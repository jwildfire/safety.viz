import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import {
  DOMAINS,
  DROP_DOMAIN_COLUMN,
  DROP_REASON_COLUMN,
  detectDomain,
  droppedRowColumns,
  normalizeDomain,
  normalizeInput
} from '../../../src/patient-journey-explorer/normalize.js';

// Input normalization for the patient-journey-explorer module (#142, design
// §3.3, §4.1, §5.1, §5.2): both init forms, case-insensitive domain keys and
// values, the per-domain drop table with its exact reason strings, the three
// terminal end states, and the untouched raw rows. PJE-DATA-*.

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const settings = () => syncSettings({});

const ae = (extra = {}) => ({
  USUBJID: 'P1',
  AETERM: 'Erythema',
  AEDECOD: 'ERYTHEMA',
  AEBODSYS: 'SKIN',
  ASTDY: 30,
  AENDY: 115,
  AESEV: 'MODERATE',
  AESER: 'N',
  AEREL: 'PROBABLE',
  AEOUT: 'RECOVERED/RESOLVED',
  AESTDTC: '2014-01-14',
  TRTSDT: '2013-12-16',
  ...extra
});

const sample = () => ({
  ex: [{ USUBJID: 'P1', EXTRT: 'XAN', EXDOSE: 54, EXDOSU: 'mg', ASTDY: 1, AENDY: 16 }],
  ae: [ae()],
  lb: [{ USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 12, LBDY: -7, LBSTNRLO: 7, LBSTNRHI: 34 }],
  cm: [{ USUBJID: 'P1', CMTRT: 'MAALOX', CMCLAS: 'UNCODED', ASTDY: 1 }],
  mh: [{ USUBJID: 'P1', MHTERM: 'VERBATIM_1', MHDECOD: 'ASTHMA', MHDY: -5 }],
  ds: [{ USUBJID: 'P1', DSDECOD: 'COMPLETED', DSCAT: 'DISPOSITION EVENT', DSSTDY: 184 }]
});

const merged = (data) =>
  Object.entries(data).flatMap(([domain, rows]) =>
    rows.map((row) => ({ DOMAIN: domain.toUpperCase(), ...row }))
  );

describe('detectDomain', () => {
  it('PJE-DATA-001: recognizes the six codes case-insensitively and the ADaM synonyms (#142)', () => {
    expect(detectDomain('ae')).toBe('AE');
    expect(detectDomain(' Lb ')).toBe('LB');
    expect(detectDomain('ADAE')).toBe('AE');
    expect(detectDomain('adlb')).toBe('LB');
    expect(detectDomain('ADEX')).toBe('EX');
    expect(detectDomain('ADCM')).toBe('CM');
    expect(detectDomain('ADMH')).toBe('MH');
    expect(detectDomain('ADDS')).toBe('DS');
    expect(detectDomain('ADSL')).toBe('DS');
    expect(detectDomain('VS')).toBeNull();
    expect(detectDomain('')).toBeNull();
    expect(detectDomain(null)).toBeNull();
    expect(detectDomain(undefined)).toBeNull();
    expect(DOMAINS).toEqual(['EX', 'AE', 'LB', 'CM', 'MH', 'DS']);
  });
});

