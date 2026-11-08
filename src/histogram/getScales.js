// Axis domain/limit handling and tick-label modes — extracted from the
// safety-histogram pilot (dev @ a3ff9f7) under #2.

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

// Swaps inverted user-entered limits in place (SH-CTRL-005).
export function normalizeDomain(state) {
  if (Number.isFinite(state.lower) && Number.isFinite(state.upper) && state.lower >= state.upper) {
    const tmp = state.lower;
    state.lower = state.upper;
    state.upper = tmp;
  }
}

export function resolveDomain(values, lower, upper) {
  const defaultDomain = [Math.min(...values), Math.max(...values)];
  return [lower == null ? defaultDomain[0] : lower, upper == null ? defaultDomain[1] : upper];
}

// Bin centers vs bin boundaries (SH-CTRL-007).
export function buildTickLabels(bins, digits, annotateBoundaries) {
  return bins.map((bin) =>
    annotateBoundaries
      ? `${formatNumber(bin.lower, digits)}–${formatNumber(bin.upper, digits)}`
      : formatNumber((bin.lower + bin.upper) / 2, digits)
  );
}

/**
 * What each bar counts: the y-axis title of every histogram view (SH-AXIS-005,
 * SH-AXIS-006, #347). The original titled it "# of Observations"; the panel
 * titles and the notes call the records results.
 */
export const COUNT_TITLE = 'Number of results';

/**
 * The single-measure chart's scales: an integer count axis from zero, rotated
 * x ticks, and both axes titled (SH-AXIS-005, #347). The x-axis title is the
 * measure as the Measure control labels it, with its unit.
 * @param {?string} measure The selected measure's label.
 * @returns {Object} The Chart.js `scales` option.
 */
export function buildScales(measure) {
  return {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 },
      title: { display: true, text: COUNT_TITLE }
    },
    x: {
      ticks: { maxRotation: 45, minRotation: 0 },
      ...(measure ? { title: { display: true, text: measure } } : {})
    }
  };
}

/**
 * A small multiple's scales, in the overview and the grouped view: the count
 * axis titled, the x-axis without ticks or title (SH-AXIS-006, #347).
 * @returns {Object} The Chart.js `scales` option.
 */
export function buildMultipleScales() {
  return {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 },
      title: { display: true, text: COUNT_TITLE }
    },
    x: { ticks: { display: false } }
  };
}
