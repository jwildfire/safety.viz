#!/usr/bin/env node
// Builds the golden set of the narrative eval harness (#146) MECHANICALLY: no
// model is called here. Every case is chosen from the vendored CDISC Pilot 01
// extracts by WHAT IT IS — a serious adverse event, an anchor with an empty
// window, a dose interruption, a lab series that fires the change-from-baseline
// rule — never by row index, and every reference fact is read straight out of
// the skill's grounding tool. The reference is therefore reproducible from the
// data, and a clinician's reviewed reference can replace it under the same file
// shape without touching the graders.
//
//   node tests/evals/patient-journey-narratives/build-golden.mjs
//
// writes tests/evals/patient-journey-narratives/golden/<skill>.jsonl (one case
// per line) and refreshes skills/patient-journey-narratives/<skill>/examples.jsonl
// with the first three cases of each skill as `{ inputs, reference }` anchors.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDataService } from '../../../src/patientJourneyNarratives/dataService.js';
import {
  collectRowIds,
  normalizeRowId,
  runTool
} from '../../../src/patientJourneyNarratives/tools/index.js';
import { forbiddenMatch } from '../../../src/patientJourneyNarratives/validator.js';
import { DEMO_SETTINGS, DEMO_SUBJECT, loadDemoData, rootDir } from './demo-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where the generated case files land. */
export const GOLDEN_DIR = path.join(here, 'golden');
/** Where the per-skill eval anchors land. */
export const SKILLS_DIR = path.join(rootDir, 'skills', 'patient-journey-narratives');
/** The five skills, in the order the harness reports them. */
export const SKILL_ORDER = [
  'event-context',
  'subject-summary',
  'lab-trajectory',
  'dose-journey',
  'disposition'
];
/** How many cases each skill contributes. */
export const CASE_BUDGET = {
  'event-context': 12,
  'subject-summary': 6,
  'lab-trajectory': 4,
  'dose-journey': 4,
  disposition: 4
};
/** The provenance caveat every case carries. */
export const PROVENANCE_NOTE =
  'facts derived mechanically from the grounding tool; AI-selected, unreviewed by a clinician';
/** How many examples each skill's examples.jsonl keeps. */
const EXAMPLE_COUNT = 3;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clean = (value) => String(value ?? '').trim();

/**
 * Sort row ids by domain then index, so a case file is byte-stable.
 * @param {Iterable<string>} ids Row ids.
 * @returns {string[]} The sorted ids.
 */
function sortRowIds(ids) {
  const parts = (id) => {
    const match = /^([A-Z]+)-(\d+)$/.exec(id);
    return match ? [match[1], Number(match[2])] : [id, -1];
  };
  return [...new Set([...ids].map(normalizeRowId))].sort((a, b) => {
    const [da, na] = parts(a);
    const [db, nb] = parts(b);
    return da < db ? -1 : da > db ? 1 : na - nb;
  });
}

/** `day 30`, `day -10`: the phrasing the style guide fixes for a study day. */
const dayFact = (day) => (finite(day) ? `day ${day}` : null);
/** `36 U/L`: a value with the unit the row carries. */
const valueFact = (value, unit) => (finite(value) ? `${value}${unit ? ` ${unit}` : ''}` : null);
/** `7 con-med`: a count on its singular noun, so plurals and compounds still match. */
const countFact = (n, noun) => (finite(n) && n > 0 ? `${n} ${noun}` : null);
const label = (row) => clean(row && row.label);

/**
 * Drop empty facts and duplicates, keeping first-seen order.
 * @param {Array<?string>} facts Candidate facts.
 * @returns {string[]} The kept facts.
 */
function facts(...list) {
  const seen = new Set();
  const kept = [];
  for (const fact of list.flat()) {
    const text = clean(fact);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    kept.push(text);
  }
  return kept;
}

/**
 * A memoized reader over the six tools, so one scan of 254 participants costs
 * one structureData() each.
 * @returns {Object} The catalog.
 */
