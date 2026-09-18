// Subject index, per-subject lane assembly, dose-change derivation, the
// shared elapsed-day domain, filters, and the unplaceable / dropped / flagged
// accounting for the patient-journey-explorer module (#142, design §5.4,
// §5.5, D10, D15, D18, PC-17). Pure.
//
// `structureData` is the one call the orchestrator makes per render: it
// normalizes every domain (all subjects, so the dropped and flagged counts are
// study-wide — a dropped row may have no usable id and so belong to no
// subject), resolves each subject's reference date, assembles the selected
// subject's record, derives dose changes, fixes the shared domain, applies the
// filters, and sorts every lane by its documented rule so the row cap
// truncates a deterministic tail and the footer can name the rule (PC-17).
//
// Three axis rules live here (D10, D18): a con-med whose start is more than
// PRE_STUDY_CLAMP days before every other domain's minimum does not extend the
// domain — its bar is clipped at the domain edge and flagged `clippedStart` —
// because one 1986 con-med otherwise compresses the whole journey into three
// pixels; the same clamp applies to medical history only under
// `mh_day_source: 'onset'`; and the minimum is held at or below study day -14
// so pre-treatment context is visible while the study period dominates.
// Filters and lane toggles never move the domain (PJE-LANE-002): it is fixed
// over the subject's whole placeable record.

import { arrayify } from '../histogram/configure.js';
import { filterMatches } from '../filters.js';
import { LANE_KEYS } from './configure.js';
import {
  DOMAINS,
  DROP_DOMAIN_COLUMN,
  DROP_REASON_COLUMN,
  LANE_BY_DOMAIN,
  normalizeDomain
} from './normalize.js';
import { referenceDate, resolveEventDate, toElapsed, toStudyDay } from './getScales.js';
import { buildLabSeries, isAbnormalByFlag, labTestOrder, matchesConfiguredTest } from './labs.js';

/** Days before every other domain's minimum beyond which a con-med start is clamped, not honoured (D10). */
export const PRE_STUDY_CLAMP = 60;

/** The study-day floor of the shared domain: pre-treatment context is always visible to here. */
const DOMAIN_MIN_DAY = -14;

/** Lanes whose rows are subject to `max_rows_per_lane`; the single-row lanes never truncate. */
const CAPPED_LANES = ['exposure', 'adverseEvents', 'labs', 'conMeds'];

/** The footer prose naming each lane's order when it truncates (PC-17). */
export const LANE_SORT_RULES = {
  exposure: 'sorted by treatment name',
  doseChanges: '',
  adverseEvents: 'sorted by severity, then onset',
  labs: 'in the configured test order',
  conMeds: 'sorted by start day, then name',
  medicalHistory: '',
  disposition: ''
};

const DOMAIN_BY_LANE = Object.fromEntries(
  Object.entries(LANE_BY_DOMAIN).map(([domain, lane]) => [lane, domain])
);
DOMAIN_BY_LANE.doseChanges = 'EX';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && (value.trim() === '' || /^na$/i.test(value.trim())));
const text = (value) => (isBlank(value) ? '' : String(value).trim());
const upper = (value) => text(value).toUpperCase();
const compareText = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const dayOrNull = (event) => (event.placeable === false ? null : event.day);
const nullsLast = (a, b) => {
  const da = finite(a) ? a : Infinity;
  const db = finite(b) ? b : Infinity;
  return da - db;
};
const emptyByDomain = () => Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));
const emptyByLane = () => Object.fromEntries(LANE_KEYS.map((lane) => [lane, 0]));
const rowCopy = (row, reason, domain) => ({
  ...(row && typeof row === 'object' ? row : {}),
  [DROP_REASON_COLUMN]: reason,
  [DROP_DOMAIN_COLUMN]: domain
});

/**
 * Every participant id present in any domain, trimmed, de-duplicated and
 * sorted ascending (PJE-SUBJ-001). Blank and `NA` cells are not subjects.
 * @param {Object<string, Object[]>} domains The per-domain raw rows (normalizeInput).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {string[]} The sorted subject ids.
 */
