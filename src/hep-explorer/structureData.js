// Data preparation for the hep-explorer module (#43): cleaning, ×ULN / ×Baseline
// standardization, per-participant peak reduction into eDISH scatter points, the
// R-Ratio, quadrant classification, and the selected-participant drill-down
// series (visit path, lab-over-time, measure summary). Ported in behavior from
// the original renderer's flattenData / getMaxValues / calculateRRatios and the
// quadrant callbacks, kept as pure functions so the math is unit-testable
// against hand-computed fixtures. Derived per-row columns are prefixed __hep_
// (mirrors the outlier-explorer's __oe_). Requirement groups: HEP-DATA-*
// (cleaning/derivation), HEP-DISPLAY-* (standardization/peak), HEP-QUAD-*
// (classification), HEP-SELECT-* (drill-down series).

import { GROUP_NONE, MEASURE_KEYS } from './configure.js';
import { QUADRANT_LABELS } from './getPlugins.js';

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

export function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

// Linear-interpolated quantile (R-7 / d3.quantile), matching the other modules.
export function quantile(values, p) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values) {
  return quantile(values, 0.5);
}

/** The derived per-row column for the active display mode (HEP-DISPLAY-001). */
function displayField(display) {
  return display === 'relative_baseline' ? '__hep_relative_baseline' : '__hep_relative_uln';
}

/** Sort comparator for a participant's records: study day ascending, then input order. */
function dayThenIndex(a, b) {
  const da = Number.isFinite(a.__hep_day) ? a.__hep_day : Number.MAX_SAFE_INTEGER;
  const db = Number.isFinite(b.__hep_day) ? b.__hep_day : Number.MAX_SAFE_INTEGER;
  return da - db || a.__hep_index - b.__hep_index;
}

/**
 * Rows whose measure column matches the full TEST string mapped to a short
 * measure key by settings.measure_values (HEP-DATA-002).
 * @param {Object[]} rows Cleaned rows.
 * @param {Object} settings Normalized settings.
 * @param {string} key A short measure key (ALT/AST/TB/ALP).
 * @returns {Object[]} The matching rows.
 */
export function resolveMeasureRows(rows, settings, key) {
  const testName = settings.measure_values ? settings.measure_values[key] : key;
  return rows.filter((row) => row[settings.measure_col] === testName);
}

/**
 * Remove missing/non-numeric results and tag each surviving row with its
 * derived columns (HEP-DATA-003, HEP-DATA-004). A row is dropped when its value
 * is blank/non-numeric or its ULN is non-numeric or ≤ 0 (the ×ULN denominator).
 * Sets __hep_value, __hep_uln, __hep_day, and __hep_relative_uln; the
 * ×Baseline column is filled later by deriveBaseline. Reports the drop count for
 * the "removed records" note.
 * @param {Object[]} rawData The raw long-format records.
 * @param {Object} settings Normalized settings.
 * @returns {{rows: Object[], removed: number}} Cleaned rows and the drop count.
 */
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => {
      const value = Number(row[settings.value_col]);
      const uln = Number(row[settings.normal_col_high]);
      const day =
        settings.studyday_col &&
        row[settings.studyday_col] !== '' &&
        row[settings.studyday_col] !== undefined
          ? Number(row[settings.studyday_col])
          : NaN;
      return {
        ...row,
        __hep_index: index,
        __hep_seq: NaN,
        __hep_value: value,
        __hep_uln: uln,
        __hep_day: day,
        __hep_relative_uln: value / uln,
        __hep_relative_baseline: NaN,
        __hep_baseline: NaN
      };
    })
    .filter((row) => {
      const keep =
        row[settings.value_col] !== '' &&
        row[settings.value_col] !== undefined &&
        Number.isFinite(row.__hep_value) &&
        Number.isFinite(row.__hep_uln) &&
        row.__hep_uln > 0;
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

/**
 * Assign a per-participant-per-measure 1-based input-order sequence to each row
 * (HEP-SELECT-004, HEP-DATA-004). This synthetic ordinal is the timing fallback
 * used to pair the X/Y visit-path points and order the drill-down series when
 * the data carries no usable study day (studyday_col absent, or its values
 * non-numeric). Mutates each surviving row with __hep_seq and returns the rows;
 * mirrors the outlier-explorer's assignSequence, keyed by participant × measure
 * so each measure's records number 1..n independently.
 * @param {Object[]} rows Cleaned rows, in input order.
 * @param {Object} settings Normalized settings.
 * @returns {Object[]} The same rows, mutated.
 */
export function assignSequence(rows, settings) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = `${row[settings.id_col]}\u0000${row[settings.measure_col]}`;
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    row.__hep_seq = next;
  });
  return rows;
}

