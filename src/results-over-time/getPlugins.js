// Tooltip text, group colors, and the box-and-whisker Chart.js plugin for the
// results-over-time module (#27). The statistics come pre-computed from
// structureData (unit-tested); this module only formats them and stages the
// draw. The box-plot marks themselves (whiskers at the 5th/95th percentiles,
// box Q1–Q3, median line, mean marker) are drawn by the shared box-whisker
// module, promoted verbatim from here for reuse (#91, HEP-CORE-010) — this
// module's plugin is now a thin delegation that preserves the srot id prefix
// and the state.boxplots/boxSpecs gating exactly.

import { formatFixed } from './getScales.js';
import { boxWhiskerPlugin as sharedBoxWhiskerPlugin } from '../box-whisker.js';

export { hexToRgba } from '../box-whisker.js';

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
  return sharedBoxWhiskerPlugin('srot', () =>
    instance.state.boxplots ? instance.boxSpecs || [] : []
  );
}
