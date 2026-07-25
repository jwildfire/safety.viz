// The adverse-event domain for the participant-profile module (obot.roadmap#75,
// design decisions D5/D6/D7). v1 read one domain — long-format labs; v2 adds a
// second so a participant's story is readable in one pass: an AE summary block
// and an AE timeline drawn on the same study-day axis as the labs chart.
//
// The contract deliberately reuses the setting names ae-timelines and
// ae-explorer already ship (id_col, term_col, minor_col/major_col, stdy_col,
// endy_col, color.*, highlight.*) rather than inventing a third vocabulary for
// the same records, so a host that already feeds one of those renderers can
// feed the profile the same mapping (design §6).
//
// This file is data only — cleaning, per-participant selection, the summary
// reduction, the shared domain and the bar/tick geometry. Rendering lives in
// aeTracks.js so the geometry stays unit-testable without a canvas.
//
// Requirement groups: PPRF-AE-* (contract + cleaning), PPRF-AESUM-* (summary),
// PPRF-AETL-* (timeline), PPRF-AXIS-* (shared domain).

/** Severity for a record whose severity value is absent or unmapped. */
const NOT_RECORDED = { key: null, label: 'Not recorded', rank: 0 };

/** Minimum bar width, as a percentage of the domain, so a same-day event shows. */
const MIN_BAR_PERCENT = 0.8;

/**
 * The AE mapping and display settings.
 * @typedef {Object} AeSettings
 * @property {string} [id_col='USUBJID'] Participant identifier; joins events to the profiled participant.
 * @property {string} [term_col='AETERM'] Verbatim term column, kept for the tooltip.
 * @property {?string} [minor_col='AEDECOD'] Preferred-term column; the row label when present.
 * @property {?string} [major_col='AEBODSYS'] Body-system column; the summary rollup.
 * @property {string} [stdy_col='ASTDY'] Study day of onset; the bar's left edge.
 * @property {string} [endy_col='AENDY'] Study day of resolution; blank means no end date recorded.
 * @property {Object} [color] Severity scale: value_col, values (ascending severity), optional labels.
 * @property {?Object} [highlight] Serious marking: value_col, value, label; null disables it.
 * @property {number} [max_rows=10] Timeline rows drawn before the remainder is counted instead.
 */

/** Built-in defaults; syncAeSettings merges caller overrides onto these. */
export const AE_DEFAULT_SETTINGS = {
  id_col: 'USUBJID',
  term_col: 'AETERM',
  minor_col: 'AEDECOD',
  major_col: 'AEBODSYS',
  stdy_col: 'ASTDY',
  endy_col: 'AENDY',
  color: {
    value_col: 'AESEV',
    values: ['MILD', 'MODERATE', 'SEVERE'],
    labels: null
  },
  highlight: {
    value_col: 'AESER',
    value: 'Y',
    label: 'Serious'
  },
  max_rows: 10
};

/**
 * Severity colours, worst-last, from the reserved status ramp — severity is a
 * state, not a series, so it never takes a categorical slot (design §4.2). A
 * scale longer than the ramp cycles from the mild end; the label always travels
 * with the colour so severity is never carried by hue alone.
 */
export const SEVERITY_COLORS = ['#fab219', '#ec835a', '#d03b3b'];
export const NOT_RECORDED_COLOR = '#c3c2b7';

/**
 * Title-case a severity value for its default label ("MODERATE" → "Moderate"),
 * leaving values that are not plain words (grades, codes) alone.
 * @param {string} value The configured severity value.
 * @returns {string} The display label.
 * @private
 */