describe('normalizeInput', () => {
  it('PJE-DATA-001: the per-domain object and the merged array produce the same domain map (#142)', () => {
    const data = sample();
    const a = normalizeInput(data, settings());
    const b = normalizeInput(merged(data), settings());
    expect(a.form).toBe('object');
    expect(b.form).toBe('array');
    expect(Object.keys(a.domains)).toEqual(DOMAINS);
    expect(Object.keys(b.domains)).toEqual(DOMAINS);
    for (const domain of DOMAINS) {
      const strip = (rows) => rows.map(({ DOMAIN, ...rest }) => rest);
      expect(strip(a.domains[domain])).toEqual(strip(b.domains[domain]));
    }
    expect(a.dropped).toEqual([]);
    expect(b.dropped).toEqual([]);
  });

  it('PJE-DATA-001: form A keys are matched case-insensitively and unknown keys warn (#142)', () => {
    const result = normalizeInput({ Ae: [ae()], LB: [], vitals: [{}] }, settings());
    expect(result.domains.AE).toHaveLength(1);
    expect(result.domains.LB).toEqual([]);
    expect(result.domains.EX).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('vitals');
  });

  it('PJE-DATA-001: form B domain values are upper-cased, trimmed and synonym-mapped (#142)', () => {
    const rows = [
      { DOMAIN: ' ae ', ...ae() },
      { DOMAIN: 'ADLB', USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 1, LBDY: 1 }
    ];
    const result = normalizeInput(rows, settings());
    expect(result.domains.AE).toHaveLength(1);
    expect(result.domains.LB).toHaveLength(1);
    expect(result.domains.AE[0]).toBe(rows[0]);
  });

  it('PJE-DATA-002: a merged row with a blank or unrecognized domain is dropped with a named reason (#142)', () => {
    const rows = [
      { DOMAIN: 'XX', USUBJID: 'P1' },
      { USUBJID: 'P2' },
      { DOMAIN: '', USUBJID: 'P3' }
    ];
    const result = normalizeInput(rows, settings());
    for (const domain of DOMAINS) expect(result.domains[domain]).toEqual([]);
    expect(result.dropped).toHaveLength(3);
    expect(result.dropped[0][DROP_REASON_COLUMN]).toBe('unrecognized domain "XX"');
    expect(result.dropped[1][DROP_REASON_COLUMN]).toBe('unrecognized domain ""');
    expect(result.dropped[2][DROP_REASON_COLUMN]).toBe('unrecognized domain ""');
    expect(result.dropped[0][DROP_DOMAIN_COLUMN]).toBe('');
    expect(result.dropped[0].USUBJID).toBe('P1');
  });

  it('PJE-DATA-002: the merged array reads the configured domain column (#142)', () => {
    const result = normalizeInput([{ DOM: 'ae', ...ae() }], syncSettings({ domain_col: 'DOM' }));
    expect(result.domains.AE).toHaveLength(1);
  });

  it('null, undefined and primitives yield an all-empty object-form map (#142)', () => {
    for (const input of [null, undefined, 42, 'rows']) {
      const result = normalizeInput(input, settings());
      expect(result.form).toBe('object');
      expect(result.dropped).toEqual([]);
      for (const domain of DOMAINS) expect(result.domains[domain]).toEqual([]);
    }
  });

  it('form A values that are not arrays are treated as absent and counted in dropped (#142)', () => {
    const result = normalizeInput({ ae: 'nope', lb: [] }, settings());
    expect(result.domains.AE).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0][DROP_REASON_COLUMN]).toBe('domain "ae" is not an array');
    expect(result.dropped[0][DROP_DOMAIN_COLUMN]).toBe('AE');
  });

  it('an array-like object is form A and its numeric keys are unknown-key warnings (#142)', () => {
    const result = normalizeInput({ 0: ae(), ae: [ae()] }, settings());
    expect(result.form).toBe('object');
    expect(result.domains.AE).toHaveLength(1);
    expect(String(warn.mock.calls[0][0])).toContain('"0"');
  });

  it('PJE-DATA-006: form A keeps the caller arrays by reference and no row is mutated in either form (#142)', () => {
    const data = sample();
    const snapshot = JSON.stringify(data);
    const a = normalizeInput(data, settings());
    expect(a.domains.AE).toBe(data.ae);
    const rows = merged(data);
    const rowSnapshot = JSON.stringify(rows);
    const b = normalizeInput(rows, settings());
    expect(b.domains.AE[0]).toBe(rows[1]);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(JSON.stringify(rows)).toBe(rowSnapshot);
  });
});

