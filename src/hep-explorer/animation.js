// Study-day animation for the eDISH/mDISH scatter (safety.viz#46,
// obot.roadmap#30): the play control that walks every participant's point along
// its own lab trajectory, day by day, leaving a motion trail behind it. Ported
// in behaviour from the original SafetyGraphics/hep-explorer's
// src/callbacks/onLayout/initStudyDayControl.js and its
// initStudyDayControl/{initPlayButton,startAnimation,stopAnimation}.js — the
// day-position rule, the out-of-range shrink, the not-yet-enrolled fade and the
// playback-duration formula are all the original's, restated against Chart.js
// datasets instead of d3 transitions.
//
// Everything here is a PURE function over cleaned rows: the view owns the
// timer, the DOM and the Chart.js instance. That split is what makes the
// day-position semantics unit-testable against hand-computed fixtures
// (tests/unit/hep-explorer/animation.test.js) rather than only through the
// browser.
//
// The playback steps by study day or by visit, as the x-axis toggle says
// (HEP-XAX-*, safety.viz#375): a TIMELINE (animationTimeline) names the
// positions the slider and the play-through move through — every study day in
// Study day view, one step per visit in visit-number order in Visit view — and
// every frame below is positioned on that timeline rather than on the day
// column directly. Without a timeline the functions read the study day, as
// they always have.
//
// Requirement groups: HEP-ANIM-*, HEP-XAX-*.

import { MEASURE_KEYS, displayField, resolveMeasureRows } from '../hep-core/rows.js';
import { xAxisTick } from '../x-axis.js';

/**
 * The playback ceiling in milliseconds (HEP-ANIM-005). The original caps a long
 * study at 30 seconds rather than letting a three-year trial run for five
 * minutes; kept verbatim so a ported study plays for the same length of time.
 * @type {number}
 */
export const ANIMATION_MAX_DURATION = 30000;

/** Milliseconds of playback per study day below the cap (the original's rate). */
const MS_PER_DAY = 100;

/**
 * Frames per second a study-day play-through advances at; the day step is
 * derived from this and the duration so a long study skips days instead of
 * slowing down.
 * @type {number}
 */
export const ANIMATION_FPS = 20;

/**
 * Milliseconds each visit is shown for in a Visit-view play-through
 * (HEP-XAX-003), below the 30-second ceiling. Visits are few, so the
 * play-through shows every one of them rather than skipping any.
 * @type {number}
 */
export const MS_PER_VISIT = 500;

const blank = (value) => value === undefined || value === null || String(value).trim() === '';

/** The rows of the four liver measures, which are all the playback moves. @private */
function liverRows(cleanRows, settings) {
  return MEASURE_KEYS.flatMap((key) => resolveMeasureRows(cleanRows, settings, key));
}

/**
 * The study-day extent the animation slider spans (HEP-ANIM-001): the smallest
 * to the largest study day carried by rows for the four liver measures — the
 * original's `d3.extent(imputed_data.filter(f => f.key_measure), studyday_col)`.
 * Rows for unmapped measures do not move a point, so they do not widen the
 * range either.
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @returns {?number[]} The [min, max] day range, or null when no row is dated.
 */
export function studyDayRange(cleanRows, settings) {
  const days = [];
  MEASURE_KEYS.forEach((key) => {
    resolveMeasureRows(cleanRows, settings, key).forEach((row) => {
      if (Number.isFinite(row.__hep_day)) days.push(row.__hep_day);
    });
  });
  if (!days.length) return null;
  return [Math.min(...days), Math.max(...days)];
}

/**
 * The visits a Visit-view playback steps through (HEP-XAX-003): one step per
 * distinct value of the visit option's column on the liver-measure rows, in
 * visit-number order — so an unscheduled visit numbered 8.1 sits right after
 * Week 8 — or, when that column is not numeric, in the order the visits first
 * appear. Each step carries the visit's label (its `label_col` value).
 * @private
 */
function visitSteps(rows, option) {
  const seen = new Map();
  rows.forEach((row) => {
    const raw = row[option.col];
    if (blank(raw)) return;
    const key = String(raw).trim();
    if (!seen.has(key)) seen.set(key, { raw, label: xAxisTick(option, row) });
  });
  const entries = [...seen.entries()];
  const numeric = entries.every(([key]) => Number.isFinite(Number(key)));
  if (numeric) entries.sort((a, b) => Number(a[0]) - Number(b[0]));
  return entries.map(([key, entry]) => ({ key, label: entry.label }));
}

