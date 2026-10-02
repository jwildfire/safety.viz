// Axis configuration for the shift-plot module (#14, #136). Both axes share
// one domain — of whichever scale type is selected — so the identity line
// stays at 45° and a participant's shift is read as distance from that line
// (SSP-CHART-001/002). The linear/log choice is therefore per-chart, never per
// axis: two axes with different scale types could not share a domain and the
// identity line would stop meaning y = x (SSP-SCALE-001).

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

/**
 * Chart.js scale config for the scatter: matching x/y axes of one scale type,
 * clamped to the shared domain and labelled Baseline Value (x) and Comparison
 * Value (y).
 * @param {[number, number]} domain The shared [min, max] applied to both axes.
 * @param {string} [measure] Measure name appended to the axis titles when given.
 * @param {string} [type='linear'] Axis scale type from AXIS_TYPES: 'linear' or
 *   'log'; anything else falls back to linear. Applied to BOTH axes.
 * @returns {Object} The Chart.js `scales` option.
 */
export function buildScales(domain, measure, type = 'linear') {
  const suffix = measure ? ` — ${measure}` : '';
  const scaleType = type === 'log' ? 'logarithmic' : 'linear';
  return {
    x: {
      type: scaleType,
      min: domain[0],
      max: domain[1],
      title: { display: true, text: `Baseline Value${suffix}` },
      ticks: { maxRotation: 0 }
    },
    y: {
      type: scaleType,
      min: domain[0],
      max: domain[1],
      title: { display: true, text: `Comparison Value${suffix}` }
    }
  };
}