/**
 * Whether the cleaned rows carry any usable (finite) study day. When false the
 * timing test degrades gracefully: day_diff is unavailable and points render
 * filled by default rather than all-hollow (HEP-DATA-004).
 * @param {Object[]} rows Cleaned rows.
 * @returns {boolean} True when at least one row has a finite study day.
 */
export function hasStudyDay(rows) {
  return rows.some((row) => Number.isFinite(row.__hep_day));
}

/**
 * The largest finite participant R-Ratio in the cleaned data (HEP-CTRL-010): the
 * data-derived maximum used to seed the R-Ratio range filter's max input before
 * the scatter points are built. Computed on the ULN scale like computeRRatio.
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @returns {number} The maximum finite R-Ratio, or 0 when none is finite.
 */
export function maxRRatio(cleanRows, settings) {
  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });
  let max = 0;
  byId.forEach((participantRows) => {
    const ratio = computeRRatio(participantRows, settings);
    if (Number.isFinite(ratio) && ratio > max) max = ratio;
  });
  return max;
}

/**
 * Fill each row's ×Baseline column (HEP-DISPLAY-001): for every participant ×
 * measure group, the baseline value is the record at study day 0, else the
 * earliest day (or the first in input order when no day column). Mutates the
 * rows with __hep_baseline and __hep_relative_baseline and returns them; a
 * missing or zero baseline leaves __hep_relative_baseline as NaN, which drops
 * that participant from the mDISH scatter (HEP-DISPLAY-004).
 * @param {Object[]} rows Cleaned rows.
 * @param {Object} settings Normalized settings.
 * @returns {Object[]} The same rows, mutated.
 */
