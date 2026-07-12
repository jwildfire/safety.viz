// Chart.js plugin + mark-styling helpers for the hep-explorer module (#43): the
// color-by-group palette, the point tooltip text, the four Hy's-Law quadrant
// labels, and the quadrant cut-line plugin. Mirrors the outlier-explorer's
// getPlugins.js split of pure helpers (unit-tested) from the canvas plugin
// (browser-tested). Requirement groups: HEP-QUAD-* (quadrants/cutpoints),
// HEP-CTRL-009 (grouping), HEP-CHART-004 (tooltip).

import { formatNumber, measureLabel } from './getScales.js';

// Categorical palette for color-by grouping and the participant lab-over-time
// lines (HEP-CTRL-009). Distinct, print- and colorblind-considerate hues; cycles
// when a grouping has more categories.
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

// Highlight color for the selected participant's point and visit path
// (HEP-SELECT-001).
export const SELECTION_COLOR = '#111827';

/**
 * The four Hy's-Law quadrants (HEP-QUAD-002): the label strings, the corner the
 * label draws in, and the X/Y category combination that lands a participant in
 * the quadrant. classifyQuadrants and the quadrant plugin share this ordering.
 * @type {Array<{position: string, label: string, xCat: string, yCat: string}>}
 */
export const QUADRANT_LABELS = [
  { position: 'upper-right', label: "Possible Hy's Law Range", xCat: 'High', yCat: 'High' },
  { position: 'upper-left', label: 'Hyperbilirubinemia', xCat: 'Normal', yCat: 'High' },
  { position: 'lower-right', label: "Temple's Corollary", xCat: 'High', yCat: 'Normal' },
  { position: 'lower-left', label: 'Normal Range', xCat: 'Normal', yCat: 'Normal' }
];

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
 * Map each group value to a stable palette color (HEP-CTRL-009).
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
 * Human-readable study day for a tooltip, 'NA' when the day is unknown.
 * @private
 */
function dayText(day) {
  return Number.isFinite(day) ? String(day) : 'NA';
}

/**
 * Tooltip text lines for a participant point (HEP-CHART-004): the participant
 * id, the R Ratio, each axis measure with its standardized peak value and day,
 * and the day-difference between the two peaks. Each measure is named with its
 * full label from measure_values (e.g. `Total Bilirubin`) rather than the short
 * key, matching the axis titles and the original renderer.
 * @param {Object} point The plotted point ({ id, x, y, days_x, days_y, day_diff, rRatio }).
 * @param {Object} state The live instance state ({ measureX, measureY }).
 * @param {Object} [measureValues] The settings.measure_values map (short key -> full label).
 * @returns {Array<string>} Tooltip lines.
 */
export function pointTooltip(point, state, measureValues) {
  const lines = [
    `Participant: ${point.id}`,
    `R Ratio: ${Number.isFinite(point.rRatio) ? formatNumber(point.rRatio) : 'NA'}`,
    `${measureLabel(state.measureX, measureValues)}: ${formatNumber(point.x)} @ day ${dayText(
      point.days_x
    )}`,
    `${measureLabel(state.measureY, measureValues)}: ${formatNumber(point.y)} @ day ${dayText(
      point.days_y
    )}`
  ];
  if (Number.isFinite(point.day_diff)) {
    lines.push(`${formatNumber(point.day_diff)} days apart`);
  }
  return lines;
}

/**
 * Chart.js plugin drawing the two Hy's-Law cut-lines and the four corner
 * quadrant labels with live percents (HEP-QUAD-002, HEP-QUAD-003). Reads
 * `instance.state.xCut`/`yCut` for the line positions and `instance.quadrants`
 * (the classifyQuadrants result the entrypoint stores) for the counts and
 * percents. Records the drawn geometry on `chart.$hepQuadrants` so tests can
 * assert against it (mirrors the outlier-explorer's $oeNormalRangeOverlay);
 * null when no cutpoints are resolvable.
 * @param {Object} instance The live hep-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function quadrantPlugin(instance) {
  return {
    id: `hep-quadrants-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$hepQuadrants = null;
      const state = instance.state || {};
      const { xCut, yCut } = state;
      if (!Number.isFinite(xCut) || !Number.isFinite(yCut)) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;

      const xPixel = scales.x.getPixelForValue(xCut);
      const yPixel = scales.y.getPixelForValue(yCut);
      const quadrants = instance.quadrants || { labels: [] };
      const counts = {};
      const percents = {};
      quadrants.labels.forEach((entry) => {
        counts[entry.position] = entry.count;
        percents[entry.position] = entry.percent;
      });
      chart.$hepQuadrants = { xCut, yCut, xPixel, yPixel, counts, percents };

      ctx.save();
      // Dashed grey cut-lines spanning the full plot (HEP-QUAD-002).
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (xPixel >= chartArea.left && xPixel <= chartArea.right) {
        ctx.beginPath();
        ctx.moveTo(xPixel, chartArea.top);
        ctx.lineTo(xPixel, chartArea.bottom);
        ctx.stroke();
      }
      if (yPixel >= chartArea.top && yPixel <= chartArea.bottom) {
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPixel);
        ctx.lineTo(chartArea.right, yPixel);
        ctx.stroke();
      }

      // Corner labels with live percents (HEP-QUAD-003).
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const anchors = {
        'upper-left': { x: chartArea.left + 6, y: chartArea.top + 12, align: 'left' },
        'upper-right': { x: chartArea.right - 6, y: chartArea.top + 12, align: 'right' },
        'lower-left': { x: chartArea.left + 6, y: chartArea.bottom - 12, align: 'left' },
        'lower-right': { x: chartArea.right - 6, y: chartArea.bottom - 12, align: 'right' }
      };
      quadrants.labels.forEach((entry) => {
        const anchor = anchors[entry.position];
        if (!anchor) return;
        ctx.textAlign = anchor.align;
        const percent = Number.isFinite(entry.percent) ? entry.percent.toFixed(1) : '0.0';
        ctx.fillText(`${entry.label} (${percent}%)`, anchor.x, anchor.y);
      });
      ctx.restore();
    }
  };
}
