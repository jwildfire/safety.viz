// Settings defaults + merge for the hep-explorer module (#43). Mirrors the
// outlier-explorer's configure.js shape (DEFAULT_SETTINGS + syncSettings),
// extended for the eDISH/mDISH hepatotoxicity explorer the original
// SafetyGraphics hep-explorer exposes: the four liver measures (ALT/AST/TB/ALP)
// mapped from the TEST column, the ×ULN / ×Baseline display modes, the Hy's-Law
// quadrant cutpoints, and the R-Ratio / timing controls. Field-list settings
// (filters, groups, details) accept column-name strings or { value_col, label }
// specs. Requirement IDs use the condensed HEP-* scheme (HEP-CTRL-*, HEP-DISPLAY-*,
// HEP-QUAD-*, HEP-DATA-*).

/** The "no grouping" sentinel value for the color-by control (HEP-CTRL-009). */
export const GROUP_NONE = 'hep_none';

/**
 * Standardization / display modes offered by the Display Type control
 * (HEP-DISPLAY-001). `relative_uln` ("eDISH") divides each value by its ULN;
 * `relative_baseline` ("mDISH") divides by the participant's baseline value.
 * @type {Array<{value: string, label: string}>}
 */
export const DISPLAY_MODES = [
  { value: 'relative_uln', label: 'Upper limit of normal adjusted (eDISH)' },
  { value: 'relative_baseline', label: 'Baseline adjusted (mDISH)' }
];

/**
 * Top-level view modes offered by the View control (HEP-COMP-006). `scatter` is
 * the classic one-point-per-participant eDISH/mDISH scatter; `composite` is the
 * baseline-referenced composite plot (Tesfaldet et al., Drug Safety 2024) for
 * subjects with abnormal baseline liver tests — pretreatment and on-treatment
 * eDISH panels, a four-panel ×Baseline shift plot, and a migration table.
 * @type {Array<{value: string, label: string}>}
 */
export const VIEW_MODES = [
  { value: 'scatter', label: 'eDISH / mDISH scatter' },
  { value: 'composite', label: 'Composite plot (baseline-referenced)' }
];

/** Axis-type options for the Axis Type control (HEP-CTRL-006). */
export const AXIS_TYPES = ['linear', 'log'];

/** Point-size options for the Point Size control: uniform radius or rRatio-scaled (HEP-CTRL-007). */
export const POINT_SIZE_OPTIONS = ['Uniform', 'rRatio'];

/** The four liver measures the explorer standardizes and can plot (HEP-DISPLAY-003). */
export const MEASURE_KEYS = ['ALT', 'AST', 'TB', 'ALP'];

