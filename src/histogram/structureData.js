// Data preparation: cleaning, filtering, grouping helpers, and the binning
// algorithms — extracted from the safety-histogram pilot (dev @ a3ff9f7) under #2.

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

export function quantile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
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

export function precision(values) {
  const decimals = values.map((value) => {
    const text = String(value);
    return text.includes('.') ? text.split('.')[1].length : 0;
  });
  return Math.min(4, Math.max(0, ...decimals));
}

// Display precision for bin labels and tooltips (#15): just enough decimals
// to resolve the bin width (d3's precisionFixed rule), never more than the
// data itself carries — so real-world results with long fractional tails
// don't produce noisy axis labels.
export function displayDigits(width, values) {
  if (!Number.isFinite(width) || width <= 0) return precision(values);
  return Math.min(precision(values), Math.max(0, -Math.floor(Math.log10(width))));
}

// Removes missing/non-numeric results, reporting how many were dropped (SH-DATA-002).
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => ({
      ...row,
      __sh_index: index,
      __sh_value: Number(row[settings.value_col])
    }))
    .filter((row) => {
      const keep = row[settings.value_col] !== '' && Number.isFinite(row.__sh_value);
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

export function measureLabel(row, settings) {
  const measure = row[settings.measure_col];
  const unit = settings.unit_col ? row[settings.unit_col] : null;
  return unit ? `${measure} (${unit})` : measure;
}

// Whether any row of the (current-measure) data carries usable normal-range
// limits — drives normal-range control availability (SH-FUNC-004C).
export function measureHasNormalRange(rows, settings) {
  if (!settings.normal_col_low || !settings.normal_col_high) return false;
  return rows.some((row) => {
    const low = row[settings.normal_col_low];
    const high = row[settings.normal_col_high];
    return (
      low !== undefined &&
      low !== null &&
      low !== '' &&
      Number.isFinite(Number(low)) &&
      high !== undefined &&
      high !== null &&
      high !== '' &&
      Number.isFinite(Number(high))
    );
  });
}

export function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, value]) => !value || String(row[key]) === String(value))
  );
}

export function calculateBins(values, algorithm, customQuantity, customWidth, domain) {
  const n = values.length;
  const min = domain ? domain[0] : Math.min(...values);
  const max = domain ? domain[1] : Math.max(...values);
  const range = max - min || 1;
  let quantity;
  let width;

  if (algorithm === 'Custom') {
    quantity = customQuantity ? Math.max(1, Math.round(customQuantity)) : null;
    width = customWidth ? Math.max(Number.EPSILON, Number(customWidth)) : null;
  }

  if (!quantity && !width) {
    if (algorithm === 'Square-root choice') quantity = Math.ceil(Math.sqrt(n));
    else if (algorithm === "Sturges' formula") quantity = Math.ceil(Math.log2(n) + 1);
    else if (algorithm === 'Rice Rule') quantity = Math.ceil(2 * Math.cbrt(n));
    else if (algorithm === "Freedman-Diaconis' choice") {
      width = (2 * (quantile(values, 0.75) - quantile(values, 0.25))) / Math.cbrt(n);
      quantity = width > 0 ? Math.ceil(range / width) : Math.ceil(Math.sqrt(n));
    } else if (algorithm === "Shimazaki and Shinomoto's choice") quantity = Math.ceil(Math.sqrt(n));
    else {
      width = (3.5 * sd(values)) / Math.cbrt(n);
      quantity = width > 0 ? Math.ceil(range / width) : Math.ceil(Math.sqrt(n));
    }
  }

  if (!quantity && width) quantity = Math.ceil(range / width);
  quantity = Math.max(1, quantity || 1);
  width = range / quantity;

  const bins = Array.from({ length: quantity }, (_, index) => {
    const lower = min + index * width;
    const upper = index === quantity - 1 ? max : min + (index + 1) * width;
    return { index, lower, upper, records: [] };
  });

  values.forEach((value, idx) => {
    let binIndex = Math.floor((value - min) / width);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= bins.length) binIndex = bins.length - 1;
    bins[binIndex].records.push(idx);
  });

  return { bins, quantity, width, domain: [min, max] };
}