export function createCatalog() {
  const service = createDataService({ data: loadDemoData(), settings: DEMO_SETTINGS });
  const memo = new Map();
  const read = (name, input) => {
    const key = `${name}|${JSON.stringify(input)}`;
    if (!memo.has(key)) memo.set(key, runTool(service, name, input, { subject: input.usubjid }));
    return memo.get(key);
  };
  return {
    service,
    subjects: service.subjects(),
    overview: (usubjid) => read('get_subject_overview', { usubjid }),
    doses: (usubjid) => read('get_dose_history', { usubjid }),
    events: (usubjid, domain) => read('get_events', { usubjid, domain }),
    labs: (usubjid, test) => read('get_lab_series', { usubjid, test }),
    window: (usubjid, anchor_row_id, days) =>
      read('get_context_window', {
        usubjid,
        anchor_row_id,
        ...(finite(days) ? { days } : {})
      }),
    /** The first participant the predicate accepts, scanning in index order. */
    find(predicate, used = new Set()) {
      for (const usubjid of service.subjects()) {
        if (used.has(usubjid)) continue;
        if (predicate(usubjid)) return usubjid;
      }
      return null;
    },
    /** Every participant the predicate accepts, in index order. */
    findAll(predicate, max = Infinity) {
      const hits = [];
      for (const usubjid of service.subjects()) {
        if (predicate(usubjid)) hits.push(usubjid);
        if (hits.length >= max) break;
      }
      return hits;
    }
  };
}

/**
 * An anchor chosen by what it is: the row whose label and day match, never an
 * index into the file.
 * @param {Object} catalog The catalog.
 * @param {string} usubjid The participant.
 * @param {string} domain The domain to search.
 * @param {(row: Object) => boolean} predicate What the anchor is.
 * @returns {?Object} The projected row, or null.
 */
function anchorRow(catalog, usubjid, domain, predicate) {
  const result = catalog.events(usubjid, domain);
  return (result.rows || []).find((row) => predicate(row)) || null;
}

// ---------------------------------------------------------------------------
// Reference derivation: what a faithful draft of this grounding must say.
// ---------------------------------------------------------------------------

/**
 * The reference for an event-context case, from get_context_window.
 * @private
 */
function eventContextReference(grounding) {
  const anchor = grounding.anchor;
  const conMeds = grounding.con_meds_active || [];
  const labs = grounding.abnormal_labs || [];
  const doses = grounding.dose_changes || [];
  const prior = grounding.prior_same_term_events || [];
  const later = grounding.con_meds_started_later || [];
  const lab = labs[0];
  const dose = doses[0];
  const empty = ![conMeds, labs, doses, prior, later].some((list) => list.length);
  const required = facts(
    label(anchor),
    dayFact(anchor.start_day),
    countFact(conMeds.length, 'con-med'),
    conMeds.slice(0, 4).map(label),
    lab ? [clean(lab.test), valueFact(lab.value, lab.unit), dayFact(lab.start_day)] : [],
    lab && lab.ratio_to_limit ? String(lab.ratio_to_limit.ratio) : null,
    dose ? [`from ${dose.dose_from} to ${dose.dose_to}`, dayFact(dose.start_day)] : [],
    prior.length ? countFact(Math.abs(prior[0].days_before_anchor), 'day') : null,
    later.length ? label(later[0]) : null
  );
  const flags = [];
  if (anchor.serious) flags.push('sae');
  if (empty) flags.push('context:empty');
  if (labs.some((row) => row.abnormal_reason && row.abnormal_reason !== 'flag')) {
    flags.push('labs:change-rule');
  }
  if (conMeds.length && (grounding.not_evaluated?.con_meds_end_unrecorded ?? 0) > 0) {
    flags.push('ends-unrecorded');
  }
  return {
    required_facts: required,
    required_citations: sortRowIds(
      [anchor.row_id, conMeds[0]?.row_id, lab?.row_id, dose?.row_id].filter(Boolean)
    ),
    expected_flags: flags
  };
}

/**
 * The reference for a subject-summary case, from get_subject_overview.
 * @private
 */
