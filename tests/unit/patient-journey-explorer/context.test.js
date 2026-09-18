import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import {
  abnormalLabsInWindow,
  buildContext,
  conMedsActiveAt,
  conMedsStartingLater,
  doseChangesInWindow,
  priorSameTerm,
  windowBounds
} from '../../../src/patient-journey-explorer/anchor.js';

// The four context queries and the context bundle for the
// patient-journey-explorer module (#142, design §4.3, §5.7, D8, D16):
// con-meds active at the anchor with the two honesty counters, abnormal labs
// in the window with the reason that fired, dose changes in the window, prior
// same-term adverse events over the whole record, and the bundle a consumer
// reads without touching the DOM. PJE-CTX-001..004, PJE-PANEL-001, PJE-EVT-001.

const settings = syncSettings({});

const cmEvents = (rows) =>
  normalizeDomain(
    rows.map((row, i) => ({ USUBJID: 'P1', CMTRT: `CM${i}`, CMCLAS: 'ANALGESICS', ...row })),
    'CM',
    settings
  ).events;
const aeEvents = (rows, s = settings) =>
  normalizeDomain(
    rows.map((row) => ({ USUBJID: 'P1', AEOUT: 'RECOVERED/RESOLVED', ...row })),
    'AE',
    s
  ).events;
const lbEvents = (rows) =>
  normalizeDomain(
    rows.map((row) => ({
      USUBJID: 'P1',
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESU: 'U/L',
      LBSTNRLO: 7,
      LBSTNRHI: 34,
      LBNRIND: 'NORMAL',
      ...row
    })),
    'LB',
    settings
  ).events;
const dose = (day, direction, index) => ({
  id: `DOSE-${index}`,
  domain: 'EX',
  lane: 'doseChanges',
  subject: 'P1',
  kind: 'point',
  start: day,
  end: null,
  endState: 'closed',
  open: false,
  day,
  placeable: day !== null,
  clippedStart: false,
  label: '54 → 81 mg',
  detail: direction,
  category: 'XANOMELINE',
  value: 81,
  unit: 'mg',
  flags: { derived: true, direction },
  source: {},
  sourceIndex: index,
  sourceAnchorId: `pje-src-EX-${index}`
});

