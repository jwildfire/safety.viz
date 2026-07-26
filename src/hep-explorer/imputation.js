// Below-LLOQ imputation for the hep-explorer module (safety.viz#50,
// obot.roadmap#88), restoring parity with the original RhoInc/hep-explorer.
//
// PORTED, NOT INVENTED. The rules here were read off the original's
// `src/callbacks/onInit/cleanData/imputeData.js` and its
// `imputeData/imputeColumn.js`, per the v1.0 QC discipline of executing or
// reading the original source wherever the semantics are subtle:
//
//   * `data-driven` (the original's default for ALT, AST, TB and ALP) takes the
//     limit to be the smallest POSITIVE value recorded for that measure, and
//     imputes to half of it;
//   * `user-defined` takes the limit from configuration and imputes to half of
//     it;
//   * `drop` removes the records at or below zero instead of imputing them;
//   * the imputation window is `0 <= value < limit`, so NEGATIVE values are
//     left alone — a negative lab result is a data problem, not a value below
//     the limit of quantitation;
//   * the original value is kept beside the imputed one.
//
// Read against a data-driven limit, the window from zero up to the smallest
// positive value contains exactly one thing: recorded zeros. That is the point.
// A zero has no place on a ×ULN ratio axis and cannot be drawn on a log one at
// all, and dropping it silently loses a participant; half the smallest observed
// value is the original's answer, and it is the one this port reproduces.
//
// NOTE ON THE ORIGINAL'S `drop` BRANCH: it is dead code upstream — the filter
// references an undefined `d` and assigns an implicit global — so it throws if
// it is ever reached. The intent is unambiguous from the surrounding code, and
// that intent is implemented here rather than the fault.
//
// Requirement group: HEP-IMPUTE-*.

/** The imputation methods the original offers, in its own order. */
export const IMPUTATION_METHODS = ['data-driven', 'user-defined', 'drop'];

/** The rows recorded for one measure key. @private */
function measureRows(rows, settings, measureKey) {
  const value = settings.measure_values ? settings.measure_values[measureKey] : undefined;
  if (value === undefined) return [];
  return rows.filter((row) => String(row[settings.measure_col]) === String(value));
}

/**
 * The lower limit of quantitation in force for one measure (HEP-IMPUTE-001):
 * the smallest positive recorded value under `data-driven`, the configured
 * value under `user-defined`, and NaN when neither applies — including the case
 * where a measure has no positive value for the data to speak from.
 * @param {Object[]} rows The cleaned rows.
 * @param {Object} settings Normalized settings.
 * @param {string} measureKey The measure key (e.g. 'ALT').
 * @returns {number} The limit, or NaN.
 */
export function lloqFor(rows, settings, measureKey) {
  const method = (settings.imputation_methods || {})[measureKey];
  if (method === 'user-defined') {
    const configured = Number((settings.imputation_values || {})[measureKey]);
    return Number.isFinite(configured) ? configured : NaN;
  }
  if (method !== 'data-driven') return NaN;
  const positives = measureRows(rows, settings, measureKey)
    .map((row) => Number(row[settings.value_col]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return positives.length ? Math.min(...positives) : NaN;
}

/**
 * Apply the configured below-LLOQ handling to the cleaned rows, in place for
 * the imputing methods and by filtering for `drop` (HEP-IMPUTE-002,
 * HEP-IMPUTE-003).
 *
 * Imputed rows carry `__hep_imputed` and their pre-imputation value in
 * `__hep_valueOriginal`, and their derived `__hep_relative_uln` is recomputed —
 * the ratio the eDISH axes actually plot. The ×baseline ratio is derived later,
 * from the imputed values, by the caller's `deriveBaseline`.
 * @param {Object[]} rows The cleaned rows, as returned by cleanData.
 * @param {Object} settings Normalized settings.
 * @returns {{rows: Object[], imputed: number, dropped: Object[], limits: Object}} The surviving rows, how many were imputed, the records dropped by the `drop` method with their reason, and the limit used per measure.
 */
export function imputeBelowLloq(rows, settings) {
  const methods = settings.imputation_methods || {};
  const dropped = [];
  const limits = {};
  let imputed = 0;
  let surviving = rows;

  Object.keys(settings.measure_values || {}).forEach((measureKey) => {
    const method = methods[measureKey];
    if (!IMPUTATION_METHODS.includes(method)) return;

    if (method === 'drop') {
      const measureValue = settings.measure_values[measureKey];
      surviving = surviving.filter((row) => {
        const isMeasure = String(row[settings.measure_col]) === String(measureValue);
        const value = Number(row[settings.value_col]);
        if (!isMeasure || !(value <= 0)) return true;
        row.__hep_dropReason = `${measureKey} result is not positive, and this measure is set to drop records at or below the limit of quantitation.`;
        dropped.push(row);
        return false;
      });
      return;
    }

    const limit = lloqFor(surviving, settings, measureKey);
    if (!Number.isFinite(limit)) return;
    limits[measureKey] = limit;
    const imputedValue = limit / 2;
    measureRows(surviving, settings, measureKey).forEach((row) => {
      const value = Number(row[settings.value_col]);
      if (!(value >= 0) || !(value < limit)) return;
      row.__hep_imputed = true;
      row.__hep_valueOriginal = value;
      row.__hep_value = imputedValue;
      row.__hep_relative_uln = imputedValue / row.__hep_uln;
      imputed += 1;
    });
  });

  return { rows: surviving, imputed, dropped, limits };
}
