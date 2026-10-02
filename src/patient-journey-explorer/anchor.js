// Anchor math, window membership and the four context queries for the
// patient-journey-explorer module (#142, design §4.3, §5.6, §5.7, D8, D16,
// D22). Pure: no DOM, no Chart.js, no Date.now() except the bundle's
// `generatedAt`, which the unit tests ignore.
//
// Everything here runs in ELAPSED-day space (D22). CDISC has no day 0, so a
// window of ±30 study days across first dose is 59 elapsed days and the
// tooltip's "days from anchor" disagrees with the calendar by one for every
// pre-treatment event. In elapsed space both disappear: `relativeDay(-5, 10)`
// is -14, matching the calendar exactly, and `windowBounds(10, 30)` spans 30
// elapsed days on each side by construction. anchor.test.js pins this with the
// all-pairs anti-drift assertion (PJE-ANCH-005).
//
// Anchoring never re-ranges the shared domain (PC-18): it changes the axis
// labels, the anchor rule and the highlight, and it produces the ContextBundle
// below — the "explainable substrate" of plan §6, delivered as data so a later
// AI layer never reads the DOM.
//
// Two honesty rules the queries carry (D8, D16): a con-med with no usable start
// is never asserted active (absence of a start cannot prove presence); a
// con-med whose end was never recorded IS counted active — excluding it would
// print "(0)" on the Definition-of-Done screen, which is differently wrong —
// but is counted separately so the panel can say so. A record whose recorded
// end PRECEDED its start is neither: it is a flagged data error that ends on
// its start day for membership, exactly as it is drawn (PJE-DATA-008).
//
// The four context queries run over the subject's WHOLE record (pre-filter,
// every lane), because the panel presents them as facts about the record —
// "con-meds active at the anchor", "prior events with this term" — and a
// display filter must not silently change them. Only `inWindow` is scoped to
// what is shown (design §4.3: the enabled lanes, post-filter).

import { toElapsed, toStudyDay } from './getScales.js';
import { isAbnormalByChange, isAbnormalByFlag, labBaseline } from './labs.js';
import { endBeforeStart } from './normalize.js';

// getScales.js needed the elapsed helpers first (the x scale is built over
// elapsed days) and cannot import this file; they are re-exported here so the
// anchor API is complete in one place.
export { toElapsed, toStudyDay };

/** The anchored axis title (PJE-ANCH-004): an offset count, the anchor at 0. */
export const ANCHOR_AXIS_TITLE = 'Days from anchor';

/** The six domains, for the per-domain honesty counters. */
const DOMAIN_CODES = ['AE', 'LB', 'EX', 'CM', 'MH', 'DS'];

/**
 * The context bundle a consumer receives on anchoring (design §4.3): the
 * anchor, the inclusive window, the four context lists, everything in the
 * window, counts that spare a consumer walking the arrays, and every honesty
 * counter — so the AI layer and the aria-live announcement never read the DOM
 * or re-derive what was left out.
 * @typedef {Object} ContextBundle
 * @property {string} subject The subject id.
 * @property {'day'|'date'} mode The display mode at build time.
 * @property {{id: string, domain: string, lane: string, label: string, day: number, date: ?string, source: Object, sourceIndex: number, sourceAnchorId: string}} anchor The anchored event, reduced to its identity.
 * @property {{days: number, elapsedStart: number, elapsedEnd: number, startDay: number, endDay: number}} window The inclusive window: `days` the configured half-width, the elapsed bounds, and the study-day labels the same bounds carry.
 * @property {import('./normalize.js').EventRecord[]} conMeds Con-meds active at the anchor day (see `notEvaluated.conMedsEndUnrecorded`).
 * @property {import('./normalize.js').EventRecord[]} conMedsLater Con-meds starting inside the window but after the anchor day.
 * @property {import('./normalize.js').EventRecord[]} abnormalLabs Abnormal labs in the window, each a copy with `flags.abnormalReason` set to `'flag'`, `'change'` or `'both'`.
 * @property {import('./normalize.js').EventRecord[]} doseChanges Dose changes in the window.
 * @property {import('./normalize.js').EventRecord[]} priorEvents Earlier or same-day adverse events with the anchor's preferred term, over the whole record, most recent first (a same-day record with a smaller source index counts as prior, design §5.7).
 * @property {import('./normalize.js').EventRecord[]} inWindow Everything in the window across the enabled lanes (post-filter), in lane order then day order.
 * @property {{conMeds: number, conMedsLater: number, abnormalLabs: number, doseChanges: number, priorEvents: number, inWindow: number}} counts The length of each list above.
 * @property {{conMedsWithoutStart: number, conMedsEndUnrecorded: number, aeEndUnrecorded: number, unplaceableByDomain: Object<string, number>, truncatedByLane: Object<string, number>}} notEvaluated The honesty counters: con-meds with no start (not asserted active), con-meds counted active whose end was never recorded, adverse events in the window whose end is neither recorded nor ongoing, records kept but not drawn per domain, and rows kept but not drawn per lane (row cap).
 * @property {string} generatedAt ISO timestamp of the build.
 */

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const list = (value) =>
  Array.isArray(value) ? value.filter((e) => e && typeof e === 'object') : [];
