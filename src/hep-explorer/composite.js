// Composite plot data model for the hep-explorer module (#67): a faithful port
// of the FDA Composite-eDISH-Plot reference (Composite_eDISH_Model.R, public
// domain / MIT, DOI 10.5281/zenodo.10892050) implementing Tesfaldet et al.,
// "Composite Plot for Visualizing Aminotransferase and Bilirubin Changes in
// Clinical Trials of Subjects with Abnormal Baseline Values", Drug Safety
// 2024;47:699-710.
//
// The composite plot anchors an eDISH assessment to each subject's OWN baseline
// (xBLN) alongside the population reference (xULN), for the abnormal-baseline
// population where the standard xULN eDISH view both raises false alarms and
// masks real on-treatment change. Each subject is classified into a Hy's-Law
// quadrant twice — from BASELINE xULN (pretreatment) and from PEAK on-treatment
// xULN — and the migration between the two is what the plot and the migration
// table make visible.
//
// Ported faithfully from the R source (not reverse-engineered from the paper):
//   * strict thresholds — ALT > 3xULN and BILI > 2xULN; the threshold value
//     itself is on the NORMAL side (R `cut(..., right = TRUE)`),
//   * peak = max over ON-TREATMENT records only (AVISITN > 0), taken
//     independently per analyte (non-concurrent peak-to-peak),
//   * xBLN = peak on-treatment value / the subject's own baseline value.
// Kept as pure functions so the algorithm is unit-testable against
// hand-computed fixtures. Requirement groups: HEP-COMP-* (issue #67).

import { GROUP_NONE } from './configure.js';
import { resolveMeasureRows } from './structureData.js';

/** The four Hy's-Law quadrants, in the FDA reference's factor order. */
export const COMPOSITE_QUADRANTS = ['Normal & NN', 'Cholestasis', "Temple's Corollary", "Hy's Law"];

const [NN, CH, TC, HL] = COMPOSITE_QUADRANTS;

/** ALT elevation cutpoint on the xULN scale — strictly greater than this. */
export const ALT_ULN_CUT = 3;

/** Total-bilirubin elevation cutpoint on the xULN scale — strictly greater than this. */
export const BILI_ULN_CUT = 2;

/** xBLN reference lines drawn on the composite shift panels (1x = baseline). */
export const BLN_LINES = [1, 3, 5];

/**
 * Point color + Chart.js pointStyle per quadrant, carrying the paper's coded
 * symbols through every panel: Normal & NN green square, Cholestasis amber
 * circle, Temple's Corollary blue plus, Hy's Law red triangle. Colors are tuned
 * for legibility on a white plot background.
 * @type {Object<string, {color: string, pointStyle: string, label: string}>}
 */
export const QUADRANT_STYLE = {
  [NN]: { color: '#33a02c', pointStyle: 'rect', label: NN },
  [CH]: { color: '#e6a000', pointStyle: 'circle', label: CH },
  [TC]: { color: '#1f78b4', pointStyle: 'cross', label: TC },
  [HL]: { color: '#e31a1c', pointStyle: 'triangle', label: HL }
};

/**
 * Migration-table cell fill per level of DILI concern, keyed by the concern
 * color returned by concernOf.
 * @type {Object<string, string>}
 */
export const CONCERN_COLORS = {
  red: '#f28b82',
  yellow: '#fdd663',
  green: '#81c995',
  gray: '#dadce0'
};

/**
 * The 4x4 concern matrix (rows = pretreatment quadrant, columns = on-treatment
 * quadrant) decoded from the FDA reference's table styling: red = migration of
 * concern, yellow = migration of potential concern, green = migration of no
 * concern (potential benefit), gray = no migration (the diagonal). 5 red, 2
 * yellow, 5 green, 4 gray.
 * @type {Object<string, Object<string, string>>}
 */
export const CONCERN_MATRIX = {
  [NN]: { [NN]: 'gray', [CH]: 'red', [TC]: 'red', [HL]: 'red' },
  [CH]: { [NN]: 'green', [CH]: 'gray', [TC]: 'yellow', [HL]: 'red' },
  [TC]: { [NN]: 'green', [CH]: 'yellow', [TC]: 'gray', [HL]: 'red' },
  [HL]: { [NN]: 'green', [CH]: 'green', [TC]: 'green', [HL]: 'gray' }
};

/**
 * Level of DILI concern for a pretreatment -> on-treatment migration
 * (HEP-COMP-004): 'red' | 'yellow' | 'green' | 'gray'. Unknown quadrant pairs
 * fall back to 'gray'.
 * @param {string} pretreatQuadrant The baseline quadrant.
 * @param {string} onTreatQuadrant The peak on-treatment quadrant.
 * @returns {string} The concern color.
 */
