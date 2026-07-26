// Shared hepatic-DILI quadrant domain for the safety.viz hepatic tools
// (obot.roadmap#43, safety.viz#91). Moved VERBATIM out of
// src/hep-explorer/composite.js so that the composite view (Amirzadegan 2025
// Fig 4), the baseline-to-on-treatment migration Sankey (Fig 3) and the ALT
// waterfall (Fig 5) share one definition of the Hy's-Law quadrants, the point
// styling, and the level of DILI concern.
//
// Ported faithfully from the FDA Composite-eDISH-Plot reference
// (Composite_eDISH_Model.R, public domain / MIT, DOI 10.5281/zenodo.10892050)
// implementing Tesfaldet et al., "Composite Plot for Visualizing
// Aminotransferase and Bilirubin Changes in Clinical Trials of Subjects with
// Abnormal Baseline Values", Drug Safety 2024;47:699-710 — strict thresholds
// (ALT > 3xULN and BILI > 2xULN) with the threshold value itself on the NORMAL
// side (R `cut(..., right = TRUE)`).
//
// Requirement groups: HEP-COMP-*, HEP-CORE-*.

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

/**
 * Severity band per quadrant for the migration Sankey's vertical stacking
 * (HEP-CORE-008): 0 is the top (most severe) band. Three bands over four
 * quadrants — Cholestasis and Temple's Corollary SHARE one band because
 * CONCERN_MATRIX deliberately declines to rank them against each other (both
 * CH→TC and TC→CH are yellow). Stacking them as distinct tiers would draw a
 * CH→TC ribbon travelling visually upward while painting it neutral, so the
 * chart would contradict the paper's "upward = potential DILI" reading.
 * @type {Object<string, number>}
 */
export const SEVERITY_TIERS = {
  [HL]: 0,
  [CH]: 1,
  [TC]: 1,
  [NN]: 2
};

/**
 * The four quadrants in severity order, top to bottom: the node stacking order
 * of every Sankey column and the row/column order of the migration view's
 * per-arm cross tables (HEP-CORE-008). CH and TC are adjacent sub-nodes of the
 * shared middle tier.
 * @type {string[]}
 */
export const SEVERITY_ORDER = [HL, CH, TC, NN];

/**
 * The vertical travel of a pretreatment -> on-treatment ribbon (HEP-CORE-008):
 * 'up' toward greater severity, 'down' toward less, 'lateral' within a tier
 * (including the CH/TC pair and every self-flow). Unknown quadrants compare as
 * NaN and degrade to 'lateral' rather than throwing.
 * @param {string} pretreatQuadrant The baseline quadrant.
 * @param {string} onTreatQuadrant The peak on-treatment quadrant.
 * @returns {string} 'up' | 'down' | 'lateral'.
 */
export function shiftDirection(pretreatQuadrant, onTreatQuadrant) {
  const delta = SEVERITY_TIERS[pretreatQuadrant] - SEVERITY_TIERS[onTreatQuadrant];
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'lateral';
}

/**
 * Fill colour for a migration ribbon (HEP-CORE-008). THE GOVERNING RULE: the
 * colour comes from concernOf — the clinical judgement in CONCERN_MATRIX —
 * never from the sign of the ribbon's vertical travel. Deriving it from the
 * geometry would repaint the two yellow CH↔TC flows as neutral gray and make
 * the plot's colours a restatement of its shape rather than of the medicine.
 * The 16-cell correspondence this guarantees (all 5 red pairs are 'up', all 5
 * green are 'down', the 2 yellow and 4 diagonal are 'lateral') is pinned by
 * HEP-CORE-008 / HEP-MIG-009.
 * @param {string} pretreatQuadrant The baseline quadrant.
 * @param {string} onTreatQuadrant The peak on-treatment quadrant.
 * @returns {string} A #rrggbb fill from CONCERN_COLORS.
 */
export function ribbonColor(pretreatQuadrant, onTreatQuadrant) {
  return CONCERN_COLORS[concernOf(pretreatQuadrant, onTreatQuadrant)];
}
