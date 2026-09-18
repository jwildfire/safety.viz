// Settings defaults + merge for the patient-journey-explorer module (#142,
// obot.roadmap#349, design §3.2): one subject's safety record across six
// domains on a shared study-day axis. Column mappings are flat, snake_case and
// domain-prefixed (`ae_*`, `lb_*`, …) because the schema's `requiredSettings`
// name settings keys directly, the time-to-event idiom (D3); lane DISPLAY
// configuration is the nested `lanes` object the plan describes.
//
// The plan's §7 settings object is written in camelCase with lane-level column
// keys and `filters[].col`. Every one of those spellings is accepted here as an
// alias and mapped onto the canonical key with one console warning each, so a
// plan-shaped paste produces a working chart rather than a silent one (PC-3).
// The canonical key wins silently when both are given.
//
// IMPORT HYGIENE (RF-19, hard requirement): scripts/api/build-api-data.mjs
// imports this file with plain Node, outside the bundler. It may import ONLY
// ../filters.js and ../histogram/configure.js — both DOM-free and JSON-free —
// and never checkInputs.js, the schema, palette.js or anything touching
// `document`. configure.test.js asserts this with a bare dynamic import.
//
// ONE TYPEDEF (RF-4): the settings typedef below is the only `@typedef` with
// `@property` lines in the two files the API generator reads; the data-model
// typedefs live in normalize.js, labs.js and anchor.js.

import { arrayify } from '../histogram/configure.js';
import { normalizeFilterSpec } from '../filters.js';