describe('conMedsActiveAt (PJE-CTX-001, D8, D16)', () => {
  it('PJE-CTX-001: active means started on or before the day and not ended before it — end === day is active, end === day - 1 is not (#142)', () => {
    const cms = cmEvents([
      { ASTDY: 10, AENDY: 30 }, // ends ON the day
      { ASTDY: 10, AENDY: 29 }, // ended the day before
      { ASTDY: 30, AENDY: 40 }, // starts ON the day
      { ASTDY: 31, AENDY: 40 } // starts after
    ]);
    const result = conMedsActiveAt(cms, 30, settings);
    expect(result.active.map((e) => e.id)).toEqual(['CM-0', 'CM-2']);
    expect(result.withoutStart).toBe(0);
    expect(result.endUnrecorded).toBe(0);
  });

  it('PJE-CTX-001: a con-med whose end was never recorded IS active and raises endUnrecorded; an ongoing one is active and does not (#142)', () => {
    const s = syncSettings({ cm_out_col: 'CMENRTPT' });
    const cms = normalizeDomain(
      [
        { USUBJID: 'P1', CMTRT: 'A', ASTDY: 1, AENDY: '' },
        { USUBJID: 'P1', CMTRT: 'B', ASTDY: 1, AENDY: '', CMENRTPT: 'ONGOING' },
        { USUBJID: 'P1', CMTRT: 'C', ASTDY: 1, AENDY: 20 }
      ],
      'CM',
      s
    ).events;
    expect(cms.map((e) => e.endState)).toEqual(['unrecorded', 'ongoing', 'closed']);
    const result = conMedsActiveAt(cms, 30, s);
    expect(result.active.map((e) => e.label)).toEqual(['A', 'B']);
    expect(result.endUnrecorded).toBe(1);
  });

  it('PJE-CTX-001: a con-med whose recorded end precedes its start is active only on its start day and is not counted as end-unrecorded (PJE-DATA-008) (#142)', () => {
    const [invalid] = cmEvents([{ ASTDY: 100, AENDY: 50 }]);
    expect(invalid.endState).toBe('unrecorded');
    expect(invalid.flagged).toHaveLength(1);
    expect(conMedsActiveAt([invalid], 300)).toEqual({
      active: [],
      withoutStart: 0,
      endUnrecorded: 0
    });
    const onDay = conMedsActiveAt([invalid], 100);
    expect(onDay.active.map((e) => e.id)).toEqual(['CM-0']);
    expect(onDay.endUnrecorded).toBe(0);
    expect(conMedsActiveAt([invalid], 101).active).toEqual([]);
  });

  it('PJE-CTX-001: a con-med with no usable start day is never asserted active and is counted in withoutStart (#142)', () => {
    const cms = cmEvents([{ ASTDY: '', AENDY: 40 }, { ASTDY: 'NA' }, { ASTDY: 1 }]);
    const result = conMedsActiveAt(cms, 30, settings);
    expect(result.active.map((e) => e.id)).toEqual(['CM-2']);
    expect(result.withoutStart).toBe(2);
    expect(result.endUnrecorded).toBe(1);
  });

  it('PJE-CTX-001: the day comparison runs in elapsed space and an unusable day returns nothing active (#142)', () => {
    const cms = cmEvents([{ ASTDY: -1, AENDY: 1 }]);
    expect(conMedsActiveAt(cms, 1, settings).active).toHaveLength(1);
    expect(conMedsActiveAt(cms, -1, settings).active).toHaveLength(1);
    expect(conMedsActiveAt(cms, 2, settings).active).toHaveLength(0);
    expect(conMedsActiveAt(cms, null, settings)).toEqual({
      active: [],
      withoutStart: 0,
      endUnrecorded: 0
    });
    expect(conMedsActiveAt(null, 30, settings).active).toEqual([]);
  });

  it('PJE-CTX-001: the active list is ordered by start day, then name, then sourceIndex (#142)', () => {
    const cms = cmEvents([
      { CMTRT: 'ZZZ', ASTDY: 5 },
      { CMTRT: 'AAA', ASTDY: 5 },
      { CMTRT: 'MMM', ASTDY: 1 }
    ]);
    expect(conMedsActiveAt(cms, 30, settings).active.map((e) => e.label)).toEqual([
      'MMM',
      'AAA',
      'ZZZ'
    ]);
  });
});

describe('conMedsStartingLater (PJE-CTX-001)', () => {
  it('PJE-CTX-001: returns only con-meds starting inside the window and AFTER the anchor day (#142)', () => {
    const bounds = windowBounds(30, 30); // study days -1..60
    const cms = cmEvents([
      { ASTDY: 30 }, // on the anchor: active, not later
      { ASTDY: 43 }, // later, in window
      { ASTDY: 60 }, // on the far edge, in window
      { ASTDY: 61 }, // outside
      { ASTDY: 10 }, // before the anchor
      { ASTDY: '' } // unplaceable
    ]);
    expect(conMedsStartingLater(cms, bounds, 30).map((e) => e.id)).toEqual(['CM-1', 'CM-2']);
    expect(conMedsStartingLater(cms, null, 30)).toEqual([]);
    expect(conMedsStartingLater(null, bounds, 30)).toEqual([]);
  });
});

