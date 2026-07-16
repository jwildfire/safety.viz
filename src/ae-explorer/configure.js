// Settings defaults + merge for the ae-explorer module, matching the
// original renderer's defaultSettings.js/setDefaults.js behavior
// (RhoInc/aeexplorer v3.4.1) under #60, flattened to the safety.viz settings
// idiom. Field-list normalization helpers are shared with the histogram
// module.

import { arrayify, fieldSpec } from '../histogram/configure.js';

/**
 * Rendering and data-mapping settings for the ae-explorer module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest (AE-CFG-001). The nested
 * placeholder_flag and plot_settings objects merge key-by-key onto their
 * defaults, and the filters/details field lists accept column-name strings
 * or spec objects, in a single value or an array.
 * @typedef {Object} AEExplorerSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; required in the data. Distinct participants drive the group denominators and participant-mode numerators.
 * @property {string} [major_col='AEBODSYS'] Major category column — the MedDRA System Organ Class; required in the data. One expandable table section per level, and the default placeholder-flag column (AE-CFG-003).
 * @property {string} [minor_col='AEDECOD'] Minor category column — the MedDRA Preferred Term; required in the data. One nested row per level under its System Organ Class.
 * @property {string} [group_col='ARM'] Treatment group column; required in the data. One rate column per level, up to max_groups.
 * @property {?Array<string>} [groups=null] Group levels to show as columns (AE-CFG-005). Null derives every level found in group_col, sorted; configured levels missing from the data are dropped with a console warning. A single group hides the Total and Difference columns (AE-USER-019).
 * @property {Array<string>} [colors] Group colors assigned by column order (AE-CFG-006); the Total column always renders gray, and the default palette carries no yellow (AE-REG-040).
 * @property {?Array<string|Object>} [filters=null] Filter controls (AE-USER-018): column names or { value_col, label, type, start } specs. Type 'event' narrows the events counted; type 'participant' narrows the analysis population and its denominators (AE-REG-006). Defaults to the four ADAE event filters — seriousness, severity, relationship, outcome; filters whose column is absent or single-valued are dropped with a console warning.
 * @property {?Array<string|Object>} [details=null] Columns for the details drill-down listing (AE-REG-024); null shows every input column.
 * @property {?Object} [variable_options=null] Valid alternative columns for the primary mappings (AE-CFG-004): keys id, major, minor, group, each an array of column names. Two or more options for a mapping draw a re-mapping control; the current mapping is always offered even when not listed (AE-REG-044).
 * @property {Object} [placeholder_flag] How placeholder rows for AE-free participants are identified (AE-DATA-001): value_col (null follows major_col) and the values marking a placeholder (blank and 'NA' by default).
 * @property {number} [max_prevalence=0] Initial minimum-prevalence filter value in percent (AE-USER-001).
 * @property {number} [max_groups=6] Most group columns the table will draw; more levels than this throws.
 * @property {boolean} [total_col=true] Draw the all-groups Total column; suppressed automatically when only one group shows (AE-REG-037).
 * @property {boolean} [group_cols=true] Draw the per-group rate columns; disabling leaves a Total-only table and suppresses the Difference column (AE-REG-037).
 * @property {boolean} [diff_col=true] Draw the Difference Between Groups column (AE-USER-013); needs two or more shown groups.
 * @property {boolean} [pref_terms=false] Start with every Preferred Term row expanded instead of collapsed.
 * @property {string} [summarize_by='participant'] Summary basis (AE-USER-006): 'participant' or 'event' (AE-REG-033, AE-REG-035); unknown values fall back to the default.
 * @property {boolean} [validation=false] Adds a summarized-data CSV download named major-minor-summarize_by (AE-CFG-009, AE-USER-020).
 * @property {Object} [plot_settings] Inline row-plot geometry (AE-CFG-008): height, width, and point radius in pixels, with margin / diff_margin {left, right} insets for the rate and difference axes (AE-REG-046).
 * @property {number} [page_size=10] Rows per page in the details drill-down listing.
 */