function defaultLabel(value) {
  const text = String(value);
  if (!/^[A-Za-z][A-Za-z\s-]*$/.test(text)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Merge caller AE settings onto the defaults and normalize them (PPRF-AE-001):
 * `color` and `highlight` deep-merge key by key so a partial override still
 * back-fills, severity labels default from the values, and `highlight: null`
 * disables serious marking outright.
 * @param {AeSettings} [settings={}] Caller overrides.
 * @returns {AeSettings} The merged, normalized AE settings.
 */
export function syncAeSettings(settings = {}) {
  const synced = { ...AE_DEFAULT_SETTINGS, ...settings };

  const color = { ...AE_DEFAULT_SETTINGS.color, ...(settings.color || {}) };
  color.values = (Array.isArray(color.values) ? color.values : []).map(String);
  if (!color.values.length) color.values = [...AE_DEFAULT_SETTINGS.color.values];
  const labels = Array.isArray(color.labels) ? color.labels.map(String) : null;
  color.labels = color.values.map((value, index) =>
    labels && labels[index] !== undefined ? labels[index] : defaultLabel(value)
  );
  synced.color = color;

  synced.highlight =
    settings.highlight === null
      ? null
      : { ...AE_DEFAULT_SETTINGS.highlight, ...(settings.highlight || {}) };

  const rows = Number(synced.max_rows);
  synced.max_rows = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : AE_DEFAULT_SETTINGS.max_rows;

  return synced;
}

/**
 * The severity descriptor for one record: key, display label, one-based rank
 * within the configured scale, and the ramp colour. Values outside the scale
 * fall to "Not recorded" rather than borrowing a rank (PPRF-AE-002).
 * @param {Object} record A raw AE record.
 * @param {AeSettings} settings Normalized AE settings.
 * @returns {{key: ?string, label: string, rank: number, color: string}} The severity descriptor.
 */
export function severityOf(record, settings) {
  const raw = record[settings.color.value_col];
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  const index = settings.color.values.findIndex(
    (level) => level.toUpperCase() === value.toUpperCase()
  );
  if (value === '' || index < 0) return { ...NOT_RECORDED, color: NOT_RECORDED_COLOR };
  const scale = settings.color.values.length;
  // Map the scale onto the three-step status ramp so a 4- or 5-level grade
  // scale still reads mild → severe rather than running out of colours.
  const step = scale <= SEVERITY_COLORS.length
    ? SEVERITY_COLORS.length - scale + index
    : Math.round((index / (scale - 1)) * (SEVERITY_COLORS.length - 1));
  return {
    key: settings.color.values[index],
    label: settings.color.labels[index],
    rank: index + 1,
    color: SEVERITY_COLORS[Math.max(0, Math.min(SEVERITY_COLORS.length - 1, step))]
  };
}

/**
 * Read a study day, returning null for anything not finite.
 * @param {*} value The raw cell.
 * @returns {?number} The day, or null.
 * @private
 */
function day(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Clean raw adverse-event records once per setData (PPRF-AE-002), tagging each
 * survivor with the derived columns the tracks read. The rules are explicit
 * because clinical data arrives dirty:
 *
 * - no participant id → dropped, and counted for the removed-records note;
 * - a blank stop day, or a stop day before the start, → open-ended (`__ae_open`),
 *   never a zero-length event and never silently repaired;
 * - a non-numeric start day → retained but `__ae_placeable: false`, listed under
 *   the timeline rather than dropped;
 * - a severity outside the configured scale → "Not recorded", not a colour slot.
 *
 * @param {Object[]} rawData The raw adverse-event records.
 * @param {AeSettings} settings Normalized AE settings.
 * @returns {{events: Object[], removed: number}} Cleaned events and the drop count.
 */
export function cleanAeRecords(rawData, settings) {
  const events = [];
  let removed = 0;
  (Array.isArray(rawData) ? rawData : []).forEach((record, index) => {
    const id = record[settings.id_col];
    if (id === undefined || id === null || String(id).trim() === '') {
      removed += 1;
      return;
    }
    const verbatim = settings.term_col ? record[settings.term_col] : '';
    const preferred = settings.minor_col ? record[settings.minor_col] : '';
    const label = String(preferred || verbatim || '').trim();
    const start = day(record[settings.stdy_col]);
    const rawEnd = day(record[settings.endy_col]);
    const end = start !== null && rawEnd !== null && rawEnd >= start ? rawEnd : null;
    const serious = settings.highlight
      ? String(record[settings.highlight.value_col] ?? '').trim().toUpperCase() ===
        String(settings.highlight.value).toUpperCase()
      : false;
    events.push({
      ...record,
      __ae_id: String(id),
      __ae_index: index,
      __ae_term: label.toLowerCase(),
      __ae_verbatim: verbatim === undefined || verbatim === null ? '' : String(verbatim),
      __ae_soc: settings.major_col ? String(record[settings.major_col] ?? '').trim() : '',
      __ae_severity: severityOf(record, settings),
      __ae_serious: serious,
      __ae_start: start,
      __ae_end: end,
      __ae_open: end === null,
      __ae_placeable: start !== null
    });
  });
  return { events, removed };
}

/**
 * One participant's events, ordered the way they are read (PPRF-AE-003):
 * severity descending, then onset ascending, with unplaceable events last so
 * the plotted rows stay contiguous.
 * @param {Object[]} events Cleaned events.
 * @param {string|number} id The profiled participant id.
 * @returns {Object[]} The participant's events, worst-first.
 */
export function participantEvents(events, id) {
  const key = String(id);
  return (Array.isArray(events) ? events : [])
    .filter((event) => event.__ae_id === key)
    .sort((a, b) => {
      if (a.__ae_placeable !== b.__ae_placeable) return a.__ae_placeable ? -1 : 1;
      if (b.__ae_severity.rank !== a.__ae_severity.rank)
        return b.__ae_severity.rank - a.__ae_severity.rank;
      const sa = a.__ae_start === null ? Number.MAX_SAFE_INTEGER : a.__ae_start;
      const sb = b.__ae_start === null ? Number.MAX_SAFE_INTEGER : b.__ae_start;
      return sa - sb || a.__ae_index - b.__ae_index;
    });
}

/**
 * The AE summary reduction (PPRF-AESUM-001): the four headline figures, the
 * severity mix worst-first, and the body-system rollup. Deliberately not a
 * chart — at one participant's scale the counts are single digits (design §4.2).
 * @param {Object[]} events One participant's cleaned events.
 * @param {AeSettings} settings Normalized AE settings.
 * @returns {{total: number, serious: number, openEnded: number, worst: Object, mix: Object[], bodySystems: Object[]}} The summary.
 */
export function summarizeAe(events, settings) {
  const list = Array.isArray(events) ? events : [];
  const worst = list.reduce(
    (acc, event) => (event.__ae_severity.rank > acc.rank ? event.__ae_severity : acc),
    { ...NOT_RECORDED, color: NOT_RECORDED_COLOR }
  );

  const levels = settings.color.values
    .map((value, index) => ({
      key: value,
      label: settings.color.labels[index],
      rank: index + 1
    }))
    .reverse()
    .concat([{ key: null, label: NOT_RECORDED.label, rank: 0 }]);

  const mix = levels
    .map((level) => ({
      ...level,
      color:
        level.rank === 0
          ? NOT_RECORDED_COLOR
          : (list.find((event) => event.__ae_severity.rank === level.rank) || {}).__ae_severity
              ?.color || NOT_RECORDED_COLOR,
      count: list.filter((event) => event.__ae_severity.rank === level.rank).length
    }))
    .filter((entry) => entry.count > 0);

  const counts = new Map();
  list.forEach((event) => {
    const name = event.__ae_soc || 'Not recorded';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const bodySystems = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    total: list.length,
    serious: list.filter((event) => event.__ae_serious).length,
    openEnded: list.filter((event) => event.__ae_open).length,
    worst,
    mix,
    bodySystems
  };
}

/**
 * The day span the placeable events occupy (PPRF-AXIS-001). Open-ended events
 * contribute their onset only — the profile does not guess when they resolved.
 * @param {Object[]} events One participant's cleaned events.
 * @returns {?number[]} [min, max], or null when nothing is placeable.
 */
export function aeDomain(events) {
  const placeable = (Array.isArray(events) ? events : []).filter((event) => event.__ae_placeable);
  if (!placeable.length) return null;
  const days = [];
  placeable.forEach((event) => {
    days.push(event.__ae_start);
    if (event.__ae_end !== null) days.push(event.__ae_end);
  });
  return [Math.min(...days), Math.max(...days)];
}

/**
 * Union two day domains so labs and adverse events rescale together (design
 * decision D7): an event running past the last lab draw stays visible instead
 * of clipping at a cap. A zero-width result is padded by a day either side so a
 * single-day participant still plots.
 * @param {?number[]} labs The lab domain, or null.
 * @param {?number[]} aes The AE domain, or null.
 * @returns {?number[]} The union domain, or null when neither exists.
 */
export function unionDomain(labs, aes) {
  const parts = [labs, aes].filter(
    (domain) => Array.isArray(domain) && domain.length === 2 && domain.every(Number.isFinite)
  );
  if (!parts.length) return null;
  const min = Math.min(...parts.map((domain) => domain[0]));
  const max = Math.max(...parts.map((domain) => domain[1]));
  return min === max ? [min - 1, max + 1] : [min, max];
}

/**
 * Bar geometry for the timeline, as percentages of the shared domain
 * (PPRF-AETL-001) — percentages rather than pixels so the placement is a pure
 * function the unit suite can pin, and so the bars follow the plot area on
 * resize with no measurement. Open-ended events run to the domain end; an event
 * extending past the domain clamps and is flagged.
 * @param {Object[]} events The events to place, in row order.
 * @param {?number[]} domain The shared [min, max] day domain.
 * @returns {Array<?{left: number, width: number, open: boolean, clipped: boolean}>} One entry per event; null where the event cannot be placed.
 */
export function timelineGeometry(events, domain) {
  if (!Array.isArray(domain) || domain.length !== 2) return (events || []).map(() => null);
  const [min, max] = domain;
  const span = max - min || 1;
  const percent = (value) => ((value - min) / span) * 100;
  return (Array.isArray(events) ? events : []).map((event) => {
    if (!event || !event.__ae_placeable) return null;
    const end = event.__ae_end === null ? max : event.__ae_end;
    const rawLeft = percent(event.__ae_start);
    const rawRight = percent(end);
    const left = Math.max(0, Math.min(100, rawLeft));
    const right = Math.max(0, Math.min(100, rawRight));
    return {
      left,
      width: Math.max(MIN_BAR_PERCENT, right - left),
      open: event.__ae_open,
      clipped: rawRight > 100 + 1e-9 || rawLeft < -1e-9
    };
  });
}

/** Candidate tick steps, in study days, coarsest chosen that keeps ~4–8 ticks. */
const TICK_STEPS = [1, 2, 5, 7, 10, 14, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Tick values and their percentage positions for the ruler under the timeline
 * (PPRF-AETL-002). Round day values, never more than eight, always at least
 * two for a real domain.
 * @param {?number[]} domain The shared [min, max] day domain.
 * @param {number} [target=6] Preferred tick count.
 * @returns {Array<{value: number, position: number}>} The ticks.
 */
export function axisTicks(domain, target = 6) {
  if (!Array.isArray(domain) || domain.length !== 2) return [];
  const [min, max] = domain;
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [];
  const step =
    TICK_STEPS.find((candidate) => span / candidate <= target) || TICK_STEPS[TICK_STEPS.length - 1];
  const first = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = first; value <= max + 1e-9; value += step) {
    ticks.push({ value, position: ((value - min) / span) * 100 });
  }
  return ticks;
}
