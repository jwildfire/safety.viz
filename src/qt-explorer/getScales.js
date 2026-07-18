// Axis titles, number formatting, scale domains, and per-arm mark styling for
// the qt-explorer module (#68). Pure helpers, unit-tested. Axis titles mirror
// the CSRC mockup's correction suffix ("− Fridericia" / "− Bazett") built from
// the active measure, and the scatter/central-tendency domains include the
// reference lines so the ICH-E14 thresholds are always in view (QT-OUT-005,
// QT-CT-003).

/** Correction-formula suffix for the QTc measures the demo carries. */
const CORRECTION_SUFFIX = { QTcF: 'Fridericia', QTcB: 'Bazett' };

/** Chart.js point-style keywords cycled to give each arm a distinct mark shape. */
export const ARM_POINT_STYLES = ['circle', 'triangle', 'rectRot', 'rect', 'star', 'crossRot'];

/**
 * The correction-formula name for a measure, or null when it has none (e.g. Heart Rate).
 * @param {string} measure The measure name.
 * @returns {?string} The correction suffix.
 */
export function correctionSuffix(measure) {
  return CORRECTION_SUFFIX[measure] || null;
}

/**
 * Whether a measure is a QTc correction (drives the absolute cut-lines and the
 * categorical absolute rows).
 * @param {string} measure The measure name.
 * @param {string[]} qtcMeasures The settings.qtc_measures list.
 * @returns {boolean} True when the measure is a QTc correction.
 */
export function isQtcMeasure(measure, qtcMeasures) {
  return (qtcMeasures || []).includes(measure);
}

/**
 * The unit label for a measure: milliseconds for QTc, beats/min otherwise.
 * @param {string} measure The measure name.
 * @param {string[]} qtcMeasures The settings.qtc_measures list.
 * @returns {string} The unit label ('ms' | 'bpm').
 */
export function measureUnit(measure, qtcMeasures) {
  return isQtcMeasure(measure, qtcMeasures) ? 'ms' : 'bpm';
}

/**
 * Central-tendency y-axis title, e.g. "Δ QTcF (ms) − Fridericia" or
 * "ΔΔ QTcF (ms) − Fridericia" or "Δ Heart Rate (bpm)" (QT-CT-001).
 * @param {string} measure The measure name.
 * @param {'delta'|'deltadelta'} mode The display mode.
 * @param {string[]} qtcMeasures The settings.qtc_measures list.
 * @returns {string} The axis title.
 */
export function centralAxisTitle(measure, mode, qtcMeasures) {
  const prefix = mode === 'deltadelta' ? 'ΔΔ' : 'Δ';
  const suffix = correctionSuffix(measure);
  const unit = measureUnit(measure, qtcMeasures);
  return `${prefix} ${measure} (${unit})${suffix ? ` − ${suffix}` : ''}`;
}

/**
 * Scatter axis titles mirroring the mockup: baseline on x, change on y, each
 * with the correction suffix (QT-OUT-005).
 * @param {string} measure The measure name.
 * @param {string[]} qtcMeasures The settings.qtc_measures list.
 * @returns {{x:string, y:string}} The axis titles.
 */
export function scatterAxisTitles(measure, qtcMeasures) {
  const suffix = correctionSuffix(measure);
  const unit = measureUnit(measure, qtcMeasures);
  const tail = suffix ? ` − ${suffix}` : '';
  return {
    x: `Baseline ${measure} (${unit})${tail}`,
    y: `${measure} change (${unit})${tail}`
  };
}

/**
 * Format a number to at most one decimal place, trimming a trailing ".0".
 * @param {number} value The number.
 * @returns {string} The formatted string, or 'NA' for non-finite input.
 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return 'NA';
  return Number(value.toFixed(1)).toString();
}

/**
 * Format a signed change value to one decimal place (e.g. "+58.5", "−12.0").
 * @param {number} value The change value.
 * @returns {string} The signed string, or 'NA' for non-finite input.
 */
export function formatSigned(value) {
  if (!Number.isFinite(value)) return 'NA';
  const rounded = Number(value.toFixed(1));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded)}`;
}

/**
 * A [min, max] domain covering the values plus any required inclusions
 * (thresholds, zero), padded by a fraction of the span.
 * @param {number[]} values Numeric values.
 * @param {number[]} [include=[]] Values that must fall inside the domain.
 * @param {number} [pad=0.08] Padding as a fraction of the span.
 * @returns {[number, number]} The padded domain.
 */
export function paddedDomain(values, include = [], pad = 0.08) {
  const all = [...values, ...include].filter((v) => Number.isFinite(v));
  if (!all.length) return [0, 1];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

/**
 * Assign each arm a distinct Chart.js point-style keyword, cycling the palette
 * (QT-OUT-004) — a colorblind- / print-safe second encoding beyond color.
 * @param {string[]} arms Ordered arms.
 * @returns {Map<string,string>} arm -> point-style keyword.
 */
export function armPointStyles(arms) {
  const styles = new Map();
  (arms || []).forEach((arm, index) => {
    styles.set(String(arm), ARM_POINT_STYLES[index % ARM_POINT_STYLES.length]);
  });
  return styles;
}
