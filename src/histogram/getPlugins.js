// Tooltip/footnote text, normal-range overlay and bar-selection highlighting — extracted from the safety-histogram pilot
// (dev @ a3ff9f7) under #2.

import { formatNumber } from './getScales.js';

export function binDescription(bin, measure, digits) {
  return `${bin.records.length} records with ${measure} values >= ${formatNumber(bin.lower, digits)} and <= ${formatNumber(bin.upper, digits)}`;
}

/**
 * "1 result" or "N results": what a bar counts, as a small multiple's tooltip
 * says it (SH-AXIS-006, #359).
 * @param {number} count The bar's number of records.
 * @returns {string} The count in words.
 */
export function countLabel(count) {
  return `${count} ${count === 1 ? 'result' : 'results'}`;
}

/**
 * A bin's range for a tooltip title: its bounds at the chart's display digits,
 * then the unit when there is one, e.g. "13–23 U/L" (SH-AXIS-006, #359).
 * @param {{lower: number, upper: number}} bin The bin.
 * @param {number} digits Display digits.
 * @param {?string} unit The measure's unit.
 * @returns {string} The range.
 */
export function binRange(bin, digits, unit) {
  const range = `${formatNumber(bin.lower, digits)}–${formatNumber(bin.upper, digits)}`;
  return unit ? `${range} ${unit}` : range;
}

/**
 * The tooltip a small multiple shows on hover, in the overview and the grouped
 * view: the bar's range as its title and its count of results as its line, in
 * place of a y-axis title (SH-AXIS-006, #359).
 * @param {Array<{lower: number, upper: number, records: Array}>} bins The chart's bins.
 * @param {number} digits Display digits.
 * @param {?string} unit The measure's unit.
 * @returns {Object} The Chart.js tooltip plugin options.
 */
export function countTooltip(bins, digits, unit) {
  return {
    enabled: true,
    displayColors: false,
    callbacks: {
      title: (items) => binRange(bins[items[0].dataIndex], digits, unit),
      label: (item) => countLabel(bins[item.dataIndex].records.length)
    }
  };
}

// Per-bar colors that keep the selected bar and fade the rest (SH-FUNC-011).
export function selectionColors(baseColor, count, selectedIndex) {
  const faded = baseColor.replace(/,\s*[\d.]+\)$/, ', 0.15)');
  return Array.from({ length: count }, (_, index) => (index === selectedIndex ? baseColor : faded));
}

export function normalRangePlugin(instance) {
  return {
    id: `normal-range-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$shNormalRangeOverlay = null;
      if (!instance.state.displayNormalRange || !instance.state.normalRange) return;
      const { ctx, chartArea, scales } = chart;
      const bins = chart.$shBins || [];
      const matched = bins
        .map((bin, index) => ({ bin, index }))
        .filter(
          ({ bin }) =>
            bin.upper >= instance.state.normalRange.low &&
            bin.lower <= instance.state.normalRange.high
        );
      if (!matched.length) return;
      const start = matched[0].index - 0.5;
      const end = matched[matched.length - 1].index + 0.5;
      const left = scales.x.getPixelForValue(start);
      const right = scales.x.getPixelForValue(end);
      const clampedLeft = Math.max(chartArea.left, left);
      const clampedRight = Math.min(chartArea.right, right);
      const width = Math.max(0, clampedRight - clampedLeft);
      chart.$shNormalRangeOverlay = {
        low: instance.state.normalRange.low,
        high: instance.state.normalRange.high,
        left: clampedLeft,
        right: clampedRight,
        top: chartArea.top,
        bottom: chartArea.bottom,
        width
      };
      if (!width) return;
      ctx.save();
      ctx.fillStyle = 'rgba(160, 160, 160, 0.25)';
      ctx.fillRect(clampedLeft, chartArea.top, width, chartArea.bottom - chartArea.top);
      ctx.restore();
    }
  };
}