export function subjectIndex(domains, settings) {
  const idCol = settings?.id_col ?? 'USUBJID';
  const ids = new Set();
  for (const rows of Object.values(domains || {})) {
    for (const row of arrayify(rows)) {
      const id = row && typeof row === 'object' ? text(row[idCol]) : '';
      if (id) ids.add(id);
    }
  }
  return [...ids].sort();
}

/**
 * Derive dose-change events from consecutive exposure records for one subject
 * (design §5.5): placeable records with a finite dose, in start order, emit a
 * change wherever the dose differs from the previous record's, dated to the
 * day the NEW dose begins. A gap at the same dose is not a change — the module
 * reports dose changes, not exposure gaps.
 * @param {Object[]} exEvents The subject's exposure EventRecords (any order).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} [settings] The synced settings (accepted for symmetry).
 * @returns {Object[]} The dose-change point events, chronological.
 */
// eslint-disable-next-line no-unused-vars
export function deriveDoseChanges(exEvents, settings) {
  const candidates = arrayify(exEvents)
    .filter(
      (event) =>
        event &&
        typeof event === 'object' &&
        event.placeable !== false &&
        finite(event.start) &&
        finite(event.value)
    )
    .sort((a, b) => a.start - b.start || a.sourceIndex - b.sourceIndex);
  const changes = [];
  for (let i = 1; i < candidates.length; i += 1) {
    const prev = candidates[i - 1];
    const next = candidates[i];
    const from = Number(prev.value);
    const to = Number(next.value);
    if (from === to) continue;
    let direction = null;
    if (to > from && from > 0) direction = 'increase';
    else if (to < from && to > 0) direction = 'reduction';
    else if (to === 0 && from > 0) direction = 'interruption';
    else if (from === 0 && to > 0) direction = 'restart';
    const unit = next.unit || prev.unit || '';
    changes.push({
      id: `DOSE-${next.sourceIndex}`,
      domain: 'EX',
      lane: 'doseChanges',
      subject: next.subject,
      kind: 'point',
      start: next.start,
      end: null,
      endState: 'closed',
      open: false,
      day: next.start,
      placeable: true,
      clippedStart: false,
      dayCol: next.dayCol,
      date: next.date ?? null,
      endDate: null,
      rawDate: next.rawDate || '',
      dateConflict: Boolean(next.dateConflict),
      refDate: next.refDate ?? null,
      label: `${from} → ${to}${unit ? ` ${unit}` : ''}`,
      detail: direction || '',
      category: next.category || '',
      value: to,
      unit,
      outcome: '',
      test: null,
      testCode: null,
      lln: null,
      uln: null,
      flags: {
        severity: null,
        serious: false,
        related: '',
        abnormal: '',
        abnormalReason: '',
        derived: true,
        direction
      },
      flagged: [],
      previousValue: from,
      previousSource: prev.source,
      previousSourceIndex: prev.sourceIndex,
      source: next.source,
      sourceIndex: next.sourceIndex,
      sourceAnchorId: next.sourceAnchorId
    });
  }
  return changes;
}

/**
 * Whether an event's start is subject to the pre-study clamp (D10, D18).
 * @private
 */
function clampable(event, settings) {
  if (event.domain === 'CM') return true;
  return event.domain === 'MH' && settings?.mh_day_source === 'onset';
}

/**
 * The shared ELAPSED-day domain the lanes draw over (design §5.4): starts,
 * closed ends and point days, with clampable starts more than PRE_STUDY_CLAMP
 * days before every other domain's minimum left out, the minimum held at or
 * below study day -14, and the maximum padded by ONE elapsed day so the last
 * day's cell is inside the plot — a closed bar is drawn through the end of its
 * end day (lanes.js) and a point on the last day would otherwise sit half
 * outside the chart area. `recordExtent` gives the unpadded study-day range.
 * @param {Object[]} events The subject's EventRecords (pre-filter).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {?[number, number]} The elapsed drawing domain, or null when nothing is placeable.
 */
export function sharedDomain(events, settings) {
  const extent = elapsedExtent(events, settings);
  if (!extent) return null;
  const [min, max] = extent;
  return [min, max + 1];
}

