// Data reduction for the time-to-event module (#128): filtered event rows +
// population rows → one time-to-first-qualifying-event observation per
// participant → km.js estimates, per design obot.roadmap
// requirements/design/161_design.html §4/§6 as revised by the sv#131 review.
//
// The derivation rule is fixed and deliberately simple (TTE-DERIV-001/002):
// each participant's observation is their earliest qualifying event day (ties
// broken by input order), or censoring at the population follow-up-end day when
// no event qualifies. Which events qualify is the reviewer's live filter
// selection — the endpoint composer — never a pre-derived endpoint list. The
// clinical guide states the rule and its limits (competing events, events
// recorded after follow-up end).
//
// Nothing is dropped silently: every excluded row — event or population —
// carries a named reason and is counted and exportable (TTE-DATA-002), the
// nep-explorer accounting pattern.

import { kmEstimate } from './km.js';
import { filterMatches } from '../filters.js';

/** The one internal column the dropped-row exports keep, because it is the answer. */
export const DROP_REASON_COLUMN = '__tte_dropReason';

/** The pooled-group label when the population carries no group column (TTE-DATA-004). */
export const POOLED_GROUP = 'All participants';

/**
 * Distinct values in first-seen order.
 * @param {Array} values Raw values.
 * @returns {Array} Unique values, first appearance first.
 */
export function unique(values) {
  return [...new Set(values)];
}

/**
 * Apply the active multiselect event filters: a row qualifies when, for every
 * filter with an active selection, its value is in the selected set. A filter
 * with no active selection (null/undefined) qualifies everything; an empty
 * selection qualifies nothing — the reviewer deselected every value.
 * @param {Object[]} events The event rows.
 * @param {Object<string, ?string[]>} filters Selected values keyed by column; null = all.
 * @returns {Object[]} The qualifying event rows.
 */
export function applyEventFilters(events, filters) {
  const active = Object.entries(filters || {}).filter(([, values]) => values != null);
  if (!active.length) return events;
  const sets = active.map(([column, values]) => [column, new Set(values.map(String))]);
  return events.filter((row) => sets.every(([column, set]) => set.has(String(row[column]))));
}

/**
 * Apply the active single-select population filters: a row stays when every
 * non-null filter matches its value for that column.
 * @param {Object[]} rows The population rows.
 * @param {Object<string, ?string>} filters Active selections keyed by column; null = all.
 * @returns {Object[]} The rows passing every active filter.
 */
export function applyFilters(rows, filters) {
  const active = Object.entries(filters || {}).filter(([, value]) => value != null);
  if (!active.length) return rows;
  return rows.filter((row) => active.every(([column, value]) => filterMatches(row[column], value)));
}

/**
 * Derive one time-to-first-qualifying-event observation per participant from
 * the qualifying (already filtered) event rows and the population rows,
 * counting every exclusion with a named reason.
 *
 * Semantics (TTE-DERIV-001/002):
 * - The observation time for a participant with qualifying events is the
 *   earliest usable event day; ties keep the first row in input order.
 * - An event-free participant censors at the population follow-up-end day;
 *   without a usable value there, the participant is excluded and counted.
 * - A participant WITH a qualifying event does not need the follow-up day.
 *
 * @param {Object[]} events The qualifying event rows (post applyEventFilters).
 * @param {Object[]} population The population rows (post applyFilters).
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @returns {{observations: Object[], droppedEvents: Object[], droppedPopulation: Object[]}}
 *   One observation per participant ({ id, group, time, event, eventDesc,
 *   censorDesc, row }) plus the excluded rows from each dataset, each carrying
 *   DROP_REASON_COLUMN.
 */
