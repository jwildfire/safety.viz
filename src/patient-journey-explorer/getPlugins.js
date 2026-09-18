// Pure dataset, geometry and text builders for the patient-journey-explorer
// module (#142, design §6.3–6.5, D16, D20, D23). NOTE THE NAME (D20): every
// other module keeps its Chart.js plugin/canvas code in `<module>/getPlugins.js`;
// here the canvas code lives in draw.js and this file holds only the pure,
// unit-tested builders the lane charts and the keyboard overlay consume.
//
// Everything positions in ELAPSED-day space (D22): a floating bar is
// `{ x: [toElapsed(start), toElapsed(end)], y: row }`, a point is
// `{ x: toElapsed(day), y }`. The end cap follows `endState`, never a bare
// missing value: a closed end caps hard, `ongoing` gets the arrow, and
// `unrecorded` — every blank-ended con-med in the pilot — gets the dotted fade
// and the words "end not recorded" (D16). Mark fills are opaque (D23): AE
// severity is bar height, border weight and the accessible name, never alpha;
// de-emphasis of out-of-window marks uses the per-hue table in PJE_DEEMPHASIS.
//
// Text is built once and read twice: `tooltipLines` feeds the single DOM
// tooltip and the footnote, `laneAriaLabel` the mark button — so pointer and
// keyboard users read the same facts (RF-6, PJE-KEY-001).

import { dayToDate, isFullDate, toElapsed } from './getScales.js';
import { PJE_DEEMPHASIS, PJE_GLYPHS, PJE_MARKS } from './palette.js';
import { inWindow, relativeDay } from './anchor.js';
import { referenceRatio } from './labs.js';

/** Human label per domain code (`DOSE` is the derived dose-change record). */
export const DOMAIN_LABELS = {
  EX: 'Exposure',
  DOSE: 'Dose change',
  AE: 'Adverse event',
  LB: 'Lab result',
  CM: 'Con-med',
  MH: 'Medical history',
  DS: 'Disposition'
};

/** Minimum drawn bar width (px) so a same-day interval still shows; Chart.js `minBarLength`. */
export const MIN_BAR_WIDTH = 4;

/** The last tooltip line: both gestures, named (PC-4). */
export const GESTURE_LINE = 'Enter to anchor · Shift+Enter to open the source record';

/** The accessible name's closing sentence: both gestures, named (PC-4). */
export const GESTURE_SENTENCE =
  'Press Enter to anchor time on this event, Shift and Enter to open its source record.';

const HUE_BY_LANE = { exposure: 'ex', adverseEvents: 'ae', conMeds: 'cm' };
const BAR_LANES = ['exposure', 'adverseEvents', 'conMeds'];
const POINT_LANES = ['doseChanges', 'medicalHistory', 'disposition'];
const SEVERITY_KEYS = ['MILD', 'MODERATE', 'SEVERE'];

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const isEvent = (event) => Boolean(event) && typeof event === 'object';
const upper = (value) =>
  value === null || value === undefined ? '' : String(value).trim().toUpperCase();
const endBeforeStart = (event) =>
  Array.isArray(event.flagged) && event.flagged.some((flag) => /precedes start/.test(String(flag)));
const domainCode = (event) => (event.flags?.derived ? 'DOSE' : event.domain);
const usableDomain = (domain) =>
  Array.isArray(domain) && domain.length === 2 && domain.every(finite);

/**
 * Sentence-case an all-caps label for speech; mixed-case text is left alone.
 * @private
 */