describe('abnormalLabsInWindow (PJE-CTX-002)', () => {
  const rows = [
    { LBDY: -7, LBSTRESN: 10, ABLFL: 'Y' },
    { LBDY: 30, LBSTRESN: 36, LBNRIND: 'HIGH' }, // flag only (3.6x baseline -> also change)
    { LBDY: 35, LBSTRESN: 12 }, // normal
    { LBDY: 40, LBSTRESN: 21, LBNRIND: '' }, // change only (2.1x)
    { LBDY: 45, LBSTRESN: 35, LBNRIND: 'HIGH' }, // both
    { LBDY: 100, LBSTRESN: 200, LBNRIND: 'HIGH' } // outside the window
  ];

  it('PJE-CTX-002: keeps in-window points where the flag or the change rule fires, with the reason recorded on a copy (#142)', () => {
    const labs = lbEvents(rows);
    const bounds = windowBounds(40, 10); // study days 30..50
    const result = abnormalLabsInWindow(labs, bounds, settings);
    expect(result.map((e) => [e.day, e.flags.abnormalReason])).toEqual([
      [30, 'both'],
      [40, 'change'],
      [45, 'both']
    ]);
    expect(result[0]).not.toBe(labs[1]);
    expect(labs[1].flags.abnormalReason).toBe('');
    expect(result[0].source).toBe(labs[1].source);
  });

  it('PJE-CTX-002: a flag-only point reports "flag" and the baseline is computed over the whole record, not the window (#142)', () => {
    const labs = lbEvents([
      { LBDY: -7, LBSTRESN: 30, ABLFL: 'Y' },
      { LBDY: 30, LBSTRESN: 36, LBNRIND: 'HIGH' }
    ]);
    const bounds = windowBounds(30, 5);
    const result = abnormalLabsInWindow(labs, bounds, settings);
    expect(result.map((e) => e.flags.abnormalReason)).toEqual(['flag']);
    const filtered = labs.filter((e) => e.flags.abnormal === 'HIGH');
    expect(
      abnormalLabsInWindow(filtered, bounds, settings, { baselineEvents: labs }).map(
        (e) => e.flags.abnormalReason
      )
    ).toEqual(['flag']);
  });

  it('PJE-CTX-002: results are sorted by day then test name, and empty input yields [] (#142)', () => {
    const labs = [
      ...lbEvents([{ LBDY: 30, LBSTRESN: 36, LBNRIND: 'HIGH' }]),
      ...normalizeDomain(
        [
          {
            USUBJID: 'P1',
            LBTEST: 'Aspartate Aminotransferase',
            LBTESTCD: 'AST',
            LBSTRESN: 50,
            LBDY: 30,
            LBNRIND: 'HIGH'
          }
        ],
        'LB',
        settings
      ).events
    ];
    const result = abnormalLabsInWindow(labs, windowBounds(30, 5), settings);
    expect(result.map((e) => e.test)).toEqual([
      'Alanine Aminotransferase',
      'Aspartate Aminotransferase'
    ]);
    expect(abnormalLabsInWindow([], windowBounds(30, 5), settings)).toEqual([]);
    expect(abnormalLabsInWindow(labs, null, settings)).toEqual([]);
  });
});

describe('doseChangesInWindow (PJE-CTX-003)', () => {
  it('PJE-CTX-003: point containment, inclusive at both edges; unplaceable changes never match (#142)', () => {
    const bounds = windowBounds(30, 13); // study days 17..43
    const changes = [
      dose(17, 'increase', 1),
      dose(43, 'reduction', 2),
      dose(44, 'reduction', 3),
      dose(16, 'increase', 4),
      dose(null, 'increase', 5)
    ];
    expect(doseChangesInWindow(changes, bounds).map((e) => e.day)).toEqual([17, 43]);
    expect(doseChangesInWindow(changes, null)).toEqual([]);
    expect(doseChangesInWindow(null, bounds)).toEqual([]);
  });
});

