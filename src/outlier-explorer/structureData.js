// Data preparation for the outlier-explorer module (#24): cleaning, filtering,
// per-participant series building along the active x-axis option (#371), and
// the normal-range statistics. Small numeric helpers mirror the histogram's
// structureData.js so the two renderers read the same.

import { filterMatches } from '../filters.js';
import { xAxisTick, xAxisValue } from '../x-axis.js';

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / (values.length - 1)
  );
}

// Linear-interpolated quantile (R-7 / d3.quantile), matching the histogram.
export function quantile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values) {
  return quantile(values, 0.5);
}

export function precision(values) {
  const decimals = values.map((value) => {
    const text = String(value);
    return text.includes('.') ? text.split('.')[1].length : 0;
  });
  return Math.min(4, Math.max(0, ...decimals, 0));
}

// Removes missing/non-numeric results, reporting how many were dropped
// (SOE-REG-037/038). Mirrors the histogram's cleanData with an oe_ prefix.
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => ({
      ...row,
      __oe_index: index,
      __oe_value: Number(row[settings.value_col])
    }))
    .filter((row) => {
      const keep = row[settings.value_col] !== '' && Number.isFinite(row.__oe_value);
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

// Measure label with unit appended when present (SOE-REG-029/031).
export function measureLabel(row, settings) {
  const measure = row[settings.measure_col];
  const unit = settings.unit_col ? row[settings.unit_col] : null;
  return unit ? `${measure} (${unit})` : measure;
}

export function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters || {}).every(([key, value]) => filterMatches(row[key], value))
  );
}

const blank = (value) => value === undefined || value === null || String(value).trim() === '';

// Whether a row has a place on an x-axis option: a study day for a linear
// option, a visit for an ordinal one (#371).
export function hasPosition(row, option) {
  if (option.type === 'linear') return Number.isFinite(xAxisValue(option, row));
  return !blank(row[option.col]);
}

// The x value a row plots at on an x-axis option: its study day on a linear
// axis, its visit's category on an ordinal one — the visit name, or the name
// with its number when `names` (from categoryNames) tells it apart.
export function timeValue(row, option, names = null) {
  if (option.type !== 'ordinal') return xAxisValue(option, row);
  const name = names ? names.get(categoryKey(row, option)) : undefined;
  return name ?? xAxisTick(option, row);
}

// The sort key ordering a participant's points along the axis: the study day,
// or the visit's number — its order_col when the option came from time_cols.
export function timeOrder(row, option) {
  if (option.type !== 'ordinal' || !option.order_col) return xAxisValue(option, row);
  return xAxisValue({ ...option, col: option.order_col }, row);
}

// The time label shown in tooltips and the listing (#371): the row's visit and
// study day, each where the row has it, from every x-axis option — "Week 8 ·
// Day 57" — so the label is the same whichever view is plotted.
export function timeLabels(row, options) {
  return options
    .filter((option) => hasPosition(row, option))
    .map((option) => {
      const tick = xAxisTick(option, row);
      return option.type === 'linear' && option.key !== 'day'
        ? `${option.title} ${xAxisValue(option, row)}`
        : tick;
    })
    .filter((label) => !blank(label))
    .join(' · ');
}

// One category per visit: keyed by the visit number where there is one, else
// by the visit name.
function categoryKey(row, option) {
  const order = timeOrder(row, option);
  return Number.isFinite(order) ? String(order) : xAxisTick(option, row);
}

// The category name for each visit on an ordinal axis (#384): the visit name,
// unless visits with different numbers share it (real data often labels every
// unscheduled visit "UNSCHEDULED"), when each is named with its number —
// "UNSCHEDULED (2.1)" — so the two never collapse into one category.
export function categoryNames(rows, option) {
  const visits = new Map();
  rows
    .filter((row) => hasPosition(row, option))
    .forEach((row) => {
      const key = categoryKey(row, option);
      if (!visits.has(key))
        visits.set(key, { label: xAxisTick(option, row), order: timeOrder(row, option) });
    });
  const uses = new Map();
  visits.forEach(({ label }) => uses.set(label, (uses.get(label) || 0) + 1));
  const names = new Map();
  visits.forEach(({ label, order }, key) =>
    names.set(key, uses.get(label) > 1 ? `${label} (${order})` : label)
  );
  return names;
}

// Ordered category labels for an ordinal axis: one per visit, sorted by the
// visit number (SOE-REG-028 axis ordering); visits with no number keep the
// order they first appear in.
export function orderedCategories(rows, option, names = categoryNames(rows, option)) {
  const order = new Map();
  rows
    .filter((row) => hasPosition(row, option))
    .forEach((row) => {
      const key = categoryKey(row, option);
      if (!order.has(key)) order.set(key, timeOrder(row, option));
    });
  const byOrder = (a, b) => (Number.isFinite(a[1]) && Number.isFinite(b[1]) ? a[1] - b[1] : 0);
  return [...order.entries()].sort(byOrder).map(([key]) => names.get(key));
}

// Builds one series per participant: points sorted along the active x-axis
// option, tagged with the participant id, the color-by group value, and
// per-point raw record. A record with no place on the axis (no study day in
// Study day view) is left out rather than drawn at zero (#371). This is the
// model the single null-separated Chart.js line dataset is built from (one
// line per participant without one dataset per participant).
export function buildSeries(rows, settings, option, groupBy, names = null) {
  const byId = new Map();
  rows.forEach((row) => {
    if (!hasPosition(row, option)) return;
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });
  const series = [];
  byId.forEach((records, id) => {
    const points = records
      .map((row) => ({
        x: timeValue(row, option, names),
        y: row.__oe_value,
        order: timeOrder(row, option),
        label: row.__oe_timeLabel ?? '',
        raw: row
      }))
      .sort((a, b) => a.order - b.order);
    const group = groupBy ? records[0][groupBy] : null;
    series.push({ id, group, points });
  });
  return series.sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
}

// Normal-range band bounds for the current measure results per the selected
// method (SOE-FUNC-007). Returns null for "None" or when LLN-ULN limits are
// unavailable.
export function computeNormalRange(rows, settings) {
  const method = settings.normal_range_method;
  if (method === 'None' || !rows.length) return null;
  const results = rows.map((row) => row.__oe_value);
  if (method === 'Standard Deviation') {
    const m = mean(results);
    const s = sd(results);
    return { low: m - settings.normal_range_sd * s, high: m + settings.normal_range_sd * s };
  }
  if (method === 'Quantiles') {
    return {
      low: quantile(results, settings.normal_range_quantile_low),
      high: quantile(results, settings.normal_range_quantile_high)
    };
  }
  // LLN-ULN: median of the per-record limit columns (the original's default).
  const lows = rows.map((row) => Number(row[settings.normal_col_low])).filter(Number.isFinite);
  const highs = rows.map((row) => Number(row[settings.normal_col_high])).filter(Number.isFinite);
  if (!lows.length || !highs.length) return null;
  return { low: median(lows), high: median(highs) };
}

// Count of observations inside the normal-range band — the "inlier" count the
// original shows to the left of the chart.
export function countInliers(rows, normalRange) {
  if (!normalRange) return null;
  return rows.filter(
    (row) => row.__oe_value >= normalRange.low && row.__oe_value <= normalRange.high
  ).length;
}
