// Settings defaults + merge for the nep-explorer module (#120): the KDIGO
// acute-kidney-injury creatinine scatter, ported in behaviour from
// SafetyGraphics/nepExplorer (R Shiny, v1.0.0) per design obot.roadmap#35.
// Mirrors the delta-delta / hep-explorer configure flow (DEFAULT_SETTINGS +
// syncSettings) and reuses hep-explorer's baseline vocabulary so reviewers meet
// one spelling of `baseline_col` / `baseline_value` across the two explorers.
//
// Two settings carry the design decisions that make this port diverge from the
// R source, and both are parameterized rather than hard-coded:
//
//   `stages` (D4) — the source stages absolute change at 1.5 and 2.5 mg/dL in
//   R/creatinine_data_fcn.R, at those same numbers in the opposite ORDER in
//   R/creatinine_scatter_charts.R, and at 0.7/1.2 in its own outline.md: three
//   ladders across two files and a spec, none of them KDIGO. The module takes
//   the KDIGO criteria as its default (fold 1.5 / 2 / 3, a single 0.3 mg/dL
//   Stage-1 trigger on absolute change, and >= 4.0 mg/dL as a Stage-3 rule on
//   the VALUE reached) and exposes the cut-points, so a sponsor who wants the
//   original rectangles back sets three numbers.
//
//   `units` (design §4) — the fold axis is a ratio and unit-free; 0.3 and 4.0
//   mg/dL are not. Creatinine is reported in µmol/L across most of the world,
//   including in both demo datasets, so the module converts per record at
//   1 mg/dL = 88.4 µmol/L. Sponsor-specific factors vary — nepExplorer warns
//   about this itself — so the factor table is a setting.

/** Micromoles per litre in 1 mg/dL of creatinine (design §4). */
export const UMOL_PER_MGDL = 88.4;

/**
 * The KDIGO acute-kidney-injury staging criteria as design §3.1 states them,
 * and the module's default `stages` setting (D4).
 *
 * `fold` is the ascending ladder of value ÷ baseline cut-points for Stages 1,
 * 2 and 3. `delta` is the single absolute-CHANGE cut-point KDIGO defines — it
 * only ever produces Stage 1; there is no KDIGO Stage 2 or 3 on absolute
 * change, which is precisely where the R source's table goes wrong. `absolute`
 * is the Stage-3 rule on the VALUE reached, so it is a property of the
 * participant rather than a region of the (fold, delta) plane (D5).
 * @type {{fold: number[], delta: number, absolute: number}}
 */
export const KDIGO_STAGES = Object.freeze({
  fold: Object.freeze([1.5, 2, 3]),
  delta: 0.3,
  absolute: 4.0
});

/**
 * Rendering and data-mapping settings for the nep-explorer module. Every key has
 * a default in DEFAULT_SETTINGS; callers pass only the overrides they need and
 * syncSettings fills in the rest.
 * @typedef {Object} NepExplorerSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; one point per participant and the selection key (NEP-CFG-001).
 * @property {string} [measure_col='TEST'] Column holding the measure name, matched against measure_values.CREAT to find the creatinine records (NEP-CFG-008).
 * @property {string} [value_col='STRESN'] Column holding the numeric result; non-numeric rows drop with a counted note (NEP-DATA-005).
 * @property {?string} [unit_col='STRESU'] Column holding the result unit, resolved PER RECORD to mg/dL before any comparison (NEP-UNIT-002).
 * @property {?string} [baseline_col=null] Optional baseline-flag column. When supplied, the flagged record is the baseline; otherwise the earliest record is used (D7, NEP-DATA-001).
 * @property {string} [baseline_value='Y'] The value of baseline_col that marks the baseline record (NEP-CFG-002).
 * @property {string} [visit_col='VISIT'] Categorical visit column; the tooltip's "maximum at visit" and the baseline fallback's second sort key.
 * @property {?string} [visitn_col='VISITNUM'] Numeric visit column ordering the records; ignored when absent.
 * @property {?string} [studyday_col='DY'] Optional numeric study-day column: the baseline fallback's first sort key and the tooltip's "maximum on study day". Degrades silently when the data has no such column (NEP-SCAT-003).
 * @property {Object} [measure_values={CREAT: 'Creatinine'}] Map of the short measure key to this data's full measure name; grows to the profile panel in Phase 2.
 * @property {?string} [arm_col='ARM'] Treatment-arm column, carried on each point for the tooltip and the filters.
 * @property {{fold: number[], delta: number, absolute: number}} [stages=KDIGO_STAGES] The staging cut-points (D4): the three fold-change cut-points, the single absolute-change Stage-1 trigger, and the Stage-3 rule on the value reached.
 * @property {{target: string, factors: Object<string, number>}} [units] The mg/dL contract (design §4): the target unit and the per-unit multiplier table. Factor keys are normalized (lower-cased, µ/μ/u folded) on merge, so lookups never guess.
 * @property {Array<string|Object>} [filters=[]] Filter controls: column names or { value_col, label } specs (NEP-CFG-006).
 * @property {?Array<string|Object>} [details=null] Participant-detail columns shown with the selected participant; defaults to the participant ID plus the filter columns.
 * @property {string} [zone_labels='shown'] Whether the scatter draws the stage-zone labels: `shown` or `hidden` (NEP-ZONE-004).
 * @property {string} [width='100%'] Widget width, carried for the R widget bindings; the current shell always spans its container.
 * @property {number} [height=460] Chart-area height in pixels, carried for the R widget bindings.
 */

