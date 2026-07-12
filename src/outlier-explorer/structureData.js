// Data preparation for the outlier-explorer module (#24): cleaning, filtering,
// per-participant series building, the derived time index, and the normal-range
// statistics. Small numeric helpers mirror the histogram's structureData.js so
// the two renderers read the same.

import { OE_SEQ } from './configure.js';

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
    Object.entries(filters).every(([key, value]) => !value || String(row[key]) === String(value))
  );
}

// Assigns the derived 1-based measurement sequence per participant, in input
// order — the synthetic time axis used when the data carries no visit column.
// Mutates each row with __oe_seq and returns the rows.
export function assignSequence(rows, idCol) {
  const counts = new Map();
  rows.forEach((row) => {
    const id = row[idCol];
    const next = (counts.get(id) || 0) + 1;
    counts.set(id, next);
    row[OE_SEQ] = next;
  });
  return rows;
}

// The x value a row plots at for a given time column: the derived sequence, a
// numeric linear value, or an ordinal category label.
export function timeValue(row, timeCol) {
  if (timeCol.value_col === OE_SEQ) return row[OE_SEQ];
  const raw = row[timeCol.value_col];
  return timeCol.type === 'ordinal' ? raw : Number(raw);
}

// The sort key ordering a participant's points along the axis.
export function timeOrder(row, timeCol) {
  if (timeCol.value_col === OE_SEQ) return row[OE_SEQ];
  return Number(row[timeCol.order_col]);
}

// The human-readable time label shown in tooltips and the listing.
export function timeLabel(row, timeCol) {
  if (timeCol.value_col === OE_SEQ) return `#${row[OE_SEQ]}`;
  return String(row[timeCol.value_col]);
}

// Ordered category labels for an ordinal axis: unique visit values sorted by
// the order column (SOE-REG-028 axis ordering).
export function orderedCategories(rows, timeCol) {
  const seen = new Map();
  rows.forEach((row) => {
    const label = String(row[timeCol.value_col]);
    if (!seen.has(label)) seen.set(label, timeOrder(row, timeCol));
  });
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
}

// Builds one series per participant: points sorted along the time axis, tagged
// with the participant id, the color-by group value, and per-point raw record.
// This is the model the single null-separated Chart.js line dataset is built
// from (one line per participant without one dataset per participant).
export function buildSeries(rows, settings, timeCol, groupBy) {
  const byId = new Map();
  rows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });
  const series = [];
  byId.forEach((records, id) => {
    const points = records
      .map((row) => ({
        x: timeValue(row, timeCol),
        y: row.__oe_value,
        order: timeOrder(row, timeCol),
        label: timeLabel(row, timeCol),
        raw: row
      }))
      .sort((a, b) => a.order - b.order);
    const group = groupBy && groupBy !== OE_SEQ ? records[0][groupBy] : null;
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