/**
 * Rendering and data-mapping settings for the patient-journey-explorer module.
 * Every key has a default in DEFAULT_SETTINGS; callers pass only the overrides
 * they need and syncSettings fills in the rest. Column settings ending in
 * `_stdy_col`, `_endy_col` or `_day_col` accept a single column name or an
 * ordered fallback chain, resolved per row left to right (PJE-DATA-007).
 * @typedef {Object} PatientJourneyExplorerSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column, present in every domain; the subject picker lists its distinct values across all domains and the participantsSelected event carries it (PJE-SUBJ-001, PJE-EVT-002).
 * @property {string} [domain_col='DOMAIN'] For the merged-array input form, the column whose value names each row's domain (`AE`, `LB`, `EX`, `CM`, `MH`, `DS`, or the ADaM spellings `ADAE` …); rows with any other value are dropped with a named reason (PJE-DATA-001, PJE-DATA-002).
 * @property {?string} [subject=null] The subject to open on; null opens on the first subject in sorted order (PJE-SUBJ-001).
 * @property {Object} [time] Time-axis configuration: `mode` (`'day'` or `'date'`, the opening display), `ref_date_col` (`'TRTSDT'`; the column holding the date of study day 1, read from any row of any domain and preferred over deriving it from a recorded date), and `allow_date_mode` (true; when false the calendar-date control is not offered and `mode` is forced to `'day'`). The plan's `day_col` / `date_col` keys are accepted as generic `--DY` / `--DTC` patterns expanded per domain and prepended to each domain's fallback chain (PJE-TIME-001, PJE-TIME-002).
 * @property {number} [context_window_days=30] Half-width of the anchor context window in elapsed days, inclusive on both sides; coerced to a non-negative integer, and 0 means the anchor day only (PJE-CFG-004, PJE-ANCH-002).
 * @property {string} [ex_trt_col='EXTRT'] Exposure treatment name column; the exposure lane draws one row per distinct value and each record's label and category come from it.
 * @property {string} [ex_dose_col='EXDOSE'] Exposure dose column; consecutive records with different numeric doses derive the dose-change events (PJE-DERIV-001). A record with both treatment and dose blank is dropped with a named reason.
 * @property {string} [ex_dosu_col='EXDOSU'] Exposure dose unit column, appended to the dose in tooltips and dose-change labels.
 * @property {string|string[]} [ex_stdy_col=['ASTDY','EXSTDY']] Exposure start study day, as a column name or a fallback chain resolved per row; required in exposure data. A record with no usable start day is kept but not drawn (PJE-LANE-008).
 * @property {string|string[]} [ex_endy_col=['AENDY','EXENDY']] Exposure end study day, as a column name or a fallback chain; a blank end is `end not recorded` (exposure has no outcome column).
 * @property {string} [ex_stdtc_col='EXSTDTC'] Exposure start date column (`--DTC`), shown as recorded; a full date labels the record in date mode and a partial one never positions it (PJE-TIME-003).
 * @property {string} [ae_term_col='AETERM'] Adverse-event verbatim term column; the tooltip's secondary line when it differs from the decoded term, and the label when the decode is blank. A record with both blank is dropped with a named reason.
 * @property {string} [ae_decod_col='AEDECOD'] Adverse-event preferred term column: the mark label, and the key the "prior events with the same preferred term" context list matches on (PJE-CTX-004).
 * @property {string} [ae_soc_col='AEBODSYS'] Adverse-event body-system column, shown as the record's category.
 * @property {string|string[]} [ae_stdy_col=['ASTDY','AESTDY']] Adverse-event onset study day, as a column name or a fallback chain; required in adverse-event data.
 * @property {string|string[]} [ae_endy_col=['AENDY','AEENDY']] Adverse-event resolution study day, as a column name or a fallback chain. A blank end is `ongoing` only when `ae_out_col` says so, otherwise `end not recorded`; an end before the start is kept as a single-day mark and counted (PJE-DATA-008).
 * @property {string} [ae_sev_col='AESEV'] Adverse-event severity column, ranked by `ae_severity_values`; severity is drawn as bar height and border weight at one opaque fill, and a blank value draws a hatched mark named "severity not recorded" (PJE-ACC-002). The plan's lane-level `severityCol` is an alias.
 * @property {string} [ae_ser_col='AESER'] Adverse-event seriousness column, compared with `ae_serious_value`; serious events get a filled start dot, an escalation ring and an `SAE` tag. The plan's lane-level `seriousCol` is an alias.
 * @property {string} [ae_rel_col='AEREL'] Adverse-event relatedness column, shown in the tooltip as recorded.
 * @property {string} [ae_stdtc_col='AESTDTC'] Adverse-event onset date column (`--DTC`), shown as recorded (PJE-TIME-003, PJE-TIME-004).
 * @property {string[]} [ae_severity_values=['MILD','MODERATE','SEVERE']] Severity levels in ascending rank; a value outside the list keeps rank 0 and draws at the moderate height. An empty list falls back to the default.
 * @property {string} [ae_serious_value='Y'] The `ae_ser_col` value (case-insensitive) that marks a serious event (PJE-FILT-001).
 * @property {?string} [ae_out_col='AEOUT'] Adverse-event outcome column, read only when the end day is blank: an event is `ongoing` when this cell is one of `ae_ongoing_values`, and `end not recorded` otherwise (D16).
 * @property {string[]} [ae_ongoing_values=['NOT RECOVERED/NOT RESOLVED','RECOVERING/RESOLVING','ONGOING','N']] Outcome values (upper-cased, trimmed) that assert an event is still running when its end day is blank.
 * @property {string} [lb_test_col='LBTEST'] Lab test name column; required in lab data. A record with a blank name is dropped with a named reason; `lb_tests` matches this column or `lb_testcd_col`, case-insensitively.
 * @property {string} [lb_testcd_col='LBTESTCD'] Lab test code column; `lb_tests` entries match either the name or the code, so both `'Alanine Aminotransferase'` and `'ALT'` select the same series.
 * @property {string} [lb_value_col='LBSTRESN'] Lab numeric result column; required in lab data. A non-numeric result is dropped with a named reason.
 * @property {string} [lb_lo_col='LBSTNRLO'] Lab lower limit of normal column; with `lb_hi_col` draws the reference band and the `× LLN` ratio (PJE-LANE-005).
 * @property {string} [lb_hi_col='LBSTNRHI'] Lab upper limit of normal column; with `lb_lo_col` draws the reference band and the `× ULN` ratio.
 * @property {string|string[]} [lb_day_col=['LBDY','ADY']] Lab study day, as a column name or a fallback chain; required in lab data.
 * @property {string} [lb_nrind_col='LBNRIND'] Lab normal-range indicator column: a present value other than `lb_normal_value` marks the point abnormal by flag (PJE-CTX-002); `HIGH`/`LOW` pick the glyph and `HH`/`LL` add the escalation ring.
 * @property {string} [lb_unit_col='LBSTRESU'] Lab result unit column, appended to values in labels and the panel.
 * @property {string} [lb_dtc_col='LBDTC'] Lab collection date column (`--DTC`), shown as recorded.
 * @property {string[]} [lb_tests=['Alanine Aminotransferase','Aspartate Aminotransferase','Bilirubin','Alkaline Phosphatase']] The lab tests drawn as small multiples, in this order, matched case-insensitively against the test name or code; an empty list means every test present. The plan's `labTests` and lane-level `tests` are aliases.
 * @property {string} [lb_normal_value='NORMAL'] The `lb_nrind_col` value meaning within range; any other non-blank value is abnormal by flag, and a blank value is not abnormal.
 * @property {?string} [lb_baseline_flag_col='ABLFL'] Analysis-baseline flag column, consulted first when resolving a test's baseline (D17); null skips the flag rule.
 * @property {string} [lb_baseline_flag_value='Y'] The `lb_baseline_flag_col` value marking the baseline record.
 * @property {number} [lb_baseline_day=1] Fallback baseline rule: the last value on or before this study day, used only when no flagged record exists (PJE-DERIV-002).
 * @property {number} [lb_change_factor=2] Symmetric change rule: a value at least this many times, or at most 1/this of, the baseline is abnormal by change (D28). Must exceed 1.
 * @property {string} [cm_trt_col='CMTRT'] Con-med name column; required in con-med data. A record with a blank name is dropped with a named reason.
 * @property {string} [cm_class_col='CMCLAS'] Con-med class column (ATC class), the record's category and the multiselect filter's values; `cm_uncoded_value` is kept as its own bucket (PJE-FILT-003).
 * @property {string} [cm_dose_col='CMDOSE'] Con-med dose column, shown with the route as the tooltip's secondary line when present.
 * @property {string} [cm_route_col='CMROUTE'] Con-med route column, shown with the dose as the tooltip's secondary line when present.
 * @property {string|string[]} [cm_stdy_col=['ASTDY','CMSTDY']] Con-med start study day, as a column name or a fallback chain. A con-med with no usable start is kept, not drawn, and never asserted active at an anchor (PJE-CTX-001).
 * @property {string|string[]} [cm_endy_col=['AENDY','CMENDY']] Con-med end study day, as a column name or a fallback chain; a blank end is `end not recorded` unless `cm_out_col` says ongoing.
 * @property {string} [cm_stdtc_col='CMSTDTC'] Con-med start date column (`--DTC`), shown as recorded.
 * @property {string} [cm_uncoded_value='UNCODED'] The `cm_class_col` value meaning "not coded", kept as an ordinary selectable class.
 * @property {?string} [cm_out_col=null] Con-med ongoing-indicator column (`CMENRTPT`, `CMONGO`, …), read only when the end day is blank; null (the default — the pilot data has none) makes every blank end `end not recorded` (D16).
 * @property {string[]} [cm_ongoing_values=['ONGOING','Y','CONTINUING']] Values of `cm_out_col` (upper-cased, trimmed) that assert a con-med is still running when its end day is blank.
 * @property {string} [mh_term_col='MHTERM'] Medical-history verbatim term column; the label when the decode is blank. A record with both blank is dropped with a named reason.
 * @property {string} [mh_decod_col='MHDECOD'] Medical-history decoded term column, the mark label when present.
 * @property {string} [mh_cat_col='MHCAT'] Medical-history category column, shown as the record's category.
 * @property {string|string[]} [mh_day_col='MHDY'] Medical-history collection study day (the screening visit), the mark's position under the default `mh_day_source` (D18).
 * @property {string} [mh_day_source='collection'] Which day places a medical-history mark: `'collection'` (`mh_day_col`, the day it was recorded) or `'onset'` (`mh_onset_stdy_col`); anything else falls back to `'collection'` with a warning.
 * @property {string|string[]} [mh_onset_stdy_col=['ASTDY', 'MHSTDY']] Medical-history onset study day, as a column name or a fallback chain resolved per row (the ADaM `ASTDY`, then the SDTM `MHSTDY`, so the plan's vocabulary places too — D15); the tooltip's onset text by default, and the mark position under `mh_day_source: 'onset'`.
 * @property {string} [mh_strtpt_col='MHSTRTPT'] Medical-history onset relative-timing column (`BEFORE`, …), the tooltip's onset text when no onset day or date resolves.
 * @property {string} [mh_enrtpt_col='MHENRTPT'] Medical-history end relative-timing column; `ONGOING` adds "still present" to the tooltip.
 * @property {string} [mh_onset_dtc_col='MHSTDTC'] Medical-history onset date column (`--DTC`), shown as recorded in the onset text.
 * @property {string} [ds_decod_col='DSDECOD'] Disposition decoded term column, the mark label; required in disposition data. A record with a blank decode is dropped with a named reason.
 * @property {string} [ds_term_col='DSTERM'] Disposition verbatim term column, the tooltip's secondary line when it differs from the decode.
 * @property {string} [ds_cat_col='DSCAT'] Disposition category column (`DISPOSITION EVENT`, `PROTOCOL MILESTONE`, …), the record's category and the key `ds_reference_cats` matches (D19).
 * @property {string|string[]} [ds_stdy_col='DSSTDY'] Disposition study day, as a column name or a fallback chain.
 * @property {string} [ds_dtc_col='DSSTDTC'] Disposition date column (`--DTC`), shown as recorded.
 * @property {string[]} [ds_reference_cats=['DISPOSITION EVENT']] Disposition categories (upper-cased, trimmed) whose rows draw a full-height dashed rule across every lane; every disposition row still draws its own mark. An empty list draws a rule for every row, which is legal but noisy and warned once.
 * @property {Object} [lanes] Per-lane display configuration keyed by lane (`exposure`, `doseChanges`, `adverseEvents`, `labs`, `conMeds`, `medicalHistory`, `disposition`), each `{ enabled, label, group }` merged key by key onto the default; null disables a lane, an unknown lane key is dropped with a warning (PJE-CFG-003). Lane-level `severityCol`, `seriousCol` and `tests` are lifted to `ae_sev_col`, `ae_ser_col` and `lb_tests`; `domain`, `derivedFrom` and `smallMultiple` are accepted and ignored.
 * @property {Object[]} [lane_groups] Collapsible lane groups in stack order, each `{ key, label, collapsed }` (`treatment`, `events`, `context` by default); a group with no enabled lane is dropped at render time (PJE-LANE-003). The plan's `laneGroups` is an alias.
 * @property {Object[]} [filters] Sidebar filter specs, each with a `domain` (the only domain the filter applies to) and the shared filter contract keys: `type: 'flag'` with a `flag_value` renders a checkbox (the special `flag_value: '__abnormal__'` keeps only labs failing the abnormality rule), `multiple: true` renders the shell multiselect, and the rest follow `{ value_col, label, start, all }`. Specs without a `value_col` (or the plan's `col` alias) or without a recognized `domain` are dropped with a warning; a filter whose column is absent from its domain's data is dropped at render time with the library's standard warning (PJE-FILT-001 … PJE-FILT-004).
 * @property {?string} [source_url_template=null] Optional external link template for every source row, e.g. `'https://edc.example/{domain}/{USUBJID}/{AESEQ}'`: `{domain}` is the domain code and `{COLUMN}` the row's URI-encoded value; a row lacking a named column gets no link. null renders no link (PJE-SRC-002). The plan's `sourceUrlTemplate` is an alias.
 * @property {string} [source_url_label='Open source record'] Link text for the external source link.
 * @property {?Function} [on_select_subject=null] Callback `(subjectId, detail)` when the subject changes; kept only when a function. The plan's `onSelectSubject` is an alias (PJE-EVT-001).
 * @property {?Function} [on_anchor_event=null] Callback `(event, context)` when a mark is anchored or the anchor is cleared (both null on clear). The plan's `onAnchorEvent` is an alias.
 * @property {?Function} [on_context_change=null] Callback `(context)` whenever the context bundle changes while anchored, and with null when cleared. The plan's `onContextChange` is an alias.
 * @property {?Object} [narratives=null] The AI narrative slots (#146, PJE-NARR-009): an object of async functions returning a narrative draft — `subjectSummary(subject)`, `eventContext(subject, anchorRowId, { windowDays })`, `labTrajectory(subject, test)`, `doseJourney(subject)`, `disposition(subject)`. A slot with no function renders nothing; `SafetyViz.narratives.bindNarratives(instance, options)` installs all five over the built-in runtime. Non-function entries are dropped.
 * @property {?Function} [on_narrative_action=null] Callback `(action)` when a reviewer acts on a narrative card (PJE-NARR-013): `{ type: 'accept' | 'reject' | 'edit' | 'regenerate', kind, subject, row_id, draft, editedSentences?, reason? }`. The camelCase `onNarrativeAction` is an alias. The host application owns what happens next (storage of accepted narratives); the chart only emits.
 * @property {number} [row_height=26] Pixels per row inside a categorical lane; a positive integer. The plan's `rowHeight` is an alias.
 * @property {number} [row_height_min=18] Floor for `row_height` when `fit_to_height` scales the stack down.
 * @property {number} [max_rows_per_lane=12] Rows drawn per categorical lane before the remainder is counted in prose, in the lane's documented sort order (PJE-LANE-010). The plan's `maxRowsPerLane` is an alias.
 * @property {number} [lab_height=96] Pixels per lab small multiple. The plan's `labHeight` is an alias.
 * @property {number} [lab_height_min=64] Floor for `lab_height` when `fit_to_height` scales the stack down.
 * @property {number} [height=760] Pixel height of the lane column; taller stacks scroll and say so (PJE-LANE-009, D21). 760 is the height at which the Definition-of-Done participant (four lab tests, nine con-meds, a screening-history lane) fits at the row and lab floors; 720 left it 16px short.
 * @property {boolean} [fit_to_height=true] Scale row and lab heights (down to their floors) so the opening stack fits `height` before the column scrolls (D21).
 * @property {string} [width='100%'] Widget width, applied as the container element's style width; carried for the R widget binding.
 * @property {number} [page_size=10] Rows per page in the source-row drawer's tables.
 */

