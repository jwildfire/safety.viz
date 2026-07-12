// Data preparation for the results-over-time module (#27): cleaning, filtering,
// visit ordering, unscheduled-visit detection, per-visit-group summary
// statistics, and outlier flagging. Ports the original renderer's
// onPreprocess/defineMeasureData pipeline (RhoInc/safety-results-over-time) —
// the same d3.quantile (R-7) statistics — to plain, unit-testable functions.

/**
 * Distinct, non-empty values in first-seen order.
 * @param {Array} values Values to dedupe.
 * @returns {Array} The distinct values.
 */
export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

/**
 * The p-quantile of a numeric sample by the R-7 rule (d3.quantile).
 * @param {number[]} values Numeric sample (need not be sorted).
 * @param {number} p Probability in [0, 1].
 * @returns {number} The interpolated quantile, or NaN for an empty sample.
 */
export function quantile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * The arithmetic mean of a numeric sample.
 * @param {number[]} values Numeric sample.
 * @returns {number} The mean.
 */
export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The sample (n-1) standard deviation, matching d3.deviation — NaN for
 * samples smaller than two.
 * @param {number[]} values Numeric sample.
 * @returns {number} The standard deviation, or NaN when n < 2.
 */
export function sd(values) {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / (values.length - 1)
  );
}

/**
 * The number of decimal places carried by the values, capped at four.
 * @param {Array} values Raw values.
 * @returns {number} The decimal precision.
 */
export function precision(values) {
  const decimals = values.map((value) => {
    const text = String(value);
    return text.includes('.') ? text.split('.')[1].length : 0;
  });
  return Math.min(4, Math.max(0, ...decimals));
}

/**
 * Remove missing and non-numeric results, reporting how many were dropped.
 * Each kept row gains __srot_index (source order) and __srot_value (numeric
 * result).
 * @param {Object[]} rawData Long-format result records.
 * @param {ResultsOverTimeSettings} settings Column mappings.
 * @returns {{rows: Object[], removed: number}} Cleaned rows and the removed count.
 */
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => ({
      ...row,
      __srot_index: index,
      __srot_value: Number(row[settings.value_col])
    }))
    .filter((row) => {
      const keep = row[settings.value_col] !== '' && Number.isFinite(row.__srot_value);
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

/**
 * The measure label for a row: the measure name with its unit appended when
 * a unit column is mapped and present.
 * @param {Object} row A data record.
 * @param {ResultsOverTimeSettings} settings Column mappings.
 * @returns {string} The measure label.
 */
export function measureLabel(row, settings) {
  const measure = row[settings.measure_col];
  const unit = settings.unit_col ? row[settings.unit_col] : null;
  return unit ? `${measure} (${unit})` : measure;
}

/**
 * Apply the active filter selections (column → value) to a set of rows.
 * @param {Object[]} rows Rows to filter.
 * @param {Object<string,?string>} filters Column → selected value (nullish means "all").
 * @returns {Object[]} The filtered rows.
 */
export function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, value]) => !value || String(row[key]) === String(value))
  );
}

/**
 * The ordered set of visits: by the numeric order column when it is mapped and
 * present in the data, otherwise alphanumeric. Mirrors the original renderer's
 * defineVisitOrder.
 * @param {Object[]} rows Data records.
 * @param {ResultsOverTimeSettings} settings Column mappings (time_col, time_order_col).
 * @returns {string[]} Visit names in display order.
 */
export function computeVisitOrder(rows, settings) {
  const timeCol = settings.time_col;
  const orderCol = settings.time_order_col;
  const hasOrder =
    orderCol && rows.some((row) => row[orderCol] !== undefined && row[orderCol] !== '');
  if (hasOrder) {
    const keyed = unique(rows.map((row) => `${row[orderCol]}|${row[timeCol]}`));
    return keyed
      .sort((a, b) => {
        const diff = Number(a.split('|')[0]) - Number(b.split('|')[0]);
        return diff || a.localeCompare(b);
      })
      .map((entry) => entry.split('|').slice(1).join('|'));
  }
  // No order column: plain lexicographic sort, matching the original
  // renderer's defineVisitOrder fallback (d3.set(...).values().sort()).
  return unique(rows.map((row) => row[timeCol])).sort();
}