function subjectSummaryReference(grounding) {
  const extent = grounding.exposure_extent;
  const terms = grounding.adverse_event_terms || [];
  const sae = grounding.serious_adverse_events || [];
  const dispo = (grounding.disposition || []).filter((row) => row.reference);
  const last = grounding.last_adverse_event;
  const counts = grounding.counts || {};
  const required = facts(
    grounding.treatments || [],
    extent ? [dayFact(extent.first_day), dayFact(extent.last_day)] : [],
    countFact(counts.AE, 'adverse event'),
    terms.slice(0, 3).map((term) => clean(term.term)),
    sae.flatMap((row) => [label(row), dayFact(row.start_day)]),
    dispo.flatMap((row) => [label(row), dayFact(row.start_day)]),
    last ? [label(last), dayFact(last.start_day)] : []
  );
  const flags = [];
  if (sae.length) flags.push('sae');
  if (Object.values(grounding.unplaceable || {}).some((n) => n > 0)) flags.push('data:unplaceable');
  return {
    required_facts: required,
    required_citations: sortRowIds(
      [
        extent?.first_row_id,
        extent?.last_row_id,
        dispo[0]?.row_id,
        sae[0]?.row_id,
        last?.row_id
      ].filter(Boolean)
    ),
    expected_flags: flags
  };
}

/**
 * The reference for a lab-trajectory case, from get_lab_series.
 * @private
 */
function labTrajectoryReference(grounding) {
  const points = grounding.points || [];
  const first = points[0];
  const last = points[points.length - 1];
  const peak = grounding.peak;
  const peakRow = points.find((row) => row.row_id === (peak && peak.row_id));
  const abnormal = points.filter((row) => row.abnormal_by_flag || row.abnormal_by_change);
  const required = facts(
    clean(grounding.test),
    countFact(points.length, 'time'),
    dayFact(first.start_day),
    dayFact(last.start_day),
    grounding.baseline
      ? [valueFact(grounding.baseline.value, grounding.unit), dayFact(grounding.baseline.day)]
      : [],
    peak ? [valueFact(peak.value, grounding.unit), dayFact(peak.day)] : [],
    peakRow && peakRow.ratio_to_limit ? String(peakRow.ratio_to_limit.ratio) : null,
    peakRow && finite(peakRow.x_baseline) && peakRow.x_baseline !== 1
      ? String(peakRow.x_baseline)
      : null,
    abnormal.length ? `${abnormal.length} of ${points.length}` : null,
    points.length > 1 ? valueFact(last.value, grounding.unit) : null
  );
  const flags = [];
  if (points.some((row) => row.abnormal_by_change)) flags.push('labs:change-rule');
  if (points.length === 1) flags.push('series:single-point');
  if (!grounding.baseline) flags.push('baseline:missing');
  return {
    required_facts: required,
    required_citations: sortRowIds(
      [first.row_id, last.row_id, grounding.baseline?.row_id, peak?.row_id].filter(Boolean)
    ),
    expected_flags: flags
  };
}

/**
 * The reference for a dose-journey case, from get_dose_history (plus the
 * serious adverse events the skill reads through get_events).
 * @private
 */
function doseJourneyReference(grounding, overview) {
  const records = grounding.records || [];
  const changes = grounding.changes || [];
  const first = records[0];
  const last = records[records.length - 1];
  const sae = overview.serious_adverse_events || [];
  const required = facts(
    grounding.treatments || [],
    countFact(records.length, 'record'),
    dayFact(first.start_day),
    finite(last.end_day) ? dayFact(last.end_day) : null,
    changes
      .slice(0, 3)
      .flatMap((change) => [
        `from ${change.dose_from} to ${change.dose_to}`,
        dayFact(change.start_day),
        clean(change.direction)
      ]),
    sae.flatMap((row) => [label(row), dayFact(row.start_day)])
  );
  const flags = [];
  if (changes.length > 3) flags.push('dose:more-changes');
  if (sae.length) flags.push('sae');
  if (last && last.end_state === 'unrecorded') flags.push('exposure:end-unrecorded');
  return {
    required_facts: required,
    required_citations: sortRowIds(
      [
        first.row_id,
        last.row_id,
        ...changes.slice(0, 3).flatMap((change) => [change.row_id, change.source_row_id]),
        sae[0]?.row_id
      ].filter(Boolean)
    ),
    expected_flags: flags
  };
}

/**
 * The reference for a disposition case, from get_events(DS) (plus the exposure
 * extent and last adverse event the skill reads through get_subject_overview).
 * @private
 */
