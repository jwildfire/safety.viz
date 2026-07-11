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

export function buildScales() {
  return {
    y: { beginAtZero: true, ticks: { precision: 0 } },
    x: { ticks: { maxRotation: 45, minRotation: 0 } }
  };
}
