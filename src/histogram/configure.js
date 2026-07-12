// Settings defaults + merge, extracted verbatim from the safety-histogram pilot
// (dev @ a3ff9f7) under #2.

/**
 * Rendering and data-mapping settings for the histogram module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest. Field-list settings (filters,
 * groups, details) accept column-name strings or { value_col, label }
 * objects, in a single value or an array.
 * @typedef {Object} HistogramSettings
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Each distinct measure (with its unit) becomes an option in the Measure control.
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning.
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the participant counts shown above the chart and the default listing columns.
 * @property {string} [unit_col='STRESU'] Unit column, appended to the measure name in labels when present.
 * @property {string} [normal_col_low='STNRLO'] Lower-limit-of-normal column; with normal_col_high, feeds the normal-range overlay. The control hides for measures without normal-range data (SH-FUNC-004C).
 * @property {string} [normal_col_high='STNRHI'] Upper-limit-of-normal column; see normal_col_low.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs. Filters whose column is absent from the data are dropped with a console warning.
 * @property {Array<string|Object>} [groups=[]] Group-by options for the small-multiple charts; a "None" option is always offered first.
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults to participant ID, the filter columns, result, normal limits, and unit.
 * @property {?string} [start_value=null] Measure selected on first render. When null (the default) the histogram opens on the all-measures overview — one small-multiple histogram per measure, click one to drill in. A measure absent from the data falls back to the overview with a console warning.
 * @property {string} [bin_algorithm="Scott's normal reference rule"] Binning algorithm applied on first render; one of the ALGORITHMS options. Setting an explicit bin quantity or width in the UI switches it to "Custom".
 * @property {boolean} [normal_range=true] Offer the Show Normal Range control (visible only for measures with normal-range data).
 * @property {boolean} [display_normal_range=false] Draw the normal-range overlay on first render. The pilot's camelCase alias displayNormalRange is still honored.
 * @property {boolean} [annotate_bin_boundaries=false] Label the x-axis with bin boundaries instead of linear ticks on first render.
 * @property {boolean} [test_normality=false] Annotate the main chart with an approximate Jarque-Bera normality screen.
 * @property {string} [group_by='sh_none'] Column the small multiples are grouped by on first render; 'sh_none' disables grouping. Unknown columns are added to the group options as-is.
 * @property {boolean} [compare_distributions=false] When grouped, annotate each panel with an approximate one-way ANOVA screen comparing the groups.
 * @property {string} [width='100%'] Widget width, carried over from the pilot API for the R widget bindings; the current shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over from the pilot API for the R widget bindings; the current shell fixes the chart area at 460px.
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 */

/**
 * Built-in defaults for every histogram setting; syncSettings merges caller
 * overrides onto these.
 * @type {HistogramSettings}
 */
export const DEFAULT_SETTINGS = {
  measure_col: 'TEST',
  value_col: 'STRESN',
  id_col: 'USUBJID',
  unit_col: 'STRESU',
  normal_col_low: 'STNRLO',
  normal_col_high: 'STNRHI',
  filters: [],
  groups: [],
  details: null,
  start_value: null,
  bin_algorithm: "Scott's normal reference rule",
  normal_range: true,
  display_normal_range: false,
  annotate_bin_boundaries: false,
  test_normality: false,
  group_by: 'sh_none',
  compare_distributions: false,
  width: '100%',
  height: 460,
  page_size: 10
};

/**
 * Binning algorithms offered by the Bins control; valid values for the
 * bin_algorithm setting.
 */
export const ALGORITHMS = [
  'Square-root choice',
  "Sturges' formula",
  'Rice Rule',
  "Scott's normal reference rule",
  "Freedman-Diaconis' choice",
  "Shimazaki and Shinomoto's choice",
  'Custom'
];

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
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field
 * lists become { value_col, label } arrays, the group list always offers
 * None, group_by falls back when its column is not offered, listing details
 * default from the other mappings, and the pilot's displayNormalRange alias
 * is honored.
 * @param {HistogramSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {HistogramSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.filters = arrayify(synced.filters)
    .map(fieldSpec)
    .filter((d) => d.value_col);
  const defaultGroup = { value_col: 'sh_none', label: 'None' };
  synced.groups = [
    defaultGroup,
    ...arrayify(synced.groups)
      .map(fieldSpec)
      .filter((d) => d.value_col)
  ];
  if (synced.group_by && !synced.groups.some((group) => group.value_col === synced.group_by)) {
    synced.groups.push({ value_col: synced.group_by, label: synced.group_by });
  }
  synced.group_by = synced.groups.some((group) => group.value_col === synced.group_by)
    ? synced.group_by
    : synced.groups[0].value_col;
  synced.details = arrayify(synced.details)
    .map(fieldSpec)
    .filter((d) => d.value_col);
  if (!synced.details.length) {
    synced.details = [
      { value_col: synced.id_col, label: 'Participant ID' },
      ...synced.filters,
      { value_col: synced.value_col, label: 'Result' },
      { value_col: synced.normal_col_low, label: 'Lower Limit of Normal' },
      { value_col: synced.normal_col_high, label: 'Upper Limit of Normal' },
      { value_col: synced.unit_col, label: 'Unit' }
    ].filter((d) => d.value_col);
  }
  if (settings.displayNormalRange !== undefined)
    synced.display_normal_range = settings.displayNormalRange;
  return synced;
}