function dispositionReference(grounding, overview) {
  const rows = grounding.rows || [];
  const reference = rows.filter((row) => row.reference);
  const milestones = rows.filter((row) => !row.reference);
  const extent = overview.exposure_extent;
  const last = overview.last_adverse_event;
  const required = facts(
    reference.flatMap((row) => [
      label(row),
      dayFact(row.start_day),
      row.detail && row.detail !== row.label ? clean(row.detail) : null
    ]),
    milestones.flatMap((row) => [label(row), dayFact(row.start_day)]),
    extent ? [dayFact(extent.first_day), dayFact(extent.last_day)] : [],
    last ? [label(last), dayFact(last.start_day)] : []
  );
  const flags = [];
  if (!reference.length) flags.push('disposition:none');
  if (last && last.serious) flags.push('sae');
  if (extent && extent.last_end_state === 'unrecorded') flags.push('exposure:end-unrecorded');
  return {
    required_facts: required,
    required_citations: sortRowIds(
      [reference[0]?.row_id, milestones[0]?.row_id, extent?.first_row_id, last?.row_id].filter(
        Boolean
      )
    ),
    expected_flags: flags
  };
}

/**
 * Assemble one case: run the grounding tool, derive the reference from it.
 * @private
 */
function makeCase(catalog, { id, skill, inputs, note, refusal = null }) {
  const grounding = groundingFor(catalog, skill, inputs);
  const scope = sortRowIds(collectRowIds(grounding));
  if (skill === 'event-context' && inputs.anchor_row_id && !grounding.error) {
    scope.push(...sortRowIds([inputs.anchor_row_id]).filter((rowId) => !scope.includes(rowId)));
  }
  let reference = { required_facts: [], required_citations: [], expected_flags: [] };
  if (refusal) {
    reference = {
      required_facts: [],
      required_citations: [],
      expected_flags: [`refused:${refusal}`]
    };
  } else if (skill === 'event-context') reference = eventContextReference(grounding);
  else if (skill === 'subject-summary') reference = subjectSummaryReference(grounding);
  else if (skill === 'lab-trajectory') reference = labTrajectoryReference(grounding);
  else if (skill === 'dose-journey') {
    reference = doseJourneyReference(grounding, catalog.overview(inputs.subject));
  } else if (skill === 'disposition') {
    reference = dispositionReference(grounding, catalog.overview(inputs.subject));
  }
  return {
    id,
    skill,
    inputs,
    reference: {
      required_facts: reference.required_facts,
      required_citations: reference.required_citations,
      scope_row_ids: refusal ? [] : sortRowIds(scope),
      expected_flags: reference.expected_flags,
      refusal
    },
    notes: `${note}; ${PROVENANCE_NOTE}`
  };
}

/**
 * The grounding result for a case, exactly as the runtime computes it.
 * @private
 */
function groundingFor(catalog, skill, inputs) {
  switch (skill) {
    case 'event-context':
      return catalog.window(inputs.subject, inputs.anchor_row_id, inputs.window_days);
    case 'subject-summary':
      return catalog.overview(inputs.subject);
    case 'lab-trajectory':
      return catalog.labs(inputs.subject, inputs.test);
    case 'dose-journey':
      return catalog.doses(inputs.subject);
    case 'disposition':
      return catalog.events(inputs.subject, 'DS');
    default:
      throw new Error(`build-golden: unknown skill ${skill}`);
  }
}

// ---------------------------------------------------------------------------
// Selection: which participants, and why.
// ---------------------------------------------------------------------------

const hasSerious = (catalog, usubjid) =>
  (catalog.overview(usubjid).serious_adverse_events || []).length > 0;

const referenceDisposition = (catalog, usubjid) =>
  (catalog.overview(usubjid).disposition || []).find((row) => row.reference) || null;

/** A disposition record whose recorded wording would trip the forbidden-phrase block. */
const dispositionIsQuotable = (catalog, usubjid) =>
  (catalog.events(usubjid, 'DS').rows || []).every(
    (row) => !forbiddenMatch(`${row.label} ${row.detail ?? ''}`)
  );

/** The window lists of an anchor, all empty. */
function windowIsEmpty(catalog, usubjid, rowId) {
  const g = catalog.window(usubjid, rowId);
  if (g.error) return false;
  return ![
    g.con_meds_active,
    g.abnormal_labs,
    g.dose_changes,
    g.prior_same_term_events,
    g.con_meds_started_later
  ].some((list) => (list || []).length);
}

