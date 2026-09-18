import { describe, expect, test } from 'vitest';
import { buildContext, relativeDay } from '../../../src/patient-journey-explorer/anchor.js';
import { createDataService } from '../../../src/patientJourneyNarratives/dataService.js';
import {
  TOOLS,
  collectRowIds,
  normalizeRowId,
  runTool,
  toolDefinitions
} from '../../../src/patientJourneyNarratives/tools/index.js';
import {
  DEMO_SETTINGS,
  DEMO_SUBJECT,
  loadDemoData
} from '../../evals/patient-journey-narratives/demo-data.mjs';

// The six read-only tools the AI layer reads the record through (#146, design
// §5). They return the chart's own structured rows, never prose, and every row
// carries the chart's event id as `row_id` — the runtime collects those ids as
// the citation scope, so a model can cite only what it was shown. The context
// tool must agree with the chart's own buildContext(): if the two ever drift,
// the narrative describes a different window than the panel on screen.
// PJE-NARR-002.

// ---- a tiny hand-built record, every cell a string as CSV-parsed data arrives.
// Expected values are computed here in the comments, not pasted from a run.
//
// EX  [0] 50 mg  days 1-20   [1] 100 mg days 21-60  -> DOSE-1 at day 21 (increase)
// AE  [0] RASH days 10-12 MILD, recovered (closed)
//     [1] RASH day 30, end blank, AESER=Y, AEOUT blank (end unrecorded)  <- anchor
// LB  ALT d-5 20 NORMAL (ABLFL=Y, the baseline), d25 90 HIGH (ULN 40), d70 25 NORMAL
// CM  [0] ASPIRIN d5 -> blank (end not recorded)  [1] IBUPROFEN d40 -> d50
//     [2] PARACETAMOL d-1 -> blank (starts the day before first dose)
// DS  [0] COMPLETED day 90 (the disposition event)
//
// Anchored on AE-1 (day 30) with days=30, in elapsed space (no day 0):
//   window elapsed [-1, 59] -> study days -1 to 60
//   con-meds active at day 30: ASPIRIN (d5, no end), PARACETAMOL (d-1, no end) -> 2
//     IBUPROFEN starts at day 40, inside the window and after the anchor      -> later 1
//   abnormal labs in the window: ALT d25 (HIGH, and 90/20 = 4.5x baseline)    -> 1
//     ratio 90/40 = 2.25 x ULN; d-5 and d70 are outside the window
//   dose changes in the window: DOSE-1 at day 21                              -> 1
//   prior same-term events: AE-0 RASH on day 10                               -> 1
//   days_from_anchor: PARACETAMOL d-1 -> relativeDay(-1, 30) = -30, NOT -31
const TINY = {
  ex: [
    { USUBJID: 'S1', EXTRT: 'DRUG X', EXDOSE: '50', EXDOSU: 'mg', EXSTDY: '1', EXENDY: '20' },
    { USUBJID: 'S1', EXTRT: 'DRUG X', EXDOSE: '100', EXDOSU: 'mg', EXSTDY: '21', EXENDY: '60' }
  ],
  ae: [
    {
      USUBJID: 'S1',
      AETERM: 'rash',
      AEDECOD: 'RASH',
      ASTDY: '10',
      AENDY: '12',
      AESEV: 'MILD',
      AESER: 'N',
      AEOUT: 'RECOVERED/RESOLVED'
    },
    {
      USUBJID: 'S1',
      AETERM: 'severe rash',
      AEDECOD: 'RASH',
      ASTDY: '30',
      AENDY: '',
      AESEV: 'SEVERE',
      AESER: 'Y',
      AEOUT: ''
    }
  ],
  lb: [
    {
      USUBJID: 'S1',
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: '20',
      LBSTRESU: 'U/L',
      LBSTNRLO: '7',
      LBSTNRHI: '40',
      LBNRIND: 'NORMAL',
      ABLFL: 'Y',
      LBDY: '-5'
    },
    {
      USUBJID: 'S1',
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: '90',
      LBSTRESU: 'U/L',
      LBSTNRLO: '7',
      LBSTNRHI: '40',
      LBNRIND: 'HIGH',
      ABLFL: '',
      LBDY: '25'
    },
    {
      USUBJID: 'S1',
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: '25',
      LBSTRESU: 'U/L',
      LBSTNRLO: '7',
      LBSTNRHI: '40',
      LBNRIND: 'NORMAL',
      ABLFL: '',
      LBDY: '70'
    }
  ],
  cm: [
    { USUBJID: 'S1', CMTRT: 'ASPIRIN', CMCLAS: 'ANALGESICS', CMSTDY: '5', CMENDY: '' },
    { USUBJID: 'S1', CMTRT: 'IBUPROFEN', CMCLAS: 'ANALGESICS', CMSTDY: '40', CMENDY: '50' },
    { USUBJID: 'S1', CMTRT: 'PARACETAMOL', CMCLAS: 'ANALGESICS', CMSTDY: '-1', CMENDY: '' }
  ],
  ds: [
    {
      USUBJID: 'S1',
      DSDECOD: 'COMPLETED',
      DSTERM: 'PROTOCOL COMPLETED',
      DSCAT: 'DISPOSITION EVENT',
      DSSTDY: '90'
    }
  ]
};

