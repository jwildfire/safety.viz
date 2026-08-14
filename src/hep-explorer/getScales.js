// Axis labels, domains, and result formatting for the hep-explorer eDISH
// scatter (#43). Ported from the original renderer's updateAxisSettings / axis
// domain logic, kept pure for unit testing. The explorer standardizes values
// two ways (×ULN and ×Baseline) and supports a linear ↔ log axis toggle
// (HEP-CHART-001, HEP-CHART-002, HEP-CTRL-006).

/**
 * Format a number to a fixed precision, trimming trailing zeros; '' for a
 * non-finite value.
 * @param {number} value The value to format.
 * @param {number} [digits=2] Maximum decimal places.
 * @returns {string} The formatted number, or '' when not finite.
 */
export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

/**
 * Axis-title suffix for the active display mode (HEP-DISPLAY-001): ' [×ULN]' for
 * the eDISH (relative_uln) view, ' [×Baseline]' for the mDISH (relative_baseline)
 * view.
 * @param {string} display The active display mode.
 * @returns {string} The axis-title suffix, including its leading space.
 */
export function axisSuffix(display) {
  return display === 'relative_baseline' ? ' [×Baseline]' : ' [×ULN]';
}

/**
 * Resolve the full, human-readable measure label for a short measure key
 * (HEP-CHART-002): looks the key up in settings.measure_values (e.g. TB ->
 * `Total Bilirubin`), falling back to the key itself when no mapping is
 * supplied. Matches the original renderer, which titled axes and tooltips with
 * the full measure name rather than the short key.
 * @param {string} measureKey The short measure key (ALT/AST/TB/ALP).
 * @param {Object} [measureValues] The settings.measure_values map (short key -> full label).
 * @returns {string} The full measure label, or the key when unmapped.
 */
export function measureLabel(measureKey, measureValues) {
  if (measureValues && measureValues[measureKey]) return measureValues[measureKey];
  return measureKey ?? '';
}

/**
 * Axis title for a selected measure in the active display units
 * (HEP-CHART-002): e.g. `Total Bilirubin [×ULN]` or
 * `Aminotransferase, alanine (ALT) [×Baseline]`. Uses the full measure label
 * from measure_values when available, else the short key.
 * @param {string} measureKey The short measure key or label.
 * @param {string} display The active display mode.
 * @param {Object} [measureValues] The settings.measure_values map (short key -> full label).
 * @returns {string} The axis title.
 */
export function axisLabel(measureKey, display, measureValues) {
  return `${measureLabel(measureKey, measureValues)}${axisSuffix(display)}`;
}

/**
 * eDISH axis domain over a set of standardized values, always widened to keep
 * the cutpoint in view (HEP-CHART-003). A linear axis starts at 0 and extends
 * past the larger of the max value and the cut; a log axis runs from the
 * smallest positive value (or cut) to the max, padded multiplicatively so no
 * point sits on the frame.
 * @param {number[]} values The standardized values on the axis.
 * @param {number} cut The active Hy's-Law cutpoint for the axis.
 * @param {string} [type='linear'] 'linear' or 'log'.
 * @returns {number[]} The [min, max] domain.
 */
export function edishDomain(values, cut, type = 'linear') {
  const nums = values.filter(Number.isFinite);
  const all = Number.isFinite(cut) ? [...nums, cut] : nums;
  if (!all.length) return type === 'log' ? [0.1, 1] : [0, 1];
  const max = Math.max(...all);
  if (type === 'log') {
    const positives = all.filter((value) => value > 0);
    const min = positives.length ? Math.min(...positives) : 0.1;
    return [min / 1.5, max * 1.5];
  }
  return [0, max * 1.05 || 1];
}

/**
 * The eDISH domain actually drawn for one axis: the derived domain
 * (edishDomain), with each bound replaced by the user's override when there is
 * one (HEP-AXIS-001..004, #238). Overrides live in the shared limit contract of
 * src/axis-limits.js — `null` means automatic, so an unedited bound keeps
 * re-deriving as the measure, filters and scale change.
 *
 * Two things an override may not do, because either would draw a lie:
 * push a log axis to a non-positive floor, or invert the domain. Either is
 * declined in favour of the derived domain — the crossed-pair case is normally
 * caught earlier by applyLimitEdit's swap, and this is the backstop for the
 * paths that do not go through an input.
 * @param {number[]} values The standardized values on the axis.
 * @param {number} cut The active Hy's-Law cutpoint for the axis.
 * @param {string} type 'linear' or 'log'.
 * @param {?Object} limits The axis's limit state ({ lower, upper }); null/absent = fully automatic.
 * @returns {number[]} The [min, max] domain to draw.
 */