/**
 * Build the event-context cases.
 * @private
 */
function eventContextCases(catalog, demoAnchor) {
  const cases = [];
  const used = new Set([DEMO_SUBJECT]);
  cases.push(
    makeCase(catalog, {
      id: 'event-context/demo-erythema-day-30',
      skill: 'event-context',
      inputs: { subject: DEMO_SUBJECT, anchor_row_id: demoAnchor.row_id, window_days: 30 },
      note: `the demo participant's ${demoAnchor.label} anchor on day ${demoAnchor.start_day}, ±30 days`
    }),
    makeCase(catalog, {
      id: 'event-context/demo-erythema-day-30-narrow-window',
      skill: 'event-context',
      inputs: { subject: DEMO_SUBJECT, anchor_row_id: demoAnchor.row_id, window_days: 7 },
      note: `the same ${demoAnchor.label} anchor with a ±7-day window, so the scope shrinks`
    })
  );

  const serious = catalog.findAll((usubjid) => hasSerious(catalog, usubjid), 3);
  for (const usubjid of serious) {
    used.add(usubjid);
    const row = catalog.overview(usubjid).serious_adverse_events[0];
    const anchor = anchorRow(
      catalog,
      usubjid,
      'AE',
      (candidate) => candidate.label === row.label && candidate.start_day === row.start_day
    );
    cases.push(
      makeCase(catalog, {
        id: `event-context/serious-ae-${anchor.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-day-${anchor.start_day}`,
        skill: 'event-context',
        inputs: { subject: usubjid, anchor_row_id: anchor.row_id, window_days: 30 },
        note: `a serious adverse event anchor (${anchor.label} on day ${anchor.start_day})`
      })
    );
  }

  const emptyWindows = [];
  for (const usubjid of catalog.subjects) {
    if (used.has(usubjid)) continue;
    const row = (catalog.events(usubjid, 'AE').rows || []).find((candidate) =>
      windowIsEmpty(catalog, usubjid, candidate.row_id)
    );
    if (row) {
      emptyWindows.push([usubjid, row]);
      used.add(usubjid);
    }
    if (emptyWindows.length >= 2) break;
  }
  for (const [usubjid, row] of emptyWindows) {
    cases.push(
      makeCase(catalog, {
        id: `event-context/empty-window-day-${row.start_day}-${usubjid.slice(-4)}`,
        skill: 'event-context',
        inputs: { subject: usubjid, anchor_row_id: row.row_id },
        note: `an anchor whose ±window holds nothing but the anchor (${row.label} on day ${row.start_day})`
      })
    );
  }

  const interruption = catalog.find(
    (usubjid) => (catalog.doses(usubjid).changes || []).some((c) => c.direction === 'interruption'),
    used
  );
  if (interruption) {
    used.add(interruption);
    const change = catalog
      .doses(interruption)
      .changes.find((candidate) => candidate.direction === 'interruption');
    cases.push(
      makeCase(catalog, {
        id: `event-context/dose-interruption-day-${change.start_day}`,
        skill: 'event-context',
        inputs: { subject: interruption, anchor_row_id: change.row_id, window_days: 30 },
        note: `an anchor on a dose interruption (${change.dose_from} → ${change.dose_to} ${change.unit} on day ${change.start_day})`
      })
    );
  }

  const discontinued = catalog.find((usubjid) => {
    const row = referenceDisposition(catalog, usubjid);
    return Boolean(row) && row.label !== 'COMPLETED' && dispositionIsQuotable(catalog, usubjid);
  }, used);
  if (discontinued) {
    used.add(discontinued);
    const row = referenceDisposition(catalog, discontinued);
    cases.push(
      makeCase(catalog, {
        id: `event-context/disposition-anchor-day-${row.start_day}`,
        skill: 'event-context',
        inputs: { subject: discontinued, anchor_row_id: row.row_id, window_days: 30 },
        note: `an anchor on the disposition event (${row.label} on day ${row.start_day})`
      })
    );
  }

  const repeated = catalog.find((usubjid) => repeatedTerm(catalog, usubjid) !== null, used);
  if (repeated) {
    used.add(repeated);
    const term = repeatedTerm(catalog, repeated);
    const rows = (catalog.events(repeated, 'AE').rows || []).filter((row) => row.label === term);
    const anchor = rows[rows.length - 1];
    cases.push(
      makeCase(catalog, {
        id: `event-context/recurrent-term-day-${anchor.start_day}`,
        skill: 'event-context',
        inputs: { subject: repeated, anchor_row_id: anchor.row_id, window_days: 30 },
        note: `an anchor with earlier or same-day records of the same preferred term (${term})`
      })
    );
  }

  const busy = catalog.find((usubjid) => {
    const row = (catalog.events(usubjid, 'AE').rows || [])[0];
    if (!row) return false;
    const g = catalog.window(usubjid, row.row_id);
    return !g.error && (g.con_meds_active || []).length >= 5 && (g.abnormal_labs || []).length >= 1;
  }, used);
  if (busy) {
    used.add(busy);
    const row = catalog.events(busy, 'AE').rows[0];
    cases.push(
      makeCase(catalog, {
        id: `event-context/crowded-window-day-${row.start_day}`,
        skill: 'event-context',
        inputs: { subject: busy, anchor_row_id: row.row_id, window_days: 30 },
        note: `an anchor with a crowded window (five or more con-meds active and an abnormal lab)`
      })
    );
  }

  const missing = 'AE-999999';
  if ((catalog.window(DEMO_SUBJECT, missing) || {}).error !== 'anchor-not-found') {
    throw new Error('build-golden: the unresolvable anchor now resolves');
  }
  cases.push(
    makeCase(catalog, {
      id: 'event-context/anchor-not-found',
      skill: 'event-context',
      inputs: { subject: DEMO_SUBJECT, anchor_row_id: missing },
      note: 'an anchor id that resolves to no row of this participant',
      refusal: 'anchor-not-found'
    })
  );
  return cases.slice(0, CASE_BUDGET['event-context']);
}

