// Scales for the patient-journey-explorer module (#142, design §5.9, §6.2,
// D7, D22). Pure: returns Chart.js config objects and strings; no DOM, no
// Chart.js import.
//
// Two rules live here and nowhere else:
//
//   Elapsed-day space (D22). CDISC study days have no day 0, so "day 1 minus
//   day −1" is one calendar day, not two. Every lane draws over a continuous
//   ELAPSED axis (`toElapsed`: day 1 → 0, day 2 → 1, day −1 → −1) and converts
//   back with `toStudyDay` only for labels. The window and offset arithmetic in
//   anchor.js runs in the same space, which is what makes a ±30-day window span
//   30 elapsed days on each side and makes "days from anchor" agree with the
//   calendar for every pair of days (PJE-ANCH-005).
//
//   Date mode is labelling only (D7). The x scale stays linear in elapsed days
//   in both modes; `dayToDate` and `formatTick` relabel ticks, tooltips and
//   panel text from the subject's reference date. No date adapter is installed.
//   A partial recorded date never positions a mark (PJE-TIME-003), and a full
//   recorded date that disagrees with the study day loses to the day and is
//   flagged (PJE-TIME-004).

/** Left plot gutter (px): wide enough for the lane label and a y tick. Pinned on every lane. */
export const PLOT_GUTTER_LEFT = 132;

/** Right plot padding (px), identical on every lane. */
export const PLOT_GUTTER_RIGHT = 16;

const MS_PER_DAY = 86400000;
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

// Tick steps in study days: whole weeks and months before the 1/2/5 decades,
// because reviewers read this axis in visit-schedule units.
const STEP_LADDER = [1, 2, 5, 7, 14, 30, 60, 90, 180, 365, 730, 1825, 3650];

/**
 * Study day → the continuous elapsed-day axis (D22). Day 1 is elapsed 0, day 2
 * is 1, day −1 is −1; there is no day 0, so 0 and non-finite values are null.
 * @param {*} day A study day.
 * @returns {?number} The elapsed day, or null.
 */
export function toElapsed(day) {
  const n = Number(day);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n - 1 : n;
}

/**
 * Elapsed day → study day, the inverse of toElapsed, for labels and anything a
 * clinician reads.
 * @param {number} elapsed An elapsed day.
 * @returns {number} The study day.
 */
export function toStudyDay(elapsed) {
  return elapsed >= 0 ? elapsed + 1 : elapsed;
}

/**
 * Whether a `--DTC` cell is a full ISO date (`YYYY-MM-DD`, optionally with a
 * time part) naming a real calendar date — not `YYYY` or `YYYY-MM`.
 * @param {*} value The cell as recorded.
 * @returns {boolean} True for a full, valid date.
 */
