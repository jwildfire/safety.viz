// Settings defaults + merge for the qt-explorer module (#68). Mirrors the
// hep-explorer / outlier-explorer configure.js shape (DEFAULT_SETTINGS +
// syncSettings), for the QT Safety Explorer that ports SafetyGraphics/qtexplorer
// into safety.viz: heart-rate-corrected QTc (QTcF / QTcB) and heart rate mapped
// from the TEST column, an arm column driving per-arm central tendency + ΔΔ
// placebo correction, and the ICH-E14 absolute (450/480/500 ms) and change
// (30/60 ms) thresholds from the CSRC clinical workflow. Field-list settings
// (filters) accept column-name strings or { value_col, label } specs.
// Requirement IDs use the condensed QT-* scheme (QT-CTRL-*, QT-CT-*, QT-OUT-*,
// QT-CAT-*, QT-DATA-*).

/** The three views the renderer switches between (QT-CTRL-001). */
export const VIEWS = [
  { value: 'central', label: 'Central tendency' },
  { value: 'outlier', label: 'Outlier scatter' },
  { value: 'categorical', label: 'Categorical' }
];

/** Central-tendency summary statistics offered by the Statistic control (QT-CT-002). */
export const STATISTICS = [
  { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' }
];

/**
 * Central-tendency display modes (QT-CT-004). `delta` plots the mean/median
 * change from baseline per arm; `deltadelta` plots the placebo-corrected change
 * (arm mean Δ − placebo mean Δ) for each active drug arm — the double-difference
 * the ICH-E14 metric reads.
 * @type {Array<{value: string, label: string}>}
 */
export const DISPLAY_MODES = [
  { value: 'delta', label: 'Δ (change from baseline)' },
  { value: 'deltadelta', label: 'ΔΔ (placebo-corrected)' }
];

/** Sentinel timepoint: each participant's worst post-baseline reading (QT-OUT-002). */
export const TIMEPOINT_MAX = '__qt_max';

/**
 * Rendering and data-mapping settings for the qt-explorer module. Every key has
 * a default in DEFAULT_SETTINGS; callers pass only the overrides they need and
 * syncSettings fills in the rest. Field-list settings (filters) accept
 * column-name strings or spec objects, singly or as an array.
 * @typedef {Object} QtExplorerSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; one scatter point per participant and the exceedance denominators (QT-DATA-001).
 * @property {string} [measure_col='TEST'] Column holding the ECG parameter name; required in the data. Matched to the correction options (QT-DATA-002).
 * @property {string} [value_col='STRESN'] Column holding the numeric analysis value; required in the data. Missing / non-numeric rows are removed with a console warning (QT-DATA-003).
 * @property {string} [baseline_col='BASE'] Baseline-value column; required in the data — the scatter x-axis and the absolute-threshold diagonals anchor to it (QT-OUT-001).
 * @property {?string} [change_col='CHG'] Optional source change-from-baseline column; when blank for a row, change is derived as value − baseline (QT-DATA-004).
 * @property {?string} [unit_col='STRESU'] Optional unit column, appended to the parameter label.
 * @property {string} [arm_col='ARM'] Treatment-arm column; required in the data. Drives per-arm lines, point colors, ΔΔ correction, and the exceedance columns (QT-CT-001, QT-OUT-004, QT-CAT-001).
 * @property {?string} [placebo_arm=null] Arm treated as placebo for ΔΔ and the ICH-E14 metric; when null, /placebo/i is auto-detected (QT-CT-004).
 * @property {string} [visit_col='VISIT'] Categorical visit column; the central-tendency x-axis and the scatter timepoint selector (QT-CT-001, QT-OUT-002).
 * @property {?string} [visitn_col='VISITNUM'] Optional numeric visit column ordering the visits; falls back to first-seen order.
 * @property {?string} [baseline_flag_col='ABLFL'] Optional 'Y'-flagged baseline-record column; excludes the baseline visit from post-baseline extremes and the change series (QT-DATA-005).
 * @property {string[]} [measures=['QTcF','QTcB','Heart Rate']] Correction / parameter options offered by the Correction control (QT-CTRL-002).
 * @property {string[]} [qtc_measures=['QTcF','QTcB']] Which measures are QTc corrections; absolute cut-lines/rows apply only to these (QT-OUT-003).
 * @property {?string} [start_measure='QTcF'] Correction selected on first render; falls back to the first available measure (QT-CTRL-002).
 * @property {number[]} [absolute_thresholds=[450,480,500]] Absolute QTc cut-lines (msec) — scatter diagonals + categorical absolute rows (QT-OUT-003, QT-CAT-002).
 * @property {number[]} [change_thresholds=[30,60]] Change-from-baseline cut-lines (msec) — scatter horizontals + categorical change rows (QT-OUT-003, QT-CAT-003).
 * @property {number} [reference_threshold=10] Central-tendency reference line (msec): the ICH-E14 threshold of concern (QT-CT-003).
 * @property {number} [ci_level=0.9] Confidence level for the CI on the mean change and the mean difference; the ICH-E14 metric reads its upper bound (QT-CT-005).
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs (QT-CTRL-003).
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings.
 */

/**
 * Built-in defaults for every qt-explorer setting; syncSettings merges caller
 * overrides onto these. Threshold defaults reproduce the CSRC clinical
 * workflow's cutpoints: absolute QTc 450/480/500 ms (step 3a), change from
 * baseline 30/60 ms (step 3b), and a 10 ms central-tendency reference of concern
 * (step 1a).
 * @type {QtExplorerSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  baseline_col: 'BASE',
  change_col: 'CHG',
  unit_col: 'STRESU',
  arm_col: 'ARM',
  placebo_arm: null,
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  baseline_flag_col: 'ABLFL',
  measures: ['QTcF', 'QTcB', 'Heart Rate'],
  qtc_measures: ['QTcF', 'QTcB'],
  start_measure: 'QTcF',
  absolute_thresholds: [450, 480, 500],
  change_thresholds: [30, 60],
  reference_threshold: 10,
  ci_level: 0.9,
  filters: [],
  width: '100%',
  height: 460
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

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become spec arrays, the measure/threshold lists are coerced to arrays, and
 * start_measure falls back to the first available measure when unlisted.
 * @param {QtExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {QtExplorerSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.filters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);

  synced.measures = arrayify(synced.measures);
  synced.qtc_measures = arrayify(synced.qtc_measures);
  synced.absolute_thresholds = arrayify(synced.absolute_thresholds)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  synced.change_thresholds = arrayify(synced.change_thresholds)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (!synced.start_measure || !synced.measures.includes(synced.start_measure)) {
    synced.start_measure = synced.measures[0] || null;
  }
  if (!Number.isFinite(synced.ci_level) || synced.ci_level <= 0 || synced.ci_level >= 1) {
    synced.ci_level = DEFAULT_SETTINGS.ci_level;
  }

  return synced;
}

/**
 * The two-sided z multiplier for a confidence level (normal approximation).
 * Interpolates a small table so ci_level need not be one of the common values;
 * the CSRC workflow uses the two-sided 90% interval (z ≈ 1.645) for the ICH-E14
 * metric (QT-CT-005).
 * @param {number} ciLevel Confidence level in (0, 1), e.g. 0.9.
 * @returns {number} The two-sided z multiplier.
 */
export function zForCi(ciLevel) {
  const table = [
    [0.8, 1.2816],
    [0.9, 1.6449],
    [0.95, 1.96],
    [0.98, 2.3263],
    [0.99, 2.5758]
  ];
  if (!Number.isFinite(ciLevel)) return 1.6449;
  if (ciLevel <= table[0][0]) return table[0][1];
  if (ciLevel >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i += 1) {
    const [lo, zLo] = table[i];
    const [hi, zHi] = table[i + 1];
    if (ciLevel >= lo && ciLevel <= hi) {
      return zLo + ((zHi - zLo) * (ciLevel - lo)) / (hi - lo);
    }
  }
  return 1.6449;
}

/**
 * Resolve the placebo arm for ΔΔ: the explicit setting when it names one of the
 * present arms, else the arm whose name matches /placebo/i, else null (QT-CT-004).
 * @param {string[]} arms Distinct arm values present in the data.
 * @param {?string} placeboSetting The settings.placebo_arm override.
 * @returns {?string} The placebo arm, or null when none is resolvable.
 */
export function resolvePlaceboArm(arms, placeboSetting) {
  if (placeboSetting && arms.includes(placeboSetting)) return placeboSetting;
  return arms.find((arm) => /placebo/i.test(arm)) || null;
}
