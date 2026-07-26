// Settings defaults + merge for the hep-waterfall module (safety.viz#93,
// obot.roadmap#43): the modified ALT waterfall of Amirzadegan et al., "Emerging
// Tools to Support DILI Assessment in Clinical Trials with Abnormal Baseline
// Serum Liver Tests or Pre-existing Liver Diseases", Drug Safety
// 2025;48(5):443-453, Figure 5.
//
// The lab-mapping block (id_col … measure_values, filters) is deliberately
// IDENTICAL to hep-explorer's, so one lSettings list can drive both R widget
// bindings; everything after it is the waterfall's own. Field-list settings
// (filters, details) accept column-name strings or { value_col, label } specs.
//
// This file's NAME is load-bearing: scripts/api/extract.mjs derives a module's
// documented surface as ['src/<module>.js', 'src/<module>/configure.js'], so
// the settings typedef below IS the published API reference. Every
// DEFAULT_SETTINGS key must appear in it with a type and a description or
// `npm run docs:api` exits non-zero and the site build fails.
//
// Requirement group: HWF-CFG-*.

/** The four liver measures the waterfall can plot; the paper uses ALT. */
export const MEASURE_KEYS = ['ALT', 'AST', 'TB', 'ALP'];

/**
 * How the reference range is drawn on the absolute axis (HWF-CFG-004,
 * HWF-AXIS-004). `band` shades min-to-max across the cohort (collapsing to a
 * single line when every participant shares one limit), `per_subject` traces
 * each participant's own limit, `none` draws nothing.
 * @type {string[]}
 */
export const ULN_DISPLAYS = ['band', 'per_subject', 'none'];

/**
 * What the flanking summary panels show (HWF-CFG-005, HWF-BOX-003).
 * `baseline_peak` shows a baseline box and a maximum-on-treatment box per arm —
 * the panel then summarizes the SHIFT, which is what the bars show per
 * participant; `peak` gives the single-box reading (open call O2).
 * @type {string[]}
 */
export const SUMMARY_MODES = ['baseline_peak', 'peak'];

/**
 * Rendering and data-mapping settings for the hep-waterfall module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they need
 * and syncSettings fills in the rest.
 * @typedef {Object} HepWaterfallSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; one bar per participant (HWF-DATA-001).
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Rows are matched to the ALT/AST/TB/ALP keys via measure_values.
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. The bars and the baseline trace are drawn in these units (HWF-AXIS-001).
 * @property {?string} [unit_col='STRESU'] Unit column; the modal value for the plotted measure titles both axes, falling back to U/L (HWF-DATA-006).
 * @property {string} [normal_col_high='STNRHI'] Upper-limit-of-normal column; required in the data — it drives the reference-range band and the ×ULN bilirubin rules (HWF-AXIS-004).
 * @property {?string} [normal_col_low='STNRLO'] Optional lower-limit-of-normal column, carried into the participant listing.
 * @property {?string} [studyday_col='DY'] Study-day column; separates the baseline record from the on-treatment records and dates the maximum (HWF-DATA-002).
 * @property {?string} [visit_col='VISIT'] Optional categorical visit column, shown in the participant listing.
 * @property {?string} [visitn_col='VISITNUM'] Optional numeric visit column ordering the visits.
 * @property {Object} [measure_values] Map of the short measure key (ALT/AST/TB/ALP) to the full measure string in the data; controls present the short keys but resolve rows via these strings.
 * @property {string} [measure='ALT'] The plotted analyte. The paper plots ALT; AST, ALP and TB are available (HWF-CFG-002).
 * @property {string} [arm_col='ARM'] Treatment-arm column; REQUIRED in the data — the arm decides which half of the waterfall a participant's bar sits in, so a waterfall without it has no seam and no comparison (HWF-DATA-005).
 * @property {?string} [placebo_arm=null] Arm plotted blue on the left half; when null it is auto-detected by matching the arm values against /placebo|control/i (HWF-CFG-003).
 * @property {?Array<string>} [active_arms=null] Arms plotted bronze on the right half; when null every non-placebo arm pools right (HWF-CFG-003).
 * @property {?string} [baseline_col=null] Optional baseline-flag column (e.g. ABLFL); when supplied the flagged record is the baseline, outranking the day-0-else-earliest heuristic.
 * @property {string} [baseline_value='Y'] The value of baseline_col that marks the baseline record.
 * @property {number} [jaundice_uln=2] New-onset-jaundice threshold on the total-bilirubin ×ULN scale: flagged when the baseline is at or below it and the on-treatment maximum exceeds it (HWF-DATA-004).
 * @property {number} [baseline_tb_max=1] Paper Table-1 cohort rule: participants whose baseline total bilirubin exceeds this many ×ULN are excluded (HWF-DATA-003).
 * @property {boolean} [apply_tb_cohort=true] Whether to apply that Table-1 exclusion; turning it off admits baseline-jaundiced participants and says so in the notes (HWF-DATA-003).
 * @property {string} [uln_display='band'] How the reference range is drawn: 'band', 'per_subject', or 'none' (HWF-CFG-004, HWF-AXIS-004).
 * @property {string} [summary='baseline_peak'] What the flanking panels show: 'baseline_peak' (a baseline box and a peak box per arm) or 'peak' (HWF-CFG-005, HWF-BOX-003).
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs (HWF-CTRL-003).
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults derive from the measure/day/value mappings (HWF-SELECT-002).
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the shell always spans its container.
 * @property {number} [height=480] Chart-area height in pixels, carried over for the R widget bindings.
 */