/**
 * Rendering and data-mapping settings for the hep-explorer module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they need
 * and syncSettings fills in the rest. Field-list settings (filters, groups,
 * details) accept column-name strings or spec objects, singly or as an array.
 * The flat snake_case keys replace the original renderer's nested
 * `settings.measure.{x,y}` / `settings.x` / `settings.y` webcharts config; the
 * mapping is documented in docs/hep-explorer-coverage.md.
 * @typedef {Object} HepExplorerSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the one-point-per-participant scatter, the participant counts, and the linked listing (HEP-DATA-001).
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Rows are matched to the ALT/AST/TB/ALP keys via measure_values (HEP-DATA-002).
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning (HEP-DATA-003).
 * @property {string} [unit_col='STRESU'] Optional unit column, appended to measure labels and shown in the linked listing.
 * @property {string} [normal_col_high='STNRHI'] Upper-limit-of-normal (ULN) column; required in the data — the ×ULN standardization divides each value by it (HEP-DISPLAY-002).
 * @property {?string} [normal_col_low='STNRLO'] Optional lower-limit-of-normal column, carried into the linked listing.
 * @property {?string} [studyday_col='DY'] Optional study-day column; drives the day_diff timing test and the visit-path ordering. When absent, a per-participant per-measure input-order sequence is derived (HEP-SELECT-004, HEP-DATA-004).
 * @property {?string} [visit_col='VISIT'] Optional categorical visit column; labels the visit-path overlay and pairs the X/Y trajectory points (HEP-SELECT-003).
 * @property {?string} [visitn_col='VISITNUM'] Optional numeric visit column; orders visit-keyed series when present.
 * @property {?string} [arm_col='ARM'] Treatment-arm column, structural for the migration view — it decides which side of the centre column a participant's flow leaves from. Auto-detected across ARM, ACTARM, TRT01A and TREATMENT when the named column is absent; deliberately not a globally required column, so arm-less data still renders the scatter and composite views (HEP-ARM-001).
 * @property {?string} [placebo_arm=null] Arm value plotted on the left (placebo) side of the migration Sankey; when null it is auto-detected by matching the arm values against /placebo|control/i (HEP-ARM-002).
 * @property {?Array<string>} [active_arms=null] Arm values plotted on the right (active) side; when null every non-placebo arm pools right and the pooled arms are named in the notes (HEP-ARM-003).
 * @property {?string} [baseline_col=null] Optional baseline-flag column (e.g. ABLFL). When supplied, the flagged record is the baseline, outranking the day-0-else-earliest heuristic (HEP-CORE-003).
 * @property {string} [baseline_value='Y'] The value of baseline_col that marks the baseline record (HEP-CORE-003).
 * @property {number} [jaundice_uln=2] New-onset-jaundice threshold on the total-bilirubin ×ULN scale: flagged when baseline is at or below it and the on-treatment maximum exceeds it. Defaults to the composite plot's bilirubin cutpoint so the flag and the quadrants stay mutually consistent (HEP-CORE-006).
 * @property {boolean} [hide_unchanged=false] Migration view: suppress the diagonal (no-migration) ribbons; the hidden participant count stays in the notes and the cross tables (HEP-MIG-013).
 * @property {Object} [measure_values] Map of the short measure key (ALT/AST/TB/ALP) to the full TEST string in the data; controls present the short keys but resolve rows via these strings (HEP-DATA-002).
 * @property {string} [x_default='ALT'] Measure plotted on the x-axis on first render (HEP-CTRL-001).
 * @property {string} [y_default='TB'] Measure plotted on the y-axis on first render (HEP-CTRL-002).
 * @property {string[]} [x_options=['ALT','AST','TB','ALP']] Measures offered by the X-axis Measure control (HEP-CTRL-001).
 * @property {string[]} [y_options=['TB']] Measures offered by the Y-axis Measure control; when only one option the control is dropped (HEP-CTRL-002).
 * @property {Object} [cuts] Per-measure Hy's-Law cutpoints keyed by measure then display mode; a `defaults` entry back-fills any measure without its own cuts (HEP-QUAD-001).
 * @property {string} [view='scatter'] Initial view mode: `scatter` (eDISH/mDISH scatter) or `composite` (baseline-referenced composite plot for abnormal-baseline subjects) (HEP-COMP-006).
 * @property {number} [visit_window=30] Timing window (days): points whose peak-X and peak-Y days are within this many days render filled, else hollow (HEP-CTRL-008, HEP-DISPLAY-005).
 * @property {boolean} [r_ratio_filter=true] Whether to render the R-Ratio range filter control (HEP-CTRL-010).
 * @property {number[]} [r_ratio=[0,null]] Initial R-Ratio [min, max] range; a null max is resolved from the data on first render (HEP-CTRL-010).
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs. Filters whose column is absent from the data are dropped with a console warning (HEP-CTRL-011).
 * @property {Array<string|Object>} [groups=[]] Color-by options; a "None" option is always offered first (HEP-CTRL-009).
 * @property {string} [group_by='hep_none'] Column the points are colored by on first render; 'hep_none' disables grouping.
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults derive from the measure/day/value mappings (HEP-SELECT-006).
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the shell fixes the chart-area height.
 */

/**
 * Built-in defaults for every hep-explorer setting; syncSettings merges caller
 * overrides onto these. Cutpoint defaults reproduce the original renderer's
 * settings.cuts: TB 2×ULN / 4.8×Baseline, ALP 1×ULN / 3.8×Baseline, rRatio 5/5,
 * and a `defaults` fallback of 3×ULN / 3.8×Baseline used by ALT, AST, and any
 * unlisted measure — so the default eDISH view is ALT ≥ 3×ULN vs TB ≥ 2×ULN
 * (HEP-QUAD-001).
 * @type {HepExplorerSettings}
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
  arm_col: 'ARM',
  placebo_arm: null,
  active_arms: null,
  baseline_col: null,
  baseline_value: 'Y',
  // Defaults to BILI_ULN_CUT (2) from src/hep-core/quadrants.js so a new-onset
  // jaundice flag and a Cholestasis/Hy's-Law classification can never disagree.
  jaundice_uln: 2,
  hide_unchanged: false,
  measure_values: {
    ALT: 'Aminotransferase, alanine (ALT)',
    AST: 'Aminotransferase, aspartate (AST)',
    TB: 'Total Bilirubin',
    ALP: 'Alkaline phosphatase (ALP)'
  },
  view: 'scatter',
  x_default: 'ALT',
  y_default: 'TB',
  x_options: ['ALT', 'AST', 'TB', 'ALP'],
  y_options: ['TB'],
  cuts: {
    TB: { relative_uln: 2, relative_baseline: 4.8 },
    ALP: { relative_uln: 1, relative_baseline: 3.8 },
    rRatio: { relative_uln: 5, relative_baseline: 5 },
    defaults: { relative_uln: 3, relative_baseline: 3.8 }
  },
  visit_window: 30,
  r_ratio_filter: true,
  r_ratio: [0, null],
  filters: [],
  groups: [],
  group_by: GROUP_NONE,
  details: null,
  page_size: 10,
  width: '100%',
  height: 460
};

/**
 * Normalize a single value or nullish to an array.
 * @private
 */
