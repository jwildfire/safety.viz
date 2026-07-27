// The P_ALT hepatocyte-loss estimate (safety.viz#49, obot.roadmap#30): the
// rapid estimate of the percentage of hepatocytes lost during a drug-induced
// liver-injury event, from the AUC and the peak of serum ALT — Chung et al.,
// "A Rapid Method to Estimate Hepatocyte Loss Due to Drug-Induced Liver
// Injury", Clin Pharmacol Ther (PMID 30303523).
//
// Ported from the original SafetyGraphics/hep-explorer's
// src/callbacks/onPreprocess/flattenData/calculatePalt.js. Two details of that
// implementation are load-bearing and easy to lose:
//
//   * the trapezoidal AUC integrates over HOURS (study day × 24), not days, so
//     a day-based integration is wrong by a factor of 24; and
//   * it uses the RAW result, not the ×ULN or ×Baseline standardization — the
//     estimate is defined on IU/L.
//
// This module computes; it does not decide whether to. The hep-explorer and the
// participant profile both default to NOT computing it (`calculate_palt: false`)
// and prefer a value the caller's own statistical programming supplied via
// `p_alt_col`, because a browser-side estimate carries assumptions — the unit,
// and a study-day axis dense enough for a trapezoid to mean anything — that only
// the data owner can confirm.
//
// Requirement group: HEP-PALT-*.

import { MEASURE_KEYS, dayThenIndex, resolveMeasureRows } from './rows.js';

/** The paper's exponent on peak ALT. */
const PEAK_EXPONENT = 0.18;
/** The paper's scaling denominator. */
const SCALE = 1e5;
/** Hours per study day — the AUC's time unit. */
const HOURS_PER_DAY = 24;

/** Two-decimal fixed formatting, matching the original's d3.format('0.2f'). @private */
const f2 = (value) => value.toFixed(2);

/**
 * The P_ALT estimate for one participant, or null when the data cannot support
 * one (HEP-PALT-001, HEP-PALT-002). Returns the value, its display string, the
 * two components it is built from, and the note that shows the arithmetic —
 * the same shape the participant-profile header renders for a click-to-explain
 * P_ALT figure.
 *
 * Declines to answer — returning null rather than a number — when the
 * participant has fewer than two dated ALT results, or when every dated result
 * falls on one study day: an AUC needs an interval, and inventing one would
 * turn "not estimable" into a number a reader would act on.
 *
 * @param {Object[]} participantRows That participant's cleaned rows (carrying __hep_*).
 * @param {Object} settings Normalized settings (measure_col, measure_values, value_col).
 * @returns {?{value: number, text_value: string, note: string, components: {peak: number, auc: number}, values: Array<{day: number, value: number}>}}
 */
export function calculatePalt(participantRows, settings) {
  if (!Array.isArray(participantRows) || !participantRows.length) return null;
  const altRows = resolveMeasureRows(participantRows, settings, MEASURE_KEYS[0]);
  const values = altRows
    .filter((row) => Number.isFinite(row.__hep_value) && Number.isFinite(row.__hep_day))
    .sort(dayThenIndex)
    .map((row) => ({ day: row.__hep_day, value: row.__hep_value }));
  if (values.length < 2) return null;
  if (values[values.length - 1].day === values[0].day) return null;

  const peak = Math.max(...values.map((point) => point.value));
  let auc = 0;
  for (let i = 0; i < values.length - 1; i += 1) {
    const meanValue = (values[i].value + values[i + 1].value) / 2;
    const hours = (values[i + 1].day - values[i].day) * HOURS_PER_DAY;
    auc += meanValue * hours;
  }

  const value = (auc * Math.pow(peak, PEAK_EXPONENT)) / SCALE;
  const text = f2(value);
  // PLAIN TEXT, deliberately: the original renderer wrote its note in with
  // .html(), but the profile header sets textContent, and a note that arrives
  // as markup would either render as literal tags or force an innerHTML sink
  // into a component that also displays caller-supplied values. The citation
  // travels beside the prose as a link the header can build safely.
  const note =
    `NOTE: For this participant, P_ALT was calculated as ` +
    `ALT AUC × Peak ALT^${PEAK_EXPONENT} / 10^5 = ` +
    `${f2(auc)} × ${f2(peak)}^${PEAK_EXPONENT} / 10^5 = ${text}. ` +
    `The AUC is trapezoidal over study day × 24 hours, and the estimate assumes ALT is ` +
    `reported in IU/L — if your results are in other units this figure does not apply. ` +
    `P_ALT predicts the percentage hepatocyte loss from the maximum value and the AUC of ` +
    `serum ALT observed during a DILI event (Chung et al., PMID 30303523). It is an ` +
    `estimate, not a measurement, and is not validated for clinical use.`;

  return {
    value,
    text_value: text,
    note,
    reference: {
      label: 'A Rapid Method to Estimate Hepatocyte Loss Due to Drug-Induced Liver Injury',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30303523/'
    },
    components: { peak, auc },
    values
  };
}
