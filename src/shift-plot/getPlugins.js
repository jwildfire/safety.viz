// Chart.js plugins and mark helpers for the shift-plot module (#14): the
// identity (y = x) reference line, the gray brushed-selection rectangle, the
// point tooltip content, and the selected/de-emphasized point coloring. All
// are pure of DOM state — the module feeds them the current domain and
// selection through the chart's `$ssp*` scratch properties.

const POINT_COLOR = 'rgba(37, 99, 235, 0.78)';
const POINT_BORDER = 'rgba(37, 99, 235, 1)';
const POINT_FADED = 'rgba(37, 99, 235, 0.14)';

export const COLORS = { point: POINT_COLOR, border: POINT_BORDER, faded: POINT_FADED };

/**
 * The dashed identity line spanning the shared domain (SSP-CHART-002). Drawn
 * after the points so it reads as a reference overlay.
 * @param {Object} instance The live shift-plot instance (for its state.domain).
 * @returns {Object} A Chart.js plugin.
 */
export function identityLinePlugin(instance) {
  return {
    id: `ssp-identity-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      const domain = instance.state.domain;
      if (!domain) return;
      const { ctx, scales } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(scales.x.getPixelForValue(domain[0]), scales.y.getPixelForValue(domain[0]));
      ctx.lineTo(scales.x.getPixelForValue(domain[1]), scales.y.getPixelForValue(domain[1]));
      ctx.strokeStyle = 'rgba(31, 41, 51, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }
  };
}

/**
 * The translucent gray rectangle around the brushed points (SSP-REQ-006).
 * Reads the pixel rectangle the module records on `chart.$sspBrush`.
 * @returns {Object} A Chart.js plugin.
 */
export function brushBoxPlugin() {
  return {
    id: `ssp-brush-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      const brush = chart.$sspBrush;
      if (!brush) return;
      const { ctx } = chart;
      const width = brush.right - brush.left;
      const height = brush.bottom - brush.top;
      ctx.save();
      ctx.fillStyle = 'rgba(120, 120, 120, 0.18)';
      ctx.strokeStyle = 'rgba(90, 90, 90, 0.65)';
      ctx.lineWidth = 1;
      ctx.fillRect(brush.left, brush.top, width, height);
      ctx.strokeRect(brush.left, brush.top, width, height);
      ctx.restore();
    }
  };
}

/**
 * Tooltip lines for a hovered point: subject ID, baseline, comparison, change,
 * and percent change (SSP-REG-006).
 * @param {Object} pair A pair record from computeShiftPairs.
 * @param {string} idCol The participant-id column name.
 * @returns {string[]} One line per field.
 */
export function tooltipLines(pair, idCol) {
  return [
    `Subject ID: ${pair[idCol]}`,
    `Baseline: ${pair.__ssp_baseline}`,
    `Comparison: ${pair.__ssp_comparison}`,
    `Change: ${pair.__ssp_chg}`,
    `Percent Change: ${pair.__ssp_pchg}`
  ];
}

/**
 * Per-point colors that keep the selected points saturated and fade the rest
 * (SSP-REQ-007). With no selection every point uses the base color.
 * @param {number} count Number of points.
 * @param {?Set<number>} selected Indices of the selected points, or null for none.
 * @param {string} [base=COLORS.point] Base fill for selected/all points.
 * @param {string} [faded=COLORS.faded] Fill for de-emphasized points.
 * @returns {string|string[]} A single color when nothing is selected, else a per-point array.
 */
export function pointColors(count, selected, base = POINT_COLOR, faded = POINT_FADED) {
  if (!selected || !selected.size) return base;
  return Array.from({ length: count }, (_, index) => (selected.has(index) ? base : faded));
}