describe('normalizeDomain — the shared record shape', () => {
  it('PJE-DATA-006: an AE record carries the documented EventRecord fields and its source by reference (#142)', () => {
    const row = ae();
    const { events, dropped, flagged } = normalizeDomain([row], 'AE', settings());
    expect(dropped).toEqual([]);
    expect(flagged).toEqual([]);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.source).toBe(row);
    expect(event).toMatchObject({
      id: 'AE-0',
      domain: 'AE',
      lane: 'adverseEvents',
      subject: 'P1',
      kind: 'interval',
      start: 30,
      end: 115,
      endState: 'closed',
      day: 30,
      placeable: true,
      clippedStart: false,
      dayCol: 'ASTDY',
      date: '2014-01-14',
      endDate: '2014-04-09',
      rawDate: '2014-01-14',
      dateConflict: false,
      refDate: '2013-12-16',
      label: 'ERYTHEMA',
      detail: 'Erythema',
      category: 'SKIN',
      value: null,
      unit: '',
      outcome: 'RECOVERED/RESOLVED',
      sourceIndex: 0,
      sourceAnchorId: 'pje-src-AE-0'
    });
    expect(event.flags).toEqual({
      severity: { key: 'MODERATE', label: 'Moderate', rank: 2 },
      serious: false,
      related: 'PROBABLE',
      abnormal: '',
      abnormalReason: '',
      derived: false,
      direction: null
    });
    expect(event.open).toBe(false);
    expect(JSON.stringify(row)).toBe(JSON.stringify(ae()));
  });

  it('PJE-DATA-006: sourceIndex is the index within the domain array in both forms (#142)', () => {
    const data = { ae: [ae({ AETERM: 'A' }), ae({ AETERM: 'B' })], lb: [] };
    const fromObject = normalizeDomain(
      normalizeInput(data, settings()).domains.AE,
      'AE',
      settings()
    );
    const rows = [
      { DOMAIN: 'LB', USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 1, LBDY: 1 },
      { DOMAIN: 'AE', ...ae({ AETERM: 'A' }) },
      { DOMAIN: 'AE', ...ae({ AETERM: 'B' }) }
    ];
    const fromArray = normalizeDomain(
      normalizeInput(rows, settings()).domains.AE,
      'AE',
      settings()
    );
    expect(fromObject.events.map((event) => event.id)).toEqual(['AE-0', 'AE-1']);
    expect(fromArray.events.map((event) => event.id)).toEqual(['AE-0', 'AE-1']);
    expect(fromArray.events[1].source).toBe(rows[2]);
  });

  it('every domain drops a row with a missing participant id, naming the id column (#142)', () => {
    for (const domain of DOMAINS) {
      const { events, dropped } = normalizeDomain([{ USUBJID: ' ' }, { X: 1 }], domain, settings());
      expect(events, domain).toEqual([]);
      expect(dropped, domain).toHaveLength(2);
      expect(dropped[0][DROP_REASON_COLUMN], domain).toBe('missing participant id (USUBJID)');
      expect(dropped[0][DROP_DOMAIN_COLUMN], domain).toBe(domain);
    }
  });

  it('PJE-DATA-003: dropped rows are copies carrying the reason and domain columns, and the export orders the reason first (#142)', () => {
    const row = { USUBJID: '', AETERM: 'X' };
    const { dropped } = normalizeDomain([row], 'AE', settings());
    expect(dropped[0]).not.toBe(row);
    expect(dropped[0]).toEqual({
      USUBJID: '',
      AETERM: 'X',
      [DROP_REASON_COLUMN]: 'missing participant id (USUBJID)',
      [DROP_DOMAIN_COLUMN]: 'AE'
    });
    expect(droppedRowColumns(dropped)).toEqual([
      DROP_REASON_COLUMN,
      DROP_DOMAIN_COLUMN,
      'USUBJID',
      'AETERM'
    ]);
    expect(droppedRowColumns([])).toEqual([]);
    expect(
      droppedRowColumns([
        { A: 1, [DROP_REASON_COLUMN]: 'r', [DROP_DOMAIN_COLUMN]: 'AE' },
        { B: 2, A: 1, [DROP_REASON_COLUMN]: 'r', [DROP_DOMAIN_COLUMN]: 'LB', __pje_extra: 1 }
      ])
    ).toEqual([DROP_REASON_COLUMN, DROP_DOMAIN_COLUMN, 'A', 'B']);
  });

  it("PJE-LANE-008: 'NA', blank and non-numeric days leave the record unplaceable but kept (#142)", () => {
    for (const day of ['NA', 'na', '', null, undefined, 'soon', 'NaN']) {
      const { events, dropped } = normalizeDomain([ae({ ASTDY: day })], 'AE', settings());
      expect(dropped, String(day)).toEqual([]);
      expect(events[0].placeable, String(day)).toBe(false);
      expect(events[0].start, String(day)).toBeNull();
      expect(events[0].day, String(day)).toBeNull();
      expect(events[0].dayCol, String(day)).toBeNull();
    }
  });

  it('PJE-DATA-007: the day chain resolves per row, left to right, and records the resolving column (#142)', () => {
    const rows = [ae({ ASTDY: 'NA', AESTDY: 12 }), ae({ ASTDY: 5, AESTDY: 9 }), ae({ ASTDY: '7' })];
    const { events } = normalizeDomain(rows, 'AE', settings());
    expect(events.map((event) => [event.start, event.dayCol])).toEqual([
      [12, 'AESTDY'],
      [5, 'ASTDY'],
      [7, 'ASTDY']
    ]);
  });
});

