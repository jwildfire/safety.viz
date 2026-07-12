// Settings defaults + merge for the ae-timelines module, matching the
// original renderer's defaultSettings.js/syncSettings behavior
// (RhoInc/ae-timelines @ master) under #26. Field-list normalization helpers
// are shared with the histogram module.

import { arrayify, fieldSpec } from '../histogram/configure.js';

/**
 * Rendering and data-mapping settings for the ae-timelines module. Every key
 * has a default in DEFAULT_SETTINGS; callers pass only the overrides they
 * need and syncSettings fills in the rest. The nested color and highlight
 * objects merge key-by-key onto their defaults, and field-list settings
 * (filters, details) accept column-name strings or { value_col, label }
 * objects, in a single value or an array.
 * @typedef {Object} AETimelinesSettings
 * @property {string} [id_col='USUBJID'] Participant identifier column; required in the data. One timeline row per participant; clicking the ID opens the detail view.
 * @property {string} [seq_col='AESEQ'] Adverse-event sequence number column; required in the data. Blank in placeholder rows for participants without adverse events.
 * @property {string} [stdy_col='ASTDY'] Study day of onset; required in the data. Records with non-integer values are removed with a console warning.
 * @property {string} [endy_col='AENDY'] Study day of resolution; required in the data. Events with unusable stop days render as zero-length events at the start day.
 * @property {string} [term_col='AETERM'] Verbatim adverse-event term column; required in the data (AET-CFG-004). Records with blank terms are removed with a console warning.
 * @property {Object} [color] Event color stratification (AET-CFG-005): value_col (default 'AESEV'; required in the data, but remappable), label ('Severity/Intensity'), values (expected levels in legend order: MILD, MODERATE, SEVERE), and colors (assigned by domain position; N/A always renders gray).
 * @property {?Object} [highlight] Distinct marking for notable events (AET-CFG-007) — serious events by default: value_col ('AESER'), label ('Serious Event'), value ('Y', AET-CFG-008), detail_col (optional tooltip/listing detail, AET-CFG-009), and attributes ({ stroke, 'stroke-width' } mark style, AET-CFG-010). Pass null to disable highlighting.
 * @property {?Array<string|Object>} [filters=null] Filter controls (AET-CFG-011): column names or { value_col, label } specs. When null, defaults to serious event, severity, and participant identifier; filters whose column is absent or single-valued are dropped with a console warning.
 * @property {?Array<string|Object>} [details=null] Columns for the participant detail listing (AET-CFG-012). Custom columns append after the defaults (sequence, start/stop day, term, severity, seriousness), deduplicated by column.
 * @property {string} [sort_participants='earliest'] Initial participant order: 'earliest' (first adverse-event onset, earliest at the top) or 'alphabetical-descending' (the original's label for its alphabetical order).
 * @property {number} [row_height=15] Vertical pixels per participant row; the chart area grows with the participant count like the original's range band.
 * @property {number} [page_size=10] Rows per page in the participant detail listing.
 */

/**
 * Built-in defaults for every ae-timelines setting; syncSettings merges
 * caller overrides onto these.
 * @type {AETimelinesSettings}
 */
export const DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  seq_col: 'AESEQ',
  stdy_col: 'ASTDY',
  endy_col: 'AENDY',
  term_col: 'AETERM',
  color: {
    value_col: 'AESEV',
    label: 'Severity/Intensity',
    values: ['MILD', 'MODERATE', 'SEVERE'],
    colors: [
      '#66bd63', // mild
      '#fdae61', // moderate
      '#d73027', // severe
      '#377eb8',
      '#984ea3',
      '#ff7f00',
      '#a65628',
      '#f781bf'
    ]
  },
  highlight: {
    value_col: 'AESER',
    label: 'Serious Event',
    value: 'Y',
    detail_col: null,
    attributes: { stroke: 'black', 'stroke-width': 2 }
  },
  filters: null,
  details: null,
  sort_participants: 'earliest',
  row_height: 15,
  page_size: 10
};

/**
 * Participant sort orders offered by the Sort Participant IDs control; valid
 * values for the sort_participants setting.
 */
export const SORT_OPTIONS = ['earliest', 'alphabetical-descending'];

/**
 * Merge caller settings onto DEFAULT_SETTINGS and normalize them: the nested
 * color/highlight objects merge key-by-key (highlight: null disables
 * highlighting), filters default to serious event + severity + participant
 * identifier, details default from the other mappings with custom columns
 * appended (deduplicated by column), and unknown sort orders fall back to
 * the default.
 * @param {AETimelinesSettings} settings Caller overrides; pass {} for the defaults.
 * @returns {AETimelinesSettings} The merged, normalized settings.
 */
export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.color = { ...DEFAULT_SETTINGS.color, ...(settings.color || {}) };
  synced.highlight =
    settings.highlight === null
      ? null
      : {
          ...DEFAULT_SETTINGS.highlight,
          ...(settings.highlight || {}),
          attributes: {
            ...DEFAULT_SETTINGS.highlight.attributes,
            ...((settings.highlight || {}).attributes || {})
          }
        };

  const customFilters = arrayify(synced.filters)
    .map((value) => fieldSpec(value))
    .filter((filter) => filter.value_col);
  synced.filters = customFilters.length
    ? customFilters
    : [
        ...(synced.highlight
          ? [{ value_col: synced.highlight.value_col, label: synced.highlight.label }]
          : []),
        { value_col: synced.color.value_col, label: synced.color.label },
        { value_col: synced.id_col, label: 'Participant Identifier' }
      ];

  const defaultDetails = [
    { value_col: synced.seq_col, label: 'Sequence Number' },
    { value_col: synced.stdy_col, label: 'Start Day' },
    { value_col: synced.endy_col, label: 'Stop Day' },
    { value_col: synced.term_col, label: 'Reported Term' },
    { value_col: synced.color.value_col, label: synced.color.label },
    ...(synced.highlight
      ? [{ value_col: synced.highlight.value_col, label: synced.highlight.label }]
      : []),
    ...(synced.highlight && synced.highlight.detail_col
      ? [
          {
            value_col: synced.highlight.detail_col,
            label: `${synced.highlight.label} Details`
          }
        ]
      : []),
    ...synced.filters.filter((filter) => filter.value_col !== synced.id_col)
  ];
  const details = [...defaultDetails, ...arrayify(synced.details).map((value) => fieldSpec(value))];
  const seen = new Set();
  synced.details = details.filter((column) => {
    if (!column.value_col || seen.has(column.value_col)) return false;
    seen.add(column.value_col);
    return true;
  });

  if (!SORT_OPTIONS.includes(synced.sort_participants)) {
    synced.sort_participants = DEFAULT_SETTINGS.sort_participants;
  }
  return synced;
}