const tiny = createDataService({ data: TINY });
const demo = createDataService({ data: loadDemoData(), settings: DEMO_SETTINGS });
// The demo's opening anchor: ERYTHEMA on day 30 (tests/evals/.../demo-data.mjs).
const DEMO_ANCHOR = 'AE-973';

describe('every tool returns the chart’s own rows (PJE-NARR-002)', () => {
  test('PJE-NARR-002: each of the six tools returns structured rows whose row_id is an event id of the chart’s record (#146)', () => {
    const structured = tiny.structuredFor('S1');
    const chartIds = new Set(structured.allEvents.map((event) => event.id));
    expect(chartIds.has('DOSE-1'), 'derived dose changes are events too').toBe(true);

    const results = [
      TOOLS.get_subject_overview.run(tiny, { usubjid: 'S1' }),
      TOOLS.get_events.run(tiny, { usubjid: 'S1', domain: 'AE' }),
      TOOLS.get_context_window.run(tiny, { usubjid: 'S1', anchor_row_id: 'AE-1', days: 30 }),
      TOOLS.get_lab_series.run(tiny, { usubjid: 'S1', test: 'ALT' }),
      TOOLS.get_dose_history.run(tiny, { usubjid: 'S1' }),
      TOOLS.get_source_row.run(tiny, { usubjid: 'S1', row_id: 'AE-1' })
    ];
    expect(Object.keys(TOOLS)).toHaveLength(6);
    for (const result of results) {
      expect(result.error, JSON.stringify(result).slice(0, 80)).toBeUndefined();
      const ids = collectRowIds(result);
      expect(ids.size).toBeGreaterThan(0);
      for (const id of ids) expect(chartIds.has(id), `${id} is a chart event id`).toBe(true);
    }

    // Every tool the model may call declares a name, a description and a JSON
    // Schema (what toolDefinitions() hands the adapter — see the next test).
    for (const [name, tool] of Object.entries(TOOLS)) {
      expect(tool.name, name).toBe(name);
      expect(typeof tool.description, name).toBe('string');
      expect(tool.input_schema.type, name).toBe('object');
      expect(typeof tool.run, name).toBe('function');
    }
  });

  // The definitions a provider receives: name, description and schema per
  // declared tool, in the order asked; unknown names are skipped (#146).
  test('PJE-NARR-002: toolDefinitions returns one { name, description, input_schema } per known tool, in the order asked (#146)', () => {
    const definitions = toolDefinitions(['get_source_row', 'nope', 'get_events']);
    expect(definitions.map((tool) => tool.name)).toEqual(['get_source_row', 'get_events']);
    for (const definition of definitions) {
      expect(Object.keys(definition).sort()).toEqual(['description', 'input_schema', 'name']);
      expect(definition.input_schema.type).toBe('object');
    }
  });

  test('PJE-NARR-002: get_events filters by seriousness, preferred term, test, day range and max, and reports what it truncated (#146)', () => {
    const rows = (filters) => TOOLS.get_events.run(tiny, { usubjid: 'S1', domain: 'AE', filters });
    expect(rows().rows.map((row) => row.row_id)).toEqual(['AE-0', 'AE-1']);
    expect(rows({ serious: true }).rows.map((row) => row.row_id)).toEqual(['AE-1']);
    // The preferred term matches case-insensitively; both rows decode to RASH.
    expect(rows({ term: 'rash' }).rows.map((row) => row.row_id)).toEqual(['AE-0', 'AE-1']);
    const labs = (filters) => TOOLS.get_events.run(tiny, { usubjid: 'S1', domain: 'LB', filters });
    expect(labs({ test: 'alt' }).rows.map((row) => row.row_id)).toEqual(['LB-0', 'LB-1', 'LB-2']);
    expect(labs({ from_day: 0, to_day: 30 }).rows.map((row) => row.row_id)).toEqual(['LB-1']);
    const capped = labs({ max: 1 });
    expect(capped.total).toBe(3);
    expect(capped.truncated).toBe(2);
    expect(capped.rows).toHaveLength(1);

    // An adverse-event row carries the safety columns; a lab row the lab ones.
    const [ae] = rows({ serious: true }).rows;
    expect(ae).toMatchObject({
      row_id: 'AE-1',
      domain: 'AE',
      label: 'RASH',
      start_day: 30,
      end_day: null,
      end_state: 'unrecorded',
      severity: 'Severe',
      serious: true
    });
  });
});

