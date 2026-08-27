// Settings defaults + merge for the time-to-event module (#128): the events +
// population data contract and the display options, per design obot.roadmap
// requirements/design/161_design.html §4 as revised by the sv#131 review —
// endpoint selection is composed with flexible multiselect filters over the
// event dataset, not picked from pre-derived endpoints, because the events that
// matter vary from study to study. Mirrors the nep-explorer configure flow
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
//
// A later release may add configured filter presets — named filter states that
// reproduce study-standard endpoints (serious AEs, a body-system basket) in one
// click. That would be a new `presets` setting layered on the event_filters
// state; nothing here hard-codes any endpoint.

/**
 * Rendering and data-mapping settings for the time-to-event module. Every key has
 * a default in DEFAULT_SETTINGS; callers pass only the overrides they need and
 * syncSettings fills in the rest.
 * @typedef {Object} TimeToEventSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column, in both datasets: one row per participant in the population data, any number of event rows, and the key the participantsSelected event carries (TTE-CFG-001).
 * @property {?string} [group_col='ARM'] Population curve-grouping column (treatment arm). When the population has no such column the module draws one pooled curve (TTE-DATA-004).
 * @property {string} [fu_day_col='EOSDY'] Population follow-up-end study day: the censoring time for participants with no qualifying event (TTE-DERIV-002). Event-free participants without a usable value are excluded with a counted reason.
 * @property {?string} [censor_desc_col='EOSSTT'] Optional population censoring description (e.g. end-of-study status), shown in censor-mark tooltips.
 * @property {string} [event_day_col='ASTDY'] Event onset study day (day 1 = first dose). Event rows with a missing, non-numeric or non-positive day are excluded and counted (TTE-DATA-002).
 * @property {?string} [event_desc_col='AEDECOD'] Optional event description column, shown in event tooltips for the qualifying event.
 * @property {Array<string|Object>} [event_filters=['AEBODSYS','AEDECOD','AESER','AESEV']] Multiselect filter controls over the event dataset — the endpoint composer (TTE-FILT-001): column names or { value_col, label } specs. A filter whose column is absent from the events is dropped with a console warning.
 * @property {string} [endpoint_label='Time to first qualifying event'] Display name for the composed endpoint, used in the notes.
 * @property {Array<string|Object>} [filters=[]] Population filter controls (single-select): column names or { value_col, label } specs. Filter specs take `{ value_col, label, start, all, multiple }`: `start` is the opening selection (an array for a `multiple` filter, and a start of `0` or `false` is a real value, not an absent one); `all` controls the "All" option and defaults to true, or to false when a start is given — pass `all: true` to keep All alongside a start, `all: false` to require a selection; `multiple: true` renders a checkbox multiselect whose state is null (everything) or an array of values (#136).
 * @property {string} [direction='incidence'] `incidence` (1 − KM, rising — the safety default, D2) or `survival` (falling). Anything else falls back to incidence.
 * @property {boolean} [ci=true] Whether to draw the pointwise 95% confidence band (D3).
 * @property {string} [time_unit='day'] Axis label unit; display only, no rescaling.
 * @property {string} [width='100%'] Widget width, carried for the R widget bindings.
 * @property {number} [height=560] Chart-area height in pixels, carried for the R widget bindings; includes the in-canvas risk table.
 */

/**
 * Built-in defaults for every time-to-event setting; syncSettings merges caller
 * overrides onto these. The column defaults are the ADAE / ADSL conventions, so
 * pharmaverse-shaped adverse-event and population extracts map with zero
 * configuration.
 * @type {TimeToEventSettings}
 */
import { normalizeFilterSpec } from '../filters.js';

export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  group_col: 'ARM',
  fu_day_col: 'EOSDY',
  censor_desc_col: 'EOSSTT',
  event_day_col: 'ASTDY',
  event_desc_col: 'AEDECOD',
  event_filters: ['AEBODSYS', 'AEDECOD', 'AESER', 'AESEV'],
  endpoint_label: 'Time to first qualifying event',
  filters: [],
  direction: 'incidence',
  ci: true,
  time_unit: 'day',
  width: '100%',
  height: 560
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
 * and both filter lists become { value_col, label } arrays.
 * @param {TimeToEventSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {TimeToEventSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.direction = synced.direction === 'survival' ? 'survival' : 'incidence';
  synced.ci = synced.ci === undefined ? true : Boolean(synced.ci);
  synced.time_unit =
    typeof synced.time_unit === 'string' && synced.time_unit ? synced.time_unit : 'day';
  synced.endpoint_label =
    typeof synced.endpoint_label === 'string' && synced.endpoint_label
      ? synced.endpoint_label
      : DEFAULT_SETTINGS.endpoint_label;
  synced.event_filters = arrayify(synced.event_filters)
    .map((filter) => fieldSpec(filter))
    .filter((filter) => filter.value_col);
  synced.filters = arrayify(synced.filters)
    .map((filter) => normalizeFilterSpec(filter))
    .filter((filter) => filter.value_col);
  return synced;
}
