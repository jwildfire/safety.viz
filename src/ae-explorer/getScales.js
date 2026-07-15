// Inline row-plot scale math for the ae-explorer module (#60): linear
// pixel scales for the shared rate axis and the symmetric difference axis,
// inset by the configured margins (AE-REG-046). Pure math — the SVG marks
// render in the module entry.

/**
 * A linear scale from a domain onto a pixel range.
 * @private
 */
function linear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return {
    domain,
    range,
    x: (value) => r0 + ((value - d0) / span) * (r1 - r0)
  };
}

/**
 * The shared percent axis for the rate dot plot: 0 to the highest group
 * rate, inset by plot_settings.margin (AE-USER-012, AE-REG-046).
 * @param {number} maxPer Highest group rate shown, in percent.
 * @param {Object} plot The plot_settings object ({width, margin}).
 * @returns {{domain: number[], range: number[], x: Function}} The scale.
 */
export function makePercentScale(maxPer, plot) {
  return linear([0, maxPer || 1], [plot.margin.left, plot.width - plot.margin.right]);
}

/**
 * The difference axis, symmetric around zero over the observed extent so
 * equal differences read equally in both directions (AE-USER-013).
 * @param {number[]} extent The [min, max] of every interval bound shown.
 * @param {Object} plot The plot_settings object ({width, diff_margin}).
 * @returns {{domain: number[], range: number[], x: Function}} The scale.
 */
export function makeDiffScale(extent, plot) {
  const reach = Math.max(Math.abs(extent[0] || 0), Math.abs(extent[1] || 0)) || 1;
  return linear([-reach, reach], [plot.diff_margin.left, plot.width - plot.diff_margin.right]);
}

/**
 * One-decimal percent formatting for rate cells and axis labels.
 * @param {number} value The percentage.
 * @returns {string} The value with one decimal place.
 */
export function formatPercent(value) {
  return (Number(value) || 0).toFixed(1);
}
