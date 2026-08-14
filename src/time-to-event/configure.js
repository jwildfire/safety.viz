// Settings defaults + merge for the time-to-event module (#128): the ADTTE-shaped
// data contract and the display options, per design obot.roadmap
// requirements/design/161_design.html §4. Mirrors the nep-explorer configure flow
// (DEFAULT_SETTINGS + syncSettings).
//
// Two settings carry design decisions:
//
//   `direction` (D2) — the default display is cumulative incidence, 1 − KM: the
//   safety convention (curves rise; the arm with more events sits higher) and the
//   orientation of the FDA ST&F figures this module serves. Survival orientation
//   is one setting away, and the axis always names the estimator either way.
//
//   `ci` (D3) — the pointwise 95% band (Greenwood variance, log-log transform) is
//   on by default: the ST&F guide mandates interval furniture, so switching it
//   off is the deliberate act, not switching it on.

/**
 * Rendering and data-mapping settings for the time-to-event module. Every key has
 * a default in DEFAULT_SETTINGS; callers pass only the overrides they need and
 * syncSettings fills in the rest.
 * @typedef {Object} TimeToEventSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column: one row per participant per endpoint, and the key the participantsSelected event carries (TTE-CFG-001).
 * @property {?string} [group_col='ARM'] Curve grouping column (treatment arm). When the data has no such column the module draws one pooled curve (TTE-DATA-004).
 * @property {?string} [param_col='PARAM'] Endpoint label column, feeding the endpoint picker.
 * @property {?string} [paramcd_col='PARAMCD'] Endpoint short-code column; `param_value` selects against it.
 * @property {?string} [param_value=null] The endpoint (paramcd) shown initially; null = the first endpoint in data order.
 * @property {string} [time_col='AVAL'] Time in days since the analysis time origin. Rows with a missing, non-numeric or non-positive time are excluded and counted (TTE-DATA-002).
 * @property {string} [censor_col='CNSR'] ADaM censor flag: 0 = event, ≥ 1 = censored. Anything else excludes the row with a counted reason (TTE-DATA-002).
 * @property {?string} [event_desc_col='EVNTDESC'] Optional event description column, shown in event tooltips.
 * @property {?string} [censor_desc_col='CNSDTDSC'] Optional censoring description column, shown in censor-mark tooltips.
 * @property {string} [direction='incidence'] `incidence` (1 − KM, rising — the safety default, D2) or `survival` (falling). Anything else falls back to incidence.
 * @property {boolean} [ci=true] Whether to draw the pointwise 95% confidence band (D3).
 * @property {string} [time_unit='day'] Axis label unit; display only, no rescaling.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs.
 * @property {string} [width='100%'] Widget width, carried for the R widget bindings.
 * @property {number} [height=520] Chart-area height in pixels, carried for the R widget bindings; includes the in-canvas risk table.
 */

/**
 * Built-in defaults for every time-to-event setting; syncSettings merges caller
 * overrides onto these.
 * @type {TimeToEventSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  group_col: 'ARM',
  param_col: 'PARAM',
  paramcd_col: 'PARAMCD',
  param_value: null,
  time_col: 'AVAL',
  censor_col: 'CNSR',
  event_desc_col: 'EVNTDESC',
  censor_desc_col: 'CNSDTDSC',
  direction: 'incidence',
  ci: true,
  time_unit: 'day',
  filters: [],
  width: '100%',
  height: 520
};

/**
 * Normalize a single value or nullish to an array.
 * @private
 */
export function arrayify(value) {
  if (value === undefined || value === null) return [];
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
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: the direction
 * is validated (TTE-CFG-002), the ci flag coerced to a boolean (TTE-CFG-003),
 * and field lists become { value_col, label } arrays.
 * @param {TimeToEventSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {TimeToEventSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.direction = synced.direction === 'survival' ? 'survival' : 'incidence';
  synced.ci = synced.ci === undefined ? true : Boolean(synced.ci);
  synced.param_value = synced.param_value == null ? null : String(synced.param_value);
  synced.time_unit =
    typeof synced.time_unit === 'string' && synced.time_unit ? synced.time_unit : 'day';
  synced.filters = arrayify(synced.filters)
    .map((filter) => fieldSpec(filter))
    .filter((filter) => filter.value_col);
  return synced;
}
