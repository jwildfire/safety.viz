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
//
// The numeric helpers (mean/median/quantile) moved to src/hep-core/stats.js in
// safety.viz#91, and the row-level reducers (cleanData, assignSequence,
// hasStudyDay, deriveBaseline, resolveMeasureRows, participantPeak,
// computeRRatio, participantMeasureSeries, measureSummary) moved VERBATIM to
// src/hep-core/rows.js in safety.viz#98 so the participant-profile module can
// consume them without a renderer-specific import (PPRF-1). Both sets are
// re-exported below for compatibility so no existing caller or test churns.

import { GROUP_NONE } from './configure.js';
import { QUADRANT_LABELS } from './getPlugins.js';
import { mean, median, quantile } from '../hep-core/stats.js';
import {
  cleanData,
  assignSequence,
  hasStudyDay,
  deriveBaseline,
  resolveMeasureRows,
  participantPeak,
  computeRRatio,
  participantMeasureSeries,
  measureSummary,
  displayField,
  dayThenIndex
} from '../hep-core/rows.js';

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

/**
 * @deprecated Since safety.viz#91 — `mean`, `median` and `quantile` moved
 * VERBATIM to `src/hep-core/stats.js`, where the migration Sankey
 * (safety.viz#92) and the ALT waterfall (safety.viz#93) can reach them without
 * the eDISH data pipeline; see obot.roadmap#43. This pure re-export keeps the
 * original import path valid so the split touches no test file, and is removed
 * by the follow-up `hep-core-cleanup` chunk.
 */
export { mean, median, quantile };

/**
 * @deprecated Since safety.viz#98 — the row-level cleaning, derivation, and
 * per-participant series/summary reducers moved VERBATIM to
 * `src/hep-core/rows.js` so the participant-profile module (PPRF-1) consumes
 * them without importing this renderer file. These pure re-exports keep the
 * original import path valid so the split touches no hep-explorer caller or
 * test. `participantPeak`, `displayField`, and `dayThenIndex` travel along as
 * dependencies of the listed functions.
 */
export {
  cleanData,
  assignSequence,
  hasStudyDay,
  deriveBaseline,
  resolveMeasureRows,
  participantPeak,
  computeRRatio,
  participantMeasureSeries,
  measureSummary
};

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
