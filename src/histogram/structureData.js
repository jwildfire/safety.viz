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

// Faithful port of the original renderer's Shimazaki-Shinomoto choice
// (calculateSSBinWidth.js, validated by executing the original against d3 v3,
// quirks included): for candidate bin counts 2..99, count the results in
// candidate−1 uniform bins over the results' extent (d3 v3
// layout.histogram().bins(candidate − 1)), score
// cost = (2·mean − Σ(count − mean)²/candidate) / (span/candidate)², and keep
// the first candidate that minimizes the cost.
export function shimazakiShinomotoBins(values, span) {
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  let best = 2;
  let bestCost = Infinity;
  for (let candidate = 2; candidate < 100; candidate += 1) {
    const binWidth = span / candidate;
    const binCount = candidate - 1;
    const counts = new Array(binCount).fill(0);
    const countWidth = (hi - lo) / binCount;
    for (const value of values) counts[binIndex(value, lo, countWidth, binCount)] += 1;
    const meanCount = counts.reduce((sum, count) => sum + count, 0) / binCount;
    const residual =
      counts.reduce((sum, count) => sum + Math.pow(count - meanCount, 2), 0) / candidate;
    const cost = (2 * meanCount - residual) / Math.pow(binWidth, 2);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

// Uniform-bin assignment matching the original's Webcharts quantile-scale
// thresholds over a two-point domain: right-open bins, boundary values move
// up a bin, and the extremes clamp into the first/last bin.
export function binIndex(value, min, width, binCount) {
  if (!(width > 0)) return 0;
  let index = Math.floor((value - min) / width);
  if (index < 0) index = 0;
  if (index >= binCount) index = binCount - 1;
  return index;
}

// Bin count/width/edges per the original renderer's onPreprocess pipeline
// (#19): each algorithm proposes a count, Scott/FD floor at 5 bins, and every
// algorithmic count is clamped to the number of unique results (a zero-spread
// NaN proposal also falls back to it). The final width is always
// range/quantity, with uniform edges over the domain.
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
    const nUnique = new Set(values).size;
    let proposed;
    if (algorithm === 'Square-root choice') proposed = Math.ceil(Math.sqrt(n));
    else if (algorithm === "Sturges' formula") proposed = Math.ceil(Math.log2(n)) + 1;
    else if (algorithm === 'Rice Rule') proposed = Math.ceil(2 * Math.cbrt(n));
    else if (algorithm === "Freedman-Diaconis' choice") {
      const fdWidth = (2 * (quantile(values, 0.75) - quantile(values, 0.25))) / Math.cbrt(n);
      proposed = fdWidth > 0 ? Math.max(Math.ceil(range / fdWidth), 5) : NaN;
    } else if (algorithm === "Shimazaki and Shinomoto's choice")
      proposed = n ? shimazakiShinomotoBins(values, range) : NaN;
    else {
      const scottWidth = (3.5 * sd(values)) / Math.cbrt(n);
      proposed = scottWidth > 0 ? Math.max(Math.ceil(range / scottWidth), 5) : NaN;
    }
    // The original's clamp: `proposed < nUnique ? proposed : nUnique`, which
    // also routes NaN proposals to the unique-result count.
    quantity = proposed < nUnique ? proposed : nUnique;
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
    bins[binIndex(value, min, width, bins.length)].records.push(idx);
  });

  return { bins, quantity, width, domain: [min, max] };
}
