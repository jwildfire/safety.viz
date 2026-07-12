// Tooltip text, group colors, and the box-and-whisker Chart.js plugin for the
// results-over-time module (#27). The statistics come pre-computed from
// structureData (unit-tested); this module only formats and draws them,
// reproducing the original renderer's box-plot marks (whiskers at the 5th/95th
// percentiles, box Q1–Q3, median line, mean marker) on a Chart.js canvas.

import { formatFixed } from './getScales.js';

// Categorical palette for grouped box plots; index-stable so a group keeps its
// color across renders and matches its legend entry (SROT-REG-003).
const PALETTE = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#65a30d',
  '#db2777',
  '#4b5563',
  '#ca8a04'
];

/**
 * Map each group value to a stable color by its position in the ordered list.
 * @param {string[]} groups Group values in display order.
 * @returns {Object<string,string>} group value → hex color.
 */
export function groupColors(groups) {
  return Object.fromEntries(groups.map((group, index) => [group, PALETTE[index % PALETTE.length]]));
}

/**
 * Convert a #rrggbb color to an rgba() string at the given alpha.
 * @param {string} hex A #rrggbb color.
 * @param {number} alpha Opacity in [0, 1].
 * @returns {string} The rgba() color.
 */
export function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The hover-tooltip summary for a box plot: the original renderer's field list
 * (N, Min, 5th %, Q1, Median, Q3, 95th %, Max, Mean, StDev) at the precision
 * levels from statPrecisions (SROT-REG-014/015).
 * @param {string} group The group key ('All' when ungrouped).
 * @param {string} visit The visit name.
 * @param {Object} stats Summary statistics from summarize().
 * @param {{p0:number, p1:number, p2:number}} precisions Precision levels from statPrecisions.
 * @returns {string} A newline-separated summary.
 */
export function summaryTooltip(group, visit, stats, { p0, p1, p2 }) {
  return [
    `${group} at ${visit}:`,
    `N = ${stats.n}`,
    `Min = ${formatFixed(stats.min, p0)}`,
    `5th % = ${formatFixed(stats.q5, p1)}`,
    `Q1 = ${formatFixed(stats.q25, p1)}`,
    `Median = ${formatFixed(stats.median, p1)}`,
    `Q3 = ${formatFixed(stats.q75, p1)}`,
    `95th % = ${formatFixed(stats.q95, p1)}`,
    `Max = ${formatFixed(stats.max, p0)}`,
    `Mean = ${formatFixed(stats.mean, p1)}`,
    `StDev = ${formatFixed(stats.deviation, p2)}`
  ].join('\n');
}

/**
 * The hover-tooltip text for an outlier point: the participant identifier and
 * its result (SROT-REG-011).
 * @param {Object} row The outlier record.
 * @param {ResultsOverTimeSettings} settings Column mappings (id_col).
 * @param {{p1:number}} precisions Precision levels from statPrecisions.
 * @returns {string} The outlier description.
 */
export function outlierTooltip(row, settings, { p1 }) {
  return `${row[settings.id_col]}: ${formatFixed(row.__srot_value, p1)}`;
}

/**
 * A Chart.js plugin that draws the box-and-whisker marks for a render from the
 * box specs the instance stages before drawing (instance.boxSpecs, also
 * mirrored to chart.$srotBoxes for test introspection). Each spec carries a
 * group color, its data-space x center and half-width, and the pre-computed
 * statistics; the plugin projects them through the chart scales.
 * @param {SafetyResultsOverTime} instance The owning instance, whose boxSpecs the plugin draws.
 * @returns {Object} A Chart.js plugin object.
 */
export function boxWhiskerPlugin(instance) {
  return {
    id: `srot-boxwhisker-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      const boxes = instance.state.boxplots ? instance.boxSpecs || [] : [];
      if (!boxes.length) return;
      const { ctx, scales, chartArea } = chart;
      const yOf = (value) => scales.y.getPixelForValue(value);
      ctx.save();
      for (const box of boxes) {
        const { stats, color } = box;
        if (!stats || !stats.n) continue;
        const centerX = scales.x.getPixelForValue(box.x);
        const left = scales.x.getPixelForValue(box.x - box.halfWidth);
        const right = scales.x.getPixelForValue(box.x + box.halfWidth);
        const clamp = (y) => Math.max(chartArea.top, Math.min(chartArea.bottom, y));

        // Box: Q1–Q3.
        ctx.fillStyle = hexToRgba(color, 0.35);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        const top = clamp(yOf(stats.q75));
        const bottom = clamp(yOf(stats.q25));
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.strokeRect(left, top, right - left, bottom - top);

        // Whiskers: q5→Q1 and Q3→q95, with caps at the 5th/95th percentiles.
        ctx.beginPath();
        ctx.moveTo(centerX, clamp(yOf(stats.q5)));
        ctx.lineTo(centerX, bottom);
        ctx.moveTo(centerX, top);
        ctx.lineTo(centerX, clamp(yOf(stats.q95)));
        ctx.moveTo(left, clamp(yOf(stats.q5)));
        ctx.lineTo(right, clamp(yOf(stats.q5)));
        ctx.moveTo(left, clamp(yOf(stats.q95)));
        ctx.lineTo(right, clamp(yOf(stats.q95)));
        ctx.stroke();

        // Median line.
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.moveTo(left, clamp(yOf(stats.median)));
        ctx.lineTo(right, clamp(yOf(stats.median)));
        ctx.stroke();

        // Mean: outer light circle + inner colored dot.
        const meanY = clamp(yOf(stats.mean));
        const radius = Math.min((right - left) / 6, 6);
        ctx.beginPath();
        ctx.fillStyle = '#eee';
        ctx.arc(centerX, meanY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(centerX, meanY, radius / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }
  };
}