const usableBounds = (bounds) =>
  bounds && typeof bounds === 'object' && finite(bounds.elapsedStart) && finite(bounds.elapsedEnd);
const upper = (value) =>
  value === null || value === undefined ? '' : String(value).trim().toUpperCase();

/**
 * Deterministic order for a context list: start day ascending (nulls last),
 * then label, then sourceIndex.
 * @private
 */
function byStartThenLabel(a, b) {
  const da = finite(a.start) ? a.start : Infinity;
  const db = finite(b.start) ? b.start : Infinity;
  if (da !== db) return da - db;
  const la = String(a.label ?? '');
  const lb = String(b.label ?? '');
  if (la !== lb) return la < lb ? -1 : 1;
  return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
}

/**
 * Days from the anchor, measured in elapsed space (D22). Null in, null out.
 * @param {*} day A study day.
 * @param {*} anchorDay The anchor's study day.
 * @returns {?number} The signed elapsed offset, or null when either day is unusable.
 */
export function relativeDay(day, anchorDay) {
  const e = toElapsed(day);
  const a = toElapsed(anchorDay);
  if (e === null || a === null) return null;
  return e - a;
}

/**
 * Inclusive window bounds in elapsed space, with the study-day labels the same
 * bounds carry: `days` elapsed days on each side of the anchor.
 * @param {*} anchorDay The anchor's study day.
 * @param {*} days The half-width in elapsed days (coerced to a non-negative integer).
 * @returns {?{elapsedStart: number, elapsedEnd: number, startDay: number, endDay: number}} The bounds, or null for an unusable anchor day or a non-finite width.
 */
export function windowBounds(anchorDay, days) {
  const e0 = toElapsed(anchorDay);
  const n = Number(days);
  if (e0 === null || !Number.isFinite(n)) return null;
  const width = Math.max(0, Math.floor(n));
  const elapsedStart = e0 - width;
  const elapsedEnd = e0 + width;
  return {
    elapsedStart,
    elapsedEnd,
    startDay: toStudyDay(elapsedStart),
    endDay: toStudyDay(elapsedEnd)
  };
}

/**
 * The elapsed end of an interval for membership: a closed end, else +Infinity.
 * Both `ongoing` and `unrecorded` run to infinity — the difference between
 * them is how they are labelled and counted, not whether they are candidates.
 * A record whose end preceded its start ends on its start day (PJE-DATA-008):
 * the single-day mark it is drawn as, never an open interval.
 * @private
 */
function elapsedEnd(event) {
  if (event.endState === 'closed' && finite(event.end)) {
    const e = toElapsed(event.end);
    return e === null ? toElapsed(event.start) : e;
  }
  if (endBeforeStart(event)) return toElapsed(event.start);
  return Infinity;
}