describe('get_context_window agrees with the chart (PJE-NARR-002)', () => {
  test('PJE-NARR-002: on the demo anchor the tool returns buildContext’s lists and counts, row for row (#146)', () => {
    const structured = demo.structuredFor(DEMO_SUBJECT);
    const anchor = structured.allEvents.find((event) => event.id === DEMO_ANCHOR);
    expect(anchor.label).toBe('ERYTHEMA');
    expect(anchor.day).toBe(30);

    const bundle = buildContext(structured, anchor, {
      ...demo.settings,
      context_window_days: 30
    });
    const window = TOOLS.get_context_window.run(demo, {
      usubjid: DEMO_SUBJECT,
      anchor_row_id: DEMO_ANCHOR,
      days: 30
    });

    const ids = (rows) => rows.map((row) => row.row_id);
    expect(window.anchor.row_id).toBe(bundle.anchor.id);
    expect(window.window).toEqual({
      days: 30,
      start_day: bundle.window.startDay,
      end_day: bundle.window.endDay
    });
    expect(ids(window.con_meds_active)).toEqual(bundle.conMeds.map((event) => event.id));
    expect(ids(window.con_meds_started_later)).toEqual(bundle.conMedsLater.map((e) => e.id));
    expect(ids(window.abnormal_labs)).toEqual(bundle.abnormalLabs.map((event) => event.id));
    expect(ids(window.dose_changes)).toEqual(bundle.doseChanges.map((event) => event.id));
    expect(ids(window.prior_same_term_events)).toEqual(bundle.priorEvents.map((e) => e.id));
    expect(ids(window.in_window)).toEqual(bundle.inWindow.map((event) => event.id));
    expect(window.counts).toEqual(bundle.counts);
    expect(window.not_evaluated.con_meds_without_start).toBe(
      bundle.notEvaluated.conMedsWithoutStart
    );
    expect(window.not_evaluated.con_meds_end_unrecorded).toBe(
      bundle.notEvaluated.conMedsEndUnrecorded
    );
    expect(window.not_evaluated.adverse_events_end_unrecorded).toBe(
      bundle.notEvaluated.aeEndUnrecorded
    );

    // The demo subject's day-30 ERYTHEMA anchor, as the panel shows it.
    expect(window.counts).toEqual({
      conMeds: 7,
      conMedsLater: 2,
      abnormalLabs: 1,
      doseChanges: 1,
      priorEvents: 0,
      inWindow: window.in_window.length
    });
    expect(window.abnormal_labs[0]).toMatchObject({
      test: 'Aspartate Aminotransferase',
      value: 36,
      start_day: 27,
      days_from_anchor: -3,
      abnormal_reason: 'flag',
      ratio_to_limit: { ratio: 1.06, limit: 'ULN' }
    });
    expect(window.dose_changes[0]).toMatchObject({
      dose_from: 54,
      dose_to: 81,
      unit: 'mg',
      direction: 'increase',
      start_day: 17
    });
  });

  test('PJE-NARR-002: days_from_anchor is the elapsed-day offset relativeDay() computes, across first dose (#146)', () => {
    const window = TOOLS.get_context_window.run(tiny, {
      usubjid: 'S1',
      anchor_row_id: 'AE-1',
      days: 30
    });
    expect(window.anchor.days_from_anchor).toBe(0);
    expect(window.window).toEqual({ days: 30, start_day: -1, end_day: 60 });
    expect(window.counts).toEqual({
      conMeds: 2,
      conMedsLater: 1,
      abnormalLabs: 1,
      doseChanges: 1,
      priorEvents: 1,
      inWindow: window.in_window.length
    });

    const rows = [
      ...window.con_meds_active,
      ...window.con_meds_started_later,
      ...window.abnormal_labs,
      ...window.dose_changes,
      ...window.prior_same_term_events,
      ...window.in_window
    ];
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) {
      expect(row.days_from_anchor, row.row_id).toBe(relativeDay(row.start_day, 30));
    }
    // PARACETAMOL starts on day -1: there is no day 0, so the offset is -30.
    const paracetamol = window.con_meds_active.find((row) => row.label === 'PARACETAMOL');
    expect(paracetamol.start_day).toBe(-1);
    expect(paracetamol.days_from_anchor).toBe(-30);
    // The prior same-term event also reports how long before the anchor it began.
    expect(window.prior_same_term_events[0]).toMatchObject({
      row_id: 'AE-0',
      days_from_anchor: -20,
      days_before_anchor: 20
    });
    expect(window.abnormal_labs[0]).toMatchObject({
      row_id: 'LB-1',
      abnormal_reason: 'both',
      ratio_to_limit: { ratio: 2.25, limit: 'ULN' },
      baseline: { value: 20, day: -5, rule: 'flag' },
      x_baseline: 4.5
    });
    expect(window.not_evaluated.con_meds_end_unrecorded).toBe(2);
  });
});