/**
 * Built-in defaults for every hep-waterfall setting; syncSettings merges caller
 * overrides onto these. `jaundice_uln` defaults to the composite plot's
 * bilirubin cutpoint (2×ULN) so a jaundice flag and a Hy's-Law classification
 * can never disagree, and `baseline_tb_max` to the paper's Table-1 cohort rule
 * (normal baseline bilirubin) — two different thresholds doing two different
 * jobs, which is why they are two settings.
 * @type {HepWaterfallSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  unit_col: 'STRESU',
  normal_col_high: 'STNRHI',
  normal_col_low: 'STNRLO',
  studyday_col: 'DY',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  measure_values: {
    ALT: 'Aminotransferase, alanine (ALT)',
    AST: 'Aminotransferase, aspartate (AST)',
    TB: 'Total Bilirubin',
    ALP: 'Alkaline phosphatase (ALP)'
  },
  measure: 'ALT',
  arm_col: 'ARM',
  placebo_arm: null,
  active_arms: null,
  baseline_col: null,
  baseline_value: 'Y',
  jaundice_uln: 2,
  baseline_tb_max: 1,
  apply_tb_cohort: true,
  uln_display: 'band',
  summary: 'baseline_peak',
  filters: [],
  details: null,
  page_size: 10,
  width: '100%',
  height: 480
};

/**
 * Normalize a single value or nullish to an array.
 * @param {*} value A value, array, or nullish.
 * @returns {Array} The value as an array ([] for nullish/empty).
 */
export function arrayify(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalize a column name or spec object to { value_col, label, ...extra }.
 * @param {string|Object} value A column name or a { value_col, label } spec.
 * @param {string} [fallbackLabel] Label to use when none is supplied.
 * @returns {Object} The normalized spec.
 */
export function fieldSpec(value, fallbackLabel) {
  if (typeof value === 'string') return { value_col: value, label: fallbackLabel || value };
  return { ...value, value_col: value.value_col, label: value.label || value.value_col };
}

/** A finite number, else the DEFAULT_SETTINGS value for the key. @private */
function numberOr(value, key) {
  const parsed = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(parsed)
    ? parsed
    : DEFAULT_SETTINGS[key];
}

/** One of the allowed values, else the DEFAULT_SETTINGS value for the key. @private */
function enumOr(value, allowed, key) {
  return allowed.includes(value) ? value : DEFAULT_SETTINGS[key];
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them (HWF-CFG-001):
 * field lists become spec arrays, measure_values deep-merges onto the defaults
 * (so a partial override still back-fills every measure), the thresholds are
 * numified and the cohort toggle coerced (HWF-CFG-002), the arm designation is
 * normalized so it can be resolved to a side map at render time (HWF-CFG-003),
 * and the two enum settings fall back to their defaults rather than rendering
 * an unrecognized mode (HWF-CFG-004, HWF-CFG-005).
 * @param {HepWaterfallSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {HepWaterfallSettings} The merged, normalized settings.
 */
export function syncSettings(settings = {}) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.filters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((spec) => spec.value_col);
  synced.details = arrayify(synced.details)
    .map((value) => fieldSpec(value))
    .filter((spec) => spec.value_col);

  synced.measure_values = {
    ...DEFAULT_SETTINGS.measure_values,
    ...(settings.measure_values || {})
  };
  synced.measure = synced.measure ? String(synced.measure) : DEFAULT_SETTINGS.measure;

  // Arm designation (HWF-CFG-003): a single active arm may be given as a bare
  // string; an empty list means "not designated" and falls back to null, i.e.
  // every non-placebo arm pools onto the active side rather than leaving the
  // active half silently empty. resolveArmDesignation turns this into the side
  // map at render time.
  const activeArms = arrayify(synced.active_arms).map(String);
  synced.active_arms = activeArms.length ? activeArms : null;
  synced.placebo_arm =
    synced.placebo_arm === undefined || synced.placebo_arm === null || synced.placebo_arm === ''
      ? null
      : String(synced.placebo_arm);

  synced.jaundice_uln = numberOr(synced.jaundice_uln, 'jaundice_uln');
  synced.baseline_tb_max = numberOr(synced.baseline_tb_max, 'baseline_tb_max');
  synced.apply_tb_cohort =
    synced.apply_tb_cohort === undefined
      ? DEFAULT_SETTINGS.apply_tb_cohort
      : Boolean(synced.apply_tb_cohort);

  synced.uln_display = enumOr(synced.uln_display, ULN_DISPLAYS, 'uln_display');
  synced.summary = enumOr(synced.summary, SUMMARY_MODES, 'summary');
  synced.page_size = numberOr(synced.page_size, 'page_size');

  return synced;
}
