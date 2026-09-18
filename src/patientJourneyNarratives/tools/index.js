// The shared tool surface of the AI layer (#146, design §5): six read-only,
// in-process tools that return the same structured rows the chart holds,
// never prose. Each tool has a JSON Schema (sent to the model) and a `run`
// backed by the data service. Narrative generation and the future chatbot
// both use exactly this interface; do not fork it.
//
// Every row a tool returns carries a `row_id` — the chart's own event id
// (`AE-7`, `CM-11`, `DOSE-4`) — and the runtime collects those ids as the
// citation scope of the generation. A model can therefore cite only rows it
// was shown.

import { buildContext, relativeDay, windowBounds } from '../../patient-journey-explorer/anchor.js';
import {
  isAbnormalByChange,
  isAbnormalByFlag,
  labBaseline,
  referenceRatio
} from '../../patient-journey-explorer/labs.js';
import { deriveDoseChanges } from '../../patient-journey-explorer/structureData.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const upper = (value) =>
  value === null || value === undefined ? '' : String(value).trim().toUpperCase();
const round = (value, places = 2) => (finite(value) ? Number(value.toFixed(places)) : null);

/**
 * Normalize a citation or anchor id to the chart's `DOMAIN-index` form
 * (`AE:7` → `AE-7`). Anything else is returned upper-cased and trimmed.
 * @param {*} id A row id in either spelling.
 * @returns {string} The normalized id.
 */
export function normalizeRowId(id) {
  const text = id === null || id === undefined ? '' : String(id).trim().toUpperCase();
  return text.replace(/^([A-Z]+):(\d+)$/, '$1-$2');
}

/**
 * The structured projection of one EventRecord: what a tool returns for a row.
 * @param {Object} event An EventRecord (normalize.js).
 * @param {{anchorDay?: ?number}} [options] `anchorDay` adds `days_from_anchor` in elapsed days.
 * @returns {Object} The projected row.
 */
export function projectEvent(event, { anchorDay = null } = {}) {
  const flags = event.flags || {};
  const row = {
    row_id: event.id,
    domain: event.domain,
    lane: event.lane,
    label: event.label ?? '',
    kind: event.kind,
    start_day: finite(event.start) ? event.start : finite(event.day) ? event.day : null,
    end_day: event.endState === 'closed' && finite(event.end) ? event.end : null,
    end_state: event.endState ?? null,
    date: event.date ?? null,
    category: event.category || null,
    detail: event.detail || null,
    placeable: event.placeable !== false
  };
  if (event.domain === 'AE') {
    row.severity = flags.severity ? flags.severity.label : null;
    row.serious = Boolean(flags.serious);
    row.related = flags.related || null;
    row.outcome = event.outcome || null;
  }
  if (event.domain === 'LB') {
    row.test = event.test ?? null;
    row.test_code = event.testCode ?? null;
    row.value = finite(event.value) ? event.value : null;
    row.unit = event.unit || null;
    row.lln = finite(event.lln) ? event.lln : null;
    row.uln = finite(event.uln) ? event.uln : null;
    row.abnormal_flag = flags.abnormal || null;
    const ratio = referenceRatio(event);
    row.ratio_to_limit = ratio ? { ratio: round(ratio.ratio), limit: ratio.limit } : null;
  }
  if (event.domain === 'EX') {
    row.dose = finite(event.value) ? event.value : null;
    row.unit = event.unit || null;
    if (flags.derived) {
      row.direction = flags.direction || null;
      row.dose_from = finite(event.previousValue) ? event.previousValue : null;
      row.dose_to = finite(event.value) ? event.value : null;
    }
  }
  if (event.domain === 'DS') row.reference = Boolean(flags.reference);
  if (anchorDay !== null && anchorDay !== undefined) {
    row.days_from_anchor = relativeDay(row.start_day, anchorDay);
  }
  return row;
}

const SUBJECT_PROPERTY = {
  usubjid: {
    type: 'string',
    description: 'The participant identifier exactly as the record carries it.'
  }
};

const unknownSubject = (usubjid) => ({
  error: 'unknown-subject',
  message: `No record for participant "${usubjid}".`
});

function structuredOrError(service, usubjid) {
  const structured = service.structuredFor(usubjid);
  return structured ? { structured } : { error: unknownSubject(usubjid) };
}

