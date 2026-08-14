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
// Requirement group: HEP-ANIM-*.

import { MEASURE_KEYS, displayField, resolveMeasureRows } from '../hep-core/rows.js';

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
 * The ordered, day-stamped series for one measure in the active display units.
 * @private
 */
function measureSeries(participantRows, settings, key, field) {
  return resolveMeasureRows(participantRows, settings, key)
    .filter((row) => Number.isFinite(row[field]) && Number.isFinite(row.__hep_day))
    .map((row) => ({ day: row.__hep_day, value: row[field] }))
    .sort((a, b) => a.day - b.day);
}

/**
 * Reduce the cleaned rows to one animation frame per participant (HEP-ANIM-002):
 * the day-ordered X-measure and Y-measure series in the active display units,
 * plus that participant's own day range (the extent of ALL their records, the
 * original's `day_range`) which decides when their point fades in. A participant
 * with no usable value on either plotted measure cannot be positioned and is
 * left out, exactly as the static scatter drops them.
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ measureX, measureY, display, groupBy }).
 * @returns {Array<{id: string, x: Object[], y: Object[], dayRange: number[], group: ?string, raw: Object}>}
 */
export function buildAnimationFrames(cleanRows, settings, state) {
  const { measureX, measureY, display, groupBy } = state;
  const field = displayField(display);
  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  const frames = [];
  byId.forEach((participantRows, id) => {
    const x = measureSeries(participantRows, settings, measureX, field);
    const y = measureSeries(participantRows, settings, measureY, field);
    if (!x.length || !y.length) return;
    const days = participantRows.map((row) => row.__hep_day).filter(Number.isFinite);
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