/**
 * Built-in defaults for every nep-explorer setting; syncSettings merges caller
 * overrides onto these.
 * @type {NepExplorerSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  unit_col: 'STRESU',
  baseline_col: null,
  baseline_value: 'Y',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  studyday_col: 'DY',
  measure_values: { CREAT: 'Creatinine' },
  arm_col: 'ARM',
  stages: KDIGO_STAGES,
  units: {
    target: 'mg/dL',
    // Keys are normalized before lookup, so one entry covers umol/L, µmol/L,
    // μmol/L and every casing of each.
    factors: { 'mg/dl': 1, 'umol/l': 1 / UMOL_PER_MGDL }
  },
  filters: [],
  details: null,
  zone_labels: 'shown',
  width: '100%',
  height: 460
};

/**
 * Normalize a unit string for matching (NEP-UNIT-001): trimmed, lower-cased,
 * with all three micro spellings folded to a plain `u`.
 *
 * The three spellings are not hypothetical — the RhoInc renderer-specific
 * dataset writes `μmol/L` with U+03BC (Greek small letter mu), pharmaverseadam
 * writes `umol/L`, and U+00B5 (micro sign) is the third form in the wild. They
 * are one unit, and a factor table keyed on the raw string would silently miss
 * two of them.
 * @param {*} unit The raw unit value from a record.
 * @returns {string} The normalized key, or '' when there is no usable unit.
 */
export function normalizeUnit(unit) {
  if (unit === undefined || unit === null) return '';
  return String(unit).trim().toLowerCase().replace(/[µμ]/g, 'u');
}

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
 * Merge the caller's stage cut-points onto the KDIGO defaults (NEP-CFG-003,
 * NEP-CFG-004). The fold ladder is numified and sorted ascending, because the
 * staging function reads it worst-first and a descending ladder is exactly the
 * ordering defect this port exists to avoid; a ladder that is not three usable
 * numbers falls back to KDIGO rather than half-applying.
 * @private
 */
function syncStages(stages) {
  const supplied = stages && typeof stages === 'object' ? stages : {};
  const fold = arrayify(supplied.fold).map(Number).filter(Number.isFinite);
  const delta = Number(supplied.delta);
  const absolute = Number(supplied.absolute);
  return {
    fold: fold.length === 3 ? [...fold].sort((a, b) => a - b) : [...KDIGO_STAGES.fold],
    delta: Number.isFinite(delta) ? delta : KDIGO_STAGES.delta,
    absolute: Number.isFinite(absolute) ? absolute : KDIGO_STAGES.absolute
  };
}

/**
 * Merge the caller's unit contract onto the default (NEP-CFG-005), normalizing
 * every factor key on the way in so a lookup at plot time is a plain map read.
 * @private
 */
function syncUnits(units) {
  const supplied = units && typeof units === 'object' ? units : {};
  const factors = {};
  const source =
    supplied.factors && typeof supplied.factors === 'object'
      ? supplied.factors
      : DEFAULT_SETTINGS.units.factors;
  Object.entries(source).forEach(([unit, factor]) => {
    const key = normalizeUnit(unit);
    const value = Number(factor);
    if (key && Number.isFinite(value) && value > 0) factors[key] = value;
  });
  return {
    target: typeof supplied.target === 'string' && supplied.target ? supplied.target : 'mg/dL',
    factors: Object.keys(factors).length ? factors : { ...DEFAULT_SETTINGS.units.factors }
  };
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: field lists
 * become { value_col, label } arrays, the detail list defaults from the id and
 * filter mappings, and the stage ladder and unit table are validated so the
 * chart can read them without re-checking.
 * @param {NepExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {NepExplorerSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.stages = syncStages(settings ? settings.stages : undefined);
  synced.units = syncUnits(settings ? settings.units : undefined);
  synced.measure_values = { ...DEFAULT_SETTINGS.measure_values, ...(synced.measure_values || {}) };
  synced.zone_labels = synced.zone_labels === 'hidden' ? 'hidden' : 'shown';
  synced.filters = arrayify(synced.filters)
    .map((filter) => fieldSpec(filter))
    .filter((filter) => filter.value_col);

  const suppliedDetails = arrayify(synced.details)
    .map((detail) => fieldSpec(detail))
    .filter((detail) => detail.value_col);
  const merged = [
    { value_col: synced.id_col, label: 'Participant ID' },
    ...synced.filters.filter((filter) => filter.value_col !== synced.id_col)
  ];
  suppliedDetails.forEach((detail) => {
    if (!merged.some((existing) => existing.value_col === detail.value_col)) merged.push(detail);
  });
  synced.details = merged;
  return synced;
}