describe('priorSameTerm (PJE-CTX-004)', () => {
  it('PJE-CTX-004: prior events with the same preferred term over the whole record, most recent first (#142)', () => {
    const aes = aeEvents([
      { AEDECOD: 'RASH', AETERM: 'rash', ASTDY: 5, AENDY: 6 },
      { AEDECOD: 'RASH', AETERM: 'rash again', ASTDY: 50, AENDY: 51 },
      { AEDECOD: 'HEADACHE', AETERM: 'headache', ASTDY: 60, AENDY: 61 },
      { AEDECOD: 'rash', AETERM: 'x', ASTDY: 100, AENDY: 101 },
      { AEDECOD: 'RASH', AETERM: 'later', ASTDY: 200, AENDY: 201 }
    ]);
    const anchor = aes[3];
    expect(priorSameTerm(aes, anchor, settings).map((e) => e.id)).toEqual(['AE-1', 'AE-0']);
  });

  it('PJE-CTX-004: the key falls back to the verbatim term when the preferred term is blank (#142)', () => {
    const aes = aeEvents([
      { AEDECOD: '', AETERM: 'Erythema', ASTDY: 5, AENDY: 6 },
      { AEDECOD: '', AETERM: 'ERYTHEMA ', ASTDY: 30, AENDY: 31 },
      { AEDECOD: '', AETERM: 'Other', ASTDY: 10, AENDY: 11 }
    ]);
    expect(priorSameTerm(aes, aes[1], settings).map((e) => e.id)).toEqual(['AE-0']);
    const blank = aeEvents([{ AEDECOD: 'X', AETERM: 'X', ASTDY: 1 }]);
    const noKey = { ...blank[0], source: { USUBJID: 'P1' } };
    expect(priorSameTerm(blank, noKey, settings)).toEqual([]);
  });

  it('PJE-CTX-004: a same-day prior is resolved by sourceIndex, and the anchor never lists itself (#142)', () => {
    const aes = aeEvents([
      { AEDECOD: 'RASH', AETERM: 'a', ASTDY: 30, AENDY: 31 },
      { AEDECOD: 'RASH', AETERM: 'b', ASTDY: 30, AENDY: 31 },
      { AEDECOD: 'RASH', AETERM: 'c', ASTDY: 30, AENDY: 31 }
    ]);
    expect(priorSameTerm(aes, aes[1], settings).map((e) => e.id)).toEqual(['AE-0']);
    expect(priorSameTerm(aes, aes[0], settings)).toEqual([]);
    expect(priorSameTerm(aes, null, settings)).toEqual([]);
    expect(priorSameTerm(null, aes[0], settings)).toEqual([]);
  });

  it('PJE-CTX-004: an unplaceable candidate is never prior (#142)', () => {
    const aes = aeEvents([
      { AEDECOD: 'RASH', AETERM: 'a', ASTDY: '', AENDY: '' },
      { AEDECOD: 'RASH', AETERM: 'b', ASTDY: 30, AENDY: 31 }
    ]);
    expect(priorSameTerm(aes, aes[1], settings)).toEqual([]);
  });
});