export function resolveEdishDomain(values, cut, type, limits) {
  const derived = edishDomain(values, cut, type);
  const override = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  let lower = override(limits && limits.lower, derived[0]);
  const upper = override(limits && limits.upper, derived[1]);
  if (type === 'log' && !(lower > 0)) lower = derived[0];
  if (!(upper > lower)) return derived;
  return [lower, upper];
}

// Guards the floating-point edge of the power-of-base search: Math.log(0.1) /
// Math.log(10) is -0.9999999999999998, so a naive ceil() drops the decade the
// domain actually starts on.
const LOG_EPSILON = 1e-9;

/**
 * The powers of `base` that fall inside a log domain — the gridlines the Log
 * Base control selects (HEP-CTRL-017). Position on a log axis is
 * base-independent (log_b(x) differs from log10(x) only by a constant factor),
 * so choosing a base does not rescale the plot; it chooses WHICH multiples the
 * gridlines land on. Base 2 puts one at every doubling.
 *
 * Returns [] — meaning "leave Chart.js its own ticks" — for a domain a log axis
 * cannot take, and for one too narrow to carry two powers of the base: a single
 * gridline is a worse axis than the default one.
 * @param {number[]} domain The [min, max] domain in force.
 * @param {number} [base=10] The log base (10 or 2).
 * @returns {number[]} The tick values, ascending, or [] to decline.
 */
export function logTicks(domain, base = 10) {
  const [min, max] = domain || [];
  if (!(min > 0) || !(max > min) || !(base > 1)) return [];
  const power = (value) => Math.log(value) / Math.log(base);
  const first = Math.ceil(power(min) - LOG_EPSILON);
  const last = Math.floor(power(max) + LOG_EPSILON);
  if (!(last > first)) return [];
  const ticks = [];
  for (let exponent = first; exponent <= last; exponent += 1) ticks.push(base ** exponent);
  return ticks;
}

/**
 * Format a log-axis tick at the precision the value needs (HEP-CTRL-017):
 * `1024`, `0.125`, `1` — never exponent notation, which reads as a different
 * quantity to a reviewer scanning fold-change gridlines.
 * @param {number} value The tick value.
 * @returns {string} The tick label, or '' when not finite.
 */
export function formatLogTick(value) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toPrecision(6)).toString();
}

/**
 * Chart.js scale configs for both axes, titled by the selected measures in the
 * active display units and switched between linear and logarithmic per
 * state.axisType (HEP-CHART-002, HEP-CTRL-006). A logarithmic axis clamps its
 * min above 0 so Chart.js does not reject a 0 lower bound, and takes its
 * gridlines from state.logBase when that base spans the domain (HEP-CTRL-017).
 * @param {Object} state The live instance state ({ measureX, measureY, display, axisType, logBase }).
 * @param {number[]} xDomain The [min, max] x-domain from edishDomain.
 * @param {number[]} yDomain The [min, max] y-domain from edishDomain.
 * @param {Object} [measureValues] The settings.measure_values map, so the axes
 *   are titled with the full measure label rather than the short key.
 * @returns {{x: Object, y: Object}} The Chart.js x/y scale configs.
 */
export function buildScales(state, xDomain, yDomain, measureValues) {
  const type = state.axisType === 'log' ? 'logarithmic' : 'linear';
  const base = Number(state.logBase) > 1 ? Number(state.logBase) : 10;
  const axis = (domain, label) => {
    const min = type === 'logarithmic' && !(domain[0] > 0) ? undefined : domain[0];
    const scale = {
      type,
      min,
      max: domain[1],
      title: { display: true, text: label },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    };
    if (type !== 'logarithmic') return scale;
    const ticks = logTicks([min, domain[1]], base);
    if (!ticks.length) return scale;
    // afterBuildTicks is Chart.js's documented seam for replacing a scale's
    // computed ticks, and the only one that moves the GRIDLINES rather than
    // just their labels — which is the whole point of choosing a base.
    scale.afterBuildTicks = (built) => {
      built.ticks = ticks.map((value) => ({ value }));
    };
    scale.ticks = { callback: (value) => formatLogTick(value) };
    return scale;
  };
  return {
    x: axis(xDomain, axisLabel(state.measureX, state.display, measureValues)),
    y: axis(yDomain, axisLabel(state.measureY, state.display, measureValues))
  };
}
