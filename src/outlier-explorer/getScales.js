// Axis handling for the outlier-explorer module (#24): the y-axis limit domain
// (default from the measure results, user overrides, invert-normalization,
// reset), the stepper increment, and the x-axis scale config that switches
// between a linear time axis and an ordinal visit axis.

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

// Default y-domain from the measure results, padded slightly so the min/max
// points are not clipped by the chart edge (SOE-REG-034).
export function defaultYDomain(values) {
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * 0.04;
  return [min - pad, max + pad];
}

// Resolve the active y-domain from the measure results and any user-entered
// lower/upper overrides (SOE-FUNC-005). A null override falls back to default.
export function resolveYDomain(values, lower, upper) {
  const domain = defaultYDomain(values);
  return [lower == null ? domain[0] : lower, upper == null ? domain[1] : upper];
}

// Swap inverted user-entered limits in place (SOE-FUNC-005 / setYdomain reverse).
export function normalizeYDomain(state) {
  if (Number.isFinite(state.lower) && Number.isFinite(state.upper) && state.lower >= state.upper) {
    const tmp = state.lower;
    state.lower = state.upper;
    state.upper = tmp;
  }
}

// Stepper increment ~1/15 of the y-range, snapped to a power of ten so the
// arrows move by a "reasonable factor" (SOE-REG-033): range 150 -> 10,
// range 1.5 -> 0.1.
export function axisStep(range) {
  if (!(range > 0)) return 1;
  const raw = range / 15;
  return Math.pow(10, Math.floor(Math.log10(raw)));
}

// Chart.js x-scale config for the active time column. Ordinal visit axes use a
// category scale over the ordered labels with rotated ticks; linear time axes
// use a numeric scale with upright ticks (SOE-REG-028).
export function buildXScale(timeCol, categories) {
  if (timeCol.type === 'ordinal') {
    return {
      type: 'category',
      labels: categories,
      offset: true,
      title: { display: true, text: timeCol.label },
      ticks: { maxRotation: 45, minRotation: 45, autoSkip: true }
    };
  }
  return {
    type: 'linear',
    title: { display: true, text: timeCol.label },
    ticks: { maxRotation: 0, minRotation: 0 }
  };
}

// Chart.js y-scale config bounded to the active domain.
export function buildYScale(domain, label) {
  return {
    type: 'linear',
    min: domain[0],
    max: domain[1],
    title: { display: true, text: label },
    grid: { drawOnChartArea: true }
  };
}
