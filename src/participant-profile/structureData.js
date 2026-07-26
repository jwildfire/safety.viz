// Pure data layer for the participant-profile module (#98): the view model the
// header, spaghetti, and measure table render from (buildProfileModel), and the
// worst-first cohort ordering the stepper walks (rankParticipants). Both consume
// the shared hep-core reducers directly (PPRF-1, design decision D4) — the
// row-level cleaners and per-participant series live in src/hep-core/rows.js and
// the per-subject Hy's-Law reduction in src/hep-core/subjects.js — so the module
// carries no renderer-specific import. Kept pure so every number is unit-testable
// against the hand-built fixture. Requirement groups: PPRF-2/3/4/5.

import { computeRRatio, cutFor, displayField, dayThenIndex } from '../hep-core/rows.js';
import { buildHepSubjects } from '../hep-core/subjects.js';
import { SEVERITY_ORDER } from '../hep-core/quadrants.js';
import { median, quantile } from '../hep-core/stats.js';
import { measureColorScale, templateProfileURL } from './configure.js';

/** The y-axis label for the active display mode (PPRF-3). */
function yLabelFor(display) {
  return display === 'relative_baseline'
    ? 'Standardized Result [xBaseline]'
    : 'Standardized Result [xULN]';
}

/**
 * Map a measure's full TEST value to its short key when the measure_values map
 * names it (ALT/AST/TB/ALP), else the value itself — the key non-liver measures
 * carry (PPRF-3/4).
 * @param {Object} settings Normalized settings.
 * @returns {(measureValue: string) => {key: string, isKey: boolean}} The resolver.
 * @private
 */
function keyResolver(settings) {
  const byValue = new Map();
  Object.entries(settings.measure_values || {}).forEach(([shortKey, testValue]) => {
    byValue.set(testValue, shortKey);
  });
  return (measureValue) => {
    const shortKey = byValue.get(measureValue);
    return shortKey ? { key: shortKey, isKey: true } : { key: measureValue, isKey: false };
  };
}

/**
 * The distinct measures present in a participant's rows, ordered key-first in
 * measure_values order, extras after in first-appearance order (PPRF-3/4).
 * @param {Object[]} participantRows One participant's cleaned rows.
 * @param {Object} settings Normalized settings.
 * @returns {Array<{key: string, label: string, isKey: boolean, rows: Object[]}>}
 * @private
 */
function orderedMeasures(participantRows, settings) {
  const resolve = keyResolver(settings);
  const byMeasure = new Map();
  participantRows.forEach((row) => {
    const value = row[settings.measure_col];
    if (!byMeasure.has(value)) byMeasure.set(value, []);
    byMeasure.get(value).push(row);
  });

  const keyOrder = Object.keys(settings.measure_values || {});
  const entries = [...byMeasure.entries()].map(([value, rows]) => {
    const { key, isKey } = resolve(value);
    return { key, label: value, isKey, rows };
  });

  return entries.sort((a, b) => {
    if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
    if (a.isKey) return keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key);
    return 0; // extras: keep first-appearance (Map iteration) order via a stable sort
  });
}

/**
 * The [lower, upper] population extent for a measure over ALL cleaned rows, at
 * the configured measureBounds quantiles (PPRF-4). Computed over the full
 * population (parity: the original's makeNestedData uses chart.initial_data),
 * not the participant's own rows.
 * @param {Object[]} cleanRows All cleaned rows.
 * @param {string} measureValue The full TEST value.
 * @param {Object} settings Normalized settings.
 * @returns {[number, number]} The population extent.
 * @private
 */
function populationExtent(cleanRows, measureValue, settings) {
  const values = cleanRows
    .filter((row) => row[settings.measure_col] === measureValue)
    .map((row) => row.__hep_value)
    .filter(Number.isFinite);
  const [lo, hi] = settings.measureBounds;
  return [quantile(values, lo), quantile(values, hi)];
}

/**
 * Build the participant-profile view model for one participant (PPRF-2/3/4): the
 * header fields, the labs-over-time spaghetti series, and the measure-table
 * rows with their sparkline points and population extents. Population statistics
 * are computed over the full cleaned population; per-participant series and
 * summaries over the participant's own rows.
 * @param {Object[]} cleanRows All cleaned rows (carrying the __hep_* columns).
 * @param {string|number} id The participant id to profile.
 * @param {Object} settings Normalized settings.
 * @param {Object} state The live state ({ display }).
 * @returns {{participant: Object, spaghetti: Object, measures: Object[]}} The view model.
 */