describe('the lab, dose and source-row tools (PJE-NARR-002)', () => {
  test('PJE-NARR-002: get_lab_series returns the baseline with its rule, the peak, and each point’s ratios and abnormality rules (#146)', () => {
    const alt = TOOLS.get_lab_series.run(tiny, { usubjid: 'S1', test: 'ALT' });
    expect(alt).toMatchObject({
      subject: 'S1',
      test: 'Alanine Aminotransferase',
      test_code: 'ALT',
      unit: 'U/L',
      lln: 7,
      uln: 40,
      change_factor: 2,
      baseline: { value: 20, day: -5, rule: 'flag', row_id: 'LB-0' },
      peak: { row_id: 'LB-1', day: 25, value: 90 }
    });
    expect(alt.points.map((point) => point.row_id)).toEqual(['LB-0', 'LB-1', 'LB-2']);
    // d25: 90 U/L is HIGH (flag) and 90/20 = 4.5x the baseline (change rule).
    expect(alt.points[1]).toMatchObject({
      value: 90,
      x_baseline: 4.5,
      abnormal_by_flag: true,
      abnormal_by_change: true,
      ratio_to_limit: { ratio: 2.25, limit: 'ULN' }
    });
    // d70: 25 U/L is in range, 1.25x baseline — neither rule fires.
    expect(alt.points[2]).toMatchObject({
      x_baseline: 1.25,
      abnormal_by_flag: false,
      abnormal_by_change: false,
      ratio_to_limit: null
    });

    // The demo record, matched by test code rather than name.
    const ast = TOOLS.get_lab_series.run(demo, { usubjid: DEMO_SUBJECT, test: 'ast' });
    expect(ast.test).toBe('Aspartate Aminotransferase');
    expect(ast.points).toHaveLength(10);
    expect(ast.baseline).toEqual({ value: 29, day: -10, rule: 'flag', row_id: 'LB-6055' });
    expect(ast.peak).toEqual({ row_id: 'LB-6062', day: 145, value: 45 });
    const peak = ast.points.find((point) => point.row_id === 'LB-6062');
    expect(peak.ratio_to_limit).toEqual({ ratio: 1.32, limit: 'ULN' }); // 45 / 34
    expect(peak.x_baseline).toBe(1.55); // 45 / 29
  });

  test('PJE-NARR-002: get_dose_history returns the exposure records and the derived changes, each change naming its source and previous exposure rows (#146)', () => {
    const tinyDose = TOOLS.get_dose_history.run(tiny, { usubjid: 'S1' });
    expect(tinyDose.treatments).toEqual(['DRUG X']);
    expect(tinyDose.records.map((record) => record.row_id)).toEqual(['EX-0', 'EX-1']);
    expect(tinyDose.changes).toHaveLength(1);
    expect(tinyDose.changes[0]).toMatchObject({
      row_id: 'DOSE-1',
      source_row_id: 'EX-1',
      previous_row_id: 'EX-0',
      dose_from: 50,
      dose_to: 100,
      direction: 'increase',
      start_day: 21,
      unit: 'mg'
    });
    expect(tinyDose.unplaceable).toBe(0);

    const demoDose = TOOLS.get_dose_history.run(demo, { usubjid: DEMO_SUBJECT });
    expect(demoDose.records.map((record) => record.row_id)).toEqual(['EX-541', 'EX-542', 'EX-543']);
    expect(
      demoDose.changes.map((change) => [change.row_id, change.source_row_id, change.direction])
    ).toEqual([
      ['DOSE-542', 'EX-542', 'increase'],
      ['DOSE-543', 'EX-543', 'reduction']
    ]);
  });

  test('PJE-NARR-002: get_source_row returns the host’s raw row unchanged, beside the chart’s projection of it (#146)', () => {
    const result = TOOLS.get_source_row.run(tiny, { usubjid: 'S1', row_id: 'AE-1' });
    expect(result.row_id).toBe('AE-1');
    expect(result.domain).toBe('AE');
    // Every column the host passed in, verbatim — the verbatim term included.
    expect(result.source).toEqual(TINY.ae[1]);
    expect(result.source).not.toBe(TINY.ae[1]);
    expect(result.event.label).toBe('RASH');
    expect(result.event.detail).toBe('severe rash');

    // The demo row, reached with the colon spelling of the id.
    const demoRow = TOOLS.get_source_row.run(demo, { usubjid: DEMO_SUBJECT, row_id: 'AE:973' });
    expect(demoRow.row_id).toBe('AE-973');
    expect(demoRow.source.AEDECOD).toBe('ERYTHEMA');
    expect(demoRow.source.USUBJID).toBe(DEMO_SUBJECT);
  });
});