/**
 * The timeline the playback steps along (HEP-XAX-002, HEP-XAX-003): which
 * positions the slider spans, how each record is placed on it, and what each
 * position is called.
 *
 * - Study day view (a `linear` option, or none): the positions are study days,
 *   `min` to `max` of the liver-measure records, one day per slider step;
 *   a record sits at its study day, and a position reads "Day 57".
 * - Visit view (an `ordinal` option): the positions are the visits, numbered
 *   0..n-1 in visit-number order; a record sits at its visit's step, and a
 *   position reads as the visit's name ("Week 8").
 *
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @param {?Object} [option=null] The active x-axis option; null means Study day.
 * @returns {?{key: string, title: string, min: number, max: number, steps: ?Array<{key: string, label: string}>, position: function(Object): number, label: function(number): string, end: function(number): string}} The timeline, or null when no record can be placed on it.
 */
export function animationTimeline(cleanRows, settings, option = null) {
  if (!option || option.type === 'linear') {
    const range = studyDayRange(cleanRows, settings);
    if (!range) return null;
    return {
      key: option ? option.key : 'day',
      title: option ? option.title : 'Study day',
      min: range[0],
      max: range[1],
      steps: null,
      position: (row) => row.__hep_day,
      label: (day) => `Day ${day}`,
      end: (day) => String(day)
    };
  }
  const steps = visitSteps(liverRows(cleanRows, settings), option);
  if (!steps.length) return null;
  const index = new Map(steps.map((step, i) => [step.key, i]));
  return {
    key: option.key,
    title: option.title,
    min: 0,
    max: steps.length - 1,
    steps,
    position: (row) => {
      const raw = row ? row[option.col] : undefined;
      if (blank(raw)) return NaN;
      const at = index.get(String(raw).trim());
      return at === undefined ? NaN : at;
    },
    label: (step) => (steps[step] ? steps[step].label : ''),
    end: (step) => (steps[step] ? steps[step].label : '')
  };
}

/**
 * The ordered, day-stamped series for one measure in the active display units.
 * @private
 */
function measureSeries(participantRows, settings, key, field, position) {
  return resolveMeasureRows(participantRows, settings, key)
    .map((row) => ({ day: position(row), value: row[field] }))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.day))
    .sort((a, b) => a.day - b.day);
}

/** A record's study day, the position when no timeline is given. @private */
const studyDayOf = (row) => row.__hep_day;

/**
 * Reduce the cleaned rows to one animation frame per participant (HEP-ANIM-002):
 * the day-ordered X-measure and Y-measure series in the active display units,
 * plus that participant's own day range (the extent of ALL their records, the
 * original's `day_range`) which decides when their point fades in. A participant
 * with no usable value on either plotted measure cannot be positioned and is
 * left out, exactly as the static scatter drops them.
 *
 * With a timeline (HEP-XAX-002, HEP-XAX-003) each series entry's `day` and the
 * participant's `dayRange` are positions on that timeline: study days in Study
 * day view, visit steps in Visit view.
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ measureX, measureY, display, groupBy }).
 * @param {?Object} [timeline=null] The timeline from animationTimeline; null positions by study day.
 * @returns {Array<{id: string, x: Object[], y: Object[], dayRange: number[], group: ?string, raw: Object}>}
 */
export function buildAnimationFrames(cleanRows, settings, state, timeline = null) {
  const { measureX, measureY, display, groupBy } = state;
  const position = timeline ? timeline.position : studyDayOf;
  const field = displayField(display);
  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  const frames = [];
  byId.forEach((participantRows, id) => {
    const x = measureSeries(participantRows, settings, measureX, field, position);
    const y = measureSeries(participantRows, settings, measureY, field, position);
    if (!x.length || !y.length) return;
    const days = participantRows.map(position).filter(Number.isFinite);
    const groupValue =
      groupBy && groupBy !== 'hep_none' ? (participantRows[0][groupBy] ?? null) : null;
    frames.push({
      id,
      x,
      y,
      dayRange: days.length ? [Math.min(...days), Math.max(...days)] : [NaN, NaN],
      group: groupValue === null || groupValue === undefined ? null : String(groupValue),
      raw: participantRows[0]
    });
  });
  return frames;
}

/**
 * The value a series shows on a given day: the most recent observation at or
 * before it, else — before the participant has been measured at all — the first
 * observation, so the point waits at its starting position rather than jumping
 * in from nowhere. This is the original's bisector-right-minus-one rule.
 * @private
 */
function valueAtDay(series, day) {
  let value = series[0].value;
  for (let i = 0; i < series.length; i += 1) {
    if (series[i].day <= day) value = series[i].value;
    else break;
  }
  return value;
}

