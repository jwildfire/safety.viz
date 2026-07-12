// Settings defaults + merge for the delta-delta module (#25). Mirrors the
// histogram's configure flow (DEFAULT_SETTINGS + syncSettings) but for the
// paired change-from-baseline scatter: two measures, baseline/comparison
// visit sets, and an optional regression line. Field-list settings (filters,
// details) accept column-name strings or { value_col, label } objects.

/**
 * Rendering and data-mapping settings for the delta-delta module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they need
 * and syncSettings fills in the rest. Flat snake_case keys replace the
 * original renderer's nested `settings.measure.{x,y}` / `settings.visits`
 * (SDD-CFG-009..015); the mapping is documented in
 * docs/delta-delta-coverage.md.
 * @typedef {Object} DeltaDeltaSettings
 * @property {string} [measure_col='TEST'] Column holding the measure name; required in the data. Each distinct measure becomes an option in the X and Y Measure controls (SDD-CFG-004).
 * @property {string} [value_col='STRESN'] Column holding the numeric result; required in the data. Rows with missing or non-numeric values are removed with a console warning (SDD-CFG-005, SDD-REG-008).
 * @property {string} [id_col='USUBJID'] Participant identifier column; drives the participant counts and the one-point-per-participant scatter (SDD-CFG-006).
 * @property {string} [visit_col='VISIT'] Categorical visit column; drives the baseline/comparison visit multi-selects (SDD-CFG-007).
 * @property {string} [visitn_col='VISITNUM'] Numeric visit column used to order the visit selectors and the linked-table sparklines; ignored when absent (SDD-CFG-008).
 * @property {?string} [measure_x=null] Measure plotted on the x-axis; falls back to the first measure in the data when absent (SDD-CFG-009, SDD-CFG-010).
 * @property {?string} [measure_y=null] Measure plotted on the y-axis; falls back to the second measure in the data when absent (SDD-CFG-011).
 * @property {string[]} [baseline_visits=[]] Baseline visit(s); multiple selected visits are averaged. Falls back to the first visit in the data (SDD-CFG-012, SDD-FUNC-001).
 * @property {string[]} [comparison_visits=[]] Comparison visit(s); multiple selected visits are averaged. Falls back to the last visit in the data (SDD-CFG-013, SDD-FUNC-001).
 * @property {boolean} [add_regression_line=true] Draw a simple linear regression line with an equation and R² note on first render (SDD-REG-026).
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs. Filters whose column is absent from the data are dropped with a console warning (SDD-CFG-014, SDD-REG-007).
 * @property {?Array<string|Object>} [details=null] Participant-detail columns shown above the linked measure table; when null, defaults to the participant ID and the filter columns (SDD-CFG-015).
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings; the current shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried over for the R widget bindings; the current shell fixes the chart area at 460px.
 */

/**
 * Built-in defaults for every delta-delta setting; syncSettings merges caller
 * overrides onto these.
 * @type {DeltaDeltaSettings}
 */
export const DEFAULT_SETTINGS = {
  measure_col: 'TEST',
  value_col: 'STRESN',
  id_col: 'USUBJID',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  measure_x: null,
  measure_y: null,
  baseline_visits: [],
  comparison_visits: [],
  add_regression_line: true,
  filters: [],
  details: null,
  width: '100%',
  height: 460
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
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become { value_col, label } arrays, listing details default from the id and
 * filter mappings, and the visit/measure selections are coerced to arrays or
 * left null for the data-driven defaults resolved on setData.
 * @param {DeltaDeltaSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {DeltaDeltaSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.filters = arrayify(synced.filters)
    .map((filter) => fieldSpec(filter))
    .filter((filter) => filter.value_col);
  synced.baseline_visits = arrayify(synced.baseline_visits);
  synced.comparison_visits = arrayify(synced.comparison_visits);
  const suppliedDetails = arrayify(synced.details)
    .map((detail) => fieldSpec(detail))
    .filter((detail) => detail.value_col);
  const defaultDetails = [
    { value_col: synced.id_col, label: 'Participant ID' },
    ...synced.filters.filter((filter) => filter.value_col !== synced.id_col)
  ];
  const merged = [...defaultDetails];
  suppliedDetails.forEach((detail) => {
    if (!merged.some((existing) => existing.value_col === detail.value_col)) merged.push(detail);
  });
  synced.details = merged;
  return synced;
}
