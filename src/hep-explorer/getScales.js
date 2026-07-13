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
 * Chart.js scale configs for both axes, titled by the selected measures in the
 * active display units and switched between linear and logarithmic per
 * state.axisType (HEP-CHART-002, HEP-CTRL-006). A logarithmic axis clamps its
 * min above 0 so Chart.js does not reject a 0 lower bound.
 * @param {Object} state The live instance state ({ measureX, measureY, display, axisType }).
 * @param {number[]} xDomain The [min, max] x-domain from edishDomain.
 * @param {number[]} yDomain The [min, max] y-domain from edishDomain.
 * @param {Object} [measureValues] The settings.measure_values map, so the axes
 *   are titled with the full measure label rather than the short key.
 * @returns {{x: Object, y: Object}} The Chart.js x/y scale configs.
 */
export function buildScales(state, xDomain, yDomain, measureValues) {
  const type = state.axisType === 'log' ? 'logarithmic' : 'linear';
  const axis = (domain, label) => {
    const min = type === 'logarithmic' && !(domain[0] > 0) ? undefined : domain[0];
    return {
      type,
      min,
      max: domain[1],
      title: { display: true, text: label },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    };
  };
  return {
    x: axis(xDomain, axisLabel(state.measureX, state.display, measureValues)),
    y: axis(yDomain, axisLabel(state.measureY, state.display, measureValues))
  };
}