/**
 * The subject's placeable extent in STUDY days, unpadded, for consumers that
 * report the record's range (pjeSubjectSelected's `domainDays`).
 * @param {Object[]} events The subject's EventRecords (pre-filter).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {?[number, number]} `[firstDay, lastDay]`, or null when nothing is placeable.
 */
export function recordExtent(events, settings) {
  const extent = elapsedExtent(events, settings);
  return extent ? [toStudyDay(extent[0]), toStudyDay(extent[1])] : null;
}

/**
 * The unpadded elapsed extent behind sharedDomain and recordExtent.
 * @private
 */
function elapsedExtent(events, settings) {
  const placeable = arrayify(events).filter(
    (event) => event && typeof event === 'object' && event.placeable !== false
  );
  const daysOf = (event) => {
    const days = [toElapsed(event.start ?? event.day)];
    if (event.kind === 'interval' && event.endState === 'closed' && finite(event.end)) {
      days.push(toElapsed(event.end));
    }
    return days.filter((day) => day !== null);
  };
  const anchored = placeable.filter((event) => !clampable(event, settings)).flatMap(daysOf);
  const otherMin = anchored.length ? Math.min(...anchored) : null;
  const floor = otherMin === null ? -Infinity : otherMin - PRE_STUDY_CLAMP;
  const candidates = [
    ...anchored,
    ...placeable
      .filter((event) => clampable(event, settings))
      .flatMap(daysOf)
      .filter((day) => day >= floor)
  ];
  if (!candidates.length) return null;
  return [Math.min(DOMAIN_MIN_DAY, ...candidates), Math.max(...candidates)];
}

/**
 * Does one event satisfy one filter spec's current selection?
 * @private
 */
function filterPasses(event, spec, selection, settings) {
  const cell =
    event.source && typeof event.source === 'object' ? event.source[spec.value_col] : undefined;
  if (spec.type === 'flag') {
    const flagValue = spec.flag_value ?? selection;
    if (String(flagValue) === '__abnormal__') return isAbnormalByFlag(event, settings);
    return upper(cell) === upper(flagValue);
  }
  return filterMatches(cell, selection);
}

/**
 * Apply the filter state to a subject's events. A filter applies only to
 * events of its spec's domain; other domains always pass. `type: 'flag'`
 * compares the row's cell to `flag_value`, except the special
 * `flag_value: '__abnormal__'`, which delegates to isAbnormalByFlag; every
 * other spec uses the shared filterMatches grammar (null = no restriction, an
 * array = membership, a scalar = equality). State for a column no spec names is
 * ignored.
 * @param {Object[]} events The subject's EventRecords.
 * @param {Object<string, *>} filterState The selection per `value_col`.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {Object[]} [specs=settings.filters] The live filter specs (liveFilters).
 * @returns {Object[]} The events that pass every active filter.
 */
export function applyFilters(events, filterState, settings, specs) {
  const state = filterState && typeof filterState === 'object' ? filterState : {};
  const active = arrayify(specs ?? settings?.filters).filter((spec) => {
    const selection = state[spec.value_col];
    return selection !== null && selection !== undefined && selection !== '';
  });
  const source = arrayify(events);
  if (!active.length) return [...source];
  return source.filter((event) =>
    active.every(
      (spec) =>
        spec.domain !== event.domain || filterPasses(event, spec, state[spec.value_col], settings)
    )
  );
}

/**
 * The filter specs whose column exists in at least one row of their domain.
 * A spec whose column is absent is dropped with the library's standard warning
 * (PJE-FILT-004).
 * @param {Object[]} specs The synced filter specs.
 * @param {Object<string, Object[]>} domains The per-domain raw rows.
 * @returns {Object[]} The live specs, in the configured order.
 */
export function liveFilters(specs, domains) {
  return arrayify(specs).filter((spec) => {
    const rows = arrayify(domains?.[spec.domain]);
    const exists = rows.some(
      (row) => row && typeof row === 'object' && row[spec.value_col] !== undefined
    );
    if (!exists) {
      console.warn(
        `The [ ${spec.label} ] filter has been removed because the variable does not exist.`
      );
    }
    return exists;
  });
}

