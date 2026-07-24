// Settings defaults + merge for the outlier-explorer module (#24). Mirrors the
// histogram's configure.js shape (DEFAULT_SETTINGS + syncSettings), extended
// for the renderer-specific mappings the original safety-outlier-explorer
// exposes: a time axis (time_cols), the four normal-range methods, and
// color-by grouping. Kept intentionally close to the histogram so the pattern
// reads the same across renderers.

/**
 * Synthetic time column used when the data carries no visit/study-day column:
 * a 1-based measurement sequence derived per participant per measure from
 * input order (the shared demo data is a distribution set with no time axis).
 */
export const OE_SEQ = '__oe_seq';

/** The "no grouping" sentinel value for the color-by control. */
export const GROUP_NONE = 'oe_none';

/**
 * Normal-range method options offered by the Method control; valid values for
 * the normal_range_method setting (SOE-FUNC-007, SOE-REG-025).
 */
export const NORMAL_RANGE_METHODS = ['None', 'LLN-ULN', 'Standard Deviation', 'Quantiles'];

/**
 * Rendering and data-mapping settings for the outlier-explorer module. Every
 * key has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest. Field-list settings (filters,
 * groups, details, time_cols, tooltip_cols) accept column-name strings or
 * spec objects, singly or as an array.
 * @typedef {Object} OutlierExplorerSettings
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Each distinct measure (with its unit) becomes an option in the Measure control.
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning.
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the participant counts, the one-line-per-participant series, and the linked listing.
 * @property {string} [unit_col='STRESU'] Unit column, appended to the measure name in labels when present.
 * @property {string} [normal_col_low='STNRLO'] Lower-limit-of-normal column; feeds the LLN-ULN normal-range band.
 * @property {string} [normal_col_high='STNRHI'] Upper-limit-of-normal column; feeds the LLN-ULN normal-range band.
 * @property {string} [normal_range_method='LLN-ULN'] Normal-range method: one of None, LLN-ULN, Standard Deviation, Quantiles (SOE-FUNC-007).
 * @property {number} [normal_range_sd=1.96] Standard-deviation multiplier for the Standard Deviation method (SOE-CFG-007).
 * @property {number} [normal_range_quantile_low=0.05] Lower quantile for the Quantiles method (SOE-CFG-008).
 * @property {number} [normal_range_quantile_high=0.95] Upper quantile for the Quantiles method (SOE-CFG-009).
 * @property {Array<string|Object>} [time_cols=[]] Time-axis options: { value_col, label, type: 'linear'|'ordinal', order_col } specs. When empty, a derived "Measurement" sequence axis is used. More than one option renders the X-axis toggle (SOE-FUNC-004).
 * @property {?string} [start_value=null] Measure selected on first render; falls back to the first measure (with a console warning) when absent from the data.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label, start } specs. A filter with a start value is initialized to it and offers no "All" option (SOE-REG-051..053).
 * @property {Array<string|Object>} [groups=[]] Color-by options; a "None" option is always offered first (SOE-REG-048).
 * @property {string} [group_by='oe_none'] Column the marks are colored by on first render; 'oe_none' disables grouping.
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults to time, participant ID, result, normal limits, and unit.
 * @property {Array<string|Object>} [tooltip_cols=[]] Extra columns appended to the point tooltip (SOE-CFG-006).
 * @property {Object} [line_attributes] Population line style: { color, width, opacity }.
 * @property {Object} [point_attributes] Population point style: { color, radius, opacity }.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the shell fixes the chart area height.
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 * @property {?string} [studyday_col=null] Numeric study-day column for the docked profile's labs-over-time x-axis; when null the profile falls back to input order (#99, PPRF-OE-001).
 * @property {?string} [visit_col=null] Visit-name column passed to the docked profile for point tooltips (#99, PPRF-OE-001).
 * @property {?string} [visitn_col=null] Numeric visit column passed to the docked profile for point ordering context (#99, PPRF-OE-001).
 * @property {?Object} [measure_values=null] Optional map of short profile keys (ALT/AST/TB/ALP) to this data's full measure names, passed to the docked profile so the key liver measures resolve; null keeps the profile module's defaults (#99, PPRF-OE-001).
 * @property {boolean} [profile=true] Dock the shared participant-profile module in the shell's profile slot, fed by the point-click selection via the participantsSelected event; false restores the pre-#99 behaviour of listing-only detail (#99, PPRF-OE-001).
 * @property {?Array<string|Object>} [profile_details=null] Demographic columns for the docked profile's header, as names or { value_col, label } specs; null shows none (the host `details` are listing columns, not demographics) (#99, PPRF-OE-001).
 * @property {?string} [participantProfileURL=null] Optional link-out URL for the docked profile's header, templated by every literal `{id}` token (#99, PPRF-OE-001).
 */