describe('tools refuse rather than throw (PJE-NARR-002)', () => {
  test('PJE-NARR-002: an unknown subject, anchor, test, row or tool comes back as an { error } object and never throws (#146)', () => {
    const calls = [
      ['get_subject_overview', { usubjid: 'NOBODY' }, 'unknown-subject'],
      ['get_events', { usubjid: 'NOBODY', domain: 'AE' }, 'unknown-subject'],
      ['get_context_window', { usubjid: 'S1', anchor_row_id: 'AE-404' }, 'anchor-not-found'],
      ['get_lab_series', { usubjid: 'S1', test: 'Creatinine' }, 'no-lab-rows'],
      ['get_source_row', { usubjid: 'S1', row_id: 'LB-404' }, 'row-not-found'],
      ['get_source_row', { row_id: 'AE-1' }, 'subject-required'],
      ['no_such_tool', { usubjid: 'S1' }, 'unknown-tool']
    ];
    for (const [name, input, reason] of calls) {
      let result;
      expect(() => {
        result = runTool(tiny, name, input);
      }, `${name} threw`).not.toThrow();
      expect(result.error, name).toBe(reason);
      expect(typeof result.message, name).toBe('string');
    }
    // The no-lab-rows refusal names what the record does hold, so the model can retry.
    const labs = runTool(tiny, 'get_lab_series', { usubjid: 'S1', test: 'Creatinine' });
    expect(labs.available_tests).toEqual(['Alanine Aminotransferase']);

    // A tool that throws is caught and reported, not propagated to the runtime.
    const broken = {
      settings: tiny.settings,
      structuredFor() {
        throw new Error('the record blew up');
      }
    };
    const failed = runTool(broken, 'get_subject_overview', { usubjid: 'S1' });
    expect(failed).toEqual({ error: 'tool-failed', message: 'the record blew up' });
  });

  test('PJE-NARR-002: runTool injects the generation’s subject into any tool that takes one (#146)', () => {
    expect(runTool(tiny, 'get_subject_overview', {}, { subject: 'S1' }).subject).toBe('S1');
    expect(runTool(tiny, 'get_source_row', { row_id: 'AE-1' }, { subject: 'S1' }).row_id).toBe(
      'AE-1'
    );
    // An explicit usubjid wins over the injected one.
    expect(
      runTool(tiny, 'get_events', { usubjid: 'NOBODY', domain: 'AE' }, { subject: 'S1' })
    ).toMatchObject({ error: 'unknown-subject' });
    // With no subject anywhere the tool refuses instead of guessing.
    expect(runTool(tiny, 'get_subject_overview', {}).error).toBe('unknown-subject');
  });
});

