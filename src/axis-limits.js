// Shared axis-limit prefill for the sidebar Lower/Upper inputs (#85).
//
// Before #85 the inputs loaded blank, and blankness itself carried the "auto,
// follow the data" meaning: a reviewer saw two empty boxes and had to read the
// tick labels before nudging an axis. Now every input shows the limit actually
// in force, and the auto/override distinction lives in state rather than in the
// emptiness of a box (AXIS-2):
//
//   state.lower / state.upper   USER OVERRIDES ONLY — null means auto. Passed
//                               to each module's resolve*Domain helper exactly
//                               as before, so the derived math is untouched.
//   state.axisDomain            the [lower, upper] the last render resolved:
//                               what the chart drew and what the inputs show.
//
// An unedited limit therefore stays null and is re-derived on every render, so
// it keeps following the data across a measure, filter, or scale change; only
// an edited limit persists (AXIS-2). Reset clears the overrides and the next
// render refills the boxes with the derived values (AXIS-3).

/**
 * Decimal places for a displayed limit: three significant figures of the axis
 * range, so a wide measure reads as whole numbers and a narrow one keeps its
 * decimals (AXIS-1, "formatted at the measure's precision").
 * @param {[number, number]} domain The domain in force.
 * @returns {number} Decimal places for formatLimit.
 */
export function limitDigits(domain) {
  const range = Math.abs((domain && domain[1]) - (domain && domain[0]));
  if (!Number.isFinite(range) || range <= 0) return 2;
  return Math.max(0, Math.min(20, 2 - Math.floor(Math.log10(range))));
}

/**
 * Format a limit for its number input, dropping trailing zeros; a non-finite
 * value renders blank so a chart with no resolvable domain shows nothing
 * rather than NaN.
 * @param {number} value The limit.
 * @param {number} digits Decimal places, usually from limitDigits.
 * @returns {string} The input value.
 */
export function formatLimit(value, digits) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(Math.max(0, Math.min(20, digits)))));
}

/**
 * Record the domain a render resolved and mirror it into the limit inputs
 * (AXIS-1). Call once per render, right after the domain is resolved and
 * before the chart is built, so the boxes and the axis always agree — the
 * write-back follows the precedent of the histogram's resolved bin
 * quantity/width inputs.
 * @param {Object} state The renderer's control state.
 * @param {[number, number]} domain The resolved domain.
 * @param {{lower:?HTMLInputElement, upper:?HTMLInputElement}} inputs The limit inputs.
 * @returns {[number, number]} The recorded domain.
 */
export function syncAxisLimits(state, domain, inputs = {}) {
  state.axisDomain = [domain[0], domain[1]];
  const digits = limitDigits(state.axisDomain);
  if (inputs.lower) inputs.lower.value = formatLimit(domain[0], digits);
  if (inputs.upper) inputs.upper.value = formatLimit(domain[1], digits);
  return state.axisDomain;
}

/**
 * The value a limit input should carry when the controls are rebuilt, before
 * the render that follows has resolved a fresh domain: the override if there is
 * one, otherwise the domain last in force. Renderers that rebuild their
 * controls on a measure change clear the recorded domain first, so the seed is
 * blank for the split second before the new measure's render fills it in.
 * @param {Object} state The renderer's control state.
 * @param {'lower'|'upper'} key Which limit.
 * @returns {string} The input value.
 */
export function seedLimitInput(state, key) {
  if (Number.isFinite(state[key])) return String(state[key]);
  const domain = state.axisDomain;
  if (!domain) return '';
  return formatLimit(domain[key === 'lower' ? 0 : 1], limitDigits(domain));
}

/**
 * Apply an edited limit (AXIS-4). An empty or non-numeric entry returns that
 * side to auto. A value that crosses the OTHER limit *as displayed* pins that
 * displayed value as the opposite override and swaps the pair — without this,
 * typing a lower limit above a prefilled upper one would leave the other side
 * null and send an inverted domain to the chart, which the pre-#85 swap could
 * not catch because the other box was blank.
 * @param {Object} state The renderer's control state.
 * @param {'lower'|'upper'} key Which limit was edited.
 * @param {string} raw The input's raw value.
 * @returns {Object} The same state, mutated.
 */
export function applyLimitEdit(state, key, raw) {
  const value = raw === '' ? null : Number(raw);
  state[key] = Number.isFinite(value) ? value : null;
  const domain = state.axisDomain || [];
  const lower = state.lower == null ? domain[0] : state.lower;
  const upper = state.upper == null ? domain[1] : state.upper;
  if (Number.isFinite(lower) && Number.isFinite(upper) && lower >= upper) {
    state.lower = upper;
    state.upper = lower;
  }
  return state;
}

/**
 * Drop both overrides and the recorded domain so the next render re-derives the
 * limits from the data and refills the inputs (AXIS-3). Used by every Reset
 * Limits control and by the measure-change paths.
 * @param {Object} state The renderer's control state.
 * @returns {void}
 */
export function clearAxisLimits(state) {
  state.lower = null;
  state.upper = null;
  state.axisDomain = null;
}