const events = (structured, domain) =>
  structured.allEvents.filter((event) => event.domain === domain && !event.flags?.derived);

/**
 * The first and last exposure days with the rows that carry them.
 * @private
 */
function exposureExtent(ex) {
  const placeable = ex.filter((event) => finite(event.start));
  if (!placeable.length) return null;
  const first = placeable.reduce((best, event) => (event.start < best.start ? event : best));
  const endOf = (event) => (finite(event.end) ? event.end : event.start);
  const last = placeable.reduce((best, event) => (endOf(event) > endOf(best) ? event : best));
  return {
    first_day: first.start,
    first_row_id: first.id,
    last_day: endOf(last),
    last_row_id: last.id,
    last_end_state: last.endState ?? null
  };
}

/**
 * The adverse event with the latest onset, projected.
 * @private
 */
function lastAdverseEvent(ae) {
  const placeable = ae.filter((event) => finite(event.day));
  if (!placeable.length) return null;
  return projectEvent(placeable.reduce((best, event) => (event.day > best.day ? event : best)));
}

/** get_subject_overview(usubjid) */
export const getSubjectOverview = {
  name: 'get_subject_overview',
  description:
    "The shape of one participant's whole record: counts per domain, the study-day extent, treatments and dose range, disposition rows, the adverse-event terms with counts, the lab tests present, and data-quality counters. Rows carry row_id.",
  input_schema: {
    type: 'object',
    required: ['usubjid'],
    additionalProperties: false,
    properties: { ...SUBJECT_PROPERTY }
  },
  run(service, { usubjid }) {
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const ex = events(structured, 'EX');
    const ae = events(structured, 'AE');
    const doses = ex.map((event) => event.value).filter(finite);
    const termCounts = new Map();
    for (const event of ae) {
      const key = event.label || '';
      termCounts.set(key, (termCounts.get(key) || 0) + 1);
    }
    const terms = [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 25)
      .map(([term, count]) => ({
        term,
        count,
        row_ids: ae.filter((event) => (event.label || '') === term).map((event) => event.id)
      }));
    return {
      subject: structured.subject,
      counts: { ...structured.counts },
      extent: structured.extent
        ? { first_day: structured.extent[0], last_day: structured.extent[1] }
        : null,
      ref_date: structured.refDate ? structured.refDate.date : null,
      treatments: [...new Set(ex.map((event) => event.label).filter(Boolean))],
      dose_range: doses.length
        ? { min: Math.min(...doses), max: Math.max(...doses), unit: ex[0]?.unit || null }
        : null,
      dose_change_count: structured.allEvents.filter((event) => event.flags?.derived).length,
      exposure_extent: exposureExtent(ex),
      last_adverse_event: lastAdverseEvent(ae),
      disposition: events(structured, 'DS').map((event) => projectEvent(event)),
      adverse_event_terms: terms,
      serious_adverse_events: ae
        .filter((event) => event.flags?.serious)
        .map((e) => projectEvent(e)),
      lab_tests: [
        ...new Set(
          events(structured, 'LB')
            .map((event) => event.test)
            .filter(Boolean)
        )
      ],
      con_med_count: events(structured, 'CM').length,
      medical_history_count: events(structured, 'MH').length,
      unplaceable: { ...structured.unplaceableCounts.byDomain },
      data_quality: {
        end_before_start: structured.flaggedCounts.endBeforeStart,
        date_conflict: structured.flaggedCounts.dateConflict
      }
    };
  }
};

