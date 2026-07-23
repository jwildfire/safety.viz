// Settings defaults + merge for the participant-profile module (#98). The
// participant profile is the standardized-lab drill-down the original
// SafetyGraphics hep-explorer welded into the eDISH renderer (participant
// header, labs-over-time spaghetti, measure table with sparklines + inset),
// lifted into a standalone module that mounts either standalone or docked
// (PPRF-1). House defaults reproduce hep-explorer's long-lab contract so the
// dock can consume a host chart's already-cleaned rows verbatim.
//
// Field-list settings (details, filters, groups) accept a column-name string or
// a { value_col, label } spec, singly or as an array. cuts and measure_values
// deep-merge onto the defaults so a partial override still back-fills every
// measure. Requirement groups use the PPRF-* scheme.

// Normalize a single value or nullish to an array. Kept local (not imported
// from a renderer file) so the module carries no renderer-specific dependency
// (PPRF-1).
function arrayify(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

// Normalize a column name or spec object to { value_col, label, ...extra }.
function fieldSpec(value, fallbackLabel) {
  if (typeof value === 'string') return { value_col: value, label: fallbackLabel || value };
  return { ...value, value_col: value.value_col, label: value.label || value.value_col };
}

// Categorical palette for the labs-over-time spaghetti and the measure-table
// sparklines / colors (PPRF-3/4). The original renderer's spaghetti palette,
// distinct and print-considerate, cycled when a profile carries more measures
// than colors.
export const MEASURE_COLORS = [
  '#e41a1c',
  '#377eb8',
  '#4daf4a',
  '#984ea3',
  '#ff7f00',
  '#a65628',
  '#f781bf',
  '#00838f'
];

/**
 * Rendering and data-mapping settings for the participant-profile module. Every
 * key has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest.
 * @typedef {Object} ParticipantProfileSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column (PPRF-1).
 * @property {string} [measure_col='TEST'] Column holding the measure name; rows are matched to the ALT/AST/TB/ALP keys via measure_values (PPRF-3).
 * @property {string} [value_col='STRESN'] Column holding the numeric result; rows with missing/non-numeric values are removed (PPRF-1).
 * @property {string} [unit_col='STRESU'] Optional unit column.
 * @property {string} [normal_col_high='STNRHI'] Upper-limit-of-normal column; the ×ULN denominator and the outlier-high flag (PPRF-4).
 * @property {?string} [normal_col_low='STNRLO'] Lower-limit-of-normal column; the sparkline band floor and the outlier-low flag (PPRF-4).
 * @property {?string} [studyday_col='DY'] Study-day column; the spaghetti / inset x-axis (PPRF-3/4).
 * @property {?string} [visit_col='VISIT'] Visit column, carried onto spark points.
 * @property {?string} [visitn_col='VISITNUM'] Numeric visit column.
 * @property {?string} [baseline_col=null] Optional baseline-flag column, feeding deriveBaseline and the hep-core reduction (PPRF-5).
 * @property {string} [baseline_value='Y'] The value of baseline_col that marks the baseline record.
 * @property {Array<string|Object>} [details=[]] Header demographics: column names or { value_col, label } specs (PPRF-2).
 * @property {Object} [measure_values] Map of the short measure key (ALT/AST/TB/ALP) to the full TEST string in the data (PPRF-3).
 * @property {Object} [cuts] Per-measure reference cutpoints keyed by measure then display mode; a `defaults` entry back-fills any measure without its own cuts (PPRF-3).
 * @property {string} [display='relative_uln'] Initial display mode: `relative_uln` (×ULN) or `relative_baseline` (×Baseline) (PPRF-3).
 * @property {Array<{value: string, label: string}>} [display_options] Display-toggle labels (PPRF-3).
 * @property {number[]} [measureBounds=[0.01, 0.99]] Population-extent quantiles for the sparkline / inset guides (PPRF-4).
 * @property {?string} [participantProfileURL=null] Optional link-out URL, templated by every literal `{id}` token (PPRF-2, closes #53).
 * @property {?string} [p_alt_col=null] Optional column carrying a pre-computed P_ALT; passed through where present, never computed client-side (PPRF-2).
 * @property {?(Element|string)} [listen_to=null] Standalone event target (Element or selector); null → document (PPRF-6).
 * @property {?Function} [on_clear=null] Callback the Clear affordance invokes so the host clears its own selection (PPRF-2/6).
 * @property {?Function} [on_step=null] Callback (id) fired on stepper navigation so the host keeps its highlight in sync (PPRF-5).
 * @property {Array<string|Object>} [filters=[]] Normalized to spec arrays — required by the hep-core reducers' settings shape.
 * @property {Array<string|Object>} [groups=[]] Normalized to spec arrays — required by the hep-core reducers' settings shape.
 * @property {string} [width='100%'] Widget width, carried over for the R widget bindings.
 * @property {number} [height=300] Spaghetti chart-area height in pixels.
 */

/**
 * Built-in defaults for every participant-profile setting; syncSettings merges
 * caller overrides onto these. Cutpoint and measure_values defaults reproduce
 * hep-explorer's, so the docked mount and the standalone mount agree on how a
 * measure is flagged (PPRF-3).
 * @type {ParticipantProfileSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  unit_col: 'STRESU',
  normal_col_high: 'STNRHI',
  normal_col_low: 'STNRLO',
  studyday_col: 'DY',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  baseline_col: null,
  baseline_value: 'Y',
  details: [],
  measure_values: {
    ALT: 'Aminotransferase, alanine (ALT)',
    AST: 'Aminotransferase, aspartate (AST)',
    TB: 'Total Bilirubin',
    ALP: 'Alkaline phosphatase (ALP)'
  },
  cuts: {
    TB: { relative_uln: 2, relative_baseline: 4.8 },
    ALP: { relative_uln: 1, relative_baseline: 3.8 },
    defaults: { relative_uln: 3, relative_baseline: 3.8 }
  },
  display: 'relative_uln',
  display_options: [
    { value: 'relative_uln', label: 'ULN adjusted' },
    { value: 'relative_baseline', label: 'Baseline adjusted' }
  ],
  measureBounds: [0.01, 0.99],
  participantProfileURL: null,
  p_alt_col: null,
  listen_to: null,
  on_clear: null,
  on_step: null,
  filters: [],
  groups: [],
  width: '100%',
  height: 300
};

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: the field
 * lists (details, filters, groups) become { value_col, label } spec arrays,
 * cuts and measure_values deep-merge onto the defaults (so a partial override
 * still back-fills every measure), and measureBounds is coerced back to a
 * two-quantile array.
 * @param {ParticipantProfileSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {ParticipantProfileSettings} The merged, normalized settings.
 */
export function syncSettings(settings = {}) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };

  synced.details = arrayify(synced.details)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);
  synced.filters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);
  synced.groups = arrayify(synced.groups)
    .map((value) => fieldSpec(value))
    .filter((d) => d.value_col);

  synced.measure_values = {
    ...DEFAULT_SETTINGS.measure_values,
    ...(settings.measure_values || {})
  };

  const cutKeys = new Set([
    ...Object.keys(DEFAULT_SETTINGS.cuts),
    ...Object.keys(settings.cuts || {})
  ]);
  const mergedCuts = {};
  cutKeys.forEach((key) => {
    mergedCuts[key] = {
      ...(DEFAULT_SETTINGS.cuts[key] || {}),
      ...((settings.cuts || {})[key] || {})
    };
  });
  synced.cuts = mergedCuts;

  const bounds = arrayify(synced.measureBounds).map(Number).filter(Number.isFinite);
  synced.measureBounds = bounds.length === 2 ? bounds : [...DEFAULT_SETTINGS.measureBounds];

  return synced;
}

/**
 * Template a link-out URL for a participant (PPRF-2, closes #53): replace every
 * literal `{id}` token with the URL-encoded id. A URL that carries no token
 * passes through unchanged, preserving the original renderer's static-URL
 * behaviour; a missing URL returns null.
 * @param {?string} url The configured participantProfileURL, or null.
 * @param {string|number} id The participant id.
 * @returns {?string} The templated URL, or null.
 */
export function templateProfileURL(url, id) {
  if (url === undefined || url === null || url === '') return null;
  return String(url).replace(/\{id\}/g, encodeURIComponent(String(id)));
}

/**
 * Map each measure key to a stable palette color, in the given order, cycling
 * when a profile carries more measures than colors (PPRF-3/4).
 * @param {string[]} keys Ordered measure keys.
 * @returns {Map<string, string>} key -> hex color.
 */
export function measureColorScale(keys) {
  const scale = new Map();
  keys.forEach((key, index) => {
    scale.set(key, MEASURE_COLORS[index % MEASURE_COLORS.length]);
  });
  return scale;
}
