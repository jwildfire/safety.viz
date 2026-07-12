// Y-axis domain, limit normalization, and precision for the results-over-time
// module (#27). Ports the original renderer's setYdomain / setYprecision
// (RhoInc/safety-results-over-time) to plain functions.

/**
 * Format a number to a fixed number of decimals, keeping trailing zeros;
 * returns 'NA' for non-finite input.
 * @param {number} value The value.
 * @param {number} digits Decimal places (clamped to a valid toFixed range).
 * @returns {string} The formatted value.
 */
export function formatFixed(value, digits) {
  if (!Number.isFinite(value)) return 'NA';
  return value.toFixed(Math.max(0, Math.min(20, digits)));
}

/**
 * Swap a crossed lower/upper limit pair in place so the larger value is the
 * upper limit (SROT-REG-017).
 * @param {{lower:?number, upper:?number}} state Control state holding the limits.
 * @returns {void}
 */
export function normalizeDomain(state) {
  if (Number.isFinite(state.lower) && Number.isFinite(state.upper) && state.lower >= state.upper) {
    const tmp = state.lower;
    state.lower = state.upper;
    state.upper = tmp;
  }
}

/**
 * Resolve the y-axis domain: the data extent by default, with either limit
 * overridden when supplied (SROT-REG-016/020).
 * @param {number[]} values Numeric results for the current measure.
 * @param {?number} lower Lower-limit override, or null for the data minimum.
 * @param {?number} upper Upper-limit override, or null for the data maximum.
 * @returns {[number, number]} The [lower, upper] domain.
 */
export function resolveYDomain(values, lower, upper) {
  const extent = [Math.min(...values), Math.max(...values)];
  return [lower == null ? extent[0] : lower, upper == null ? extent[1] : upper];
}

/**
 * Choose the display precision for a y-domain by the original renderer's
 * log10-range rule: precision 0 for ranges above sqrt(10), otherwise enough
 * decimals to resolve the range (SROT-REG-015).
 * @param {[number, number]} domain The y-domain.
 * @returns {{precision:number, range:number, log10range:number}} The precision and range diagnostics.
 */
export function yPrecision(domain) {
  const range = domain[1] - domain[0];
  const log10range = Math.log10(range);
  const roundedLog10range = Math.round(log10range);
  const precision1 = -1 * (roundedLog10range - 1);
  const precision = log10range > 0.5 ? 0 : Math.max(0, precision1);
  return { precision, range, log10range };
}

/**
 * Per-statistic decimal precisions: min/max at the base precision, quantiles
 * and mean one place finer, and the standard deviation two places finer
 * (SROT-REG-015).
 * @param {number} basePrecision The y-axis base precision from yPrecision.
 * @returns {{p0:number, p1:number, p2:number}} The three precision levels.
 */
export function statPrecisions(basePrecision) {
  const base = Math.max(0, basePrecision);
  return { p0: base, p1: base + 1, p2: base + 2 };
}