/** Whether `day` sits outside a series' own measured span. @private */
function outsideSeries(series, day) {
  return day < series[0].day || day > series[series.length - 1].day;
}

/**
 * Position every frame at one study day (HEP-ANIM-003). Each point takes its
 * most recent value at or before the day; a day outside a participant's own
 * measurement span marks the point `outOfRange` (the original draws those at
 * half size), and a day before that participant's first record marks it not
 * `enrolled` (the original fades those out entirely), so the cloud fills in as
 * the study recruits rather than starting complete.
 * @param {Object[]} frames Frames from buildAnimationFrames.
 * @param {number} day The study day to show.
 * @param {Object} [state] The live state (unused today; kept so callers pass it uniformly).
 * @returns {Array<{id: string, x: number, y: number, outOfRange: boolean, enrolled: boolean, group: ?string, raw: Object}>}
 */
export function pointsAtDay(frames, day) {
  return frames.map((frame) => ({
    id: frame.id,
    x: valueAtDay(frame.x, day),
    y: valueAtDay(frame.y, day),
    outOfRange: outsideSeries(frame.x, day) || outsideSeries(frame.y, day),
    enrolled: !Number.isFinite(frame.dayRange[0]) || day >= frame.dayRange[0],
    group: frame.group,
    raw: frame.raw
  }));
}

/**
 * The motion trails between two animation frames (HEP-ANIM-004): one segment
 * per point that actually moved, from where it was to where it now is. Points
 * that held still emit nothing — a trail on a stationary point is a smudge, not
 * information — and a point missing from either frame is skipped.
 * @param {Object[]} previous Positioned points from the earlier day.
 * @param {Object[]} next Positioned points from the later day.
 * @returns {Array<{id: string, x1: number, y1: number, x2: number, y2: number, group: ?string}>}
 */
export function trailSegments(previous, next) {
  const before = new Map(previous.map((point) => [String(point.id), point]));
  const segments = [];
  next.forEach((point) => {
    const prior = before.get(String(point.id));
    if (!prior) return;
    if (prior.x === point.x && prior.y === point.y) return;
    segments.push({
      id: point.id,
      x1: prior.x,
      y1: prior.y,
      x2: point.x,
      y2: point.y,
      group: point.group
    });
  });
  return segments;
}

/**
 * How long a play-through from `fromDay` to `toDay` should take, in
 * milliseconds (HEP-ANIM-005): 100ms per remaining day, capped at 30 seconds —
 * the original's `day_count < 100 ? day_count * 100 : 30000`. A play pressed at
 * (or past) the end of the range still gets a positive duration so the caller
 * never divides by zero.
 * @param {number} fromDay The day playback starts on.
 * @param {number} toDay The last day of the range.
 * @returns {number} The playback duration in milliseconds.
 */
export function animationDuration(fromDay, toDay) {
  const dayCount = toDay - fromDay;
  if (!Number.isFinite(dayCount) || dayCount <= 0) return MS_PER_DAY;
  return dayCount < 100 ? dayCount * MS_PER_DAY : ANIMATION_MAX_DURATION;
}

/**
 * The positions a play-through from `from` shows, in order, and how long each
 * is held (HEP-ANIM-005, HEP-XAX-002, HEP-XAX-003).
 *
 * - Study day view: the ported duration formula at a fixed frame rate, so a
 *   long study skips days rather than crawling; the last frame is the last day.
 * - Visit view: every visit from `from` to the last, one frame each, held
 *   MS_PER_VISIT ms (shorter when that would run past the 30-second ceiling).
 *
 * @param {Object} timeline The timeline from animationTimeline.
 * @param {number} from The position playback starts on.
 * @returns {{positions: number[], interval: number}} The frames, and the milliseconds between them.
 */
export function playbackSchedule(timeline, from) {
  if (timeline.steps) {
    const positions = [];
    for (let step = Math.max(timeline.min, Math.round(from)); step <= timeline.max; step += 1) {
      positions.push(step);
    }
    const interval = Math.min(MS_PER_VISIT, ANIMATION_MAX_DURATION / Math.max(1, positions.length));
    return { positions, interval };
  }
  const duration = animationDuration(from, timeline.max);
  const frameCount = Math.max(1, Math.round((duration / 1000) * ANIMATION_FPS));
  const step = (timeline.max - from) / frameCount;
  const positions = [from];
  for (let frame = 1; frame <= frameCount; frame += 1) {
    positions.push(frame >= frameCount ? timeline.max : Math.round(from + step * frame));
  }
  return { positions, interval: 1000 / ANIMATION_FPS };
}