/**
 * Whether an event's end is genuinely unrecorded — blank, with nothing
 * asserting continuation — as opposed to recorded but invalid.
 * @private
 */
const endUnrecorded = (event) => event.endState === 'unrecorded' && !endBeforeStart(event);

/**
 * Window membership in elapsed space: intervals match by overlap, points and
 * rules by containment, both inclusive. An unplaceable event never matches. A
 * left-clamped con-med uses its TRUE start — clamping is a drawing concern.
 * @param {Object} event An EventRecord.
 * @param {?{elapsedStart: number, elapsedEnd: number}} bounds The window bounds (windowBounds).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} [settings] The synced settings (accepted for symmetry; membership needs none).
 * @returns {boolean} True when the event is in the window.
 */
// eslint-disable-next-line no-unused-vars
export function inWindow(event, bounds, settings) {
  if (!event || typeof event !== 'object' || event.placeable === false) return false;
  if (!usableBounds(bounds)) return false;
  if (event.kind === 'interval') {
    const startE = toElapsed(event.start);
    if (startE === null) return false;
    return startE <= bounds.elapsedEnd && elapsedEnd(event) >= bounds.elapsedStart;
  }
  const dayE = toElapsed(event.day);
  if (dayE === null) return false;
  return dayE >= bounds.elapsedStart && dayE <= bounds.elapsedEnd;
}

/**
 * Con-meds active at a day: started on or before it and not ended before it,
 * in elapsed space. A con-med with no usable start is NOT included (absence of
 * a start cannot prove presence, D8) and is counted in `withoutStart`; one
 * whose end was never recorded IS included and counted in `endUnrecorded` so
 * the panel can say so (D16). The list is ordered by start, then name.
 * @param {Object[]} cmEvents The subject's con-med EventRecords.
 * @param {*} day The study day to evaluate at (the anchor's start).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} [settings] The synced settings (accepted for symmetry).
 * @returns {{active: Object[], withoutStart: number, endUnrecorded: number}} The active con-meds and the two honesty counters.
 */
// eslint-disable-next-line no-unused-vars
export function conMedsActiveAt(cmEvents, day, settings) {
  const dayE = toElapsed(day);
  const events = list(cmEvents);
  if (dayE === null) return { active: [], withoutStart: 0, endUnrecorded: 0 };
  let withoutStart = 0;
  const active = [];
  for (const event of events) {
    const startE = event.placeable === false ? null : toElapsed(event.start);
    if (startE === null) {
      withoutStart += 1;
      continue;
    }
    if (startE <= dayE && elapsedEnd(event) >= dayE) active.push(event);
  }
  active.sort(byStartThenLabel);
  return { active, withoutStart, endUnrecorded: active.filter(endUnrecorded).length };
}

/**
 * Con-meds starting inside the window but AFTER the anchor day — the visible
 * treatment response the "active at" list would otherwise lose.
 * @param {Object[]} cmEvents The subject's con-med EventRecords.
 * @param {?Object} bounds The window bounds (windowBounds).
 * @param {*} anchorDay The anchor's study day.
 * @returns {Object[]} The later-starting con-meds, by start then name.
 */
export function conMedsStartingLater(cmEvents, bounds, anchorDay) {
  const anchorE = toElapsed(anchorDay);
  if (!usableBounds(bounds) || anchorE === null) return [];
  return list(cmEvents)
    .filter((event) => {
      if (event.placeable === false) return false;
      const startE = toElapsed(event.start);
      return startE !== null && startE > anchorE && startE <= bounds.elapsedEnd;
    })
    .sort(byStartThenLabel);
}