describe('row-id helpers (PJE-NARR-002)', () => {
  test('PJE-NARR-002: collectRowIds finds row_id, row_ids, source_row_id and previous_row_id at any depth, normalised (#146)', () => {
    const found = collectRowIds({
      anchor: { row_id: 'AE-1' },
      lists: [{ rows: [{ row_id: 'CM-2' }, { row_id: 'CM-2' }] }, { rows: [] }],
      terms: [{ term: 'RASH', row_ids: ['AE:1', 'AE-3'] }],
      changes: [{ row_id: 'DOSE-4', source_row_id: 'EX-4', previous_row_id: 'ex-3' }],
      deep: { deeper: { deepest: { row_id: 'ds-0' } } },
      // Not an id key: a bare string elsewhere is never collected.
      label: 'AE-9999',
      count: 3,
      nothing: null
    });
    expect([...found].sort()).toEqual(['AE-1', 'AE-3', 'CM-2', 'DOSE-4', 'DS-0', 'EX-3', 'EX-4']);
    expect(collectRowIds(null).size).toBe(0);
    expect(collectRowIds({ error: 'unknown-subject' }).size).toBe(0);
  });

  test('PJE-NARR-002: normalizeRowId turns the colon spelling into the chart’s dash form (#146)', () => {
    expect(normalizeRowId('AE:7')).toBe('AE-7');
    expect(normalizeRowId('ae:7')).toBe('AE-7');
    expect(normalizeRowId('  lb:203 ')).toBe('LB-203');
    expect(normalizeRowId('DOSE-4')).toBe('DOSE-4');
    expect(normalizeRowId('AE-7')).toBe('AE-7');
    // Anything that is not DOMAIN:index is upper-cased and left alone.
    expect(normalizeRowId('not an id')).toBe('NOT AN ID');
    expect(normalizeRowId(null)).toBe('');
    expect(normalizeRowId(undefined)).toBe('');
  });
});