export function deriveBaseline(rows, settings) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = `${row[settings.id_col]}\u0000${row[settings.measure_col]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  groups.forEach((records) => {
    const ordered = [...records].sort(dayThenIndex);
    const zero = ordered.find((row) => row.__hep_day === 0);
    const baselineRow = zero || ordered[0];
    const baselineValue = baselineRow ? baselineRow.__hep_value : NaN;
    records.forEach((row) => {
      row.__hep_baseline = baselineValue;
      row.__hep_relative_baseline =
        Number.isFinite(baselineValue) && baselineValue !== 0
          ? row.__hep_value / baselineValue
          : NaN;
    });
  });
  return rows;
}

/**
 * The peak (maximum active-display value) record for a set of one measure's
 * records for one participant (HEP-DISPLAY-003). Returns { key, value, day, raw }
 * for the record with the largest ×ULN or ×Baseline value, or null when none is
 * finite.
 * @param {Object[]} rows One participant's records for a single measure.
 * @param {string} key The short measure key, echoed back on the result.
 * @param {string} display The active display mode.
 * @returns {?{key: string, value: number, day: number, raw: Object}} The peak, or null.
 */
export function participantPeak(rows, key, display) {
  const field = displayField(display);
  let best = null;
  rows.forEach((row) => {
    const value = row[field];
    if (!Number.isFinite(value)) return;
    if (!best || value > best.value) {
      best = { key, value, day: row.__hep_day, raw: row };
    }
  });
  return best;
}

/**
 * Participant R-Ratio (HEP-DISPLAY-006): the peak ALT ×ULN divided by the peak
 * ALP ×ULN. NaN when either peak is missing or ALP's peak is ≤ 0. Always
 * computed on the ULN scale regardless of the active display mode.
 * @param {Object[]} participantRows One participant's cleaned records (all measures).
 * @param {Object} settings Normalized settings.
 * @returns {number} The R-Ratio, or NaN.
 */
export function computeRRatio(participantRows, settings) {
  const altPeak = participantPeak(
    resolveMeasureRows(participantRows, settings, 'ALT'),
    'ALT',
    'relative_uln'
  );
  const alpPeak = participantPeak(
    resolveMeasureRows(participantRows, settings, 'ALP'),
    'ALP',
    'relative_uln'
  );
  if (!altPeak || !alpPeak || !(alpPeak.value > 0)) return NaN;
  return altPeak.value / alpPeak.value;
}

/**
 * Reduce cleaned rows to one eDISH scatter point per participant (HEP-CHART-001,
 * HEP-DISPLAY-003): the peak X measure vs peak Y measure in the active display
 * units, tagged with each peak's day, the day-difference and timing flag, the
 * R-Ratio, and the color-by group. A participant is dropped when either peak is
 * missing or ≤ 0, or (in mDISH) lacks a baseline; the drop count feeds the
 * warning note (HEP-DISPLAY-004).
 * @param {Object[]} cleanRows Rows from cleanData (after deriveBaseline).
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ measureX, measureY, display, visitWindow, groupBy }).
 * @returns {{points: Object[], droppedParticipants: number}} The scatter points and drop count.
 */
export function buildPoints(cleanRows, settings, state) {
  const { measureX, measureY, display, visitWindow, groupBy } = state;
  // When no row carries a usable study day, the timing test cannot be
  // evaluated; points default to filled (withinWindow true) rather than
  // all-hollow (HEP-DATA-004).
  const timed = hasStudyDay(cleanRows);
  const metaCols = unique([
    settings.id_col,
    ...settings.filters.map((filter) => filter.value_col),
    ...settings.groups.map((group) => group.value_col)
  ]).filter((col) => col && col !== GROUP_NONE);

  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  const points = [];
  let droppedParticipants = 0;
  byId.forEach((participantRows, id) => {
    const peakX = participantPeak(
      resolveMeasureRows(participantRows, settings, measureX),
      measureX,
      display
    );
    const peakY = participantPeak(
      resolveMeasureRows(participantRows, settings, measureY),
      measureY,
      display
    );
    if (!peakX || !peakY || !(peakX.value > 0) || !(peakY.value > 0)) {
      droppedParticipants += 1;
      return;
    }
    const daysX = peakX.day;
    const daysY = peakY.day;
    const dayDiff =
      Number.isFinite(daysX) && Number.isFinite(daysY) ? Math.abs(daysX - daysY) : NaN;
    const withinWindow = Number.isFinite(dayDiff) ? dayDiff <= visitWindow : !timed;
    const groupValue = groupBy && groupBy !== GROUP_NONE ? participantRows[0][groupBy] : null;
    const meta = {};
    metaCols.forEach((col) => {
      meta[col] = participantRows[0][col] === undefined ? '' : String(participantRows[0][col]);
    });
    points.push({
      id,
      x: peakX.value,
      y: peakY.value,
      days_x: daysX,
      days_y: daysY,
      day_diff: dayDiff,
      withinWindow,
      rRatio: computeRRatio(participantRows, settings),
      group: groupValue === null || groupValue === undefined ? null : String(groupValue),
      raw: meta
    });
  });
  return { points, droppedParticipants };
}

/**
 * Keep only points matching every active categorical filter (HEP-CTRL-011); an
 * unset filter (falsy value) matches everything. Filter values are compared
 * against each point's participant-level meta.
 * @param {Object[]} points Scatter points from buildPoints.
 * @param {Object} filters Map of column -> selected value.
 * @returns {Object[]} The retained points.
 */
export function applyFilters(points, filters) {
  return points.filter((point) =>
    Object.entries(filters).every(
      ([key, value]) => !value || String(point.raw[key]) === String(value)
    )
  );
}

/**
 * Classify scatter points into the four Hy's-Law quadrants around the cutpoints
 * (HEP-QUAD-004): xCat = x ≥ xCut ? High : Normal, likewise for y. Returns the
 * per-position counts and the labelled rows (count + percent of shown points)
 * that drive the quadrant summary table and the plugin labels.
 * @param {Object[]} points Shown scatter points.
 * @param {number} xCut The x-axis cutpoint.
 * @param {number} yCut The y-axis cutpoint.
 * @returns {{counts: Object, labels: Array<{position: string, label: string, count: number, percent: number}>}}
 */
export function classifyQuadrants(points, xCut, yCut) {
  const counts = {};
  QUADRANT_LABELS.forEach((entry) => {
    counts[entry.position] = 0;
  });
  points.forEach((point) => {
    const xCat = point.x >= xCut ? 'High' : 'Normal';
    const yCat = point.y >= yCut ? 'High' : 'Normal';
    const quadrant = QUADRANT_LABELS.find((entry) => entry.xCat === xCat && entry.yCat === yCat);
    if (quadrant) counts[quadrant.position] += 1;
  });
  const total = points.length;
  const labels = QUADRANT_LABELS.map((entry) => {
    const count = counts[entry.position];
    return {
      position: entry.position,
      label: entry.label,
      count,
      percent: total ? (count / total) * 100 : 0
    };
  });
  return { counts, labels };
}

/**
 * Ordered (X, Y) trajectory for a selected participant (HEP-SELECT-003): pairs
 * the X-measure and Y-measure standardized values that share a visit (or study
 * day, or input-order record when neither is present), in chronological order.
 * Only points where both measures are present are returned. Drives the
 * visit-path line overlay on the scatter.
 * @param {Object[]} cleanRows All cleaned rows.
 * @param {string|number} id The selected participant id.
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ measureX, measureY, display }).
 * @returns {Array<{x: number, y: number, day: number, visit: ?string, label: string}>}
 */
export function visitPathSeries(cleanRows, id, settings, state) {
  const { measureX, measureY, display } = state;
  const field = displayField(display);
  const participantRows = cleanRows.filter((row) => row[settings.id_col] === id);
  const xRows = resolveMeasureRows(participantRows, settings, measureX);
  const yRows = resolveMeasureRows(participantRows, settings, measureY);

  // Pair the X and Y records that share a visit, else a study day, else — when
  // the data carries neither — their per-measure input-order sequence, so the
  // X/Y trajectory still pairs by measurement occurrence (HEP-SELECT-003/004).
  const keyOf = (row) => {
    if (
      settings.visit_col &&
      row[settings.visit_col] !== undefined &&
      row[settings.visit_col] !== ''
    ) {
      return `v:${row[settings.visit_col]}`;
    }
    if (Number.isFinite(row.__hep_day)) return `d:${row.__hep_day}`;
    return `s:${Number.isFinite(row.__hep_seq) ? row.__hep_seq : row.__hep_index}`;
  };

  const entries = new Map();
  const ingest = (rows, axis) => {
    rows.forEach((row) => {
      const key = keyOf(row);
      if (!entries.has(key)) {
        entries.set(key, { x: NaN, y: NaN, day: NaN, seq: NaN, visit: null, order: Infinity });
      }
      const entry = entries.get(key);
      entry[axis] = row[field];
      if (Number.isFinite(row.__hep_day)) entry.day = row.__hep_day;
      if (Number.isFinite(row.__hep_seq)) {
        entry.seq = Number.isFinite(entry.seq) ? Math.min(entry.seq, row.__hep_seq) : row.__hep_seq;
      }
      if (settings.visit_col && row[settings.visit_col] !== undefined) {
        entry.visit = row[settings.visit_col];
      }
      entry.order = Math.min(entry.order, row.__hep_index);
    });
  };
  ingest(xRows, 'x');
  ingest(yRows, 'y');

  return [...entries.values()]
    .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))
    .sort((a, b) => {
      const da = Number.isFinite(a.day) ? a.day : Number.MAX_SAFE_INTEGER;
      const db = Number.isFinite(b.day) ? b.day : Number.MAX_SAFE_INTEGER;
      return da - db || a.order - b.order;
    })
    .map((entry) => ({
      x: entry.x,
      y: entry.y,
      day: entry.day,
      visit: entry.visit,
      label: entry.visit
        ? String(entry.visit)
        : Number.isFinite(entry.day)
          ? `Day ${entry.day}`
          : `#${Number.isFinite(entry.seq) ? entry.seq : entry.order}`
    }));
}