export function arrayify(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalize a column name or spec object to { value_col, label, ...extra },
 * preserving extra keys (e.g. a filter's start value).
 * @private
 */
export function fieldSpec(value, fallbackLabel) {
  if (typeof value === 'string') return { value_col: value, label: fallbackLabel || value };
  return { ...value, value_col: value.value_col, label: value.label || value.value_col };
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become spec arrays, the group list always offers None, group_by falls back
 * when its column is not offered, cuts and measure_values deep-merge onto the
 * defaults (so a partial override still back-fills every measure), and the
 * measure-option lists are coerced to arrays.
 * @param {HepExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {HepExplorerSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.filters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);

  const defaultGroup = { value_col: GROUP_NONE, label: 'None' };
  synced.groups = [
    defaultGroup,
    ...arrayify(synced.groups)
      .map((value) => fieldSpec(value))
      .filter((d) => d.value_col)
  ];
  if (synced.group_by && !synced.groups.some((group) => group.value_col === synced.group_by)) {
    synced.groups.push({ value_col: synced.group_by, label: synced.group_by });
  }
  synced.group_by = synced.groups.some((group) => group.value_col === synced.group_by)
    ? synced.group_by
    : synced.groups[0].value_col;

  synced.details = arrayify(synced.details)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);

  synced.x_options = arrayify(synced.x_options);
  synced.y_options = arrayify(synced.y_options);

  synced.measure_values = {
    ...DEFAULT_SETTINGS.measure_values,
    ...(settings.measure_values || {})
  };

  const cutKeys = new Set([
    ...Object.keys(DEFAULT_SETTINGS.cuts),
    ...Object.keys(settings.cuts || {})
  ]);
  const mergedCuts = {};
  cutKeys.forEach((key) => {
    mergedCuts[key] = {
      ...(DEFAULT_SETTINGS.cuts[key] || {}),
      ...((settings.cuts || {})[key] || {})
    };
  });
  synced.cuts = mergedCuts;

  synced.r_ratio = arrayify(synced.r_ratio);
  if (synced.r_ratio.length < 2) synced.r_ratio = [0, null];

  // Arm designation (HEP-ARM-003): a single active arm may be given as a bare
  // string; an empty list means "not designated" and falls back to null, i.e.
  // every non-placebo arm pools onto the active side, rather than leaving the
  // active side silently empty.
  const activeArms = arrayify(synced.active_arms).map(String);
  synced.active_arms = activeArms.length ? activeArms : null;
  synced.placebo_arm =
    synced.placebo_arm === undefined || synced.placebo_arm === null || synced.placebo_arm === ''
      ? null
      : String(synced.placebo_arm);

  synced.jaundice_uln = Number.isFinite(Number(synced.jaundice_uln))
    ? Number(synced.jaundice_uln)
    : DEFAULT_SETTINGS.jaundice_uln;
  synced.hide_unchanged = Boolean(synced.hide_unchanged);

  return synced;
}

/**
 * Resolve the active Hy's-Law cutpoint for a measure + display mode, falling
 * back to the `defaults` entry for measures without their own cuts (HEP-QUAD-001).
 * @param {Object} cuts The normalized cuts object.
 * @param {string} measureKey The short measure key (ALT/AST/TB/ALP/rRatio).
 * @param {string} display The active display mode ('relative_uln'|'relative_baseline').
 * @returns {number} The cutpoint value.
 */
export function cutFor(cuts, measureKey, display) {
  const entry = (cuts && cuts[measureKey]) || (cuts && cuts.defaults) || {};
  const fallback = (cuts && cuts.defaults) || {};
  const value = entry[display];
  return Number.isFinite(value) ? value : fallback[display];
}
