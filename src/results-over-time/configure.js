// Settings defaults + merge for the results-over-time module (#27). Modeled on
// the histogram module's configure.js and the original renderer's
// rendererSettings.js (RhoInc/safety-results-over-time), condensed to the
// nextgen settings the Chart.js reimplementation honors.

/**
 * Rendering and data-mapping settings for the results-over-time module. Every
 * key has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest. Field-list settings (filters,
 * groups) accept column-name strings or { value_col, label } objects, as a
 * single value or an array.
 * @typedef {Object} ResultsOverTimeSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the participant counts shown above the chart.
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Each distinct measure (with its unit) becomes an option in the Measure control.
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning.
 * @property {string} [unit_col='STRESU'] Unit column, appended to the measure name in labels and the y-axis title when present.
 * @property {string} [time_col='VISIT'] Column holding the visit name; required in the data. Distinct visits become the x-axis categories.
 * @property {string} [time_order_col='VISITNUM'] Optional numeric column ordering the visits along the x-axis; falls back to alphanumeric visit order when absent.
 * @property {string} [time_label='Visit'] Axis label for the time (visit) dimension.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs. Filters whose column is absent from the data are dropped with a console warning.
 * @property {Array<string|Object>} [groups=[]] Group-by options; a "None" option is always offered first. The selected group splits each visit into side-by-side box plots.
 * @property {?string} [start_value=null] Measure selected on first render; falls back to the first measure (with a console warning) when absent from the data.
 * @property {string} [group_by='srot_none'] Column the box plots are grouped by on first render; 'srot_none' disables grouping. Unknown columns are added to the group options as-is.
 * @property {boolean} [boxplots=true] Draw the box-and-whisker marks on first render.
 * @property {boolean} [outliers=true] Overlay the results outside the 5th/95th percentiles as outlier points on first render.
 * @property {boolean} [visits_without_data=false] Show x-axis timepoints for visits with no data for the current measure/filters.
 * @property {boolean} [unscheduled_visits=false] Show unscheduled visits (matched by unscheduled_visit_values or unscheduled_visit_pattern).
 * @property {string} [unscheduled_visit_pattern='/unscheduled|early termination/i'] Regular expression (in /source/flags string form) identifying unscheduled visits.
 * @property {?Array<string>} [unscheduled_visit_values=null] Explicit list of unscheduled visit names; takes precedence over unscheduled_visit_pattern when set.
 * @property {string} [y_scale='linear'] Initial y-axis scale, one of the Y_SCALES options ('linear' or 'log').
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the current shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the current shell fixes the chart area at 460px.
 */

/**
 * Built-in defaults for every results-over-time setting; syncSettings merges
 * caller overrides onto these.
 * @type {ResultsOverTimeSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  unit_col: 'STRESU',
  time_col: 'VISIT',
  time_order_col: 'VISITNUM',
  time_label: 'Visit',
  filters: [],
  groups: [],
  start_value: null,
  group_by: 'srot_none',
  boxplots: true,
  outliers: true,
  visits_without_data: false,
  unscheduled_visits: false,
  unscheduled_visit_pattern: '/unscheduled|early termination/i',
  unscheduled_visit_values: null,
  y_scale: 'linear',
  width: '100%',
  height: 460
};

/**
 * Y-axis scale options offered by the Scale control; valid values for the
 * y_scale setting.
 * @type {string[]}
 */
export const Y_SCALES = ['linear', 'log'];

/**
 * Normalize a single value or nullish to an array.
 * @private
 */
export function arrayify(value) {
  if (!value) return [];
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
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become { value_col, label } arrays, the group list always offers None, and
 * group_by falls back to None when its column is not offered.
 * @param {ResultsOverTimeSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {ResultsOverTimeSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.filters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((spec) => spec.value_col);
  const defaultGroup = { value_col: 'srot_none', label: 'None' };
  synced.groups = [
    defaultGroup,
    ...arrayify(synced.groups)
      .map((value) => fieldSpec(value))
      .filter((spec) => spec.value_col)
  ];
  if (synced.group_by && !synced.groups.some((group) => group.value_col === synced.group_by)) {
    synced.groups.push({ value_col: synced.group_by, label: synced.group_by });
  }
  synced.group_by = synced.groups.some((group) => group.value_col === synced.group_by)
    ? synced.group_by
    : synced.groups[0].value_col;
  synced.y_scale = Y_SCALES.includes(synced.y_scale) ? synced.y_scale : 'linear';
  return synced;
}