/** The seven lane keys in fixed render order (PJE-LANE-001). */
export const LANE_KEYS = [
  'exposure',
  'doseChanges',
  'adverseEvents',
  'labs',
  'conMeds',
  'medicalHistory',
  'disposition'
];

/**
 * Built-in defaults for every patient-journey-explorer setting; syncSettings
 * merges caller overrides onto these.
 * @type {PatientJourneyExplorerSettings}
 */
export const DEFAULT_SETTINGS = {
  // ---- identity / input form ----
  id_col: 'USUBJID',
  domain_col: 'DOMAIN',
  subject: null,

  // ---- time ----
  time: {
    mode: 'day',
    ref_date_col: 'TRTSDT',
    allow_date_mode: true
  },
  context_window_days: 30,

  // ---- exposure (EX) ----
  ex_trt_col: 'EXTRT',
  ex_dose_col: 'EXDOSE',
  ex_dosu_col: 'EXDOSU',
  ex_stdy_col: ['ASTDY', 'EXSTDY'],
  ex_endy_col: ['AENDY', 'EXENDY'],
  ex_stdtc_col: 'EXSTDTC',

  // ---- adverse events (AE) ----
  ae_term_col: 'AETERM',
  ae_decod_col: 'AEDECOD',
  ae_soc_col: 'AEBODSYS',
  ae_stdy_col: ['ASTDY', 'AESTDY'],
  ae_endy_col: ['AENDY', 'AEENDY'],
  ae_sev_col: 'AESEV',
  ae_ser_col: 'AESER',
  ae_rel_col: 'AEREL',
  ae_stdtc_col: 'AESTDTC',
  ae_severity_values: ['MILD', 'MODERATE', 'SEVERE'],
  ae_serious_value: 'Y',
  // Terminal state of an event whose end day is blank (D16): ongoing only
  // when the outcome column says so, otherwise "end not recorded".
  ae_out_col: 'AEOUT',
  ae_ongoing_values: ['NOT RECOVERED/NOT RESOLVED', 'RECOVERING/RESOLVING', 'ONGOING', 'N'],

  // ---- labs (LB) ----
  lb_test_col: 'LBTEST',
  lb_testcd_col: 'LBTESTCD',
  lb_value_col: 'LBSTRESN',
  lb_lo_col: 'LBSTNRLO',
  lb_hi_col: 'LBSTNRHI',
  lb_day_col: ['LBDY', 'ADY'],
  lb_nrind_col: 'LBNRIND',
  lb_unit_col: 'LBSTRESU',
  lb_dtc_col: 'LBDTC',
  lb_tests: [
    'Alanine Aminotransferase',
    'Aspartate Aminotransferase',
    'Bilirubin',
    'Alkaline Phosphatase'
  ],
  lb_normal_value: 'NORMAL',
  lb_baseline_flag_col: 'ABLFL',
  lb_baseline_flag_value: 'Y',
  lb_baseline_day: 1,
  lb_change_factor: 2,

  // ---- con-meds (CM) ----
  cm_trt_col: 'CMTRT',
  cm_class_col: 'CMCLAS',
  cm_dose_col: 'CMDOSE',
  cm_route_col: 'CMROUTE',
  cm_stdy_col: ['ASTDY', 'CMSTDY'],
  cm_endy_col: ['AENDY', 'CMENDY'],
  cm_stdtc_col: 'CMSTDTC',
  cm_uncoded_value: 'UNCODED',
  cm_out_col: null,
  cm_ongoing_values: ['ONGOING', 'Y', 'CONTINUING'],

  // ---- medical history (MH) ----
  mh_term_col: 'MHTERM',
  mh_decod_col: 'MHDECOD',
  mh_cat_col: 'MHCAT',
  mh_day_col: 'MHDY',
  mh_day_source: 'collection',
  mh_onset_stdy_col: ['ASTDY', 'MHSTDY'],
  mh_strtpt_col: 'MHSTRTPT',
  mh_enrtpt_col: 'MHENRTPT',
  mh_onset_dtc_col: 'MHSTDTC',

  // ---- disposition (DS) ----
  ds_decod_col: 'DSDECOD',
  ds_term_col: 'DSTERM',
  ds_cat_col: 'DSCAT',
  ds_stdy_col: 'DSSTDY',
  ds_dtc_col: 'DSSTDTC',
  ds_reference_cats: ['DISPOSITION EVENT'],

  // ---- lanes ----
  lanes: {
    exposure: { enabled: true, label: 'Exposure', group: 'treatment' },
    doseChanges: { enabled: true, label: 'Dose changes', group: 'treatment' },
    adverseEvents: { enabled: true, label: 'Adverse events', group: 'events' },
    labs: { enabled: true, label: 'Labs', group: 'events' },
    conMeds: { enabled: true, label: 'Con-meds', group: 'context' },
    medicalHistory: { enabled: true, label: 'Medical history (at screening)', group: 'context' },
    disposition: { enabled: true, label: 'Disposition', group: 'context' }
  },
  lane_groups: [
    { key: 'treatment', label: 'Treatment', collapsed: false },
    { key: 'events', label: 'Events and labs', collapsed: false },
    { key: 'context', label: 'Context', collapsed: false }
  ],

  // ---- filters ----
  filters: [
    { domain: 'AE', value_col: 'AESER', label: 'Serious only', type: 'flag', flag_value: 'Y' },
    {
      domain: 'LB',
      value_col: 'LBNRIND',
      label: 'Abnormal labs only',
      type: 'flag',
      flag_value: '__abnormal__'
    },
    { domain: 'CM', value_col: 'CMCLAS', label: 'ATC class', multiple: true }
  ],

  // ---- traceability ----
  source_url_template: null,
  source_url_label: 'Open source record',

  // ---- callbacks ----
  on_select_subject: null,
  on_anchor_event: null,
  on_context_change: null,
  narratives: null,
  on_narrative_action: null,

  // ---- layout ----
  row_height: 26,
  row_height_min: 18,
  max_rows_per_lane: 12,
  lab_height: 96,
  lab_height_min: 64,
  height: 760,
  fit_to_height: true,
  width: '100%',
  page_size: 10
};

