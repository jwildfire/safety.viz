// Settings defaults + merge for the outlier-explorer module (#24). Mirrors the
// histogram's configure.js shape (DEFAULT_SETTINGS + syncSettings), extended
// for the renderer-specific mappings the original safety-outlier-explorer
// exposes: a time axis, the four normal-range methods, and color-by grouping.
// The time axis is the shared `x_axis` setting (#371, src/x-axis.js); the
// original chart's `time_cols` is read as its options when `x_axis` is absent.
// Kept intentionally close to the histogram so the pattern reads the same
// across renderers.

import { normalizeFilterSpec } from '../filters.js';
import { normalizeXAxis } from '../x-axis.js';

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
 * @property {?Object} [x_axis=null] The main x-axis, the setting every chart that shows change over time takes (#371): `{ options: [{ key, col, label_col, type: 'ordinal'|'linear', title }], default }`, for example `{ options: [{ key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' }, { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }], default: 'visit' }`. Each option is a button of the X-axis control, shown even when only one is available; an option whose column the data lacks is greyed and says why. The chart opens on `default` (Visit when unset), by key. Visit view spaces the visits evenly in `col` order, labelled from `label_col`; Study day view is linear in days. When null, the options are read from `time_cols`, or else built from `visitn_col`, `visit_col` and `studyday_col`. With neither a visit nor a study day in the data the chart shows a message instead of a chart (SOE-XAX-001..007).
 * @property {Array<string|Object>} [time_cols=[]] The original chart's time-axis setting, kept as a synonym of `x_axis` and read only when `x_axis` is not given: { value_col, label, type: 'linear'|'ordinal', order_col } specs. Each becomes an x_axis option: value_col is its column, label its title, type is kept, and an ordinal entry's order_col orders its visits. The ordinal entry is keyed 'visit' and the linear one 'day' (each keyed by its value_col when two share a type), so the chart opens on the visit entry whatever the order (SOE-FUNC-004, SOE-XAX-002).
 * @property {?string} [start_value=null] Measure selected on first render; falls back to the first measure (with a console warning) when absent from the data.
 * @property {?string[]} [measures=null] Ordered whitelist of measures the Measure control offers: only these appear, and in this order. Entries match the label the control shows (the measure name with its unit appended where `unit_col` is mapped), falling back to the bare `measure_col` value, which picks up every unit variant of that measure. null or [] offers every measure in the data, alphabetically — the behaviour before this setting existed. Configured measures absent from the data are dropped with a console warning; when none of them is present the control falls back to every measure in the data rather than going blank (SOE-MEAS-001, SOE-MEAS-002).
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label, start } specs. A filter with a start value is initialized to it, with "All" still on offer (SOE-REG-051..053). Filter specs take `{ value_col, label, start, all, multiple }`: `start` is the opening selection (an array for a `multiple` filter, and a start of `0` or `false` is a real value, not an absent one); `all` controls the "All" option and defaults to true whether or not a start is given — pass `all: false` to remove it, and the filter then always holds one value, the first unless `start` names another; a start value the data lacks is dropped with a console warning; `multiple: true` renders a checkbox multiselect whose state is null (everything) or an array of values (#136).
 * @property {Array<string|Object>} [groups=[]] Color-by options; a "None" option is always offered first (SOE-REG-048).
 * @property {string} [group_by='oe_none'] Column the marks are colored by on first render; 'oe_none' disables grouping.
 * @property {?Array<string|Object>} [details=null] Columns for the linked participant listing; when null, defaults to time, participant ID, result, normal limits, and unit.
 * @property {Array<string|Object>} [tooltip_cols=[]] Extra columns appended to the point tooltip (SOE-CFG-006).
 * @property {Object} [line_attributes] Population line style: { color, width, opacity }.
 * @property {Object} [point_attributes] Population point style: { color, radius, opacity }.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the shell fixes the chart area height.
 * @property {number} [page_size=10] Rows per page in the linked participant listing.
 * @property {?string} [studyday_col='DY'] Numeric study-day column: the side panel's Study day option (#370, PPRF-XAX-011; it defaulted to null before v1.12.0). Set it to null when the data has no study day, and the panel offers Visit only (#99, PPRF-OE-001). With neither `x_axis` nor `time_cols` it is also the main axis's Study day option (#371).
 * @property {?string} [visit_col=null] Visit-name column passed to the docked profile for point tooltips (#99, PPRF-OE-001). With neither `x_axis` nor `time_cols` it labels the main axis's Visit option (#371).
 * @property {?string} [visitn_col=null] Numeric visit column passed to the docked profile for point ordering context (#99, PPRF-OE-001). With neither `x_axis` nor `time_cols` it orders the main axis's Visit option (#371).
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
  x_axis: null,
  time_cols: [],
  start_value: null,
  measures: null,
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
  studyday_col: 'DY',
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
 * Map the original chart's time_cols specs to x_axis options (#371): value_col
 * is the option's column, label its title, type is kept, and an ordinal
 * entry's order_col orders its visits. The ordinal entry is keyed 'visit' and
 * the linear entry 'day'; when two entries share a type, each of them is keyed
 * by its value_col instead.
 * @param {Object[]} timeCols Normalized time_cols specs (see timeSpec).
 * @returns {Object[]} x_axis options.
 */
export function timeColsToXAxisOptions(timeCols) {
  const count = (type) => timeCols.filter((spec) => spec.type === type).length;
  const keyFor = (spec) => {
    const known = spec.type === 'ordinal' ? 'visit' : 'day';
    return count(spec.type) === 1 ? known : spec.value_col;
  };
  return timeCols.map((spec) => ({
    key: keyFor(spec),
    col: spec.value_col,
    type: spec.type,
    title: spec.label,
    ...(spec.type === 'ordinal' ? { order_col: spec.order_col } : {})
  }));
}

/**
 * The main x-axis setting in its full shape (#371): `x_axis` as given, else
 * the options `time_cols` maps to, else the options built from `visitn_col`,
 * `visit_col` and `studyday_col` — normalized with the shared normalizeXAxis,
 * Visit the default when the setting names none. An option's `order_col` (from
 * time_cols) is kept for ordering the visits.
 * @param {OutlierExplorerSettings} settings Settings, as syncSettings returns them.
 * @returns {{options: Object[], default: string}} The normalized setting.
 */
export function xAxisSetting(settings) {
  const given = settings.x_axis;
  const timeCols = arrayify(settings.time_cols)
    .map(timeSpec)
    .filter((d) => d.value_col);
  const source =
    given && Array.isArray(given.options) && given.options.length
      ? settings
      : timeCols.length
        ? { x_axis: { options: timeColsToXAxisOptions(timeCols), default: given?.default } }
        : settings;
  const xAxis = normalizeXAxis(source, { fallback: 'visit' });
  const raw = source.x_axis ? source.x_axis.options : [];
  xAxis.options = xAxis.options.map((option) => {
    const from = (raw || []).find((candidate) => candidate && String(candidate.key) === option.key);
    return from && from.order_col ? { ...option, order_col: from.order_col } : option;
  });
  return xAxis;
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become spec arrays, the group list always offers None, group_by falls back
 * when its column is not offered, and listing details default from the other
 * mappings. The x-axis is read from the merged settings by xAxisSetting.
 * @param {OutlierExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {OutlierExplorerSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.measures = arrayify(synced.measures);

  synced.filters = arrayify(synced.filters)
    .map((value) => normalizeFilterSpec(value))
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
