// Row-level cleaning, derivation, and per-participant series/summary reducers
// shared by the safety.viz hepatic tools and the participant-profile module
// (obot.roadmap#45, safety.viz#98). Moved VERBATIM from
// src/hep-explorer/structureData.js (cleanData, assignSequence, hasStudyDay,
// deriveBaseline, resolveMeasureRows, participantPeak, computeRRatio,
// participantMeasureSeries, measureSummary) and src/hep-explorer/configure.js
// (cutFor, MEASURE_KEYS), so the profile module can consume the reducers
// without a renderer-specific import (PPRF-1, design decision D4); the
// hep-explorer files keep re-export shims so no existing caller churns.
// participantPeak, displayField, and dayThenIndex travel along as load-bearing
// dependencies of the listed functions.
//
// Requirement groups: HEP-DATA-* (cleaning/derivation), HEP-DISPLAY-006
// (R-Ratio), HEP-QUAD-001 (cutpoints), HEP-SELECT-002/005 (drill-down series).

import { median } from './stats.js';

/** The four liver measures the hepatic tools standardize and plot (HEP-DISPLAY-003). */
export const MEASURE_KEYS = ['ALT', 'AST', 'TB', 'ALP'];

/**
 * Resolve the active Hy's-Law cutpoint for a measure + display mode, falling
 * back to the `defaults` entry for measures without their own cuts (HEP-QUAD-001).
 * @param {Object} cuts The normalized cuts object.
 * @param {string} measureKey The short measure key (ALT/AST/TB/ALP/rRatio).
 * @param {string} display The active display mode ('relative_uln'|'relative_baseline').
 * @returns {number} The cutpoint value.
 */
export function cutFor(cuts, measureKey, display) {
  const entry = (cuts && cuts[measureKey]) || (cuts && cuts.defaults) || {};
  const fallback = (cuts && cuts.defaults) || {};
  const value = entry[display];
  return Number.isFinite(value) ? value : fallback[display];
}

/**
 * The derived per-row column for the active display mode (HEP-DISPLAY-001).
 * @param {string} display The active display mode.
 * @returns {string} The derived column name.
 */
export function displayField(display) {
  return display === 'relative_baseline' ? '__hep_relative_baseline' : '__hep_relative_uln';
}

/**
 * Sort comparator for a participant's records: study day ascending, then input order.
 * @param {Object} a A cleaned row.
 * @param {Object} b A cleaned row.
 * @returns {number} The comparator result.
 */
export function dayThenIndex(a, b) {
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
 * Why a raw row cannot be plotted, or '' when it can (HEP-DROP-001). Names the
 * mapped column, so the reason reads against the caller's own data rather than
 * against this module's internals.
 * @param {Object} row A row carrying the derived __hep_* fields.
 * @param {Object} settings Normalized settings.
 * @returns {string} The reason, or ''.
 */
function dropReason(row, settings) {
  const raw = row[settings.value_col];
  if (raw === '' || raw === undefined || raw === null) {
    return `Result column ("${settings.value_col}") is empty.`;
  }
  if (!Number.isFinite(row.__hep_value)) {
    return `Result column ("${settings.value_col}") is not numeric.`;
  }
  if (!Number.isFinite(row.__hep_uln)) {
    return `Reference-range column ("${settings.normal_col_high}") is missing or not numeric.`;
  }
  if (!(row.__hep_uln > 0)) {
    return `Reference-range column ("${settings.normal_col_high}") is not positive.`;
  }
  return '';
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
  const dropped = [];
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
      // WHY a row left, not just that one did (HEP-DROP-001): a count in the
      // notes is not checkable against the source dataset, and the reason is
      // what makes the export worth downloading.
      const reason = dropReason(row, settings);
      if (reason) {
        row.__hep_dropReason = reason;
        dropped.push(row);
        removed += 1;
        return false;
      }
      return true;
    });
  return { rows, removed, dropped };
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