/** get_events(usubjid, domain, filters) */
export const getEvents = {
  name: 'get_events',
  description:
    'The rows of one domain (EX, AE, LB, CM, MH or DS) for a participant, in start-day order, each with row_id. Optional filters: serious (AE), term (AE preferred term, case-insensitive), test (LB test name or code), from_day / to_day (study days, inclusive), max (default 60).',
  input_schema: {
    type: 'object',
    required: ['usubjid', 'domain'],
    additionalProperties: false,
    properties: {
      ...SUBJECT_PROPERTY,
      domain: { type: 'string', enum: ['EX', 'AE', 'LB', 'CM', 'MH', 'DS'] },
      filters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          serious: { type: 'boolean' },
          term: { type: 'string' },
          test: { type: 'string' },
          from_day: { type: 'integer' },
          to_day: { type: 'integer' },
          max: { type: 'integer', minimum: 1, maximum: 500 }
        }
      }
    }
  },
  run(service, { usubjid, domain, filters = {} }) {
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const code = upper(domain);
    let rows = events(structured, code);
    const f = filters && typeof filters === 'object' ? filters : {};
    if (f.serious === true) rows = rows.filter((event) => event.flags?.serious);
    if (f.term) rows = rows.filter((event) => upper(event.label) === upper(f.term));
    if (f.test) {
      rows = rows.filter(
        (event) => upper(event.test) === upper(f.test) || upper(event.testCode) === upper(f.test)
      );
    }
    if (finite(f.from_day))
      rows = rows.filter((event) => finite(event.day) && event.day >= f.from_day);
    if (finite(f.to_day)) rows = rows.filter((event) => finite(event.day) && event.day <= f.to_day);
    rows = [...rows].sort((a, b) => {
      const da = finite(a.day) ? a.day : Infinity;
      const db = finite(b.day) ? b.day : Infinity;
      return da - db || a.sourceIndex - b.sourceIndex;
    });
    const max = finite(f.max) ? f.max : 60;
    return {
      subject: structured.subject,
      domain: code,
      total: rows.length,
      truncated: Math.max(0, rows.length - max),
      rows: rows.slice(0, max).map((event) => projectEvent(event))
    };
  }
};

/** get_context_window(usubjid, anchor_row_id, days) */
export const getContextWindow = {
  name: 'get_context_window',
  description:
    'Anchor on one event of a participant and return the mechanical context the chart panel shows: the anchor row, the inclusive ±days window in elapsed days, con-meds active at the anchor (and those started later in the window), abnormal labs in the window with the rule that fired, dose changes in the window, earlier or same-day events with the same preferred term over the whole record, everything in the window, the counts, and the honesty counters. Every row carries row_id and days_from_anchor.',
  input_schema: {
    type: 'object',
    required: ['usubjid', 'anchor_row_id'],
    additionalProperties: false,
    properties: {
      ...SUBJECT_PROPERTY,
      anchor_row_id: { type: 'string', description: 'The event id, e.g. AE-7.' },
      days: {
        type: 'integer',
        minimum: 0,
        description: 'Half-width in elapsed days; default from settings.'
      }
    }
  },
  run(service, { usubjid, anchor_row_id, days }) {
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const id = normalizeRowId(anchor_row_id);
    const anchor = structured.allEvents.find((event) => event.id === id);
    if (!anchor || anchor.placeable === false) {
      return { error: 'anchor-not-found', message: `No anchorable event "${id}" for ${usubjid}.` };
    }
    const width = finite(days)
      ? Math.max(0, Math.floor(days))
      : service.settings.context_window_days;
    const settings = { ...service.settings, context_window_days: width };
    const bundle = buildContext(structured, anchor, settings);
    if (!bundle) return { error: 'anchor-not-found', message: `Cannot anchor on "${id}".` };
    const anchorDay = anchor.day;
    const project = (event) => projectEvent(event, { anchorDay });
    const labPool = structured.allEvents.filter(
      (event) => event.domain === 'LB' && !event.flags?.unconfiguredTest
    );
    const baselines = new Map();
    const baselineFor = (test) => {
      if (!baselines.has(test)) {
        baselines.set(
          test,
          labBaseline(
            labPool.filter((event) => event.test === test),
            settings
          )
        );
      }
      return baselines.get(test);
    };
    return {
      subject: structured.subject,
      anchor: project(anchor),
      window: {
        days: width,
        start_day: bundle.window.startDay,
        end_day: bundle.window.endDay
      },
      con_meds_active: bundle.conMeds.map(project),
      con_meds_started_later: bundle.conMedsLater.map(project),
      abnormal_labs: bundle.abnormalLabs.map((event) => {
        const row = project(event);
        row.abnormal_reason = event.flags.abnormalReason;
        const baseline = baselineFor(event.test);
        row.baseline =
          baseline && finite(baseline.value)
            ? { value: baseline.value, day: baseline.day, rule: baseline.rule }
            : null;
        row.x_baseline =
          baseline && finite(baseline.value) && baseline.value > 0
            ? round(event.value / baseline.value)
            : null;
        return row;
      }),
      dose_changes: bundle.doseChanges.map(project),
      prior_same_term_events: bundle.priorEvents.map((event) => {
        const row = project(event);
        const offset = relativeDay(event.day, anchorDay);
        row.days_before_anchor = offset === null ? null : -offset;
        return row;
      }),
      in_window: bundle.inWindow.map((event) => ({
        row_id: event.id,
        domain: event.domain,
        label: event.label ?? '',
        start_day: finite(event.start) ? event.start : event.day,
        days_from_anchor: relativeDay(finite(event.start) ? event.start : event.day, anchorDay)
      })),
      counts: { ...bundle.counts },
      not_evaluated: {
        con_meds_without_start: bundle.notEvaluated.conMedsWithoutStart,
        con_meds_end_unrecorded: bundle.notEvaluated.conMedsEndUnrecorded,
        adverse_events_end_unrecorded: bundle.notEvaluated.aeEndUnrecorded,
        unplaceable_by_domain: { ...bundle.notEvaluated.unplaceableByDomain }
      }
    };
  }
};