/**
 * Built-in defaults for every outlier-explorer setting; syncSettings merges
 * caller overrides onto these.
 * @type {OutlierExplorerSettings}
 */
export const DEFAULT_SETTINGS = {
  measure_col: 'TEST',
  value_col: 'STRESN',
  id_col: 'USUBJID',
  unit_col: 'STRESU',
  normal_col_low: 'STNRLO',
  normal_col_high: 'STNRHI',
  normal_range_method: 'LLN-ULN',
  normal_range_sd: 1.96,
  normal_range_quantile_low: 0.05,
  normal_range_quantile_high: 0.95,
  time_cols: [],
  start_value: null,
  filters: [],
  groups: [],
  group_by: GROUP_NONE,
  details: null,
  tooltip_cols: [],
  line_attributes: { color: '#5b6b7b', width: 1, opacity: 0.28 },
  point_attributes: { color: '#1f78b4', radius: 3, opacity: 0.5 },
  width: '100%',
  height: 460,
  page_size: 10,
  studyday_col: null,
  visit_col: null,
  visitn_col: null,
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
 * Normalize a time-axis spec to { value_col, label, type, order_col }. Numeric
 * axes default to type 'linear'; pass type 'ordinal' with an order_col for
 * visit-style categorical axes.
 * @private
 */
export function timeSpec(value) {
  const base = typeof value === 'string' ? { value_col: value } : { ...value };
  const type = base.type === 'ordinal' ? 'ordinal' : 'linear';
  return {
    value_col: base.value_col,
    label: base.label || base.value_col,
    type,
    order_col: base.order_col || base.value_col
  };
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become spec arrays, the group list always offers None, group_by falls back
 * when its column is not offered, time_cols default to a derived Measurement
 * axis, and listing details default from the other mappings.
 * @param {OutlierExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {OutlierExplorerSettings} The merged, normalized settings.
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

  synced.time_cols = arrayify(synced.time_cols)
    .map(timeSpec)
    .filter((d) => d.value_col);
  if (!synced.time_cols.length) {
    synced.time_cols = [
      { value_col: OE_SEQ, label: 'Measurement', type: 'linear', order_col: OE_SEQ }
    ];
  }

  synced.tooltip_cols = arrayify(synced.tooltip_cols)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);

  synced.details = arrayify(synced.details)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);
  if (!synced.details.length) {
    synced.details = [
      { value_col: '__oe_timeLabel', label: 'Time' },
      { value_col: synced.id_col, label: 'Participant ID' },
      { value_col: synced.value_col, label: 'Result' },
      { value_col: synced.normal_col_low, label: 'Lower Limit of Normal' },
      { value_col: synced.normal_col_high, label: 'Upper Limit of Normal' },
      { value_col: synced.unit_col, label: 'Unit' }
    ].filter((d) => d.value_col);
  }

  // Docked-profile pass-throughs (#99): profile is a plain boolean and
  // profile_details normalizes to a spec array only when provided (null keeps
  // the "no header demographics" default — the host `details` are listing
  // columns, not demographics).
  synced.profile = Boolean(synced.profile);
  synced.profile_details =
    synced.profile_details === undefined || synced.profile_details === null
      ? null
      : arrayify(synced.profile_details)
          .map((value) => fieldSpec(value))
          .filter((d) => d.value_col);

  synced.line_attributes = {
    ...DEFAULT_SETTINGS.line_attributes,
    ...(settings.line_attributes || {})
  };
  synced.point_attributes = {
    ...DEFAULT_SETTINGS.point_attributes,
    ...(settings.point_attributes || {})
  };

  return synced;
}