export function concernOf(pretreatQuadrant, onTreatQuadrant) {
  const row = CONCERN_MATRIX[pretreatQuadrant];
  return (row && row[onTreatQuadrant]) || 'gray';
}

/**
 * Classify an (ALT xULN, BILI xULN) pair into a Hy's-Law quadrant with the FDA
 * reference's strict thresholds (HEP-COMP-001): the cutpoint value itself is on
 * the NORMAL side, so only ALT strictly > 3xULN and BILI strictly > 2xULN are
 * elevated. Non-finite inputs compare false against both cutpoints, so they are
 * treated as not elevated and yield 'Normal & NN'. This intentionally diverges
 * from the FDA `case_when`, whose NA inputs fall through to Temple's Corollary —
 * an artifact this port deliberately does not reproduce. In practice
 * buildCompositeSubjects only calls this on finite baseline/peak values, so the
 * non-finite path is not exercised at runtime.
 * @param {number} altULN ALT as a multiple of its ULN.
 * @param {number} biliULN Total bilirubin as a multiple of its ULN.
 * @returns {string} The quadrant label.
 */
export function classifyComposite(altULN, biliULN) {
  const altElevated = altULN > ALT_ULN_CUT;
  const biliElevated = biliULN > BILI_ULN_CUT;
  if (!altElevated && !biliElevated) return NN;
  if (!altElevated && biliElevated) return CH;
  if (altElevated && biliElevated) return HL;
  return TC;
}

/** Sort comparator for a participant's records: study day ascending, then input order. */
function dayThenIndex(a, b) {
  const da = Number.isFinite(a.__hep_day) ? a.__hep_day : Number.MAX_SAFE_INTEGER;
  const db = Number.isFinite(b.__hep_day) ? b.__hep_day : Number.MAX_SAFE_INTEGER;
  return da - db || a.__hep_index - b.__hep_index;
}

/**
 * Reduce one measure's records for one participant to its baseline and its peak
 * on-treatment values. Baseline is the study-day-0 record (else the earliest,
 * mirroring deriveBaseline). The peak is taken over the ON-TREATMENT records
 * only (study day > 0, matching the FDA reference's AVISITN > 0) — so screening
 * (negative-day) and any extra baseline records are excluded; when the data
 * carries no usable study day, on-treatment degrades to every record except the
 * single baseline record. Peak ×ULN and peak ×Baseline are taken as INDEPENDENT
 * maxima (they can fall on different visits when the reference range varies
 * across visits), again matching the reference. Returns null when no usable
 * baseline (finite, positive raw value) or no finite on-treatment peak is
 * present.
 * @param {Object[]} rows One participant's cleaned records for a single measure.
 * @returns {?{baselineULN: number, peakULN: number, peakBLN: number}} The reduction, or null.
 * @private
 */
function reduceMeasure(rows) {
  if (!rows.length) return null;
  const ordered = [...rows].sort(dayThenIndex);
  const baselineRow = ordered.find((row) => row.__hep_day === 0) || ordered[0];
  if (
    !baselineRow ||
    !Number.isFinite(baselineRow.__hep_value) ||
    !(baselineRow.__hep_value > 0) ||
    !Number.isFinite(baselineRow.__hep_relative_uln)
  ) {
    return null;
  }
  // On-treatment = study day > 0 when the data carries any usable day; otherwise
  // fall back to "every record except the baseline row" so day-less data still
  // yields a peak (graceful degradation).
  const hasDay = rows.some((row) => Number.isFinite(row.__hep_day));
  const isOnTreatment = (row) =>
    hasDay ? Number.isFinite(row.__hep_day) && row.__hep_day > 0 : row !== baselineRow;

  let peakULN = NaN;
  let peakBLN = NaN;
  rows.forEach((row) => {
    if (!isOnTreatment(row)) return;
    if (Number.isFinite(row.__hep_relative_uln) && !(row.__hep_relative_uln <= peakULN)) {
      peakULN = row.__hep_relative_uln;
    }
    if (Number.isFinite(row.__hep_relative_baseline) && !(row.__hep_relative_baseline <= peakBLN)) {
      peakBLN = row.__hep_relative_baseline;
    }
  });
  if (!Number.isFinite(peakULN) || !Number.isFinite(peakBLN)) return null;
  return { baselineULN: baselineRow.__hep_relative_uln, peakULN, peakBLN };
}