/** get_lab_series(usubjid, test) */
export const getLabSeries = {
  name: 'get_lab_series',
  description:
    "Every result of one lab test for a participant in study-day order, with the reference limits, the baseline the chart uses (and its rule), each point's ratio to the limit it crossed, its multiple of baseline, and which abnormality rule fires. Match the test by name or code, case-insensitively.",
  input_schema: {
    type: 'object',
    required: ['usubjid', 'test'],
    additionalProperties: false,
    properties: {
      ...SUBJECT_PROPERTY,
      test: { type: 'string', description: 'Test name (LBTEST) or code (LBTESTCD).' }
    }
  },
  run(service, { usubjid, test }) {
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const wanted = upper(test);
    const all = events(structured, 'LB');
    const points = all
      .filter((event) => upper(event.test) === wanted || upper(event.testCode) === wanted)
      .sort((a, b) => {
        const da = finite(a.day) ? a.day : Infinity;
        const db = finite(b.day) ? b.day : Infinity;
        return da - db || a.sourceIndex - b.sourceIndex;
      });
    if (!points.length) {
      return {
        error: 'no-lab-rows',
        message: `No lab rows for "${test}".`,
        available_tests: [...new Set(all.map((event) => event.test).filter(Boolean))]
      };
    }
    const settings = service.settings;
    const baseline = labBaseline(points, settings);
    const limits = points.find((event) => finite(event.lln) || finite(event.uln)) || {};
    return {
      subject: structured.subject,
      test: points[0].test,
      test_code: points[0].testCode ?? null,
      unit: points.find((event) => event.unit)?.unit || null,
      lln: finite(limits.lln) ? limits.lln : null,
      uln: finite(limits.uln) ? limits.uln : null,
      baseline:
        baseline && finite(baseline.value)
          ? {
              value: baseline.value,
              day: baseline.day,
              rule: baseline.rule,
              row_id: baseline.event?.id ?? null
            }
          : null,
      change_factor: settings.lb_change_factor,
      points: points.map((event) => {
        const row = projectEvent(event);
        row.x_baseline =
          baseline && finite(baseline.value) && baseline.value > 0 && finite(event.value)
            ? round(event.value / baseline.value)
            : null;
        row.abnormal_by_flag = isAbnormalByFlag(event, settings);
        row.abnormal_by_change = isAbnormalByChange(event, baseline, settings);
        return row;
      }),
      peak: (() => {
        const valued = points.filter((event) => finite(event.value));
        if (!valued.length) return null;
        const max = valued.reduce((best, event) => (event.value > best.value ? event : best));
        return { row_id: max.id, day: max.day, value: max.value };
      })()
    };
  }
};