const DOMAIN_CODES = ['EX', 'AE', 'LB', 'CM', 'MH', 'DS'];

// The plan's camelCase spellings → canonical keys (design §3.2, exhaustive).
const TOP_LEVEL_ALIASES = {
  contextWindowDays: 'context_window_days',
  sourceUrlTemplate: 'source_url_template',
  onSelectSubject: 'on_select_subject',
  onAnchorEvent: 'on_anchor_event',
  onContextChange: 'on_context_change',
  onNarrativeAction: 'on_narrative_action',
  labTests: 'lb_tests',
  idCol: 'id_col',
  domainCol: 'domain_col',
  rowHeight: 'row_height',
  pageSize: 'page_size',
  maxRowsPerLane: 'max_rows_per_lane',
  labHeight: 'lab_height',
  laneGroups: 'lane_groups'
};

// Lane-level keys lifted to the top level, and lane-level keys accepted and
// ignored (the lane → domain mapping is fixed by the lane registry; labs are
// always small multiples).
const LANE_LIFTED_ALIASES = {
  severityCol: 'ae_sev_col',
  seriousCol: 'ae_ser_col',
  tests: 'lb_tests'
};
const LANE_IGNORED_KEYS = ['domain', 'derivedFrom', 'smallMultiple'];
const LANE_DISPLAY_KEYS = ['enabled', 'label', 'group'];

