// Axis configuration for the shift-plot module (#14). Both axes share one
// linear domain so the identity line stays at 45° and a participant's shift is
// read as distance from that line (SSP-CHART-001/002).

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

/**
 * Chart.js scale config for the scatter: matching linear x/y axes clamped to
 * the shared domain, labelled Baseline Value (x) and Comparison Value (y).
 * @param {[number, number]} domain The shared [min, max] applied to both axes.
 * @param {string} [measure] Measure name appended to the axis titles when given.
 * @returns {Object} The Chart.js `scales` option.
 */
export function buildScales(domain, measure) {
  const suffix = measure ? ` — ${measure}` : '';
  return {
    x: {
      type: 'linear',
      min: domain[0],
      max: domain[1],
      title: { display: true, text: `Baseline Value${suffix}` },
      ticks: { maxRotation: 0 }
    },
    y: {
      type: 'linear',
      min: domain[0],
      max: domain[1],
      title: { display: true, text: `Comparison Value${suffix}` }
    }
  };
}