/**
 * Built-in defaults for every ae-explorer setting; syncSettings merges
 * caller overrides onto these.
 * @type {AEExplorerSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  major_col: 'AEBODSYS',
  minor_col: 'AEDECOD',
  group_col: 'ARM',
  groups: null,
  // ColorBrewer Set1 re-ordered like the original — and with no yellow, the
  // fix behind AE-REG-040.
  colors: ['#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#e41a1c'],
  filters: null,
  details: null,
  variable_options: null,
  placeholder_flag: { value_col: null, values: ['', 'NA'] },
  max_prevalence: 0,
  max_groups: 6,
  total_col: true,
  group_cols: true,
  diff_col: true,
  pref_terms: false,
  summarize_by: 'participant',
  validation: false,
  plot_settings: {
    height: 15,
    width: 200,
    radius: 7,
    margin: { left: 40, right: 40 },
    diff_margin: { left: 5, right: 5 }
  },
  page_size: 10
};

/**
 * Summary bases offered by the Summarize by control; valid values for the
 * summarize_by setting.
 */
export const SUMMARIZE_OPTIONS = ['participant', 'event'];

/**
 * The original renderer's default event filters — the four ADAE
 * characteristics (AE-USER-002..005).
 * @private
 */
const DEFAULT_FILTERS = [
  { value_col: 'AESER', label: 'Serious?' },
  { value_col: 'AESEV', label: 'Severity' },
  { value_col: 'AEREL', label: 'Relationship' },
  { value_col: 'AEOUT', label: 'Outcome' }
];

/**
 * Normalize one filter entry to { value_col, label, type, start }: strings
 * become event filters, and spec objects keep their participant/event type
 * and initial value (AE-REG-031).
 * @private
 */
function filterSpec(value) {
  const spec = fieldSpec(value);
  const type = value && value.type === 'participant' ? 'participant' : 'event';
  const start = (value && value.start) || null;
  return { ...spec, type, start };
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: the
 * nested placeholder_flag and plot_settings merge key-by-key (the
 * placeholder column follows a remapped major_col unless set explicitly),
 * filters normalize to { value_col, label, type, start } specs and default
 * to the four ADAE event filters, details normalize to { value_col, label }
 * specs, and unknown summary bases fall back to the default.
 * @param {AEExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {AEExplorerSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.placeholder_flag = {
    ...DEFAULT_SETTINGS.placeholder_flag,
    ...(settings.placeholder_flag || {})
  };
  if (!synced.placeholder_flag.value_col) synced.placeholder_flag.value_col = synced.major_col;

  synced.plot_settings = {
    ...DEFAULT_SETTINGS.plot_settings,
    ...(settings.plot_settings || {})
  };
  synced.plot_settings.margin = {
    ...DEFAULT_SETTINGS.plot_settings.margin,
    ...((settings.plot_settings || {}).margin || {})
  };
  synced.plot_settings.diff_margin = {
    ...DEFAULT_SETTINGS.plot_settings.diff_margin,
    ...((settings.plot_settings || {}).diff_margin || {})
  };

  const customFilters = arrayify(synced.filters)
    .map((value) => filterSpec(value))
    .filter((filter) => filter.value_col);
  synced.filters = customFilters.length
    ? customFilters
    : DEFAULT_FILTERS.map((filter) => filterSpec(filter));

  synced.details = synced.details
    ? arrayify(synced.details)
        .map((value) => fieldSpec(value))
        .filter((column) => column.value_col)
    : null;

  if (!SUMMARIZE_OPTIONS.includes(synced.summarize_by)) {
    synced.summarize_by = DEFAULT_SETTINGS.summarize_by;
  }
  return synced;
}

/**
 * Which of the group, Total, and Difference columns the table draws, from
 * the shown group count and the column settings — the original's
 * setDefaults auto-adjustments: a single group suppresses Total and
 * Difference (AE-USER-019), group_cols false suppresses Difference
 * (AE-REG-037), and hiding both the group and Total columns is a
 * configuration error.
 * @param {number} groupCount Number of groups the table will show.
 * @param {AEExplorerSettings} settings The synced settings.
 * @returns {{groupCols: boolean, totalCol: boolean, diffCol: boolean}} The column plan.
 * @throws {Error} When both group_cols and total_col are disabled.
 */
export function columnPlan(groupCount, settings) {
  if (!settings.group_cols && !settings.total_col) {
    throw new Error(
      'ae-explorer: group_cols and total_col cannot both be false — nothing to draw.'
    );
  }
  const groupCols = settings.group_cols;
  const totalCol = settings.total_col && groupCount > 1;
  const diffCol = settings.diff_col && groupCols && groupCount > 1;
  return { groupCols, totalCol, diffCol };
}