/**
 * A preferred term the participant records more than once on DIFFERENT days,
 * so the anchor has a true earlier occurrence rather than a same-day duplicate.
 * @private
 */
function repeatedTerm(catalog, usubjid) {
  const days = new Map();
  for (const row of catalog.events(usubjid, 'AE').rows || []) {
    if (!finite(row.start_day)) continue;
    if (!days.has(row.label)) days.set(row.label, new Set());
    days.get(row.label).add(row.start_day);
  }
  for (const [term, seen] of days) if (seen.size > 1) return term;
  return null;
}

/**
 * Build the subject-summary cases.
 * @private
 */
function subjectSummaryCases(catalog) {
  const used = new Set([DEMO_SUBJECT]);
  const cases = [
    makeCase(catalog, {
      id: 'subject-summary/demo-participant',
      skill: 'subject-summary',
      inputs: { subject: DEMO_SUBJECT },
      note: 'the demo participant the Patient Journey Explorer opens on'
    })
  ];
  const picks = [
    [
      'serious-adverse-events',
      (usubjid) => hasSerious(catalog, usubjid),
      'a participant with a serious adverse event on record'
    ],
    [
      'no-adverse-events',
      (usubjid) => (catalog.overview(usubjid).counts.AE || 0) === 0,
      'a participant with no adverse events at all'
    ],
    [
      'unplaceable-records',
      (usubjid) => Object.values(catalog.overview(usubjid).unplaceable || {}).some((n) => n > 0),
      'a participant with records that carry no usable study day'
    ],
    [
      'death-disposition',
      (usubjid) => (referenceDisposition(catalog, usubjid) || {}).label === 'DEATH',
      'a participant whose disposition event is DEATH'
    ],
    [
      'exposure-end-unrecorded',
      (usubjid) =>
        ((catalog.overview(usubjid).exposure_extent || {}).last_end_state || '') === 'unrecorded',
      'a participant whose last exposure record has no end date'
    ]
  ];
  for (const [slug, predicate, note] of picks) {
    const usubjid = catalog.find(predicate, used);
    if (!usubjid) continue;
    used.add(usubjid);
    cases.push(
      makeCase(catalog, {
        id: `subject-summary/${slug}`,
        skill: 'subject-summary',
        inputs: { subject: usubjid },
        note
      })
    );
  }
  return cases.slice(0, CASE_BUDGET['subject-summary']);
}