const TIME_KEYS = ['mode', 'ref_date_col', 'allow_date_mode'];
const TIME_PATTERN_KEYS = ['day_col', 'date_col'];

// Per-domain fallback chains (rule 12) and the `--DY` / `--DTC` expansion
// targets (the time.day_col / time.date_col aliases).
const CHAIN_KEYS = [
  'ex_stdy_col',
  'ex_endy_col',
  'ae_stdy_col',
  'ae_endy_col',
  'lb_day_col',
  'cm_stdy_col',
  'cm_endy_col',
  'mh_onset_stdy_col',
  'ds_stdy_col'
];
const DAY_PATTERN_TARGETS = {
  EX: 'ex_stdy_col',
  AE: 'ae_stdy_col',
  LB: 'lb_day_col',
  CM: 'cm_stdy_col',
  MH: 'mh_day_col',
  DS: 'ds_stdy_col'
};
const DATE_PATTERN_TARGETS = {
  EX: 'ex_stdtc_col',
  AE: 'ae_stdtc_col',
  LB: 'lb_dtc_col',
  CM: 'cm_stdtc_col',
  MH: 'mh_onset_dtc_col',
  DS: 'ds_dtc_col'
};

const UPPER_LISTS = ['ds_reference_cats', 'ae_ongoing_values', 'cm_ongoing_values'];
const POSITIVE_INTS = [
  'row_height',
  'row_height_min',
  'lab_height',
  'lab_height_min',
  'height',
  'max_rows_per_lane',
  'page_size'
];
/** The five narrative slot names (PJE-NARR-009). */
export const NARRATIVE_SLOT_NAMES = [
  'subjectSummary',
  'eventContext',
  'labTrajectory',
  'doseJourney',
  'disposition'
];
const CALLBACKS = [
  'on_select_subject',
  'on_anchor_event',
  'on_context_change',
  'on_narrative_action'
];
const NARRATIVE_SLOTS = NARRATIVE_SLOT_NAMES;