function humanize(value) {
  const text = String(value ?? '').trim();
  if (!text || /[a-z]/.test(text)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Convert a `#rgb`, `#rrggbb`, `rgb()` or `rgba()` color to `rgba()` at the
 * given alpha (clamped to [0, 1]). Anything else is returned unchanged.
 * @param {string} color The color.
 * @param {number} alpha Opacity in [0, 1].
 * @returns {string} The `rgba(r, g, b, a)` string.
 */
export function withAlpha(color, alpha) {
  const a = Math.min(1, Math.max(0, Number(alpha)));
  const text = String(color ?? '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${Number.isFinite(a) ? a : 1})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(text);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${Number.isFinite(a) ? a : 1})`;
  return text;
}

/**
 * The severity channel of an adverse event (D23): the palette height, border
 * width and (opaque) alpha for its grade, the hatched glyph and `missing:
 * true` when no severity was recorded, and the MODERATE geometry for a value
 * outside the configured list. A custom scale maps its first rank to MILD,
 * its last to SEVERE and the rest to MODERATE.
 * @param {Object} event An adverse-event EventRecord.
 * @param {Object} theme The resolved theme tokens (resolveTheme / PJE_PALETTE.light).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{key: ?string, height: number, borderWidth: number, alpha: number, glyph: string, missing: boolean}} The style.
 */
export function severityStyle(event, theme, settings) {
  const severity = event?.flags?.severity ?? null;
  const missing = severity === null;
  let bucket = 'MODERATE';
  if (severity) {
    const key = upper(severity.key);
    if (SEVERITY_KEYS.includes(key)) bucket = key;
    else if (severity.rank > 0) {
      const count = Array.isArray(settings?.ae_severity_values)
        ? settings.ae_severity_values.length
        : 0;
      bucket = severity.rank === 1 ? 'MILD' : severity.rank === count ? 'SEVERE' : 'MODERATE';
    }
  }
  const heights = theme?.aeSeverityHeight || {};
  const borders = theme?.aeSeverityBorder || {};
  const alphas = theme?.aeSeverityAlpha || {};
  return {
    key: severity ? severity.key : null,
    height: finite(heights[bucket]) ? heights[bucket] : 7,
    borderWidth: finite(borders[bucket]) ? borders[bucket] : 1.5,
    alpha: finite(alphas[bucket]) ? alphas[bucket] : 1,
    glyph: missing ? PJE_GLYPHS.aeSeverityMissing : 'bar',
    missing
  };
}

/**
 * The `$pjeMarks[].glyph` vocabulary for an event: bars for intervals (hatched
 * when an adverse event has no severity), the lab glyph by indicator, the
 * caret by dose direction, a hollow circle for history, a dot for disposition.
 * @param {Object} event An EventRecord.
 * @returns {string} The glyph name.
 */
export function glyphFor(event) {
  if (!isEvent(event)) return 'dot';
  if (event.flags?.derived) {
    return PJE_GLYPHS.doseChange[upper(event.flags.direction)] || 'caret-up';
  }
  switch (event.domain) {
    case 'AE':
      return event.flags?.severity === null ? PJE_GLYPHS.aeSeverityMissing : 'bar';
    case 'EX':
    case 'CM':
      return 'bar';
    case 'LB': {
      const flag = upper(event.flags?.abnormal);
      if (!flag) return 'dot';
      return PJE_GLYPHS.labFlag[flag] || PJE_GLYPHS.labFlag.NORMAL;
    }
    case 'MH':
      return 'circle-open';
    default:
      return 'dot';
  }
}

/**
 * The end cap of a mark by `endState` (D16): `closed` (hard cap), `arrow`
 * (ongoing, the record says so), `fade` (end not recorded). A record whose end
 * preceded its start is a zero-length mark and caps closed (design §5.1).
 * @param {Object} event An EventRecord.
 * @returns {'closed'|'arrow'|'fade'} The end cap.
 */
export function endCapFor(event) {
  if (!isEvent(event) || event.kind !== 'interval') return 'closed';
  if (event.endState === 'closed' || endBeforeStart(event)) return 'closed';
  return event.endState === 'ongoing' ? 'arrow' : 'fade';
}

/**
 * The mark's data-space geometry (elapsed days) and pixel height: a floating
 * bar from the (possibly clipped) start to the closed end or the domain end,
 * or a zero-width point at its day. Unplaceable events have no geometry.
 * @param {Object} event An EventRecord.
 * @param {{lane: string, domain: ?[number, number], settings: Object, theme: Object}} context The lane key, the shared elapsed domain, the synced settings and the theme tokens.
 * @returns {?{x0: number, x1: number, height: number, minWidth: number, endCap: string, glyph: string, clippedStart: boolean}} The geometry, or null.
 */
export function markGeometry(event, { lane, domain, settings, theme } = {}) {
  if (!isEvent(event) || event.placeable === false) return null;
  const start = toElapsed(event.kind === 'interval' ? event.start : event.day);
  if (start === null) return null;
  const hasDomain = usableDomain(domain);
  const glyph = glyphFor(event);
  const endCap = endCapFor(event);
  let x0 = start;
  let x1 = start;
  if (event.kind === 'interval') {
    if (event.clippedStart && hasDomain) x0 = Math.max(domain[0], start);
    if (event.endState === 'closed' && finite(event.end)) x1 = toElapsed(event.end) ?? start;
    else if (endBeforeStart(event)) x1 = start;
    else x1 = hasDomain ? domain[1] : start;
  }
  let height;
  switch (lane) {
    case 'exposure':
      height = PJE_MARKS.exBarHeight;
      break;
    case 'conMeds':
      height = PJE_MARKS.cmBarHeight;
      break;
    case 'adverseEvents':
      height = severityStyle(event, theme, settings).height;
      break;
    case 'labs':
      height = /double$/.test(glyph) ? PJE_MARKS.labGlyphSizeExtreme : PJE_MARKS.labGlyphSize;
      break;
    case 'doseChanges':
      height = PJE_MARKS.labGlyphSize;
      break;
    default:
      height = PJE_MARKS.mhDotRadius * 2;
  }
  return {
    x0,
    x1,
    height,
    minWidth: MIN_BAR_WIDTH,
    endCap,
    glyph,
    clippedStart: Boolean(event.clippedStart)
  };
}

/**
 * A study day in the active display mode: `Day 30`, or the calendar date in
 * date mode when one resolves.
 * @param {*} day The study day.
 * @param {{mode?: string, refDate?: ?string}} [options] The display mode and reference date.
 * @returns {string} The label.
 */
export function dayLabel(day, { mode, refDate } = {}) {
  if (!finite(day)) return 'no study day';
  if (mode === 'date') {
    const date = dayToDate(day, refDate);
    if (date) return date;
  }
  return `Day ${day}`;
}

/**
 * The start label of an event, preferring its own resolved date in date mode.
 * @private
 */
function startLabel(event, options) {
  if (options.mode === 'date' && event.date) return event.date;
  return dayLabel(event.day, options);
}

/**
 * The event's span in the active mode (design §6.5): `Day 30 to day 115`,
 * `Day 30 to ongoing (<outcome>)`, `Day 30, end not recorded`, a bare day for a
 * point, or `No study day recorded` for an unplaceable record. The terminal
 * phrase comes from `endState`, never from a bare missing value.
 * @param {Object} event An EventRecord.
 * @param {{mode?: string, refDate?: ?string}} [options] The display mode and reference date.
 * @returns {string} The span text.
 */
export function spanLabel(event, options = {}) {
  if (!isEvent(event) || event.placeable === false || !finite(event.day)) {
    return 'No study day recorded';
  }
  const start = startLabel(event, options);
  if (event.kind !== 'interval') return start;
  if (event.endState === 'closed' && finite(event.end)) {
    const endDate =
      options.mode === 'date' ? event.endDate || dayToDate(event.end, options.refDate) : null;
    return `${start} to ${endDate || `day ${event.end}`}`;
  }
  if (event.endState === 'ongoing') {
    const outcome = String(event.outcome ?? '')
      .trim()
      .toLowerCase();
    return `${start} to ongoing${outcome ? ` (${outcome})` : ''}`;
  }
  return `${start}, end not recorded`;
}

/**
 * The lab ratio line, `4.03 × ULN` or `0.61 × LLN`, with the limit chosen by
 * the point's direction (PC-29); null when no ratio resolves.
 * @param {Object} event A lab EventRecord.
 * @returns {?string} The line.
 */
export function ratioLine(event) {
  if (!isEvent(event) || event.domain !== 'LB') return null;
  const ratio = referenceRatio(event);
  return ratio ? `${ratio.ratio.toFixed(2)} × ${ratio.limit}` : null;
}

/**
 * The signed "days from anchor" text, or null when either day is unusable.
 * @private
 */
function anchorLine(event, anchor) {
  const offset = relativeDay(event.day, anchor?.day);
  if (offset === null) return null;
  const sign = offset >= 0 ? '+' : '';
  return `${sign}${offset} day${Math.abs(offset) === 1 ? '' : 's'} from anchor`;
}

/**
 * The second line: domain word plus the qualifiers a reviewer reads first.
 * @private
 */
function domainLine(event) {
  const parts = [DOMAIN_LABELS[domainCode(event)] || event.domain];
  if (event.domain === 'AE' && !event.flags?.derived) {
    if (event.flags?.severity) parts.push(event.flags.severity.label);
    if (event.flags?.related) parts.push(`related: ${event.flags.related}`);
  } else if (event.domain === 'LB') {
    const flag = upper(event.flags?.abnormal);
    parts.push(flag || 'indicator not recorded');
  } else if (event.flags?.derived && event.flags.direction) {
    parts.push(event.flags.direction);
  }
  return parts.join(' · ');
}

/**
 * The tooltip's first line: the label, prefixed with the test name for labs.
 * @private
 */
function titleLine(event) {
  if (event.domain === 'LB' && event.test) return `${event.test} ${event.label}`.trim();
  return String(event.label ?? '');
}

/**
 * The shared tooltip text (design §6.5), one string per line: label; domain ·
 * severity · relatedness; the span; `SAE` for a serious event; `severity not
 * recorded` for a blank severity; the `× ULN` / `× LLN` ratio for a lab; the
 * `+N days from anchor` line only when anchored; the category; the detail;
 * `recorded as <partial date>`; the date-conflict sentence; the column that
 * placed the mark (D15); and the gesture line.
 * @param {Object} event An EventRecord.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{mode?: string, refDate?: ?string, anchor?: ?Object}} [options] The display mode, the reference date and the anchored event (or `{ day }`).
 * @returns {string[]} The lines.
 */
// eslint-disable-next-line no-unused-vars
export function tooltipLines(event, settings, { mode, refDate, anchor } = {}) {
  if (!isEvent(event)) return [];
  const options = { mode, refDate };
  const title = titleLine(event);
  const lines = [title, domainLine(event), spanLabel(event, options)];
  if (event.domain === 'AE' && !event.flags?.derived) {
    if (event.flags?.serious) lines.push('SAE');
    if (event.flags?.severity === null) lines.push('severity not recorded');
  }
  const ratio = ratioLine(event);
  if (ratio) lines.push(ratio);
  if (anchor) {
    const offset = anchorLine(event, anchor);
    if (offset) lines.push(offset);
  }
  const category = String(event.category ?? '').trim();
  if (category && !title.includes(category)) lines.push(category);
  const detail = String(event.detail ?? '').trim();
  if (detail) lines.push(detail);
  const rawDate = String(event.rawDate ?? '').trim();
  if (rawDate && !isFullDate(rawDate)) lines.push(`recorded as ${rawDate}`);
  if (event.dateConflict && rawDate) {
    lines.push(`recorded date ${rawDate} disagrees with day ${event.day}`);
  }
  if (event.placeable !== false && event.dayCol) lines.push(`placed by ${event.dayCol}`);
  lines.push(GESTURE_LINE);
  return lines;
}

/**
 * The mark button's accessible name (PJE-KEY-001, PJE-ACC-002): one sentence
 * naming the label, the domain, the severity (or that none was recorded),
 * seriousness as `serious (SAE)`, relatedness, the lab indicator and ratio,
 * and the span in the active mode, followed by the two gestures.
 * @param {Object} event An EventRecord.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{mode?: string, refDate?: ?string}} [options] The display mode and reference date.
 * @returns {string} The accessible name.
 */
// eslint-disable-next-line no-unused-vars
export function laneAriaLabel(event, settings, { mode, refDate } = {}) {
  if (!isEvent(event)) return '';
  const options = { mode, refDate };
  const parts = [];
  if (event.domain === 'LB' && event.test) parts.push(`${event.test} ${event.label}`.trim());
  else if (event.flags?.derived) parts.push(String(event.label ?? ''));
  else parts.push(humanize(event.label));
  parts.push((DOMAIN_LABELS[domainCode(event)] || event.domain).toLowerCase());
  if (event.domain === 'AE' && !event.flags?.derived) {
    parts.push(
      event.flags?.severity
        ? String(event.flags.severity.label).toLowerCase()
        : 'severity not recorded'
    );
    if (event.flags?.serious) parts.push('serious (SAE)');
    if (event.flags?.related) parts.push(`related: ${event.flags.related}`);
  } else if (event.domain === 'LB') {
    const flag = upper(event.flags?.abnormal);
    if (flag) parts.push(flag);
    const ratio = ratioLine(event);
    if (ratio) parts.push(ratio);
  } else if (event.flags?.derived && event.flags.direction) {
    parts.push(event.flags.direction);
  }
  const span = spanLabel(event, options);
  parts.push(span.replace(/^(Day|No)/, (word) => word.toLowerCase()));
  return `${parts.join(', ')}. ${GESTURE_SENTENCE}`;
}

/**
 * The `$pjeMarks` emphasis of an event under the current window.
 * @private
 */
function emphasisOf(event, bounds, settings) {
  if (!bounds) return 'full';
  return inWindow(event, bounds, settings) ? 'full' : 'dim';
}

/**
 * The fill and stroke of a categorical mark, de-emphasized out of window.
 * @private
 */
function marksColors(hueKey, emphasis, theme) {
  const hue = theme?.[hueKey] || '#000000';
  if (emphasis !== 'dim') return { fill: hue, stroke: hue };
  return {
    fill: withAlpha(hue, PJE_DEEMPHASIS.fillAlpha[hueKey] ?? 0.5),
    stroke: withAlpha(hue, PJE_DEEMPHASIS.strokeAlpha)
  };
}

/**
 * One bar dataset: floating bars `{ x: [x0, x1], y: row }` at one thickness.
 * @private
 */
function barDataset(lane, thickness, entries) {
  const dataset = {
    type: 'bar',
    label: lane,
    indexAxis: 'y',
    grouped: false,
    barThickness: thickness,
    minBarLength: MIN_BAR_WIDTH,
    borderSkipped: false,
    borderRadius: PJE_MARKS.barRadius,
    data: [],
    backgroundColor: [],
    borderColor: [],
    borderWidth: []
  };
  for (const { point, fill, stroke, borderWidth } of entries) {
    dataset.data.push(point);
    dataset.backgroundColor.push(fill);
    dataset.borderColor.push(stroke);
    dataset.borderWidth.push(borderWidth);
  }
  return dataset;
}

/**
 * The Chart.js datasets for one lane, built from its drawn events in elapsed
 * space (design §6.3). Interval lanes yield floating bars (one dataset per
 * severity height for adverse events, so height and border weight carry
 * severity at one opaque fill — D23); the labs lane yields one line dataset
 * for the test's points with hidden Chart.js points (draw.js paints the
 * glyphs and the band); dose changes, medical history and disposition yield
 * scatter datasets with hidden points that draw.js paints as glyphs. Every
 * data point carries `event`, `glyph`, `endCap` and `emphasis` so `$pjeMarks`
 * can be recorded without re-derivation. Unplaceable events are left out.
 * @param {string} lane The lane key.
 * @param {Object[]} events The lane's drawn EventRecords (structureData `lanes[key].drawn`; one test's points for labs).
 * @param {{domain: ?[number, number], settings: Object, theme: Object, bounds?: ?Object}} context The shared elapsed domain, the synced settings, the theme tokens and, when anchored, the window bounds for de-emphasis.
 * @returns {Object[]} The datasets (empty for no drawable events or an unknown lane).
 */
export function buildLaneDatasets(lane, events, { domain, settings, theme, bounds } = {}) {
  const drawable = (Array.isArray(events) ? events : []).filter(
    (event) => isEvent(event) && event.placeable !== false
  );
  if (!drawable.length) return [];
  const context = { lane, domain, settings, theme };

  if (BAR_LANES.includes(lane)) {
    const hueKey = HUE_BY_LANE[lane];
    const groups = new Map();
    for (const event of drawable) {
      const geometry = markGeometry(event, context);
      if (!geometry) continue;
      const emphasis = emphasisOf(event, bounds, settings);
      const severity = lane === 'adverseEvents' ? severityStyle(event, theme, settings) : null;
      const { fill, stroke } = marksColors(hueKey, emphasis, theme);
      const thickness = severity ? severity.height : geometry.height;
      const point = {
        x: [geometry.x0, geometry.x1],
        y: lane === 'exposure' ? String(event.label ?? '') : event.id,
        event,
        glyph: geometry.glyph,
        endCap: geometry.endCap,
        emphasis,
        clippedStart: geometry.clippedStart,
        height: thickness,
        serious: Boolean(event.flags?.serious)
      };
      if (!groups.has(thickness)) groups.set(thickness, []);
      groups.get(thickness).push({
        point,
        fill,
        stroke,
        borderWidth: severity ? severity.borderWidth : 0
      });
    }
    return [...groups.keys()]
      .sort((a, b) => a - b)
      .map((thickness) => barDataset(lane, thickness, groups.get(thickness)));
  }

  if (lane === 'labs') {
    const points = drawable
      .filter((event) => finite(event.value))
      .map((event) => {
        const x = toElapsed(event.day);
        if (x === null) return null;
        return {
          x,
          y: event.value,
          event,
          glyph: glyphFor(event),
          endCap: 'closed',
          emphasis: emphasisOf(event, bounds, settings),
          nrind: upper(event.flags?.abnormal),
          ratio: ratioLine(event)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.event.sourceIndex - b.event.sourceIndex);
    if (!points.length) return [];
    return [
      {
        type: 'line',
        label: points[0].event.test || 'labs',
        data: points,
        borderColor: theme?.lbTrace,
        borderWidth: PJE_MARKS.lineWidth,
        pointRadius: 0,
        pointHitRadius: 0,
        tension: 0,
        spanGaps: true,
        fill: false
      }
    ];
  }

  if (POINT_LANES.includes(lane)) {
    const points = drawable
      .map((event) => {
        const x = toElapsed(event.day);
        if (x === null) return null;
        return {
          x,
          y: lane,
          event,
          glyph: glyphFor(event),
          endCap: 'closed',
          emphasis: emphasisOf(event, bounds, settings),
          reference: lane === 'disposition' ? Boolean(event.flags?.reference) : false
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.event.sourceIndex - b.event.sourceIndex);
    if (!points.length) return [];
    return [
      {
        type: 'scatter',
        label: lane,
        data: points,
        pointRadius: 0,
        pointHitRadius: 0,
        showLine: false
      }
    ];
  }

  return [];
}
