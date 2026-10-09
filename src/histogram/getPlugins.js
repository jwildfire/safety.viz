// Tooltip/footnote text, normal-range overlay and bar-selection highlighting — extracted from the safety-histogram pilot
// (dev @ a3ff9f7) under #2.

import { formatNumber } from './getScales.js';

export function binDescription(bin, measure, digits) {
  return `${bin.records.length} records with ${measure} values >= ${formatNumber(bin.lower, digits)} and <= ${formatNumber(bin.upper, digits)}`;
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