/**
 * Summary statistics for a numeric sample — the tooltip fields of the original
 * renderer (N, min, 5th %, Q1, median, Q3, 95th %, max, mean, StDev).
 * @param {number[]} values Numeric sample.
 * @returns {{n:number,min:number,q5:number,q25:number,median:number,q75:number,q95:number,max:number,mean:number,deviation:number,values:number[]}} The statistics.
 */
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    q5: quantile(sorted, 0.05),
    q25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q75: quantile(sorted, 0.75),
    q95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean: mean(sorted),
    deviation: sd(sorted),
    values: sorted
  };
}

/**
 * The group key for a row given the active grouping column; rows fall into a
 * single 'All' group when grouping is disabled ('srot_none' or falsy).
 * @param {Object} row A data record.
 * @param {?string} groupCol The grouping column, or 'srot_none' / null for no grouping.
 * @returns {string} The group key.
 */
export function groupKey(row, groupCol) {
  if (!groupCol || groupCol === 'srot_none') return 'All';
  return String(row[groupCol]);
}

/**
 * Nest rows by visit then group and compute summary statistics for each
 * visit-group combination.
 * @param {Object[]} rows Data records (with numeric results).
 * @param {{timeCol:string, valueCol:string, groupCol:?string}} columns Column accessors.
 * @returns {Object<string, Object<string, Object>>} statsByVisit[visit][group] = summary.
 */
export function summarizeVisitGroups(rows, { timeCol, valueCol, groupCol }) {
  const nested = {};
  const buckets = new Map();
  for (const row of rows) {
    const visit = row[timeCol];
    const group = groupKey(row, groupCol);
    const key = `${visit}\u0000${group}`;
    if (!buckets.has(key)) buckets.set(key, { visit, group, values: [] });
    buckets.get(key).values.push(Number(row[valueCol]));
  }
  for (const { visit, group, values } of buckets.values()) {
    if (!nested[visit]) nested[visit] = {};
    nested[visit][group] = summarize(values);
  }
  return nested;
}

/**
 * Flag each row as an outlier when its result falls outside the 5th/95th
 * percentiles of its visit-group — only when outlier display is enabled.
 * The group is recomputed from groupCol on every call: render reuses the same
 * row objects across grouping changes, so a memoized group would go stale and
 * miss every stats lookup. Mutates the rows (setting __srot_group and
 * __srot_outlier) and returns them.
 * @param {Object[]} rows Data records (with __srot_value set).
 * @param {Object} statsByVisitGroup Nested statistics from summarizeVisitGroups.
 * @param {ResultsOverTimeSettings & {outliers:boolean}} settings Column mappings + the outliers toggle.
 * @param {?string} [groupCol] Grouping column for the current render, if any.
 * @returns {Object[]} The same rows, flagged.
 */
export function flagOutliers(rows, statsByVisitGroup, settings, groupCol) {
  for (const row of rows) {
    const visit = row[settings.time_col];
    const group = groupKey(row, groupCol);
    row.__srot_group = group;
    const stats = (statsByVisitGroup[visit] || {})[group];
    row.__srot_outlier =
      settings.outliers && stats
        ? row.__srot_value < stats.q5 || row.__srot_value > stats.q95
        : false;
  }
  return rows;
}

/**
 * Parse an unscheduled-visit pattern string. Accepts the /source/flags form
 * used by the original renderer's settings, or a plain source string.
 * @param {string} pattern The pattern string.
 * @returns {RegExp} The compiled expression.
 */
export function parseUnscheduledPattern(pattern) {
  const match = /^\/(.*)\/([a-z]*)$/i.exec(String(pattern));
  return match ? new RegExp(match[1], match[2]) : new RegExp(String(pattern));
}

/**
 * Whether a visit is unscheduled: an explicit unscheduled_visit_values list
 * takes precedence over the unscheduled_visit_pattern.
 * @param {string} visit The visit name.
 * @param {ResultsOverTimeSettings} settings The unscheduled-visit settings.
 * @returns {boolean} True when the visit is unscheduled.
 */
export function isUnscheduledVisit(visit, settings) {
  if (Array.isArray(settings.unscheduled_visit_values)) {
    return settings.unscheduled_visit_values.map(String).includes(String(visit));
  }
  if (settings.unscheduled_visit_pattern) {
    return parseUnscheduledPattern(settings.unscheduled_visit_pattern).test(String(visit));
  }
  return false;
}