describe('normalizeDomain — interval end handling (D16)', () => {
  it('PJE-ANCH-002: a blank end with an ongoing outcome is ongoing; a blank end with any other outcome is unrecorded (#142)', () => {
    const { events } = normalizeDomain(
      [
        ae({ AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }),
        ae({ AENDY: 'NA', AEOUT: 'recovering/resolving ' }),
        ae({ AENDY: undefined, AEOUT: 'UNKNOWN' }),
        ae({ AENDY: '', AEOUT: '' })
      ],
      'AE',
      settings()
    );
    expect(events.map((event) => event.endState)).toEqual([
      'ongoing',
      'ongoing',
      'unrecorded',
      'unrecorded'
    ]);
    expect(events.every((event) => event.end === null)).toBe(true);
    expect(events.every((event) => event.endDate === null)).toBe(true);
    expect(events.every((event) => event.open === true)).toBe(true);
    expect(events[0].outcome).toBe('NOT RECOVERED/NOT RESOLVED');
  });

  it('PJE-ANCH-002: with no outcome column configured (con-meds by default) every blank end is unrecorded (#142)', () => {
    const { events } = normalizeDomain(
      [{ USUBJID: 'P1', CMTRT: 'MAALOX', ASTDY: 1, CMONGO: 'Y' }],
      'CM',
      settings()
    );
    expect(events[0].endState).toBe('unrecorded');
    const configured = normalizeDomain(
      [{ USUBJID: 'P1', CMTRT: 'MAALOX', ASTDY: 1, CMONGO: 'Y' }],
      'CM',
      syncSettings({ cm_out_col: 'CMONGO' })
    );
    expect(configured.events[0].endState).toBe('ongoing');
  });

  it('PJE-DATA-008: an end day before the start is kept as a single-day mark, unrecorded, and flagged with the exact reason (#142)', () => {
    const { events, dropped, flagged } = normalizeDomain(
      [ae({ ASTDY: 30, AENDY: 20, AEOUT: 'NOT RECOVERED/NOT RESOLVED' })],
      'AE',
      settings()
    );
    expect(dropped).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0].start).toBe(30);
    expect(events[0].end).toBeNull();
    expect(events[0].endState).toBe('unrecorded');
    expect(events[0].placeable).toBe(true);
    expect(flagged).toHaveLength(1);
    expect(flagged[0][DROP_REASON_COLUMN]).toBe('end day AENDY (20) precedes start day (30)');
    expect(flagged[0][DROP_DOMAIN_COLUMN]).toBe('AE');
    expect(flagged[0].AETERM).toBe('Erythema');
    expect(events[0].flagged).toEqual(['end day AENDY (20) precedes start day (30)']);
  });

  it('a zero-length event (end === start) stays a closed interval (#142)', () => {
    const { events, flagged } = normalizeDomain([ae({ ASTDY: 48, AENDY: 48 })], 'AE', settings());
    expect(events[0]).toMatchObject({ start: 48, end: 48, endState: 'closed', open: false });
    expect(flagged).toEqual([]);
  });

  it('an unplaceable interval keeps its end state logic but no end day (#142)', () => {
    const { events } = normalizeDomain([ae({ ASTDY: '', AENDY: 40 })], 'AE', settings());
    expect(events[0].placeable).toBe(false);
    expect(events[0].start).toBeNull();
    expect(events[0].end).toBeNull();
  });
});

