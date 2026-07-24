// Settings defaults + merge for the shift-plot module (#14), mirroring the
// histogram's configure.js. Defaults trace to the original renderer's
// defaultSettings.js (id_col/measure_col/value_col/visit_col/visit_order_col,
// x_params/y_params baseline/comparison visit + stat, filters). Field-list
// settings (filters, details) accept column-name strings or
// { value_col, label } objects, singly or as an array; visit-list settings
// accept a visit-label string or an array of them.

/**
 * Summary statistics offered for collapsing several results within a visit
 * set to one value per participant; valid values for baseline_stat /
 * comparison_stat.
 */
export const STATS = ['mean', 'min', 'max', 'first'];

/**
 * Rendering and data-mapping settings for the shift-plot module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they need
 * and syncSettings fills in the rest.
 * @typedef {Object} ShiftPlotSettings
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Each distinct measure (with its unit) becomes an option in the Measure control.
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning.
 * @property {string} [visit_col='VISIT'] Column holding the visit label; required in the data. Its distinct values populate the baseline and comparison visit controls.
 * @property {?string} [visit_order_col='VISITNUM'] Numeric column that orders the visits; when its column is absent from the data the visits sort alphanumerically (SSP-REG-013/014).
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the participant counts shown above the chart and the default listing's first column.
 * @property {string} [unit_col='STRESU'] Unit column, appended to the measure name in labels when present.
 * @property {?Array<string>} [baseline_visits=null] Visit label(s) plotted on the x-axis; when null the first visit is selected on first render (SSP-CFG-004).
 * @property {?Array<string>} [comparison_visits=null] Visit label(s) plotted on the y-axis; when null every visit after the baseline is selected on first render (SSP-CFG-005).
 * @property {string} [baseline_stat='mean'] Statistic collapsing a participant's several baseline-visit results to one value; one of STATS.
 * @property {string} [comparison_stat='mean'] Statistic collapsing a participant's several comparison-visit results to one value; one of STATS.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs. Filters whose column is absent from the data are dropped with a console warning.
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults to participant ID, baseline, comparison, change, and percent change (SSP-REQ-005).
 * @property {?string} [start_value=null] Measure selected on first render; falls back to the first measure (with a console warning) when absent from the data.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the current shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the current shell fixes the chart area at 460px.
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 * @property {?string} [normal_col_low='STNRLO'] Lower-limit-of-normal column passed to the docked profile's lab mappings (#99, PPRF-SSP-002).
 * @property {?string} [normal_col_high='STNRHI'] Upper-limit-of-normal column passed to the docked profile; profile feed rows without a finite positive value here are dropped (the ×ULN denominator) (#99, PPRF-SSP-002).
 * @property {?string} [studyday_col=null] Numeric study-day column for the docked profile's labs-over-time x-axis; when null the profile falls back to input order (#99, PPRF-SSP-002).
 * @property {?Object} [measure_values=null] Optional map of short profile keys (ALT/AST/TB/ALP) to this data's full measure names, passed to the docked profile so the key liver measures resolve; null keeps the profile module's defaults (#99, PPRF-SSP-002).
 * @property {boolean} [profile=true] Dock the shared participant-profile module in the shell's profile slot, fed by the brush selection via the participantsSelected event; false restores the pre-#99 behaviour of listing-only detail (#99, PPRF-SSP-002).
 * @property {?Array<string|Object>} [profile_details=null] Demographic columns for the docked profile's header, as names or { value_col, label } specs; null shows none (the host `details` are pair columns, not demographics) (#99, PPRF-SSP-002).
 * @property {?string} [participantProfileURL=null] Optional link-out URL for the docked profile's header, templated by every literal `{id}` token (#99, PPRF-SSP-002).
 */

/**
 * Built-in defaults for every shift-plot setting; syncSettings merges caller
 * overrides onto these.
 * @type {ShiftPlotSettings}
 */
export const DEFAULT_SETTINGS = {
  measure_col: 'TEST',
  value_col: 'STRESN',
  visit_col: 'VISIT',
  visit_order_col: 'VISITNUM',
  id_col: 'USUBJID',
  unit_col: 'STRESU',
  baseline_visits: null,
  comparison_visits: null,
  baseline_stat: 'mean',
  comparison_stat: 'mean',
  filters: [],
  details: null,
  start_value: null,
  width: '100%',
  height: 460,
  page_size: 10,
  normal_col_low: 'STNRLO',
  normal_col_high: 'STNRHI',
  studyday_col: null,
  measure_values: null,
  profile: true,
  profile_details: null,
  participantProfileURL: null
};

/**
 * Normalize a single value or nullish to an array.
 * @private
 */
export function arrayify(value) {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalize a column name or spec object to { value_col, label }.
 * @private
 */
export function fieldSpec(value, fallbackLabel) {
  if (typeof value === 'string') return { value_col: value, label: fallbackLabel || value };
  return { value_col: value.value_col, label: value.label || value.value_col };
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: filter and
 * detail field lists become { value_col, label } arrays, baseline/comparison
 * visits become string arrays (or null when unset), the stats fall back to
 * 'mean' when not one of STATS, and the listing details default from the
 * baseline/comparison mapping when none are supplied.
 * @param {ShiftPlotSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {ShiftPlotSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.filters = arrayify(synced.filters)
    .map((filter) => fieldSpec(filter))
    .filter((filter) => filter.value_col);
  synced.baseline_visits = synced.baseline_visits == null ? null : arrayify(synced.baseline_visits);
  synced.comparison_visits =
    synced.comparison_visits == null ? null : arrayify(synced.comparison_visits);
  synced.baseline_stat = STATS.includes(synced.baseline_stat) ? synced.baseline_stat : 'mean';
  synced.comparison_stat = STATS.includes(synced.comparison_stat) ? synced.comparison_stat : 'mean';
  synced.details = arrayify(synced.details)
    .map((detail) => fieldSpec(detail))
    .filter((detail) => detail.value_col);
  if (!synced.details.length) {
    synced.details = [
      { value_col: synced.id_col, label: 'Participant ID' },
      { value_col: '__ssp_baseline', label: 'Baseline' },
      { value_col: '__ssp_comparison', label: 'Comparison' },
      { value_col: '__ssp_chg', label: 'Change' },
      { value_col: '__ssp_pchg', label: 'Percent Change' }
    ];
  }
  // Docked-profile pass-throughs (#99): profile is a plain boolean and
  // profile_details normalizes to a spec array only when provided (null keeps
  // the "no header demographics" default — the host `details` are pair
  // columns, not demographics).
  synced.profile = Boolean(synced.profile);
  synced.profile_details =
    synced.profile_details === undefined || synced.profile_details === null
      ? null
      : arrayify(synced.profile_details)
          .map((value) => fieldSpec(value))
          .filter((detail) => detail.value_col);
  return synced;
}