describe('buildContext (PJE-PANEL-001, PJE-EVT-001)', () => {
  const structured = () => {
    const aes = aeEvents([
      {
        AEDECOD: 'ERYTHEMA',
        AETERM: 'Erythema',
        ASTDY: 30,
        AENDY: 115,
        AESEV: 'MODERATE',
        AESTDTC: '2014-01-14',
        TRTSDT: '2013-12-16'
      },
      {
        AEDECOD: 'ERYTHEMA',
        AETERM: 'Erythema',
        ASTDY: 5,
        AENDY: 6,
        AESEV: 'MILD',
        TRTSDT: '2013-12-16'
      },
      {
        AEDECOD: 'HYPERHIDROSIS',
        AETERM: 'sweat',
        ASTDY: 35,
        AENDY: '',
        AEOUT: '',
        TRTSDT: '2013-12-16'
      },
      { AEDECOD: 'NAUSEA', AETERM: 'nausea', ASTDY: 150, AENDY: 151, TRTSDT: '2013-12-16' }
    ]);
    const cms = cmEvents([
      { CMTRT: 'ASPIRIN', ASTDY: -10, AENDY: '' },
      { CMTRT: 'CORTISONE', ASTDY: 43, AENDY: 50 },
      { CMTRT: 'LIDEX', ASTDY: 43, AENDY: '' },
      { CMTRT: 'MYSTERY', ASTDY: '', AENDY: '' },
      { CMTRT: 'OLD', ASTDY: -100, AENDY: -50 }
    ]);
    const labs = lbEvents([
      { LBDY: -7, LBSTRESN: 10, ABLFL: 'Y' },
      { LBDY: 32, LBSTRESN: 36, LBNRIND: 'HIGH' },
      { LBDY: 90, LBSTRESN: 200, LBNRIND: 'HIGH' }
    ]);
    const doses = [dose(17, 'increase', 1), dose(175, 'reduction', 5)];
    const all = [...aes, ...cms, ...labs, ...doses];
    return {
      subject: 'P1',
      mode: 'day',
      refDate: { date: '2013-12-16', rule: 'ref_col' },
      allEvents: all,
      events: all.filter((e) => e.lane !== 'conMeds'), // con-meds lane toggled off
      byLane: {
        exposure: [],
        doseChanges: doses,
        adverseEvents: aes,
        labs,
        conMeds: cms,
        medicalHistory: [],
        disposition: []
      },
      unplaceableCounts: {
        byDomain: { AE: 0, LB: 0, EX: 0, CM: 1, MH: 0, DS: 0 },
        byLane: { conMeds: 1 }
      },
      truncatedByLane: { conMeds: 0, adverseEvents: 0 }
    };
  };

  it('PJE-PANEL-001: the bundle carries the anchor, the inclusive window, the four lists, counts that match the arrays, and every honesty counter (#142)', () => {
    const data = structured();
    const anchor = data.byLane.adverseEvents[0];
    const bundle = buildContext(data, anchor, settings);
    expect(Object.keys(bundle)).toEqual([
      'subject',
      'mode',
      'anchor',
      'window',
      'conMeds',
      'conMedsLater',
      'abnormalLabs',
      'doseChanges',
      'priorEvents',
      'inWindow',
      'counts',
      'notEvaluated',
      'generatedAt'
    ]);
    expect(bundle.subject).toBe('P1');
    expect(bundle.mode).toBe('day');
    expect(bundle.anchor).toEqual({
      id: 'AE-0',
      domain: 'AE',
      lane: 'adverseEvents',
      label: 'ERYTHEMA',
      day: 30,
      date: '2014-01-14',
      source: anchor.source,
      sourceIndex: 0,
      sourceAnchorId: 'pje-src-AE-0'
    });
    expect(bundle.window).toEqual({
      days: 30,
      elapsedStart: -1,
      elapsedEnd: 59,
      startDay: -1,
      endDay: 60
    });
    expect(bundle.conMeds.map((e) => e.label)).toEqual(['ASPIRIN']);
    expect(bundle.conMedsLater.map((e) => e.label)).toEqual(['CORTISONE', 'LIDEX']);
    expect(bundle.abnormalLabs.map((e) => e.day)).toEqual([32]);
    expect(bundle.abnormalLabs[0].flags.abnormalReason).toBe('both');
    expect(bundle.doseChanges.map((e) => e.day)).toEqual([17]);
    expect(bundle.priorEvents.map((e) => e.id)).toEqual(['AE-1']);
    expect(bundle.counts).toEqual({
      conMeds: 1,
      conMedsLater: 2,
      abnormalLabs: 1,
      doseChanges: 1,
      priorEvents: 1,
      inWindow: bundle.inWindow.length
    });
    // inWindow spans the ENABLED lanes only (con-meds are toggled off here);
    // LB-0 (day -7) and NAUSEA (day 150) fall outside days -1..60.
    expect(bundle.inWindow.map((e) => e.id)).toEqual(['AE-0', 'AE-1', 'AE-2', 'LB-1', 'DOSE-1']);
    expect(bundle.notEvaluated).toEqual({
      conMedsWithoutStart: 1,
      conMedsEndUnrecorded: 1,
      aeEndUnrecorded: 1,
      unplaceableByDomain: { AE: 0, LB: 0, EX: 0, CM: 1, MH: 0, DS: 0 },
      truncatedByLane: { conMeds: 0, adverseEvents: 0 }
    });
    expect(typeof bundle.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(bundle.generatedAt))).toBe(false);
  });

  it('PJE-CTX-004: the four lists are facts about the whole record — an active display filter that narrows byLane changes neither the prior events nor the active con-meds (#142)', () => {
    const data = structured();
    const anchor = data.byLane.adverseEvents[0];
    const unfiltered = buildContext(data, anchor, settings);
    // A serious-only AE filter and a con-med class filter applied: byLane and
    // events shrink, allEvents (the record) does not.
    const filtered = {
      ...data,
      byLane: { ...data.byLane, adverseEvents: [anchor], conMeds: [] },
      events: data.events.filter((e) => e.lane !== 'adverseEvents' || e.id === anchor.id)
    };
    const bundle = buildContext(filtered, anchor, settings);
    expect(bundle.priorEvents.map((e) => e.id)).toEqual(unfiltered.priorEvents.map((e) => e.id));
    expect(bundle.counts.priorEvents).toBe(1);
    expect(bundle.counts.conMeds).toBe(unfiltered.counts.conMeds);
    expect(bundle.counts.conMedsLater).toBe(unfiltered.counts.conMedsLater);
    expect(bundle.counts.abnormalLabs).toBe(unfiltered.counts.abnormalLabs);
    expect(bundle.notEvaluated.conMedsWithoutStart).toBe(1);
    // Only inWindow follows what is shown.
    expect(bundle.inWindow.map((e) => e.id)).toEqual(['AE-0', 'LB-1', 'DOSE-1']);
    expect(bundle.counts.inWindow).toBe(3);
  });

  it('PJE-ANCH-002: the window honours the configured context_window_days, including zero (#142)', () => {
    const data = structured();
    const anchor = data.byLane.adverseEvents[0];
    const wide = buildContext(data, anchor, syncSettings({ context_window_days: 200 }));
    expect(wide.window.days).toBe(200);
    expect(wide.doseChanges.map((e) => e.day)).toEqual([17, 175]);
    expect(wide.abnormalLabs.map((e) => e.day)).toEqual([32, 90]);
    const zero = buildContext(data, anchor, syncSettings({ context_window_days: 0 }));
    expect(zero.window).toEqual({
      days: 0,
      elapsedStart: 29,
      elapsedEnd: 29,
      startDay: 30,
      endDay: 30
    });
    expect(zero.abnormalLabs).toEqual([]);
    expect(zero.conMeds.map((e) => e.label)).toEqual(['ASPIRIN']);
  });

  it('PJE-CTX-001: anchoring on a non-AE mark still answers every query, with no prior events (#142)', () => {
    const data = structured();
    const anchor = data.byLane.doseChanges[0]; // day 17
    const bundle = buildContext(data, anchor, settings);
    expect(bundle.anchor.id).toBe('DOSE-1');
    expect(bundle.anchor.domain).toBe('EX');
    expect(bundle.priorEvents).toEqual([]);
    expect(bundle.conMeds.map((e) => e.label)).toEqual(['ASPIRIN']);
    expect(bundle.doseChanges.map((e) => e.id)).toEqual(['DOSE-1']);
  });

  it('PJE-PANEL-001: buildContext returns null for no anchor, an unplaceable anchor, or no structured data (#142)', () => {
    const data = structured();
    expect(buildContext(data, null, settings)).toBeNull();
    expect(buildContext(data, undefined, settings)).toBeNull();
    expect(buildContext(data, data.byLane.conMeds[3], settings)).toBeNull();
    expect(buildContext(null, data.byLane.adverseEvents[0], settings)).toBeNull();
  });

  it('PJE-EVT-001: the bundle is data a consumer can read without the DOM — every list item carries its raw source row and anchor id (#142)', () => {
    const data = structured();
    const bundle = buildContext(data, data.byLane.adverseEvents[0], settings);
    for (const list of [
      'conMeds',
      'conMedsLater',
      'abnormalLabs',
      'doseChanges',
      'priorEvents',
      'inWindow'
    ]) {
      for (const item of bundle[list]) {
        expect(item.source, `${list} source`).toBeTypeOf('object');
        expect(item.sourceAnchorId, `${list} anchor id`).toMatch(/^pje-src-[A-Z]{2}-\d+$/);
      }
    }
  });
});