/**
 * Build the lab-trajectory cases.
 * @private
 */
function labTrajectoryCases(catalog) {
  const tests = DEMO_SETTINGS.lb_tests;
  const demoTest = tests.find((test) => (catalog.labs(DEMO_SUBJECT, test).points || []).length > 1);
  const cases = [
    makeCase(catalog, {
      id: 'lab-trajectory/demo-participant',
      skill: 'lab-trajectory',
      inputs: { subject: DEMO_SUBJECT, test: demoTest },
      note: `the demo participant's ${demoTest} series`
    })
  ];
  const used = new Set([DEMO_SUBJECT]);
  const pick = (predicate) => {
    for (const usubjid of catalog.subjects) {
      if (used.has(usubjid)) continue;
      for (const test of tests) {
        const series = catalog.labs(usubjid, test);
        if (series.error) continue;
        if (predicate(series)) return [usubjid, test, series];
      }
    }
    return null;
  };
  const change = pick(
    (series) =>
      series.points.filter((row) => row.abnormal_by_change).length >= 2 &&
      series.points.some((row) => finite(row.x_baseline) && row.x_baseline >= 2)
  );
  if (change) {
    used.add(change[0]);
    cases.push(
      makeCase(catalog, {
        id: 'lab-trajectory/change-from-baseline',
        skill: 'lab-trajectory',
        inputs: { subject: change[0], test: change[1] },
        note: `a ${change[1]} series that fires the change-from-baseline rule`
      })
    );
  }
  const single = pick((series) => series.points.length === 1);
  if (single) {
    used.add(single[0]);
    cases.push(
      makeCase(catalog, {
        id: 'lab-trajectory/single-point',
        skill: 'lab-trajectory',
        inputs: { subject: single[0], test: single[1] },
        note: `a ${single[1]} series with one measurement`
      })
    );
  }
  const absent = ['Creatinine', 'Haemoglobin', 'Platelets'].find(
    (test) => catalog.labs(DEMO_SUBJECT, test).error === 'no-lab-rows'
  );
  cases.push(
    makeCase(catalog, {
      id: 'lab-trajectory/test-not-recorded',
      skill: 'lab-trajectory',
      inputs: { subject: DEMO_SUBJECT, test: absent },
      note: `a test (${absent}) the participant has no rows for`,
      refusal: 'insufficient-data'
    })
  );
  return cases.slice(0, CASE_BUDGET['lab-trajectory']);
}

/**
 * Build the dose-journey cases.
 * @private
 */
function doseJourneyCases(catalog) {
  const used = new Set([DEMO_SUBJECT]);
  const cases = [
    makeCase(catalog, {
      id: 'dose-journey/demo-participant',
      skill: 'dose-journey',
      inputs: { subject: DEMO_SUBJECT },
      note: 'the demo participant, whose dose is increased and then reduced'
    })
  ];
  const interruptions = catalog
    .findAll(
      (usubjid) =>
        (catalog.doses(usubjid).changes || []).some((c) => c.direction === 'interruption'),
      2
    )
    .filter((usubjid) => !used.has(usubjid));
  for (const usubjid of interruptions) {
    used.add(usubjid);
    const change = catalog.doses(usubjid).changes.find((c) => c.direction === 'interruption');
    cases.push(
      makeCase(catalog, {
        id: `dose-journey/interruption-day-${change.start_day}-${usubjid.slice(-4)}`,
        skill: 'dose-journey',
        inputs: { subject: usubjid },
        note: `a participant whose dose is interrupted on day ${change.start_day}`
      })
    );
  }
  const serious = catalog.find((usubjid) => hasSerious(catalog, usubjid), used);
  if (serious) {
    used.add(serious);
    cases.push(
      makeCase(catalog, {
        id: 'dose-journey/serious-adverse-event',
        skill: 'dose-journey',
        inputs: { subject: serious },
        note: 'a participant with a serious adverse event on the same time line as the exposure'
      })
    );
  }
  return cases.slice(0, CASE_BUDGET['dose-journey']);
}

/**
 * Build the disposition cases.
 * @private
 */
