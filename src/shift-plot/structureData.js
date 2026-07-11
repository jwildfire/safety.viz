// Data preparation for the shift-plot module (#14): cleaning, visit ordering,
// filtering, and the baseline/comparison pairing that turns long-format
// results into one scatter point per participant. The pairing mirrors the
// original renderer's preprocessData.js (nest by id → visit → measure, take
// the first result per visit, then collapse each visit set to one value with
// the configured statistic) without depending on its d3/Webcharts internals.

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Collapse a visit set's values to one number with the configured statistic.
 * A single value is returned as-is (matching the original's one-result
 * shortcut); an empty set yields NaN.
 * @private
 */
export function applyStat(values, stat) {
  if (!values.length) return NaN;
  if (values.length === 1) return values[0];
  if (stat === 'min') return Math.min(...values);
  if (stat === 'max') return Math.max(...values);
  if (stat === 'first') return values[0];
  return mean(values);
}

/**
 * Round to at most `digits` decimals, dropping trailing zeros so listing
 * cells read cleanly.
 * @private
 */
export function roundValue(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits));
}

/**
 * Format a percent change as a signed one-decimal percentage string.
 * @private
 */
export function formatPercent(value) {
  if (!Number.isFinite(value)) return '';
  return `${value.toFixed(1)}%`;
}

// Removes missing/non-numeric results, reporting how many were dropped
// (SSP-REG-020). Invalid *results* are removed row-by-row — a measure is never
// dropped just because some of its rows are invalid.
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => ({
      ...row,
      __ssp_index: index,
      __ssp_value: Number(row[settings.value_col])
    }))
    .filter((row) => {
      const keep = row[settings.value_col] !== '' && Number.isFinite(row.__ssp_value);
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

export function measureLabel(row, settings) {
  return row[settings.measure_col];
}

// Ordered distinct visit labels (SSP-REG-013/014): sorted by the numeric
// visit_order_col when that column is present, else sorted alphanumerically.
export function listVisits(rows, settings) {
  const orderCol = settings.visit_order_col;
  const hasOrder = orderCol && rows.some((row) => row[orderCol] !== undefined);
  const labels = unique(rows.map((row) => row[settings.visit_col]));
  if (!hasOrder) {
    return labels.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }
  const orderOf = new Map();
  rows.forEach((row) => {
    const label = row[settings.visit_col];
    if (label !== undefined && label !== null && label !== '' && !orderOf.has(label)) {
      orderOf.set(label, Number(row[orderCol]));
    }
  });
  return labels.sort((a, b) => {
    const diff = orderOf.get(a) - orderOf.get(b);
    return diff || String(a).localeCompare(String(b), undefined, { numeric: true });
  });
}

export function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, value]) => !value || String(row[key]) === String(value))
  );
}

/**
 * Pair each participant's baseline-visit value against their comparison-visit
 * value for one measure. Within a participant, the first result at each visit
 * is used (the original's per-visit rollup); the baseline and comparison visit
 * sets are then each collapsed to a single value with the configured
 * statistic. Only participants with a value at both a baseline and a
 * comparison visit are returned — a participant needs at least two results to
 * plot (SSP-REG-019). The returned records carry the participant's raw columns
 * (so filters and listing detail columns resolve) plus the numeric plot
 * coordinates `x`/`y` and the display columns `__ssp_baseline`,
 * `__ssp_comparison`, `__ssp_chg`, and `__ssp_pchg` (SSP-REQ-005).
 * @param {Object} inputs Pairing inputs.
 * @param {Object[]} inputs.rows Cleaned result rows (any measure).
 * @param {string} inputs.measure Selected measure value.
 * @param {string[]} inputs.baselineVisits Visit labels forming the baseline (x) axis.
 * @param {string[]} inputs.comparisonVisits Visit labels forming the comparison (y) axis.
 * @param {string} inputs.baselineStat Statistic collapsing multiple baseline results.
 * @param {string} inputs.comparisonStat Statistic collapsing multiple comparison results.
 * @param {import('./configure.js').ShiftPlotSettings} inputs.settings Column mappings.
 * @returns {Object[]} One record per plotted participant, in first-seen order.
 */
export function computeShiftPairs({
  rows,
  measure,
  baselineVisits,
  comparisonVisits,
  baselineStat,
  comparisonStat,
  settings
}) {
  const baseline = new Set(baselineVisits || []);
  const comparison = new Set(comparisonVisits || []);
  const idCol = settings.id_col;
  const visitCol = settings.visit_col;

  const participants = new Map();
  rows.forEach((row) => {
    if (measureLabel(row, settings) !== measure) return;
    const id = row[idCol];
    if (!participants.has(id)) participants.set(id, { firstRow: row, byVisit: new Map() });
    const byVisit = participants.get(id).byVisit;
    const visit = row[visitCol];
    if (!byVisit.has(visit)) byVisit.set(visit, row.__ssp_value);
  });

  const pairs = [];
  participants.forEach(({ firstRow, byVisit }, id) => {
    const baselineValues = [];
    const comparisonValues = [];
    byVisit.forEach((value, visit) => {
      if (baseline.has(visit)) baselineValues.push(value);
      if (comparison.has(visit)) comparisonValues.push(value);
    });
    if (!baselineValues.length || !comparisonValues.length) return;
    const shiftx = applyStat(baselineValues, baselineStat);
    const shifty = applyStat(comparisonValues, comparisonStat);
    if (!Number.isFinite(shiftx) || !Number.isFinite(shifty)) return;
    const chg = shifty - shiftx;
    const pchg = shiftx === 0 ? NaN : (chg / shiftx) * 100;
    pairs.push({
      ...firstRow,
      [idCol]: id,
      x: shiftx,
      y: shifty,
      __ssp_baseline: roundValue(shiftx),
      __ssp_comparison: roundValue(shifty),
      __ssp_chg: roundValue(chg),
      __ssp_pchg: formatPercent(pchg)
    });
  });
  return pairs;
}

/**
 * The shared, square-ish data domain the scatter and identity line span: the
 * combined extent of every x and y value with 5% padding (a single point, or
 * a zero-spread set, falls back to ±1). Sharing one domain across both axes
 * keeps the identity line at 45° (SSP-CHART-002).
 * @param {Object[]} pairs Pair records from computeShiftPairs.
 * @returns {[number, number]} The [min, max] domain applied to both axes.
 */
export function computeDomain(pairs) {
  if (!pairs.length) return [0, 1];
  const values = pairs.flatMap((pair) => [pair.x, pair.y]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.05 || 1;
  return [min - pad, max + pad];
}
