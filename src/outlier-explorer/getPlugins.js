// Chart.js plugin + mark-styling helpers for the outlier-explorer module (#24):
// the normal-range band overlay, the color-by-group palette, and the point
// tooltip text. Mirrors the histogram's getPlugins.js split of pure helpers
// (unit-tested) from the canvas plugin (browser-tested).

// Categorical palette for color-by grouping (SOE-REG-049). Distinct, print- and
// colorblind-considerate hues; cycles when a grouping has more categories.
export const GROUP_COLORS = [
  '#1f78b4',
  '#e31a1c',
  '#33a02c',
  '#ff7f00',
  '#6a3d9a',
  '#b15928',
  '#00838f',
  '#c2185b'
];

// Highlight color for the selected participant's marks (SOE-REG-013/016).
export const SELECTION_COLOR = '#111827';

/**
 * Convert a #rrggbb hex color to an rgba() string at the given opacity.
 * @param {string} hex Hex color (with or without leading #).
 * @param {number} opacity Alpha in [0, 1].
 * @returns {string} The rgba() color string.
 */
export function hexToRgba(hex, opacity) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Map each group value to a stable palette color (SOE-REG-049/050).
 * @param {Array<string>} groupValues Ordered distinct group values.
 * @returns {Map<string, string>} value -> hex color.
 */
export function groupColorScale(groupValues) {
  const scale = new Map();
  groupValues.forEach((value, index) => {
    scale.set(String(value), GROUP_COLORS[index % GROUP_COLORS.length]);
  });
  return scale;
}

/**
 * Tooltip text lines for a data point (SOE-REG-011): participant, result, and
 * time, plus any configured tooltip_cols (SOE-CFG-006).
 * @param {Object} point The plotted point ({ y, label, raw }).
 * @param {Object} settings Normalized settings.
 * @param {string} measureText The active measure label.
 * @returns {Array<string>} Tooltip lines.
 */
export function pointTooltip(point, settings, measureText) {
  const lines = [
    String(point.raw[settings.id_col]),
    `${measureText}: ${point.y}`,
    `Time: ${point.label}`
  ];
  settings.tooltip_cols.forEach((col) => {
    const value = point.raw[col.value_col];
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`${col.label}: ${value}`);
    }
  });
  return lines;
}

/**
 * Chart.js plugin drawing the normal-range band: a shaded horizontal region
 * between the ULN and LLN across the full plot width, with dashed boundary
 * lines (SOE-FUNC-007). Records the overlay geometry on chart.$oeNormalRangeOverlay
 * so tests can assert against it; null when no band is active.
 * @param {Object} instance The live outlier-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function normalRangePlugin(instance) {
  return {
    id: `oe-normal-range-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$oeNormalRangeOverlay = null;
      const range = instance.state.normalRange;
      if (!range) return;
      const { ctx, chartArea, scales } = chart;
      const yHigh = scales.y.getPixelForValue(range.high);
      const yLow = scales.y.getPixelForValue(range.low);
      const top = Math.max(chartArea.top, Math.min(yHigh, yLow));
      const bottom = Math.min(chartArea.bottom, Math.max(yHigh, yLow));
      const height = Math.max(0, bottom - top);
      chart.$oeNormalRangeOverlay = {
        low: range.low,
        high: range.high,
        top,
        bottom,
        height,
        left: chartArea.left,
        right: chartArea.right
      };
      if (!height) return;
      ctx.save();
      ctx.fillStyle = 'rgba(46, 125, 50, 0.12)';
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, height);
      ctx.strokeStyle = 'rgba(46, 125, 50, 0.55)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, top);
      ctx.lineTo(chartArea.right, top);
      ctx.moveTo(chartArea.left, bottom);
      ctx.lineTo(chartArea.right, bottom);
      ctx.stroke();
      ctx.restore();
    }
  };
}