/**
 * Abnormal labs inside the window: in-window placeable points where the flag
 * rule or the change rule fires, each returned as a COPY with
 * `flags.abnormalReason` set to `'flag'`, `'change'` or `'both'`, sorted by
 * day then test name. Baselines are computed per test over `baselineEvents`
 * when given (the whole record, so a filter cannot remove the baseline point)
 * and over `labEvents` otherwise — never over the window.
 * @param {Object[]} labEvents The subject's lab EventRecords (post-filter).
 * @param {?Object} bounds The window bounds (windowBounds).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{baselineEvents?: Object[]}} [options] `baselineEvents`: the records baselines are resolved over.
 * @returns {Object[]} The abnormal in-window points, as copies.
 */
export function abnormalLabsInWindow(labEvents, bounds, settings, { baselineEvents } = {}) {
  const events = list(labEvents);
  if (!usableBounds(bounds) || !events.length) return [];
  const pool = Array.isArray(baselineEvents) ? list(baselineEvents) : events;
  const baselines = new Map();
  const baselineFor = (test) => {
    if (!baselines.has(test)) {
      baselines.set(
        test,
        labBaseline(
          pool.filter((event) => event.test === test),
          settings
        )
      );
    }
    return baselines.get(test);
  };
  return events
    .filter((event) => inWindow(event, bounds, settings))
    .map((event) => {
      const flag = isAbnormalByFlag(event, settings);
      const change = isAbnormalByChange(event, baselineFor(event.test), settings);
      if (!flag && !change) return null;
      const abnormalReason = flag && change ? 'both' : flag ? 'flag' : 'change';
      return { ...event, flags: { ...event.flags, abnormalReason } };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.day - b.day ||
        String(a.test ?? '').localeCompare(String(b.test ?? '')) ||
        a.sourceIndex - b.sourceIndex
    );
}

/**
 * Dose-change events inside the window (point containment, inclusive).
 * @param {Object[]} doseEvents The subject's derived dose-change EventRecords.
 * @param {?Object} bounds The window bounds (windowBounds).
 * @returns {Object[]} The in-window changes, chronological.
 */
export function doseChangesInWindow(doseEvents, bounds) {
  if (!usableBounds(bounds)) return [];
  return list(doseEvents)
    .filter((event) => inWindow(event, bounds))
    .sort((a, b) => a.day - b.day || a.sourceIndex - b.sourceIndex);
}

/**
 * The preferred-term key of an adverse event: `ae_decod_col`, falling back
 * to `ae_term_col`, trimmed and upper-cased.
 * @private
 */
function termKey(event, settings) {
  const source = event?.source && typeof event.source === 'object' ? event.source : {};
  const decod = upper(source[settings?.ae_decod_col]);
  return decod || upper(source[settings?.ae_term_col]);
}

/**
 * Prior adverse events sharing the anchor's preferred term (falling back to
 * the verbatim term), over the WHOLE record — recurrence history is the point,
 * so this is not window-limited. Prior means an earlier start, or the same
 * start with a smaller sourceIndex. Most recent first.
 * @param {Object[]} aeEvents The subject's adverse-event EventRecords.
 * @param {?Object} anchorEvent The anchored event.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {Object[]} The prior same-term events, start descending.
 */
export function priorSameTerm(aeEvents, anchorEvent, settings) {
  if (!anchorEvent || typeof anchorEvent !== 'object' || !finite(anchorEvent.start)) return [];
  const key = termKey(anchorEvent, settings);
  if (!key) return [];
  return list(aeEvents)
    .filter((event) => {
      if (event.id === anchorEvent.id || event.placeable === false || !finite(event.start))
        return false;
      if (termKey(event, settings) !== key) return false;
      return (
        event.start < anchorEvent.start ||
        (event.start === anchorEvent.start && event.sourceIndex < anchorEvent.sourceIndex)
      );
    })
    .sort((a, b) => b.start - a.start || b.sourceIndex - a.sourceIndex);
}

/**
 * Build the ContextBundle for an anchor (design §4.3): the four queries over
 * the subject's WHOLE record (`allEvents`, pre-filter, every lane — a display
 * filter or a lane toggle never changes what the panel presents as a fact
 * about the record), everything in the window across the enabled lanes
 * (`events`, post-filter), the counts and every honesty counter. Returns null
 * when there is no anchor, the anchor is unplaceable, or there is nothing
 * structured.
 * @param {Object} structured The structureData result (needs `subject`, `events`, `allEvents`; reads `byLane` as a fallback when `allEvents` is absent, and `mode`, `unplaceableCounts`, `truncatedByLane` when present).
 * @param {?Object} anchorEvent The anchored EventRecord.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {?ContextBundle} The bundle, or null.
 */
export function buildContext(structured, anchorEvent, settings) {
  if (!structured || typeof structured !== 'object') return null;
  if (!anchorEvent || typeof anchorEvent !== 'object' || anchorEvent.placeable === false)
    return null;
  const days = Number(settings?.context_window_days);
  const width = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30;
  const bounds = windowBounds(anchorEvent.day, width);
  if (!bounds) return null;
  const byLane =
    structured.byLane && typeof structured.byLane === 'object' ? structured.byLane : {};
  const allEvents = list(structured.allEvents);
  // The whole record, split by lane. A lab for a test outside `lb_tests` is in
  // the record (counted, in the drawer) but is not part of the labs lane's
  // series, so it is not a candidate for the abnormal-labs query either.
  const record = (lane) =>
    allEvents.length
      ? allEvents.filter((event) => event.lane === lane && !event.flags?.unconfiguredTest)
      : list(byLane[lane]);
  const labPool = record('labs');

  const active = conMedsActiveAt(record('conMeds'), anchorEvent.day, settings);
  const conMedsLater = conMedsStartingLater(record('conMeds'), bounds, anchorEvent.day);
  const abnormalLabs = abnormalLabsInWindow(labPool, bounds, settings, {
    baselineEvents: labPool.length ? labPool : undefined
  });
  const doseChanges = doseChangesInWindow(record('doseChanges'), bounds);
  const priorEvents = priorSameTerm(record('adverseEvents'), anchorEvent, settings);
  const inWindowEvents = list(structured.events).filter((event) =>
    inWindow(event, bounds, settings)
  );
  const aeEndUnrecorded = inWindowEvents.filter(
    (event) => event.domain === 'AE' && endUnrecorded(event)
  ).length;

  const unplaceableByDomain = {};
  for (const domain of DOMAIN_CODES) {
    unplaceableByDomain[domain] = Number(structured.unplaceableCounts?.byDomain?.[domain]) || 0;
  }
  const truncatedByLane = {};
  for (const [lane, count] of Object.entries(structured.truncatedByLane || {})) {
    truncatedByLane[lane] = Number(count) || 0;
  }

  return {
    subject: structured.subject ?? anchorEvent.subject ?? null,
    mode: (structured.mode ?? settings?.time?.mode) === 'date' ? 'date' : 'day',
    anchor: {
      id: anchorEvent.id,
      domain: anchorEvent.domain,
      lane: anchorEvent.lane,
      label: anchorEvent.label,
      day: anchorEvent.day,
      date: anchorEvent.date ?? null,
      source: anchorEvent.source,
      sourceIndex: anchorEvent.sourceIndex,
      sourceAnchorId: anchorEvent.sourceAnchorId
    },
    window: { days: width, ...bounds },
    conMeds: active.active,
    conMedsLater,
    abnormalLabs,
    doseChanges,
    priorEvents,
    inWindow: inWindowEvents,
    counts: {
      conMeds: active.active.length,
      conMedsLater: conMedsLater.length,
      abnormalLabs: abnormalLabs.length,
      doseChanges: doseChanges.length,
      priorEvents: priorEvents.length,
      inWindow: inWindowEvents.length
    },
    notEvaluated: {
      conMedsWithoutStart: active.withoutStart,
      conMedsEndUnrecorded: active.endUnrecorded,
      aeEndUnrecorded,
      unplaceableByDomain,
      truncatedByLane
    },
    generatedAt: new Date().toISOString()
  };
}