/**
 * Build one composite subject per participant (HEP-COMP-001/002/003): each
 * carries baseline ALT/BILI xULN, peak on-treatment ALT/BILI xULN and xBLN, the
 * pretreatment and on-treatment quadrants, the migration concern, and the
 * group/filter meta used by the by-arm summary. A participant is excluded when
 * either analyte lacks a usable baseline or on-treatment peak (graceful
 * degradation for abnormal/missing baselines); the excluded count feeds the
 * warning note.
 * @param {Object[]} cleanRows Rows from cleanData after deriveBaseline.
 * @param {Object} settings Normalized settings.
 * @returns {{subjects: Object[], excluded: number}} The composite subjects and drop count.
 */
export function buildCompositeSubjects(cleanRows, settings) {
  const metaCols = [
    ...settings.groups.map((group) => group.value_col),
    ...settings.filters.map((filter) => filter.value_col)
  ].filter((col) => col && col !== GROUP_NONE);

  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  const subjects = [];
  let excluded = 0;
  byId.forEach((participantRows, id) => {
    const alt = reduceMeasure(resolveMeasureRows(participantRows, settings, 'ALT'));
    const bili = reduceMeasure(resolveMeasureRows(participantRows, settings, 'TB'));
    if (!alt || !bili) {
      excluded += 1;
      return;
    }
    const pretreatQuadrant = classifyComposite(alt.baselineULN, bili.baselineULN);
    const onTreatQuadrant = classifyComposite(alt.peakULN, bili.peakULN);
    const raw = {};
    metaCols.forEach((col) => {
      raw[col] = participantRows[0][col] === undefined ? '' : String(participantRows[0][col]);
    });
    subjects.push({
      id,
      raw,
      baselineAltULN: alt.baselineULN,
      baselineBiliULN: bili.baselineULN,
      peakAltULN: alt.peakULN,
      peakBiliULN: bili.peakULN,
      peakAltBLN: alt.peakBLN,
      peakBiliBLN: bili.peakBLN,
      pretreatQuadrant,
      onTreatQuadrant,
      concern: concernOf(pretreatQuadrant, onTreatQuadrant)
    });
  });
  return { subjects, excluded };
}

/**
 * Cross-tabulate composite subjects into the pretreatment x on-treatment
 * migration matrix (HEP-COMP-004): counts keyed [pretreatQuadrant][onTreatQuadrant]
 * over the fixed quadrant order, with row totals, column totals, and the grand
 * total.
 * @param {Object[]} subjects Composite subjects from buildCompositeSubjects.
 * @returns {{counts: Object, rowTotals: Object, colTotals: Object, total: number}}
 */
export function migrationMatrix(subjects) {
  const counts = {};
  const rowTotals = {};
  const colTotals = {};
  COMPOSITE_QUADRANTS.forEach((pre) => {
    counts[pre] = {};
    rowTotals[pre] = 0;
    colTotals[pre] = 0;
    COMPOSITE_QUADRANTS.forEach((post) => {
      counts[pre][post] = 0;
    });
  });
  let total = 0;
  subjects.forEach((subject) => {
    const pre = subject.pretreatQuadrant;
    const post = subject.onTreatQuadrant;
    if (counts[pre] && counts[pre][post] !== undefined) {
      counts[pre][post] += 1;
      rowTotals[pre] += 1;
      colTotals[post] += 1;
      total += 1;
    }
  });
  return { counts, rowTotals, colTotals, total };
}

/**
 * Summarize migrations by level of concern for each value of an arm column
 * (HEP-COMP-005): per arm, the count of subjects whose migration is red
 * (concern), yellow (potential concern), green (no concern / benefit), or gray
 * (no migration), plus the arm total. When armCol is falsy, all subjects roll
 * up into a single 'All' row.
 * @param {Object[]} subjects Composite subjects from buildCompositeSubjects.
 * @param {?string} armCol The meta column to split by (e.g. treatment arm), or null.
 * @returns {Array<{arm: string, red: number, yellow: number, green: number, gray: number, total: number}>}
 */
export function byArmSummary(subjects, armCol) {
  const buckets = new Map();
  const bucketFor = (arm) => {
    if (!buckets.has(arm))
      buckets.set(arm, { arm, red: 0, yellow: 0, green: 0, gray: 0, total: 0 });
    return buckets.get(arm);
  };
  subjects.forEach((subject) => {
    const arm = armCol ? (subject.raw[armCol] ?? '') : 'All';
    const bucket = bucketFor(arm === '' ? '(missing)' : arm);
    bucket[subject.concern] += 1;
    bucket.total += 1;
  });
  return [...buckets.values()].sort((a, b) => String(a.arm).localeCompare(String(b.arm)));
}