export function isFullDate(value) {
  if (typeof value !== 'string') return false;
  const match = FULL_DATE.exec(value.trim());
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The `YYYY-MM-DD` part of a full date cell, or null.
 * @param {*} value The cell as recorded.
 * @returns {?string} The date part.
 */
export function datePart(value) {
  return isFullDate(value) ? value.trim().slice(0, 10) : null;
}

const utc = (iso) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * Add whole days to an ISO date, in UTC so no DST boundary shifts the result.
 * @param {string} iso A `YYYY-MM-DD` date.
 * @param {number} days Days to add (may be negative).
 * @returns {string} The resulting `YYYY-MM-DD`.
 */
export function addDays(iso, days) {
  return new Date(utc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Calendar-day difference `a − b` between two full ISO dates.
 * @param {*} a A date cell.
 * @param {*} b A date cell.
 * @returns {?number} Whole days, or null when either is not a full date.
 */
export function dateDiffDays(a, b) {
  const da = datePart(a);
  const db = datePart(b);
  if (!da || !db) return null;
  return Math.round((utc(da) - utc(db)) / MS_PER_DAY);
}

/**
 * Study day → ISO date, honouring the CDISC no-day-0 rule: day 1 is the
 * reference date, day 2 the next day, day −1 the day before (PJE-TIME-002).
 * @param {*} day A study day.
 * @param {?string} refDate The subject's reference date (study day 1).
 * @returns {?string} `YYYY-MM-DD`, or null for day 0, a non-finite day or no reference.
 */
export function dayToDate(day, refDate) {
  const ref = datePart(refDate);
  const elapsed = toElapsed(day);
  if (!ref || elapsed === null) return null;
  return addDays(ref, elapsed);
}

/**
 * The subject's reference date (study day 1), resolved in two steps (D30):
 * the first full `time.ref_date_col` cell on any event's source row; otherwise
 * derived from the earliest placeable event that carries a full recorded date,
 * as that date minus its elapsed day. `rule` says which step fired.
 * @param {Object[]} events The subject's normalized events.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {?{date: string, rule: 'ref_col'|'derived'}} The reference, or null.
 */
export function referenceDate(events, settings) {
  if (!Array.isArray(events)) return null;
  const refCol = settings?.time?.ref_date_col;
  if (refCol) {
    for (const event of events) {
      const cell = event?.source?.[refCol];
      if (isFullDate(cell)) return { date: datePart(cell), rule: 'ref_col' };
    }
  }
  let earliest = null;
  for (const event of events) {
    if (!event || event.placeable === false || !Number.isFinite(event.day)) continue;
    if (!isFullDate(event.rawDate)) continue;
    if (!earliest || event.day < earliest.day) earliest = event;
  }
  if (!earliest) return null;
  const elapsed = toElapsed(earliest.day);
  if (elapsed === null) return null;
  return { date: addDays(datePart(earliest.rawDate), -elapsed), rule: 'derived' };
}

/**
 * Resolve an event's calendar fields against a reference date (§5.9): `date`
 * is the recorded full date when it agrees with the study day, else the date
 * the day maps to; a full recorded date that disagrees with the day loses to
 * the day and sets `dateConflict` (PJE-TIME-004); a partial recorded date
 * never labels or positions (PJE-TIME-003). `endDate` resolves only for a
 * closed interval. Returns a copy; the input is not touched.
 * @param {Object} event A normalized event (needs day, end, endState, placeable, rawDate).
 * @param {?string} refDate The reference date, or null.
 * @returns {Object} The event with `date`, `endDate` and `dateConflict` set.
 */
export function resolveEventDate(event, refDate) {
  const ref = datePart(refDate);
  const own = datePart(event.rawDate);
  const fromDay = ref && event.placeable !== false ? dayToDate(event.day, ref) : null;
  let date = own || fromDay || null;
  let dateConflict = false;
  if (own && fromDay && own !== fromDay) {
    date = fromDay;
    dateConflict = true;
  }
  const endDate =
    ref && event.endState === 'closed' && Number.isFinite(event.end)
      ? dayToDate(event.end, ref)
      : null;
  return { ...event, date, endDate, dateConflict };
}

/**
 * Tick label for a study day in the active display mode. With `anchorDay`
 * the label is the signed elapsed offset from the anchor (`+30`, `0`, `-30`),
 * the "Days from anchor" reading of PJE-ANCH-004; otherwise date mode prints
 * the ISO date and day mode the study day. Falls back to the day whenever a
 * date does not resolve.
 * @param {number} day The study day to label.
 * @param {{mode?: string, refDate?: ?string, anchorDay?: ?number}} options The display state.
 * @returns {string} The label.
 */
export function formatTick(day, { mode, refDate, anchorDay } = {}) {
  const anchorElapsed = toElapsed(anchorDay);
  const dayElapsed = toElapsed(day);
  if (anchorElapsed !== null && dayElapsed !== null) {
    const offset = dayElapsed - anchorElapsed;
    if (offset > 0) return `+${offset}`;
    return String(offset);
  }
  if (mode === 'date') {
    const date = dayToDate(day, refDate);
    if (date) return date;
  }
  return String(day);
}

/**
 * Whether a domain is a usable elapsed pair.
 * @param {*} domain The candidate.
 * @returns {boolean} True for `[min, max]` of finite numbers.
 * @private
 */
function usableDomain(domain) {
  return Array.isArray(domain) && domain.length === 2 && domain.every(Number.isFinite);
}

/**
 * Ticks for the one shared axis strip: at most `target + 2` round study days
 * (whole weeks or months) covering the elapsed domain, always including day 1
 * when it is in range, never day 0, each with its percentage position along the
 * domain so the DOM strip and the canvases agree by construction.
 * @param {?[number, number]} domain The shared ELAPSED-day domain.
 * @param {number} [target=6] The target number of intervals.
 * @returns {Array<{value: number, elapsed: number, position: number}>} The ticks, ascending.
 */
export function axisTicks(domain, target = 6) {
  if (!usableDomain(domain)) return [];
  const [lo, hi] = domain;
  const span = hi - lo;
  if (span <= 0) return [{ value: toStudyDay(lo), elapsed: lo, position: 0 }];
  const intervals = Math.max(1, Number(target) || 6);
  let step = STEP_LADDER[STEP_LADDER.length - 1];
  for (const candidate of STEP_LADDER) {
    if (span / candidate <= intervals) {
      step = candidate;
      break;
    }
  }
  while (span / step > intervals) step *= 10;
  const loDay = toStudyDay(lo);
  const hiDay = toStudyDay(hi);
  const values = new Set();
  for (let k = Math.ceil(loDay / step); k * step <= hiDay; k += 1) {
    if (k !== 0) values.add(k * step);
  }
  if (lo <= 0 && hi >= 0) values.add(1);
  return [...values]
    .map((value) => ({ value, elapsed: toElapsed(value) }))
    .filter((tick) => tick.elapsed !== null && tick.elapsed >= lo && tick.elapsed <= hi)
    .sort((a, b) => a.elapsed - b.elapsed)
    .map((tick) => ({ ...tick, position: ((tick.elapsed - lo) / span) * 100 }));
}

/**
 * Ticks for the axis strip while ANCHORED (PJE-ANCH-004): round offsets from
 * the anchor in elapsed space — multiples of the same step ladder, always
 * including 0 — so the relabelled axis reads `−30 · 0 · +30 · +60` rather than
 * the study-day ticks arithmetically shifted to `−16 · 0 · +43 · +103`. The
 * day-1 tick is not carried over: its offset is an arbitrary number, and the
 * day-1 rule is still drawn on every lane. Positions are percentages of the
 * same domain, so the lanes and the strip still agree.
 * @param {?[number, number]} domain The shared ELAPSED-day domain.
 * @param {number} anchorElapsed The anchor's elapsed day.
 * @param {number} [target=8] The target number of intervals (a little finer than the study-day strip, so a ±30 window gets 30-day ticks over a six-month journey).
 * @returns {Array<{value: number, elapsed: number, position: number, anchor: boolean}>} The ticks, ascending; `value` is the study day each tick labels.
 */
export function anchoredTicks(domain, anchorElapsed, target = 8) {
  if (!usableDomain(domain) || !Number.isFinite(anchorElapsed)) return axisTicks(domain, target);
  const [lo, hi] = domain;
  const span = hi - lo;
  if (span <= 0) return axisTicks(domain, target);
  const intervals = Math.max(1, Number(target) || 6);
  let step = STEP_LADDER[STEP_LADDER.length - 1];
  for (const candidate of STEP_LADDER) {
    if (span / candidate <= intervals) {
      step = candidate;
      break;
    }
  }
  while (span / step > intervals) step *= 10;
  const offsets = new Set([0]);
  for (let k = Math.ceil((lo - anchorElapsed) / step); k * step <= hi - anchorElapsed; k += 1) {
    offsets.add(k * step);
  }
  return [...offsets]
    .map((offset) => anchorElapsed + offset)
    .filter((elapsed) => elapsed >= lo && elapsed <= hi)
    .sort((a, b) => a - b)
    .map((elapsed) => ({
      value: toStudyDay(elapsed),
      elapsed,
      anchor: elapsed === anchorElapsed,
      position: ((elapsed - lo) / span) * 100
    }));
}

/**
 * The Chart.js layout block every lane shares: zero left padding (the y scale
 * is pinned to PLOT_GUTTER_LEFT instead) and the same right padding.
 * @returns {{padding: {left: number, right: number, top: number, bottom: number}}} The layout block.
 */
export function laneLayout() {
  return { padding: { left: 0, right: PLOT_GUTTER_RIGHT, top: 2, bottom: 2 } };
}

/**
 * The Chart.js scales for one lane: an x scale over the shared elapsed domain
 * (hidden — the visible axis is the DOM strip fed by axisTicks) and a y scale
 * whose fitted width is forced to PLOT_GUTTER_LEFT, so every lane aligns by
 * construction (PJE-LANE-004). Categorical lanes get a category y over their
 * row keys; the labs lane a linear y over its padded value domain.
 * @param {Object} config Lane configuration.
 * @param {string} config.lane The lane key (`'labs'` selects the linear y).
 * @param {?[number, number]} config.domain The shared ELAPSED-day domain.
 * @param {string[]} [config.rows] Row keys for a categorical lane, top to bottom.
 * @param {?[number, number]} [config.valueDomain] The labs value domain.
 * @param {string} [config.mode] The display mode (labels only; accepted for symmetry).
 * @param {?string} [config.refDate] The reference date (labels only; accepted for symmetry).
 * @returns {{x: Object, y: Object}} The scales block.
 */
export function buildScales({ lane, domain, rows, valueDomain } = {}) {
  const [min, max] = usableDomain(domain) ? domain : [0, 1];
  const x = {
    type: 'linear',
    min,
    max,
    display: false,
    offset: false,
    bounds: 'data',
    grid: { display: false },
    ticks: { display: false }
  };
  const afterFit = (scale) => {
    scale.width = PLOT_GUTTER_LEFT;
  };
  const shared = { display: true, grid: { display: false }, ticks: { display: false }, afterFit };
  if (lane === 'labs') {
    const [lo, hi] = usableDomain(valueDomain) ? valueDomain : [0, 1];
    return { x, y: { type: 'linear', min: lo, max: hi, ...shared } };
  }
  return {
    x,
    y: {
      type: 'category',
      labels: Array.isArray(rows) ? rows.map(String) : [],
      offset: true,
      ...shared
    }
  };
}