/**
 * Per-measure standardized series for a selected participant (HEP-SELECT-002):
 * one ordered { key, label, points } entry per liver measure present, each
 * point carrying the study day, the active-display value, and the raw record.
 * Drives the lab-over-time companion line chart.
 * @param {Object[]} cleanRows All cleaned rows.
 * @param {string|number} id The selected participant id.
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ display }).
 * @returns {Array<{key: string, label: string, points: Array<{day: number, value: number, raw: Object}>}>}
 */
export function participantMeasureSeries(cleanRows, id, settings, state) {
  const field = displayField(state.display);
  const participantRows = cleanRows.filter((row) => row[settings.id_col] === id);
  return MEASURE_KEYS.map((key) => {
    const rows = resolveMeasureRows(participantRows, settings, key);
    const points = rows
      .filter((row) => Number.isFinite(row[field]))
      .sort(dayThenIndex)
      .map((row) => ({ day: row.__hep_day, value: row[field], raw: row }));
    return { key, label: key, points };
  }).filter((series) => series.points.length > 0);
}

/**
 * Per-measure raw-value summary for a selected participant (HEP-SELECT-005): the
 * count, min, median, and max of the raw (unstandardized) results for each
 * liver measure present. Drives the measure summary table.
 * @param {Object[]} cleanRows All cleaned rows.
 * @param {string|number} id The selected participant id.
 * @param {Object} settings Normalized settings.
 * @returns {Array<{key: string, label: string, n: number, min: number, median: number, max: number}>}
 */
export function measureSummary(cleanRows, id, settings) {
  const participantRows = cleanRows.filter((row) => row[settings.id_col] === id);
  return MEASURE_KEYS.map((key) => {
    const values = resolveMeasureRows(participantRows, settings, key)
      .map((row) => row.__hep_value)
      .filter(Number.isFinite);
    return {
      key,
      label: key,
      n: values.length,
      min: values.length ? Math.min(...values) : NaN,
      median: values.length ? median(values) : NaN,
      max: values.length ? Math.max(...values) : NaN
    };
  }).filter((row) => row.n > 0);
}