describe('normalizeDomain — per-domain rules', () => {
  it('EX: drops only when both treatment and dose are blank; label, detail, category and value follow §5.2 (#142)', () => {
    const rows = [
      { USUBJID: 'P1', EXTRT: 'XAN', EXDOSE: 54, EXDOSU: 'mg', ASTDY: 1, AENDY: 16 },
      { USUBJID: 'P1', EXTRT: '', EXDOSE: '', ASTDY: 1 },
      { USUBJID: 'P1', EXTRT: 'XAN', EXDOSE: 'NA', ASTDY: 17 },
      { USUBJID: 'P1', EXTRT: '', EXDOSE: 0, ASTDY: 17 }
    ];
    const { events, dropped } = normalizeDomain(rows, 'EX', settings());
    expect(dropped).toHaveLength(1);
    expect(dropped[0][DROP_REASON_COLUMN]).toBe(
      'missing exposure treatment and dose (EXTRT, EXDOSE)'
    );
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      id: 'EX-0',
      lane: 'exposure',
      kind: 'interval',
      label: 'XAN',
      detail: '54 mg days 1–16',
      category: 'XAN',
      value: 54,
      unit: 'mg',
      endState: 'closed'
    });
    expect(events[1]).toMatchObject({ id: 'EX-2', value: null, endState: 'unrecorded' });
    expect(events[2]).toMatchObject({ id: 'EX-3', value: 0, label: '' });
  });

  it('AE: drops only when both term and decode are blank; the label prefers the decode and the detail is the verbatim term when it differs (#142)', () => {
    const { events, dropped } = normalizeDomain(
      [
        ae({ AETERM: '', AEDECOD: '' }),
        ae({ AETERM: 'rash', AEDECOD: '' }),
        ae({ AETERM: 'RASH', AEDECOD: 'RASH' }),
        ae({ AESEV: '', AESER: 'y' }),
        ae({ AESEV: 'GRADE 4' })
      ],
      'AE',
      settings()
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0][DROP_REASON_COLUMN]).toBe('missing adverse-event term (AETERM, AEDECOD)');
    expect(events[0]).toMatchObject({ label: 'rash', detail: '' });
    expect(events[1]).toMatchObject({ label: 'RASH', detail: '' });
    expect(events[2].flags.severity).toBeNull();
    expect(events[2].flags.serious).toBe(true);
    expect(events[3].flags.severity).toEqual({ key: 'GRADE 4', label: 'Grade 4', rank: 0 });
    expect(
      normalizeDomain([ae({ AESEV: 'severe' })], 'AE', settings()).events[0].flags.severity
    ).toEqual({ key: 'SEVERE', label: 'Severe', rank: 3 });
  });

  it('LB: drops a missing test name and a non-numeric result with the exact reasons; points carry value, limits and the indicator (#142)', () => {
    const rows = [
      { USUBJID: 'P1', LBTEST: '', LBSTRESN: 10, LBDY: 1 },
      { USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 'x', LBDY: 1 },
      { USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: '', LBDY: 1 },
      {
        USUBJID: 'P1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '36.5',
        LBSTRESU: 'U/L',
        LBSTNRLO: 7,
        LBSTNRHI: 34,
        LBNRIND: 'high ',
        LBDY: 27,
        ADY: 99
      },
      { USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 5, LBDY: 'NA', ADY: 3 }
    ];
    const { events, dropped } = normalizeDomain(rows, 'LB', settings());
    expect(dropped.map((row) => row[DROP_REASON_COLUMN])).toEqual([
      'missing lab test name (LBTEST)',
      'non-numeric result (LBSTRESN = "x")',
      'non-numeric result (LBSTRESN = "")'
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'LB-3',
      lane: 'labs',
      kind: 'point',
      start: 27,
      end: null,
      day: 27,
      dayCol: 'LBDY',
      label: '36.5 U/L',
      detail: 'Alanine Aminotransferase (7–34 U/L)',
      category: 'Alanine Aminotransferase',
      test: 'Alanine Aminotransferase',
      testCode: 'ALT',
      value: 36.5,
      unit: 'U/L',
      lln: 7,
      uln: 34
    });
    expect(events[0].flags.abnormal).toBe('HIGH');
    expect(events[1]).toMatchObject({ day: 3, dayCol: 'ADY', lln: null, uln: null });
    expect(events[1].flags.abnormal).toBe('');
    expect(events[1].detail).toBe('ALT');
  });

  it('CM: drops a missing name; the class keeps UNCODED as its own bucket and dose/route form the detail (#142)', () => {
    const rows = [
      { USUBJID: 'P1', CMTRT: '', ASTDY: 1 },
      { USUBJID: 'P1', CMTRT: 'MAALOX', CMCLAS: 'UNCODED', ASTDY: 1, AENDY: 40 },
      {
        USUBJID: 'P1',
        CMTRT: 'ALEVE',
        CMCLAS: 'ANALGESICS',
        CMDOSE: 200,
        CMROUTE: 'ORAL',
        ASTDY: 'NA'
      }
    ];
    const { events, dropped } = normalizeDomain(rows, 'CM', settings());
    expect(dropped[0][DROP_REASON_COLUMN]).toBe('missing con-med name (CMTRT)');
    expect(events[0]).toMatchObject({
      id: 'CM-1',
      lane: 'conMeds',
      kind: 'interval',
      label: 'MAALOX',
      detail: '',
      category: 'UNCODED',
      start: 1,
      end: 40,
      endState: 'closed'
    });
    expect(events[1]).toMatchObject({
      label: 'ALEVE',
      detail: '200 ORAL',
      category: 'ANALGESICS',
      placeable: false,
      endState: 'unrecorded'
    });
  });

  it('MH: drops only when both term and decode are blank; the point sits at the collection day and the detail names the onset (#142)', () => {
    const rows = [
      { USUBJID: 'P1', MHTERM: '', MHDECOD: '', MHDY: -5 },
      {
        USUBJID: 'P1',
        MHTERM: 'VERBATIM_0308',
        MHDECOD: 'ASTHMA',
        MHCAT: 'GENERAL',
        MHDY: -5,
        ASTDY: -400,
        MHSTDTC: '2012',
        MHSTRTPT: 'BEFORE',
        MHENRTPT: 'ONGOING'
      },
      { USUBJID: 'P1', MHTERM: 'ALZHEIMER', MHDECOD: '', MHDY: -3, MHSTRTPT: 'BEFORE' },
      { USUBJID: 'P1', MHTERM: 'X', MHDECOD: 'Y', MHDY: -3, MHSTDTC: '2011-03' },
      { USUBJID: 'P1', MHTERM: 'X', MHDECOD: 'Z', MHDY: -3 }
    ];
    const { events, dropped } = normalizeDomain(rows, 'MH', settings());
    expect(dropped[0][DROP_REASON_COLUMN]).toBe('missing medical-history term (MHTERM, MHDECOD)');
    expect(events[0]).toMatchObject({
      id: 'MH-1',
      lane: 'medicalHistory',
      kind: 'point',
      day: -5,
      start: -5,
      dayCol: 'MHDY',
      label: 'ASTHMA',
      detail: 'recorded day -5; onset day -400; still present',
      category: 'GENERAL',
      rawDate: ''
    });
    expect(events[1]).toMatchObject({
      label: 'ALZHEIMER',
      detail: 'recorded day -3; onset before study'
    });
    expect(events[2].detail).toBe('recorded day -3; onset 2011-03');
    expect(events[3].detail).toBe('recorded day -3; onset not recorded');
  });

  it("MH: under mh_day_source 'onset' the point sits at the onset day and rawDate is the onset date (#142)", () => {
    const row = {
      USUBJID: 'P1',
      MHTERM: 'X',
      MHDECOD: 'Y',
      MHDY: -5,
      ASTDY: -400,
      MHSTDTC: '2012'
    };
    const { events } = normalizeDomain([row], 'MH', syncSettings({ mh_day_source: 'onset' }));
    expect(events[0]).toMatchObject({ day: -400, dayCol: 'ASTDY', rawDate: '2012', date: null });
  });

  it('DS: drops a missing decode; every row is a rule mark and only reference categories carry the cross-stack flag (#142)', () => {
    const rows = [
      { USUBJID: 'P1', DSDECOD: '', DSTERM: 'X', DSSTDY: 1 },
      {
        USUBJID: 'P1',
        DSDECOD: 'RANDOMIZED',
        DSTERM: 'RANDOMIZED',
        DSCAT: 'PROTOCOL MILESTONE',
        DSSTDY: 1
      },
      {
        USUBJID: 'P1',
        DSDECOD: 'COMPLETED',
        DSTERM: 'PROTOCOL COMPLETED',
        DSCAT: 'disposition event',
        DSSTDY: 184,
        DSSTDTC: '2014-06-17'
      }
    ];
    const { events, dropped } = normalizeDomain(rows, 'DS', settings());
    expect(dropped[0][DROP_REASON_COLUMN]).toBe('missing disposition decode (DSDECOD)');
    expect(events[0]).toMatchObject({
      id: 'DS-1',
      lane: 'disposition',
      kind: 'rule',
      day: 1,
      label: 'RANDOMIZED',
      detail: '',
      category: 'PROTOCOL MILESTONE'
    });
    expect(events[0].flags.reference).toBe(false);
    expect(events[1]).toMatchObject({
      day: 184,
      label: 'COMPLETED',
      detail: 'PROTOCOL COMPLETED',
      rawDate: '2014-06-17',
      date: '2014-06-17'
    });
    expect(events[1].flags.reference).toBe(true);
  });

  it('PJE-TIME-003: a partial recorded date is kept as recorded and never positions the mark (#142)', () => {
    const { events } = normalizeDomain(
      [
        { USUBJID: 'P1', CMTRT: 'X', CMSTDTC: '2011', ASTDY: -9894, TRTSDT: '2013-12-16' },
        { USUBJID: 'P1', CMTRT: 'Y', CMSTDTC: '2014-01', ASTDY: '' }
      ],
      'CM',
      settings()
    );
    expect(events[0]).toMatchObject({ rawDate: '2011', start: -9894, placeable: true });
    expect(events[0].date).toBe('1986-11-14');
    expect(events[1]).toMatchObject({ rawDate: '2014-01', date: null, placeable: false });
  });

  it('PJE-TIME-004: a full recorded date that disagrees with the study day is overridden by the day and flagged (#142)', () => {
    const { events } = normalizeDomain(
      [ae({ ASTDY: 30, AESTDTC: '2014-01-20', TRTSDT: '2013-12-16' })],
      'AE',
      settings()
    );
    expect(events[0].date).toBe('2014-01-14');
    expect(events[0].rawDate).toBe('2014-01-20');
    expect(events[0].dateConflict).toBe(true);
  });

  it('without a row-level reference date the record keeps its own full date and no conflict is asserted (#142)', () => {
    const { events } = normalizeDomain(
      [ae({ ASTDY: 30, AESTDTC: '2014-01-20', TRTSDT: '' })],
      'AE',
      settings()
    );
    expect(events[0]).toMatchObject({ date: '2014-01-20', refDate: null, dateConflict: false });
  });

  it('normalizeDomain tolerates an unknown domain code and non-object rows (#142)', () => {
    expect(normalizeDomain([ae()], 'VS', settings())).toEqual({
      events: [],
      dropped: [],
      flagged: []
    });
    const { events, dropped } = normalizeDomain([null, ae()], 'AE', settings());
    expect(events).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0][DROP_REASON_COLUMN]).toBe('missing participant id (USUBJID)');
  });
});