function dispositionCases(catalog) {
  const used = new Set([DEMO_SUBJECT]);
  const cases = [
    makeCase(catalog, {
      id: 'disposition/demo-participant',
      skill: 'disposition',
      inputs: { subject: DEMO_SUBJECT },
      note: 'the demo participant, who completed the study'
    })
  ];
  const wanted = [
    [
      'discontinued-adverse-event',
      'ADVERSE EVENT',
      'a participant discontinued on an adverse event'
    ],
    ['death', 'DEATH', 'a participant whose disposition event is DEATH'],
    [
      'sponsor-terminated',
      'STUDY TERMINATED BY SPONSOR',
      'a participant the sponsor terminated from the study'
    ]
  ];
  for (const [slug, decod, note] of wanted) {
    const usubjid = catalog.find(
      (candidate) =>
        (referenceDisposition(catalog, candidate) || {}).label === decod &&
        dispositionIsQuotable(catalog, candidate),
      used
    );
    if (!usubjid) continue;
    used.add(usubjid);
    cases.push(
      makeCase(catalog, {
        id: `disposition/${slug}`,
        skill: 'disposition',
        inputs: { subject: usubjid },
        note
      })
    );
  }
  return cases.slice(0, CASE_BUDGET.disposition);
}

/**
 * Derive the whole golden set. Pure: same data in, identical text out.
 * @returns {{cases: Object[], bySkill: Object<string, Object[]>, files: Object<string, string>}} The cases and the exact file text for each path (absolute).
 */
export function buildGolden() {
  const catalog = createCatalog();
  const structured = catalog.service.structuredFor(DEMO_SUBJECT);
  if (!structured)
    throw new Error(`build-golden: no record for the demo participant ${DEMO_SUBJECT}`);
  const demoAnchor = anchorRow(
    catalog,
    DEMO_SUBJECT,
    'AE',
    (row) => row.label === 'ERYTHEMA' && row.start_day === 30
  );
  if (!demoAnchor) throw new Error('build-golden: the demo ERYTHEMA day-30 anchor is gone');

  const bySkill = {
    'event-context': eventContextCases(catalog, demoAnchor),
    'subject-summary': subjectSummaryCases(catalog),
    'lab-trajectory': labTrajectoryCases(catalog),
    'dose-journey': doseJourneyCases(catalog),
    disposition: dispositionCases(catalog)
  };
  const files = {};
  for (const slug of SKILL_ORDER) {
    const cases = bySkill[slug];
    if (cases.length !== CASE_BUDGET[slug]) {
      throw new Error(
        `build-golden: ${slug} produced ${cases.length} cases, expected ${CASE_BUDGET[slug]}`
      );
    }
    files[path.join(GOLDEN_DIR, `${slug}.jsonl`)] = `${cases
      .map((entry) => JSON.stringify(entry))
      .join('\n')}\n`;
    files[path.join(SKILLS_DIR, slug, 'examples.jsonl')] = `${cases
      .slice(0, EXAMPLE_COUNT)
      .map((entry) => JSON.stringify({ inputs: entry.inputs, reference: entry.reference }))
      .join('\n')}\n`;
  }
  return { cases: SKILL_ORDER.flatMap((slug) => bySkill[slug]), bySkill, files };
}

/**
 * Read a golden file back, tolerating a missing file (the first build).
 * @param {string} file An absolute path.
 * @returns {?string} The text, or null.
 */
function readIfPresent(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write the golden set to disk.
 * @param {{log?: Function}} [options] `log` receives one line per file.
 * @returns {{written: string[], unchanged: string[]}} What changed.
 */
export function writeGolden({ log = console.log } = {}) {
  const { files, cases } = buildGolden();
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const written = [];
  const unchanged = [];
  for (const [file, text] of Object.entries(files)) {
    if (readIfPresent(file) === text) {
      unchanged.push(file);
      continue;
    }
    writeFileSync(file, text, 'utf8');
    written.push(file);
  }
  log(
    `golden set: ${cases.length} cases across ${SKILL_ORDER.length} skills; ${written.length} file(s) written, ${unchanged.length} unchanged`
  );
  for (const file of written) log(`  wrote ${path.relative(rootDir, file)}`);
  return { written, unchanged };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  writeGolden();
}