/**
 * The lane's row order (PC-17). Deterministic, so the row cap truncates a
 * known tail: exposure by treatment name; adverse events by severity rank
 * descending then onset then sourceIndex; labs in the configured test order
 * (then first-seen order for unconfigured tests, when `events` are given);
 * con-meds by start (nulls last) then name; the single-row lanes by day.
 * @param {string} laneKey The lane key.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} [settings] The synced settings (labs only).
 * @param {Object[]} [events] The lane's events, for the labs first-seen rule.
 * @returns {(a: Object, b: Object) => number} The comparator.
 */
export function laneSortKey(laneKey, settings, events) {
  const byIndex = (a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
  switch (laneKey) {
    case 'exposure':
      return (a, b) =>
        compareText(String(a.label ?? ''), String(b.label ?? '')) ||
        nullsLast(dayOrNull(a), dayOrNull(b)) ||
        byIndex(a, b);
    case 'adverseEvents':
      return (a, b) => {
        const ra = a.flags?.severity?.rank ?? -1;
        const rb = b.flags?.severity?.rank ?? -1;
        return rb - ra || nullsLast(dayOrNull(a), dayOrNull(b)) || byIndex(a, b);
      };
    case 'labs': {
      const order = labTestOrder(arrayify(events), settings).tests;
      const configured = arrayify(settings?.lb_tests).map(upper);
      const rank = (event) => {
        const named = order.indexOf(event.test);
        if (named >= 0) return named;
        const byName = configured.indexOf(upper(event.test));
        const byCode = configured.indexOf(upper(event.testCode));
        const idx = byName >= 0 ? byName : byCode;
        return idx >= 0 ? idx : Infinity;
      };
      return (a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
        return (
          compareText(String(a.test ?? ''), String(b.test ?? '')) ||
          nullsLast(dayOrNull(a), dayOrNull(b)) ||
          byIndex(a, b)
        );
      };
    }
    case 'conMeds':
      return (a, b) =>
        nullsLast(dayOrNull(a), dayOrNull(b)) ||
        compareText(String(a.label ?? ''), String(b.label ?? '')) ||
        byIndex(a, b);
    default:
      return (a, b) => nullsLast(dayOrNull(a), dayOrNull(b)) || byIndex(a, b);
  }
}

/**
 * Normalize every domain for every subject, resolve each subject's reference
 * date and re-resolve calendar fields for records that carried no row-level
 * reference, and aggregate the dropped and flagged rows study-wide.
 * @param {Object<string, Object[]>} domains The per-domain raw rows.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{events: Object[], dropped: Object[], droppedCounts: Object, flagged: Object[], flaggedCounts: Object, refDates: Map<string, ?{date: string, rule: string}>}} The study-wide normalization.
 */
export function normalizeAll(domains, settings) {
  let events = [];
  const dropped = [];
  const flagged = [];
  const droppedCounts = { total: 0, byDomain: emptyByDomain(), byReason: {} };
  const flaggedCounts = { total: 0, endBeforeStart: 0, dateConflict: 0, byReason: {} };
  for (const domain of DOMAINS) {
    const result = normalizeDomain(arrayify(domains?.[domain]), domain, settings);
    events = events.concat(result.events);
    for (const row of result.dropped) {
      dropped.push(row);
      droppedCounts.total += 1;
      droppedCounts.byDomain[domain] += 1;
      const reason = row[DROP_REASON_COLUMN];
      droppedCounts.byReason[reason] = (droppedCounts.byReason[reason] || 0) + 1;
    }
    for (const row of result.flagged) {
      flagged.push(row);
      flaggedCounts.endBeforeStart += 1;
    }
  }
  const bySubject = new Map();
  for (const event of events) {
    if (!bySubject.has(event.subject)) bySubject.set(event.subject, []);
    bySubject.get(event.subject).push(event);
  }
  const refDates = new Map();
  const resolved = [];
  for (const [subject, group] of bySubject) {
    const ref = referenceDate(group, settings);
    refDates.set(subject, ref);
    for (const event of group) {
      resolved.push(ref && event.refDate === null ? resolveEventDate(event, ref.date) : event);
    }
  }
  for (const event of resolved) {
    if (!event.dateConflict) continue;
    flagged.push(
      rowCopy(
        event.source,
        `recorded date ${event.rawDate} disagrees with day ${event.day}`,
        event.domain
      )
    );
    flaggedCounts.dateConflict += 1;
  }
  for (const row of flagged) {
    flaggedCounts.total += 1;
    const reason = row[DROP_REASON_COLUMN];
    flaggedCounts.byReason[reason] = (flaggedCounts.byReason[reason] || 0) + 1;
  }
  return { events: resolved, dropped, droppedCounts, flagged, flaggedCounts, refDates };
}

/**
 * The row keys of a lane, in lane order, from its placeable events.
 * @private
 */
function laneRows(laneKey, placeable) {
  switch (laneKey) {
    case 'exposure':
      return [...new Set(placeable.map((event) => String(event.label ?? '')))];
    case 'adverseEvents':
    case 'conMeds':
      return placeable.map((event) => event.id);
    case 'labs':
      return [...new Set(placeable.map((event) => String(event.test ?? '')))];
    default:
      return [laneKey];
  }
}

/**
 * The row key an event belongs to, for the row cap.
 * @private
 */
function rowKeyOf(laneKey, event) {
  switch (laneKey) {
    case 'exposure':
      return String(event.label ?? '');
    case 'adverseEvents':
    case 'conMeds':
      return event.id;
    case 'labs':
      return String(event.test ?? '');
    default:
      return laneKey;
  }
}

/**
 * Assemble the selected subject's journey for one render (design §5.4):
 * subjects, the subject's pre- and post-filter events, every lane sorted by
 * its rule and capped, the lab series, the shared elapsed domain, the live
 * filters, and every honesty count.
 * @param {Object<string, Object[]>} domains The per-domain raw rows (normalizeInput).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{subject?: ?string, filters?: Object, lanes?: Object<string, boolean>, mode?: string, filterSpecs?: Object[]}} [state] The render state: the selected subject (null = first), the filter selections, per-lane enablement overrides, the display mode, and the live filter specs when the caller already resolved them (liveFilters).
 * @returns {Object} The structured record: `subjects`, `subject`, `mode`, `refDate`, `events` (post-filter, enabled lanes, lane then day order), `allEvents` (pre-filter, dose changes and unconfigured-test labs included), `byLane` (post-filter, sorted), `lanes` (per-lane `{ key, enabled, supplied, rows, rowCount, drawn, truncated, sortRule, unplaceable }`), `labSeries`, `labTestsMissing`, `unconfiguredLabs` (lab records for tests outside `lb_tests`: counted and in the drawer, never drawn), `domain` (the padded elapsed drawing domain), `extent` (the unpadded study-day range), `filters`, `dropped`, `droppedCounts`, `flagged`, `flaggedCounts`, `unplaceable`, `unplaceableCounts`, `truncatedByLane`, `counts`.
 */
export function structureData(domains, settings, state = {}) {
  const normalized = normalizeAll(domains, settings);
  const subjects = subjectIndex(domains, settings);
  const wanted = [state?.subject, settings?.subject].map((id) =>
    id === null || id === undefined ? '' : String(id)
  );
  const subject = wanted.find((id) => id && subjects.includes(id)) ?? subjects[0] ?? null;
  const refDate = subject === null ? null : (normalized.refDates.get(subject) ?? null);

  // A lab for a test outside `lb_tests` stays in the record — counted, in the
  // source drawer, named in the labs lane's footer — but is never drawn,
  // anchored, window-counted, or part of the shared domain: it carries
  // `flags.unconfiguredTest` and is left out of everything downstream of
  // `allEvents` (PJE-DATA-003: nothing leaves the record silently).
  const subjectEvents = normalized.events
    .filter((event) => event.subject === subject)
    .map((event) =>
      event.domain === 'LB' && !matchesConfiguredTest(event, settings)
        ? { ...event, flags: { ...event.flags, unconfiguredTest: true } }
        : event
    );
  const drawable = (event) => !event.flags?.unconfiguredTest;
  const doseChanges = deriveDoseChanges(
    subjectEvents.filter((event) => event.domain === 'EX'),
    settings
  );
  const base = [...subjectEvents, ...doseChanges];
  const domain = sharedDomain(base.filter(drawable), settings);
  const extent = recordExtent(base.filter(drawable), settings);
  const allEvents = base.map((event) => {
    if (!domain || event.kind !== 'interval' || event.placeable === false) return event;
    const startE = toElapsed(event.start);
    return startE !== null && startE < domain[0] ? { ...event, clippedStart: true } : event;
  });
  const unconfiguredLabs = allEvents.filter((event) => !drawable(event));

  // The live filter specs: the orchestrator resolves them once per data load
  // (and warns once, PJE-FILT-004); a caller without that resolves them here.
  const filters = Array.isArray(state?.filterSpecs)
    ? state.filterSpecs
    : liveFilters(settings?.filters, domains);
  const filtered = applyFilters(allEvents.filter(drawable), state?.filters, settings, filters);
  const enabled = (lane) =>
    state?.lanes && typeof state.lanes[lane] === 'boolean'
      ? state.lanes[lane]
      : Boolean(settings?.lanes?.[lane]?.enabled);

  const cap = Number(settings?.max_rows_per_lane);
  const rowCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : Infinity;
  const byLane = {};
  const lanes = {};
  const unplaceable = {};
  const truncatedByLane = emptyByLane();
  for (const lane of LANE_KEYS) {
    const laneEvents = filtered.filter((event) => event.lane === lane);
    laneEvents.sort(laneSortKey(lane, settings, laneEvents));
    byLane[lane] = laneEvents;
    const placeable = laneEvents.filter((event) => event.placeable !== false);
    const rows = laneRows(lane, placeable);
    const drawnRows = CAPPED_LANES.includes(lane) ? rows.slice(0, rowCap) : rows;
    const truncated = rows.length - drawnRows.length;
    truncatedByLane[lane] = truncated;
    unplaceable[lane] = allEvents.filter(
      (event) => event.lane === lane && event.placeable === false && drawable(event)
    );
    const domainCode = DOMAIN_BY_LANE[lane];
    lanes[lane] = {
      key: lane,
      enabled: enabled(lane),
      supplied: arrayify(domains?.[domainCode]).length > 0,
      rows: drawnRows,
      rowCount: rows.length,
      drawn: placeable.filter((event) => drawnRows.includes(rowKeyOf(lane, event))),
      truncated,
      sortRule: LANE_SORT_RULES[lane] ?? '',
      unplaceable: unplaceable[lane]
    };
  }

  const allLabs = allEvents.filter((event) => event.domain === 'LB');
  const configuredLabs = allLabs.filter(drawable);
  const labSeries = buildLabSeries(byLane.labs, domain, settings, {
    baselineEvents: configuredLabs
  });
  const labTestsMissing = allLabs.length ? labTestOrder(allLabs, settings).missing : [];

  const events = filtered
    .filter((event) => enabled(event.lane))
    .sort(
      (a, b) =>
        LANE_KEYS.indexOf(a.lane) - LANE_KEYS.indexOf(b.lane) ||
        nullsLast(dayOrNull(a), dayOrNull(b)) ||
        (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0)
    );

  const unplaceableCounts = { byDomain: emptyByDomain(), byLane: emptyByLane() };
  const counts = emptyByDomain();
  for (const event of allEvents) {
    if (event.flags?.derived) continue;
    counts[event.domain] += 1;
    if (event.placeable === false) {
      unplaceableCounts.byDomain[event.domain] += 1;
      unplaceableCounts.byLane[event.lane] += 1;
    }
  }

  return {
    subjects,
    subject,
    mode: state?.mode === 'date' ? 'date' : 'day',
    refDate,
    events,
    allEvents,
    byLane,
    lanes,
    labSeries,
    labTestsMissing,
    unconfiguredLabs,
    domain,
    extent,
    filters,
    dropped: normalized.dropped,
    droppedCounts: normalized.droppedCounts,
    flagged: normalized.flagged,
    flaggedCounts: normalized.flaggedCounts,
    unplaceable,
    unplaceableCounts,
    truncatedByLane,
    counts
  };
}