const warn = (message) => console.warn(`patient-journey-explorer: ${message}`);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringList = (value) => arrayify(value).map(String);
const unique = (list) => [...new Set(list)];

/**
 * Positive integer, or the fallback.
 * @private
 */
function positiveInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Merge the plan's camelCase top-level aliases onto their canonical keys. The
 * canonical key wins silently when both are given; each accepted alias warns
 * once and the alias key is not carried into the result.
 * @private
 */
function applyTopLevelAliases(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = TOP_LEVEL_ALIASES[key];
    if (!canonical) {
      out[key] = value;
      continue;
    }
    if (raw[canonical] !== undefined) continue;
    warn(`setting "${key}" is an alias; use "${canonical}".`);
    out[canonical] = value;
  }
  return out;
}

/**
 * Deep-merge the lanes object per lane key (rule 3), lifting the plan's
 * lane-level column aliases onto the top-level settings object.
 * @private
 */
function syncLanes(input, synced, raw) {
  const lanes = {};
  for (const key of LANE_KEYS) lanes[key] = { ...DEFAULT_SETTINGS.lanes[key] };
  if (isObject(input)) {
    for (const [key, value] of Object.entries(input)) {
      if (!LANE_KEYS.includes(key)) {
        warn(`lanes.${key} is not a lane; the known lanes are ${LANE_KEYS.join(', ')}.`);
        continue;
      }
      if (value === null) {
        lanes[key].enabled = false;
        continue;
      }
      if (!isObject(value)) continue;
      for (const [laneKey, laneValue] of Object.entries(value)) {
        if (LANE_DISPLAY_KEYS.includes(laneKey)) {
          if (laneKey === 'enabled') lanes[key].enabled = laneValue;
          else if (typeof laneValue === 'string' && laneValue.trim())
            lanes[key][laneKey] = laneValue;
          continue;
        }
        const canonical = LANE_LIFTED_ALIASES[laneKey];
        if (canonical) {
          if (raw[canonical] === undefined) {
            warn(`lanes.${key}.${laneKey} is an alias; use the top-level "${canonical}".`);
            synced[canonical] = laneValue;
          }
          continue;
        }
        if (!LANE_IGNORED_KEYS.includes(laneKey)) {
          warn(`lanes.${key}.${laneKey} is not a lane setting and was ignored.`);
        }
      }
    }
  }
  for (const key of LANE_KEYS) lanes[key].enabled = Boolean(lanes[key].enabled);
  return lanes;
}

