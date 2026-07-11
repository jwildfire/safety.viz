// Tooltip/footnote text, normal-range overlay, p-value screening annotations,
// and bar-selection highlighting — extracted from the safety-histogram pilot
// (dev @ a3ff9f7) under #2.

import { createElement } from '../shell.js';
import { mean, sd } from './structureData.js';
import { formatNumber } from './getScales.js';

export function formatPValue(value) {
  if (!Number.isFinite(value)) return 'NA';
  if (value < 0.001) return '<0.001';
  if (value > 0.999) return '>0.999';
  return value.toFixed(3);
}

export function approximateNormalityP(values) {
  const vals = values.map(Number).filter(Number.isFinite);
  if (vals.length < 3) return NaN;
  const m = mean(vals);
  const s = sd(vals) || Number.EPSILON;
  const skew = vals.reduce((sum, v) => sum + Math.pow((v - m) / s, 3), 0) / vals.length;
  const kurtosis = vals.reduce((sum, v) => sum + Math.pow((v - m) / s, 4), 0) / vals.length;
  const jb = (vals.length / 6) * (Math.pow(skew, 2) + Math.pow(kurtosis - 3, 2) / 4);
  return Math.max(0.0001, Math.min(0.9999, Math.exp(-0.5 * jb)));
}

export function approximateGroupP(groups) {
  const entries = Object.entries(groups)
    .map(([key, vals]) => [key, vals.map(Number).filter(Number.isFinite)])
    .filter(([, vals]) => vals.length);
  if (entries.length < 2) return NaN;
  const all = entries.flatMap(([, vals]) => vals);
  const grand = mean(all);
  const between = entries.reduce(
    (sum, [, vals]) => sum + vals.length * Math.pow(mean(vals) - grand, 2),
    0
  );
  const within = entries.reduce(
    (sum, [, vals]) => sum + vals.reduce((inner, v) => inner + Math.pow(v - mean(vals), 2), 0),
    0
  );
  const f =
    between /
    Math.max(1, entries.length - 1) /
    (within / Math.max(1, all.length - entries.length) || Number.EPSILON);
  return Math.max(0.0001, Math.min(0.9999, Math.exp(-0.5 * f)));
}

// Screening annotations carry the validation disclaimer (SH-CHART-005; design
// #2 disposition: approximate screens ship with the disclaimer, exact-method
// rows stay deferred).
export function statisticalAnnotation(label, pValue, testName, url) {
  const text = `${label}: p=${formatPValue(pValue)}`;
  const annotation = createElement('div', 'sv-annotation');
  const value = createElement('span', null, text);
  value.title = `${testName}. Caution: This graphic has been thoroughly tested, but is not validated.`;
  const link = createElement('a', 'sv-info', 'ⓘ');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `${testName}. Caution: This graphic has been thoroughly tested, but is not validated.`;
  annotation.append(value, document.createTextNode(' '), link);
  return annotation;
}

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