export function deriveObservations(events, population, settings) {
  const droppedEvents = [];
  const droppedPopulation = [];
  const dropEvent = (row, reason) => droppedEvents.push({ ...row, [DROP_REASON_COLUMN]: reason });
  const dropParticipant = (row, reason) =>
    droppedPopulation.push({ ...row, [DROP_REASON_COLUMN]: reason });

  // Pass 1 — participants: one row each, in population order.
  const participants = new Map();
  for (const row of population) {
    const id = row[settings.id_col];
    if (id === undefined || id === null || id === '') {
      dropParticipant(row, `missing participant id (${settings.id_col})`);
      continue;
    }
    const key = String(id);
    if (participants.has(key)) {
      dropParticipant(row, `duplicate row for participant ${key} — first row kept`);
      continue;
    }
    participants.set(key, { row, first: null });
  }

  // Pass 2 — qualifying events: keep each participant's earliest usable day,
  // ties broken by input order.
  for (const row of events) {
    const id = String(row[settings.id_col] ?? '');
    const entry = participants.get(id);
    if (!entry) {
      dropEvent(row, `participant ${id || '(missing id)'} not in the population data`);
      continue;
    }
    const raw = row[settings.event_day_col];
    const day = Number(raw);
    if (raw === '' || raw == null || !Number.isFinite(day)) {
      dropEvent(row, `missing or non-numeric event day (${settings.event_day_col})`);
      continue;
    }
    if (day <= 0) {
      dropEvent(row, `non-positive event day (${settings.event_day_col} = ${raw})`);
      continue;
    }
    if (!entry.first || day < entry.first.day) entry.first = { day, row };
  }

  // Pass 3 — observations: the first qualifying event, or censoring at the
  // follow-up-end day.
  const observations = [];
  for (const [id, entry] of participants) {
    const group =
      settings.group_col && entry.row[settings.group_col] !== undefined
        ? String(entry.row[settings.group_col])
        : null;
    if (entry.first) {
      observations.push({
        id,
        group,
        time: entry.first.day,
        event: true,
        eventDesc:
          settings.event_desc_col && entry.first.row[settings.event_desc_col]
            ? String(entry.first.row[settings.event_desc_col])
            : '',
        censorDesc: '',
        row: entry.row
      });
      continue;
    }
    const raw = entry.row[settings.fu_day_col];
    const fuDay = Number(raw);
    if (raw === '' || raw == null || !Number.isFinite(fuDay) || fuDay <= 0) {
      dropParticipant(
        entry.row,
        `no qualifying event and no usable follow-up day (${settings.fu_day_col} = ${raw ?? ''})`
      );
      continue;
    }
    observations.push({
      id,
      group,
      time: fuDay,
      event: false,
      eventDesc: '',
      censorDesc:
        settings.censor_desc_col && entry.row[settings.censor_desc_col]
          ? String(entry.row[settings.censor_desc_col])
          : '',
      row: entry.row
    });
  }

  return { observations, droppedEvents, droppedPopulation };
}

/**
 * Structure the composed endpoint for rendering: derive one observation per
 * participant, split by group in population order, and estimate each group
 * with km.js. One derivation feeds everything the chart shows (TTE-STAT-001).
 * @param {Object[]} events The qualifying event rows (post applyEventFilters).
 * @param {Object[]} population The population rows (post applyFilters).
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @returns {{
 *   groups: Array<{name: string, observations: Object[], estimate: Object}>,
 *   droppedEvents: Object[],
 *   droppedPopulation: Object[],
 *   total: number,
 *   maxTime: number
 * }} The per-group estimates plus the drop accounting for both datasets.
 */
export function structureData(events, population, settings) {
  const { observations, droppedEvents, droppedPopulation } = deriveObservations(
    Array.isArray(events) ? events : [],
    Array.isArray(population) ? population : [],
    settings
  );

  const grouped = new Map();
  for (const observation of observations) {
    const name = observation.group ?? POOLED_GROUP;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(observation);
  }

  const groups = [...grouped.entries()].map(([name, members]) => ({
    name,
    observations: members,
    estimate: kmEstimate(members)
  }));

  return {
    groups,
    droppedEvents,
    droppedPopulation,
    total: observations.length,
    maxTime: groups.reduce((max, group) => Math.max(max, group.estimate.maxTime), 0)
  };
}