/**
 * Every lane must belong to a configured group, or planLanes never draws it
 * while its sidebar toggle stays live. A lane naming an unknown group (a typo,
 * a trailing space, or a custom `lane_groups` list that dropped the default
 * group) warns and falls back: to its default group when that group is
 * configured, otherwise to the first configured group, so the lane is drawn
 * either way and `lane_groups` stays exactly as the caller set it.
 * @private
 */
function syncLaneGroupMembership(lanes, groups) {
  const keys = groups.map((group) => group.key);
  for (const key of LANE_KEYS) {
    const lane = lanes[key];
    lane.group = typeof lane.group === 'string' ? lane.group.trim() : '';
    if (keys.includes(lane.group)) continue;
    const preferred = DEFAULT_SETTINGS.lanes[key].group;
    const fallback = keys.includes(preferred) ? preferred : keys[0];
    warn(
      `lanes.${key}.group "${lane.group}" is not a lane_groups key; the lane was placed in "${fallback}".`
    );
    lane.group = fallback;
  }
}

/**
 * Normalize lane_groups to { key, label, collapsed } (rule 4), falling back to
 * the defaults when nothing usable remains.
 * @private
 */
function syncLaneGroups(input) {
  const groups = arrayify(input)
    .map((group) => {
      if (!isObject(group) || typeof group.key !== 'string' || !group.key.trim()) return null;
      const key = group.key.trim();
      return {
        key,
        label: typeof group.label === 'string' && group.label.trim() ? group.label : key,
        collapsed: Boolean(group.collapsed)
      };
    })
    .filter(Boolean);
  return groups.length ? groups : DEFAULT_SETTINGS.lane_groups.map((group) => ({ ...group }));
}

/**
 * Deep-merge `time` key by key (rule 2), applying the `--DY` / `--DTC`
 * pattern expansions to the per-domain chains and rejecting unknown keys.
 * @private
 */
function syncTime(input, synced) {
  const time = { ...DEFAULT_SETTINGS.time };
  if (isObject(input)) {
    for (const [key, value] of Object.entries(input)) {
      if (TIME_KEYS.includes(key)) {
        time[key] = value;
      } else if (TIME_PATTERN_KEYS.includes(key)) {
        expandPattern(key, value, synced);
      } else {
        warn(
          `time.${key} is not a time setting; the known keys are ${[...TIME_KEYS, ...TIME_PATTERN_KEYS].join(', ')}.`
        );
      }
    }
  }
  time.allow_date_mode = Boolean(time.allow_date_mode);
  time.mode = time.mode === 'date' && time.allow_date_mode ? 'date' : 'day';
  time.ref_date_col =
    typeof time.ref_date_col === 'string' && time.ref_date_col.trim()
      ? time.ref_date_col
      : DEFAULT_SETTINGS.time.ref_date_col;
  return time;
}

/**
 * Expand a generic `--DY` / `--DTC` pattern per domain, prepending the expanded
 * name to that domain's existing fallback chain.
 * @private
 */
function expandPattern(key, value, synced) {
  if (typeof value !== 'string' || !value.includes('--')) {
    warn(`time.${key} must contain "--" (a generic pattern such as "--DY"); ignored.`);
    return;
  }
  const targets = key === 'day_col' ? DAY_PATTERN_TARGETS : DATE_PATTERN_TARGETS;
  warn(`time.${key} is an alias; it expands "${value}" onto each domain's column chain.`);
  for (const [domain, target] of Object.entries(targets)) {
    const expanded = value.replace(/--/g, domain);
    synced[target] = unique([expanded, ...stringList(synced[target])]);
  }
}

/**
 * Normalize the filter specs (rule 5): the plan's `col` alias, the shared
 * filter contract, a required recognized domain, extra keys preserved.
 * @private
 */