/** get_dose_history(usubjid) */
export const getDoseHistory = {
  name: 'get_dose_history',
  description:
    'The exposure records of a participant in start order (treatment, dose, unit, start and end study days) and the dose changes derived from consecutive records (from → to, direction, the day the new dose began), each with row_id.',
  input_schema: {
    type: 'object',
    required: ['usubjid'],
    additionalProperties: false,
    properties: { ...SUBJECT_PROPERTY }
  },
  run(service, { usubjid }) {
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const ex = events(structured, 'EX').sort((a, b) => {
      const da = finite(a.start) ? a.start : Infinity;
      const db = finite(b.start) ? b.start : Infinity;
      return da - db || a.sourceIndex - b.sourceIndex;
    });
    const changes = deriveDoseChanges(ex, service.settings);
    return {
      subject: structured.subject,
      treatments: [...new Set(ex.map((event) => event.label).filter(Boolean))],
      records: ex.map((event) => projectEvent(event)),
      changes: changes.map((event) => ({
        ...projectEvent(event),
        source_row_id: `EX-${event.sourceIndex}`,
        previous_row_id: `EX-${event.previousSourceIndex}`
      })),
      unplaceable: structured.unplaceableCounts.byDomain.EX
    };
  }
};

/** get_source_row(row_id, usubjid) */
export const getSourceRow = {
  name: 'get_source_row',
  description:
    "The raw source row behind a row_id, exactly as the host passed it in (every column), plus the chart's projection of it. Use it to read a column the projections leave out, such as a verbatim term, a route, or a recorded outcome.",
  input_schema: {
    type: 'object',
    required: ['row_id'],
    additionalProperties: false,
    properties: {
      row_id: { type: 'string', description: 'A row id such as AE-7 or DOSE-4.' },
      usubjid: { ...SUBJECT_PROPERTY.usubjid, description: 'The participant the row belongs to.' }
    }
  },
  run(service, { row_id, usubjid }) {
    const id = normalizeRowId(row_id);
    if (!usubjid) return { error: 'subject-required', message: 'usubjid is required.' };
    const { structured, error } = structuredOrError(service, usubjid);
    if (error) return error;
    const event = structured.allEvents.find((entry) => entry.id === id);
    if (!event) return { error: 'row-not-found', message: `No row "${id}" for ${usubjid}.` };
    return {
      row_id: id,
      domain: event.domain,
      source: event.source && typeof event.source === 'object' ? { ...event.source } : {},
      event: projectEvent(event)
    };
  }
};

/** Every tool, keyed by name. */
export const TOOLS = Object.fromEntries(
  [getSubjectOverview, getEvents, getContextWindow, getLabSeries, getDoseHistory, getSourceRow].map(
    (tool) => [tool.name, tool]
  )
);

/**
 * The provider-neutral tool definitions for a set of names.
 * @param {string[]} names Tool names.
 * @returns {Array<{name: string, description: string, input_schema: Object}>} The definitions, in the given order.
 */
export function toolDefinitions(names) {
  return names
    .filter((name) => TOOLS[name])
    .map((name) => {
      const { description, input_schema } = TOOLS[name];
      return { name, description, input_schema };
    });
}

/**
 * Every `row_id` / `source_row_id` / `previous_row_id` value inside a tool result.
 * @param {*} value A tool result.
 * @returns {Set<string>} The ids found.
 */
export function collectRowIds(value) {
  const ids = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, entry] of Object.entries(node)) {
      if (/(^|_)row_ids?$/.test(key)) {
        for (const id of [].concat(entry)) if (typeof id === 'string') ids.add(normalizeRowId(id));
      } else walk(entry);
    }
  };
  walk(value);
  return ids;
}

/**
 * Run a named tool against the service, with the subject injected when the
 * tool wants one and the call omitted it.
 * @param {Object} service The data service.
 * @param {string} name The tool name.
 * @param {Object} input The tool input.
 * @param {{subject?: string}} [context] The generation's subject.
 * @returns {Object} The tool result (an `{ error, message }` object for a refused call).
 */
export function runTool(service, name, input, { subject } = {}) {
  const tool = TOOLS[name];
  if (!tool) return { error: 'unknown-tool', message: `No tool named "${name}".` };
  const args = input && typeof input === 'object' ? { ...input } : {};
  if ('usubjid' in tool.input_schema.properties && !args.usubjid && subject) args.usubjid = subject;
  try {
    return tool.run(service, args);
  } catch (error) {
    return {
      error: 'tool-failed',
      message: error && error.message ? error.message : String(error)
    };
  }
}