export function buildProfileModel(cleanRows, id, settings, state) {
  const display =
    state && state.display === 'relative_baseline' ? 'relative_baseline' : 'relative_uln';
  const field = displayField(display);
  const participantRows = cleanRows.filter((row) => row[settings.id_col] === id);
  const first = participantRows[0] || {};

  const measures = orderedMeasures(participantRows, settings);
  const colors = measureColorScale(measures.map((measure) => measure.key));

  const details = (settings.details || []).map((spec) => ({
    label: spec.label,
    value: first[spec.value_col]
  }));

  let pAlt = null;
  if (settings.p_alt_col) {
    const raw = first[settings.p_alt_col];
    pAlt = raw === undefined || raw === null || raw === '' ? null : raw;
  }

  const participant = {
    id,
    details,
    rRatio: computeRRatio(participantRows, settings),
    pAlt
  };

  const series = measures.map((measure) => {
    const points = measure.rows
      .filter((row) => Number.isFinite(row[field]))
      .sort(dayThenIndex)
      .map((row) => ({
        day: row.__hep_day,
        value: row[field],
        // Tooltip context (parity: the original spaghetti addPointTitles):
        // the raw result alongside the adjusted value, plus the visit fields.
        raw: row.__hep_value,
        visit: settings.visit_col != null ? row[settings.visit_col] : undefined,
        visitn: settings.visitn_col != null ? row[settings.visitn_col] : undefined
      }));
    return {
      key: measure.key,
      label: measure.label,
      isKey: measure.isKey,
      color: colors.get(measure.key),
      cut: cutFor(settings.cuts, measure.key, display),
      points
    };
  });

  const measureModels = measures.map((measure) => {
    const values = measure.rows.map((row) => row.__hep_value).filter(Number.isFinite);
    const spark = measure.rows
      .slice()
      .sort(dayThenIndex)
      .map((row) => {
        const lln = settings.normal_col_low != null ? Number(row[settings.normal_col_low]) : NaN;
        const uln = Number(row[settings.normal_col_high]);
        const value = row.__hep_value;
        const outlierLow = Number.isFinite(lln) && value < lln;
        const outlierHigh = Number.isFinite(uln) && value > uln;
        return {
          day: row.__hep_day,
          value,
          lln,
          uln,
          outlier: outlierLow || outlierHigh,
          visit: settings.visit_col != null ? row[settings.visit_col] : undefined,
          visitn: settings.visitn_col != null ? row[settings.visitn_col] : undefined
        };
      });
    return {
      key: measure.key,
      label: measure.label,
      isKey: measure.isKey,
      color: colors.get(measure.key),
      n: values.length,
      min: values.length ? Math.min(...values) : NaN,
      median: values.length ? median(values) : NaN,
      max: values.length ? Math.max(...values) : NaN,
      populationExtent: populationExtent(cleanRows, measure.label, settings),
      spark
    };
  });

  return {
    participant,
    spaghetti: {
      series,
      yLabel: yLabelFor(display),
      display,
      // Follow the host's y-axis scale (PPRF-3/7 — the deleted drawDetail
      // honored the hep-explorer Axis-type control).
      axisType: settings.axis_type === 'log' ? 'log' : 'linear'
    },
    measures: measureModels
  };
}

/**
 * Fallback peak severity for a participant the hep-core reduction excludes
 * (PPRF-5): the maximum over the key measures of peakULN / the measure's ×ULN
 * cut. Used to rank ids whose data cannot form a Hy's-Law quadrant (e.g. no
 * bilirubin), after every quadrant-ranked id.
 * @param {Object[]} participantRows One participant's cleaned rows.
 * @param {Object} settings Normalized settings.
 * @returns {number} The peak severity, or 0 when no key measure is present.
 * @private
 */
function fallbackSeverity(participantRows, settings) {
  const keyOrder = Object.keys(settings.measure_values || {});
  let max = 0;
  keyOrder.forEach((key) => {
    const testValue = settings.measure_values[key];
    const values = participantRows
      .filter((row) => row[settings.measure_col] === testValue)
      .map((row) => row.__hep_relative_uln)
      .filter(Number.isFinite);
    if (!values.length) return;
    const cut = cutFor(settings.cuts, key, 'relative_uln');
    const score = Math.max(...values) / (Number.isFinite(cut) && cut > 0 ? cut : 1);
    if (score > max) max = score;
  });
  return max;
}

/**
 * Order a selection of participant ids worst-first for the cohort stepper
 * (PPRF-5). Primary key: the severity rank of the on-treatment Hy's-Law quadrant
 * (Hy's Law first) from the shared hep-core reduction; tie-break by peak ALT
 * ×ULN descending. Ids the reduction excludes (or whose data forms no quadrant)
 * sort after every quadrant-ranked id, by fallback peak severity descending.
 * All ties break by id ascending, so the order is deterministic.
 * @param {Object[]} cleanRows All cleaned rows.
 * @param {string[]} ids The selected participant ids.
 * @param {Object} settings Normalized settings.
 * @returns {string[]} The ids, worst-first.
 */
export function rankParticipants(cleanRows, ids, settings) {
  const wanted = new Set(ids.map(String));
  const { subjects } = buildHepSubjects(cleanRows, settings);
  const subjectById = new Map();
  subjects.forEach((subject) => {
    if (wanted.has(String(subject.id))) subjectById.set(String(subject.id), subject);
  });

  const rowsById = new Map();
  cleanRows.forEach((row) => {
    const rid = String(row[settings.id_col]);
    if (!wanted.has(rid)) return;
    if (!rowsById.has(rid)) rowsById.set(rid, []);
    rowsById.get(rid).push(row);
  });

  const scored = ids.map((id) => {
    const sid = String(id);
    const subject = subjectById.get(sid);
    if (subject) {
      const quadrantRank = SEVERITY_ORDER.indexOf(subject.onTreatQuadrant);
      return {
        id,
        group: 0,
        primary: quadrantRank < 0 ? SEVERITY_ORDER.length : quadrantRank,
        secondary: Number.isFinite(subject.peakAltULN) ? subject.peakAltULN : -Infinity
      };
    }
    return {
      id,
      group: 1,
      primary: 0,
      secondary: fallbackSeverity(rowsById.get(sid) || [], settings)
    };
  });

  scored.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === 0) {
      if (a.primary !== b.primary) return a.primary - b.primary;
      if (a.secondary !== b.secondary) return b.secondary - a.secondary;
    } else if (a.secondary !== b.secondary) {
      return b.secondary - a.secondary;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  return scored.map((entry) => entry.id);
}

export { templateProfileURL };