function syncFilters(input) {
  return arrayify(input)
    .map((spec) => {
      if (typeof spec === 'string') {
        warn(`filter "${spec}" has no domain and was dropped; pass { domain, value_col }.`);
        return null;
      }
      if (!isObject(spec)) return null;
      const { col, ...rest } = spec;
      if (rest.value_col === undefined && col !== undefined) {
        warn(`filters[].col is an alias; use "value_col" (${spec.label || col}).`);
        rest.value_col = col;
      }
      if (!rest.value_col) {
        warn(`filter "${spec.label || '(unlabelled)'}" names no value_col and was dropped.`);
        return null;
      }
      const domain = String(rest.domain ?? '')
        .trim()
        .toUpperCase();
      if (!DOMAIN_CODES.includes(domain)) {
        warn(
          `filter "${rest.label || rest.value_col}" has no recognized domain (${DOMAIN_CODES.join(', ')}) and was dropped.`
        );
        return null;
      }
      return { ...normalizeFilterSpec(rest), domain };
    })
    .filter(Boolean);
}

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: the plan's
 * camelCase aliases map onto the snake_case keys, `time` and `lanes` deep-merge
 * key by key, lane groups and filters normalize to their contracts, every day
 * column becomes a fallback chain, and the numeric, list and callback settings
 * are coerced with their documented fallbacks (design §3.2, rules 1–14).
 * @param {PatientJourneyExplorerSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {PatientJourneyExplorerSettings} The merged, normalized settings.
 */
/**
 * The `narratives` slots: an object keeping only the five known slot names
 * whose value is a function, or null when none is bound (PJE-NARR-009).
 * @private
 */
function syncNarratives(value) {
  if (!isObject(value)) return null;
  const slots = {};
  for (const name of NARRATIVE_SLOTS) {
    if (typeof value[name] === 'function') slots[name] = value[name];
  }
  return Object.keys(slots).length ? slots : null;
}

export function syncSettings(settings) {
  const raw = isObject(settings) ? settings : {};
  const aliased = applyTopLevelAliases(raw);
  const synced = { ...DEFAULT_SETTINGS, ...aliased };

  synced.lanes = syncLanes(aliased.lanes, synced, aliased);
  synced.lane_groups = syncLaneGroups(synced.lane_groups);
  syncLaneGroupMembership(synced.lanes, synced.lane_groups);

  for (const key of CHAIN_KEYS) synced[key] = stringList(synced[key]);
  synced.time = syncTime(aliased.time, synced);
  synced.filters = syncFilters(synced.filters);

  const windowDays = synced.context_window_days;
  synced.context_window_days =
    windowDays === null || windowDays === undefined || windowDays === ''
      ? DEFAULT_SETTINGS.context_window_days
      : Number.isFinite(Number(windowDays))
        ? Math.max(0, Math.floor(Number(windowDays)))
        : DEFAULT_SETTINGS.context_window_days;

  synced.lb_tests = stringList(synced.lb_tests);
  synced.ae_severity_values = stringList(synced.ae_severity_values);
  if (!synced.ae_severity_values.length)
    synced.ae_severity_values = [...DEFAULT_SETTINGS.ae_severity_values];

  const factor = Number(synced.lb_change_factor);
  synced.lb_change_factor =
    Number.isFinite(factor) && factor > 1 ? factor : DEFAULT_SETTINGS.lb_change_factor;
  const baselineDay = Number(synced.lb_baseline_day);
  synced.lb_baseline_day = Number.isFinite(baselineDay)
    ? Math.trunc(baselineDay)
    : DEFAULT_SETTINGS.lb_baseline_day;

  for (const key of CALLBACKS) synced[key] = typeof synced[key] === 'function' ? synced[key] : null;
  synced.narratives = syncNarratives(synced.narratives);

  for (const key of POSITIVE_INTS) synced[key] = positiveInt(synced[key], DEFAULT_SETTINGS[key]);
  synced.fit_to_height = Boolean(synced.fit_to_height);

  for (const key of UPPER_LISTS) {
    synced[key] = stringList(synced[key])
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
  }
  if (!synced.ds_reference_cats.length) {
    warn('ds_reference_cats is empty, so every disposition row draws a cross-lane rule.');
  }

  if (synced.mh_day_source !== 'onset') {
    if (synced.mh_day_source !== 'collection') {
      warn(
        `mh_day_source "${synced.mh_day_source}" is not 'collection' or 'onset'; using 'collection'.`
      );
    }
    synced.mh_day_source = 'collection';
  }

  synced.subject =
    synced.subject === null || synced.subject === undefined || synced.subject === ''
      ? null
      : String(synced.subject);
  synced.source_url_template =
    typeof synced.source_url_template === 'string' && synced.source_url_template.trim()
      ? synced.source_url_template
      : null;
  synced.source_url_label =
    typeof synced.source_url_label === 'string' && synced.source_url_label.trim()
      ? synced.source_url_label
      : DEFAULT_SETTINGS.source_url_label;

  return synced;
}
