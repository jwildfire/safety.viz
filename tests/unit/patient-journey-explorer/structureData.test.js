import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LANE_KEYS, syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import {
  normalizeDomain,
  normalizeInput
} from '../../../src/patient-journey-explorer/normalize.js';
import { buildContext } from '../../../src/patient-journey-explorer/anchor.js';
import {
  PRE_STUDY_CLAMP,
  applyFilters,
  laneSortKey,
  liveFilters,
  recordExtent,
  sharedDomain,
  structureData,
  subjectIndex
} from '../../../src/patient-journey-explorer/structureData.js';

// Subject index, per-subject lane assembly, the shared elapsed-day domain,
// filters, unplaceable and dropped-row accounting for the
// patient-journey-explorer module (#142, design §5.4, D10, D15, D18, PC-17).
// PJE-SUBJ-001, PJE-LANE-004/008/010, PJE-FILT-002/004, PJE-DATA-003/008.

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const settings = (overrides = {}) => syncSettings(overrides);
const state = (overrides = {}) => ({ subject: null, filters: {}, lanes: {}, ...overrides });

const subjectRows = (id, extra = {}) => ({
  ex: [
    {
      USUBJID: id,
      EXTRT: 'XANOMELINE',
      EXDOSE: 54,
      EXDOSU: 'mg',
      ASTDY: 1,
      AENDY: 16,
      TRTSDT: '2013-12-16'
    },
    { USUBJID: id, EXTRT: 'XANOMELINE', EXDOSE: 81, EXDOSU: 'mg', ASTDY: 17, AENDY: 184 }
  ],
  ae: [
    {
      USUBJID: id,
      AETERM: 'Erythema',
      AEDECOD: 'ERYTHEMA',
      AEBODSYS: 'SKIN',
      ASTDY: 30,
      AENDY: 115,
      AESEV: 'MODERATE',
      AESER: 'N',
      AEOUT: 'RECOVERED/RESOLVED',
      AESTDTC: '2014-01-14'
    },
    {
      USUBJID: id,
      AETERM: 'Sweat',
      AEDECOD: 'HYPERHIDROSIS',
      AEBODSYS: 'SKIN',
      ASTDY: 35,
      AENDY: '',
      AESEV: 'MILD',
      AESER: 'N',
      AEOUT: 'NOT RECOVERED/NOT RESOLVED'
    },
    {
      USUBJID: id,
      AETERM: 'Fall',
      AEDECOD: 'FALL',
      AEBODSYS: 'INJURY',
      ASTDY: 10,
      AENDY: 10,
      AESEV: 'SEVERE',
      AESER: 'Y',
      AEOUT: 'RECOVERED/RESOLVED'
    },
    {
      USUBJID: id,
      AETERM: 'Nausea',
      AEDECOD: 'NAUSEA',
      AEBODSYS: 'GI',
      ASTDY: 10,
      AENDY: 12,
      AESEV: 'SEVERE',
      AESER: 'N',
      AEOUT: 'RECOVERED/RESOLVED'
    },
    {
      USUBJID: id,
      AETERM: 'Lost',
      AEDECOD: 'LOST',
      AEBODSYS: 'GI',
      ASTDY: '',
      AENDY: '',
      AESEV: 'MILD',
      AESER: 'N',
      AEOUT: ''
    }
  ],
  lb: [
    {
      USUBJID: id,
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: 10,
      LBSTRESU: 'U/L',
      LBSTNRLO: 7,
      LBSTNRHI: 34,
      LBNRIND: 'NORMAL',
      LBDY: -7,
      ABLFL: 'Y'
    },
    {
      USUBJID: id,
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: 36,
      LBSTRESU: 'U/L',
      LBSTNRLO: 7,
      LBSTNRHI: 34,
      LBNRIND: 'HIGH',
      LBDY: 32
    },
    {
      USUBJID: id,
      LBTEST: 'Bilirubin',
      LBTESTCD: 'BILI',
      LBSTRESN: 0.5,
      LBSTRESU: 'mg/dL',
      LBSTNRLO: 0.1,
      LBSTNRHI: 1.2,
      LBNRIND: 'NORMAL',
      LBDY: -7
    },
    {
      USUBJID: id,
      LBTEST: 'Glucose',
      LBTESTCD: 'GLUC',
      LBSTRESN: 5,
      LBSTRESU: 'mmol/L',
      LBSTNRLO: 3,
      LBSTNRHI: 6,
      LBNRIND: 'NORMAL',
      LBDY: 1
    }
  ],
  cm: [
    { USUBJID: id, CMTRT: 'ASPIRIN', CMCLAS: 'ANALGESICS', ASTDY: -10, AENDY: '' },
    { USUBJID: id, CMTRT: 'CORTISONE', CMCLAS: 'CORTICOSTEROIDS', ASTDY: 43, AENDY: 50 },
    { USUBJID: id, CMTRT: 'ANCIENT', CMCLAS: 'UNCODED', ASTDY: -9894, AENDY: '' },
    { USUBJID: id, CMTRT: 'MYSTERY', CMCLAS: 'UNCODED', ASTDY: '', AENDY: '' },
    { USUBJID: id, CMTRT: 'ALSO', CMCLAS: 'ANALGESICS', ASTDY: -10, AENDY: '' }
  ],
  mh: [
    {
      USUBJID: id,
      MHTERM: 'VERBATIM_1',
      MHDECOD: 'ASTHMA',
      MHCAT: 'GENERAL',
      MHDY: -37,
      ASTDY: -18371
    }
  ],
  ds: [
    { USUBJID: id, DSDECOD: 'RANDOMIZED', DSCAT: 'PROTOCOL MILESTONE', DSSTDY: 1 },
    { USUBJID: id, DSDECOD: 'COMPLETED', DSCAT: 'DISPOSITION EVENT', DSSTDY: 184 }
  ],
  ...extra
});

const merge = (...subjects) => {
  const out = { ex: [], ae: [], lb: [], cm: [], mh: [], ds: [] };
  for (const rows of subjects) for (const key of Object.keys(out)) out[key].push(...rows[key]);
  return out;
};

const domainsOf = (data, s = settings()) => normalizeInput(data, s).domains;

describe('subjectIndex (PJE-SUBJ-001)', () => {
  it('PJE-SUBJ-001: the sorted union of participant ids across every domain, blanks excluded (#142)', () => {
    const domains = domainsOf({
      ae: [{ USUBJID: 'B' }, { USUBJID: 'A' }, { USUBJID: '' }, { USUBJID: 'NA' }],
      lb: [{ USUBJID: 'C' }, { USUBJID: ' A ' }],
      ds: [{ USUBJID: 10 }, { USUBJID: 9 }]
    });
    expect(subjectIndex(domains, settings())).toEqual(['10', '9', 'A', 'B', 'C']);
    expect(subjectIndex({}, settings())).toEqual([]);
    expect(subjectIndex(null, settings())).toEqual([]);
  });

  it('PJE-SUBJ-001: the index reads the configured id_col (#142)', () => {
    const domains = domainsOf({ ae: [{ SUBJ: 'X' }, { USUBJID: 'ignored' }] });
    expect(subjectIndex(domains, settings({ id_col: 'SUBJ' }))).toEqual(['X']);
  });
});

describe('laneSortKey (PC-17)', () => {
  it('PJE-LANE-010: the AE order is severity rank descending, then onset ascending, then sourceIndex (#142)', () => {
    const aes = normalizeDomain(subjectRows('P1').ae, 'AE', settings()).events;
    const sorted = [...aes].sort(laneSortKey('adverseEvents'));
    expect(sorted.map((e) => e.id)).toEqual(['AE-2', 'AE-3', 'AE-0', 'AE-1', 'AE-4']);
    const blank = normalizeDomain(
      [{ USUBJID: 'P1', AETERM: 'x', ASTDY: 1, AESEV: '' }],
      'AE',
      settings()
    ).events[0];
    expect([blank, aes[1]].sort(laneSortKey('adverseEvents')).map((e) => e.id)).toEqual([
      'AE-1',
      'AE-0'
    ]);
  });

  it('PJE-LANE-010: the con-med order is start ascending with nulls last, then name, then sourceIndex (#142)', () => {
    const cms = normalizeDomain(subjectRows('P1').cm, 'CM', settings()).events;
    const sorted = [...cms].sort(laneSortKey('conMeds'));
    expect(sorted.map((e) => e.label)).toEqual([
      'ANCIENT',
      'ALSO',
      'ASPIRIN',
      'CORTISONE',
      'MYSTERY'
    ]);
  });

  it('PJE-LANE-010: exposure sorts by treatment name, labs by the configured test order, and the single-row lanes by day (#142)', () => {
    const exs = normalizeDomain(
      [
        { USUBJID: 'P1', EXTRT: 'ZZZ', EXDOSE: 1, ASTDY: 1 },
        { USUBJID: 'P1', EXTRT: 'AAA', EXDOSE: 1, ASTDY: 5 },
        { USUBJID: 'P1', EXTRT: 'AAA', EXDOSE: 1, ASTDY: 2 }
      ],
      'EX',
      settings()
    ).events;
    expect([...exs].sort(laneSortKey('exposure')).map((e) => e.id)).toEqual([
      'EX-2',
      'EX-1',
      'EX-0'
    ]);
    const labs = normalizeDomain(subjectRows('P1').lb, 'LB', settings()).events;
    expect([...labs].sort(laneSortKey('labs', settings())).map((e) => e.id)).toEqual([
      'LB-0',
      'LB-1',
      'LB-2',
      'LB-3'
    ]);
    const labsByCode = [...labs].sort(laneSortKey('labs', settings({ lb_tests: ['BILI', 'ALT'] })));
    expect(labsByCode.map((e) => e.id)).toEqual(['LB-2', 'LB-0', 'LB-1', 'LB-3']);
    const dss = normalizeDomain(subjectRows('P1').ds, 'DS', settings()).events;
    expect(
      [...dss]
        .reverse()
        .sort(laneSortKey('disposition'))
        .map((e) => e.id)
    ).toEqual(['DS-0', 'DS-1']);
    expect(typeof laneSortKey('unknown')).toBe('function');
  });
});

describe('sharedDomain (PJE-LANE-004, D10, D18)', () => {
  const events = (data, s = settings()) => {
    const domains = domainsOf(data, s);
    return Object.entries(domains).flatMap(
      ([domain, rows]) => normalizeDomain(rows, domain, s).events
    );
  };

  it('PJE-LANE-004: the domain is an ELAPSED pair over every placeable day, with the minimum clamped to at most study day -14 (#142)', () => {
    const data = subjectRows('P1', { cm: [], mh: [] });
    expect(sharedDomain(events(data), settings())).toEqual([-14, 184]);
    const late = subjectRows('P1', { cm: [], mh: [], lb: [], ds: [] });
    expect(sharedDomain(events(late), settings())).toEqual([-14, 184]);
    // The drawing domain is padded one elapsed day past the last day so that
    // day's cell is inside the plot; the reported extent is the record's own.
    expect(recordExtent(events(data), settings())).toEqual([-14, 184]);
  });

  it('PJE-LANE-004: a con-med starting more than PRE_STUDY_CLAMP days before every other domain does not extend the domain (#142)', () => {
    expect(PRE_STUDY_CLAMP).toBe(60);
    const data = subjectRows('P1', { mh: [] });
    expect(sharedDomain(events(data), settings())).toEqual([-14, 184]);
    const near = subjectRows('P1', {
      mh: [],
      cm: [{ USUBJID: 'P1', CMTRT: 'RECENT', ASTDY: -40, AENDY: '' }]
    });
    expect(sharedDomain(events(near), settings())).toEqual([-40, 184]);
    const only = { cm: [{ USUBJID: 'P1', CMTRT: 'ALONE', ASTDY: -9894, AENDY: -9000 }] };
    expect(sharedDomain(events(only), settings())).toEqual([-9894, -8999]);
  });

  it('PJE-LANE-004: medical history is not clamped under the default collection-day source, and is clamped under mh_day_source: onset (#142)', () => {
    const data = subjectRows('P1', { cm: [] });
    expect(sharedDomain(events(data), settings())).toEqual([-37, 184]);
    const onset = settings({ mh_day_source: 'onset' });
    expect(sharedDomain(events(data, onset), onset)).toEqual([-14, 184]);
  });

  it('PJE-LANE-004: a single day still yields a one-day-wide domain, and nothing placeable yields null (#142)', () => {
    const one = { lb: [{ USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 1, LBDY: 30 }] };
    expect(sharedDomain(events(one), settings())).toEqual([-14, 30]);
    const single = { lb: [{ USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 1, LBDY: -20 }] };
    expect(sharedDomain(events(single), settings())).toEqual([-20, -19]);
    expect(recordExtent(events(single), settings())).toEqual([-20, -20]);
    const none = { ae: [{ USUBJID: 'P1', AETERM: 'x', ASTDY: '' }] };
    expect(sharedDomain(events(none), settings())).toBeNull();
    expect(sharedDomain([], settings())).toBeNull();
    expect(sharedDomain(null, settings())).toBeNull();
  });
});

describe('applyFilters / liveFilters (PJE-FILT-*)', () => {
  const all = (s = settings()) => {
    const domains = domainsOf(subjectRows('P1'), s);
    return Object.entries(domains).flatMap(
      ([domain, rows]) => normalizeDomain(rows, domain, s).events
    );
  };

  it('PJE-FILT-001: a flag filter applies only to its own domain — the serious filter keeps serious AEs and every lab point (#142)', () => {
    const events = all();
    const kept = applyFilters(events, { AESER: 'Y' }, settings());
    expect(kept.filter((e) => e.domain === 'AE').map((e) => e.id)).toEqual(['AE-2']);
    expect(kept.filter((e) => e.domain === 'LB')).toHaveLength(4);
    expect(kept.filter((e) => e.domain === 'CM')).toHaveLength(5);
    expect(applyFilters(events, {}, settings())).toEqual(events);
    expect(applyFilters(events, { AESER: null }, settings())).toEqual(events);
  });

  it('PJE-FILT-002: the __abnormal__ flag filter keeps only lab points failing isAbnormalByFlag and leaves AE and CM untouched (#142)', () => {
    const events = all();
    const kept = applyFilters(events, { LBNRIND: '__abnormal__' }, settings());
    expect(kept.filter((e) => e.domain === 'LB').map((e) => e.id)).toEqual(['LB-1']);
    expect(kept.filter((e) => e.domain === 'AE')).toHaveLength(5);
    expect(kept.filter((e) => e.domain === 'CM')).toHaveLength(5);
  });

  it('PJE-FILT-003: the con-med class multiselect is membership over the recorded classes, UNCODED included (#142)', () => {
    const events = all();
    const kept = applyFilters(events, { CMCLAS: ['UNCODED'] }, settings());
    expect(kept.filter((e) => e.domain === 'CM').map((e) => e.label)).toEqual([
      'ANCIENT',
      'MYSTERY'
    ]);
    const two = applyFilters(events, { CMCLAS: ['UNCODED', 'CORTICOSTEROIDS'] }, settings());
    expect(two.filter((e) => e.domain === 'CM')).toHaveLength(3);
    expect(
      applyFilters(events, { CMCLAS: [] }, settings()).filter((e) => e.domain === 'CM')
    ).toHaveLength(0);
  });

  it('PJE-FILT-001: a flag value is compared trimmed and case-insensitively, and a filter state for an unknown column is ignored (#142)', () => {
    const events = all();
    expect(
      applyFilters(events, { AESER: 'y' }, settings()).filter((e) => e.domain === 'AE')
    ).toHaveLength(1);
    expect(applyFilters(events, { NOPE: 'Y' }, settings())).toEqual(events);
  });

  it('PJE-FILT-004: a filter whose column is absent from every row of its domain is dropped with the library’s exact warning (#142)', () => {
    const domains = domainsOf(subjectRows('P1', { cm: [{ USUBJID: 'P1', CMTRT: 'X', ASTDY: 1 }] }));
    const live = liveFilters(settings().filters, domains);
    expect(live.map((f) => f.value_col)).toEqual(['AESER', 'LBNRIND']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      'The [ ATC class ] filter has been removed because the variable does not exist.'
    );
    expect(liveFilters(settings().filters, domainsOf({ ae: [] }))).toEqual([]);
  });
});

describe('structureData (PJE-LANE-008/010, PJE-DATA-003)', () => {
  const data = () =>
    merge(subjectRows('P2'), subjectRows('P1'), {
      ex: [],
      ae: [{ USUBJID: 'P3', AETERM: 'Solo', ASTDY: 4 }],
      lb: [],
      cm: [],
      mh: [],
      ds: []
    });

  it('PJE-SUBJ-001: opens on the first subject in sorted order, honours settings.subject and state.subject, and falls back for an unknown id (#142)', () => {
    const domains = domainsOf(data());
    expect(structureData(domains, settings(), state()).subject).toBe('P1');
    expect(structureData(domains, settings(), state()).subjects).toEqual(['P1', 'P2', 'P3']);
    expect(structureData(domains, settings({ subject: 'P2' }), state()).subject).toBe('P2');
    expect(structureData(domains, settings(), state({ subject: 'P3' })).subject).toBe('P3');
    expect(structureData(domains, settings(), state({ subject: 'nope' })).subject).toBe('P1');
    expect(structureData(domainsOf({ ae: [] }), settings(), state()).subject).toBeNull();
  });

  it('PJE-LANE-001: byLane carries every lane key in render order, sorted by the lane rule, with dose changes derived and labs limited to the configured tests (#142)', () => {
    const structured = structureData(domainsOf(data()), settings(), state());
    expect(Object.keys(structured.byLane)).toEqual(LANE_KEYS);
    expect(structured.byLane.exposure.map((e) => e.id)).toEqual(['EX-2', 'EX-3']);
    expect(structured.byLane.doseChanges.map((e) => [e.id, e.day, e.flags.direction])).toEqual([
      ['DOSE-3', 17, 'increase']
    ]);
    expect(structured.byLane.adverseEvents.map((e) => e.label)).toEqual([
      'FALL',
      'NAUSEA',
      'ERYTHEMA',
      'HYPERHIDROSIS',
      'LOST'
    ]);
    expect(structured.byLane.labs.map((e) => e.test)).toEqual([
      'Alanine Aminotransferase',
      'Alanine Aminotransferase',
      'Bilirubin'
    ]);
    expect(structured.byLane.conMeds.map((e) => e.label)).toEqual([
      'ANCIENT',
      'ALSO',
      'ASPIRIN',
      'CORTISONE',
      'MYSTERY'
    ]);
    expect(structured.byLane.medicalHistory).toHaveLength(1);
    expect(structured.byLane.disposition).toHaveLength(2);
    for (const events of Object.values(structured.byLane)) {
      for (const event of events) expect(event.subject).toBe('P1');
    }
    // Every lab row is counted — the Glucose row is not a configured test, so
    // it is in the record (the drawer, the count) but never drawn.
    expect(structured.counts).toEqual({ EX: 2, AE: 5, LB: 4, CM: 5, MH: 1, DS: 2 });
    expect(structured.labTestsMissing).toEqual([
      'Aspartate Aminotransferase',
      'Alkaline Phosphatase'
    ]);
  });

  it('PJE-DATA-003: a lab for a test outside lb_tests stays in the record — counted, in allEvents, named — but is never drawn, filtered, anchored, window-counted or part of the domain (#142)', () => {
    const structured = structureData(domainsOf(data()), settings(), state());
    expect(structured.unconfiguredLabs.map((e) => e.test)).toEqual(['Glucose']);
    expect(structured.unconfiguredLabs[0].flags.unconfiguredTest).toBe(true);
    expect(structured.allEvents.filter((e) => e.domain === 'LB')).toHaveLength(4);
    expect(structured.byLane.labs.map((e) => e.test)).not.toContain('Glucose');
    expect(structured.events.map((e) => e.test)).not.toContain('Glucose');
    expect(structured.labSeries.map((s) => s.test)).not.toContain('Glucose');
    expect(structured.lanes.labs.rows).not.toContain('Glucose');
    // A far-off unconfigured lab day does not stretch the shared axis.
    const far = subjectRows('P1', {
      cm: [],
      mh: [],
      lb: [{ USUBJID: 'P1', LBTEST: 'Glucose', LBSTRESN: 5, LBDY: 900 }]
    });
    expect(structureData(domainsOf(far), settings(), state()).domain).toEqual([-14, 184]);
    // With lb_tests empty every test is configured and Glucose draws.
    const all = structureData(domainsOf(data()), settings({ lb_tests: [] }), state());
    expect(all.unconfiguredLabs).toEqual([]);
    expect(all.byLane.labs.map((e) => e.test)).toContain('Glucose');
  });

  it('PJE-LANE-004: the shared domain is an elapsed pair, the clamped con-med is flagged clippedStart, and events carry the subject reference date (#142)', () => {
    const structured = structureData(domainsOf(data()), settings(), state());
    expect(structured.domain).toEqual([-37, 184]);
    expect(structured.extent).toEqual([-37, 184]);
    expect(structured.refDate).toEqual({ date: '2013-12-16', rule: 'ref_col' });
    const ancient = structured.byLane.conMeds.find((e) => e.label === 'ANCIENT');
    expect(ancient.clippedStart).toBe(true);
    expect(ancient.start).toBe(-9894);
    const aspirin = structured.byLane.conMeds.find((e) => e.label === 'ASPIRIN');
    expect(aspirin.clippedStart).toBe(false);
    expect(aspirin.date).toBe('2013-12-06');
    const erythema = structured.byLane.adverseEvents.find((e) => e.label === 'ERYTHEMA');
    expect(erythema.date).toBe('2014-01-14');
    expect(erythema.endDate).toBe('2014-04-09');
    expect(structured.mode).toBe('day');
    expect(structureData(domainsOf(data()), settings(), state({ mode: 'date' })).mode).toBe('date');
  });

  it('PJE-LANE-008: unplaceable rows are kept, listed per lane, counted per domain and lane, and excluded from the domain (#142)', () => {
    const structured = structureData(domainsOf(data()), settings(), state());
    expect(structured.unplaceable.adverseEvents.map((e) => e.label)).toEqual(['LOST']);
    expect(structured.unplaceable.conMeds.map((e) => e.label)).toEqual(['MYSTERY']);
    expect(structured.unplaceableCounts).toEqual({
      byDomain: { EX: 0, AE: 1, LB: 0, CM: 1, MH: 0, DS: 0 },
      byLane: {
        exposure: 0,
        doseChanges: 0,
        adverseEvents: 1,
        labs: 0,
        conMeds: 1,
        medicalHistory: 0,
        disposition: 0
      }
    });
    expect(structured.allEvents.filter((e) => !e.placeable)).toHaveLength(2);
    expect(structured.lanes.adverseEvents.unplaceable.map((e) => e.id)).toEqual(['AE-9']);
  });

  it('PJE-FILT-001: events is the post-filter set over ENABLED lanes in lane order then day order; allEvents is pre-filter (#142)', () => {
    const domains = domainsOf(data());
    const structured = structureData(
      domains,
      settings(),
      state({ filters: { AESER: 'Y' }, lanes: { conMeds: false } })
    );
    expect(structured.byLane.adverseEvents.map((e) => e.label)).toEqual(['FALL']);
    expect(structured.byLane.conMeds).toHaveLength(5);
    expect(structured.events.some((e) => e.lane === 'conMeds')).toBe(false);
    expect(structured.events.filter((e) => e.domain === 'AE')).toHaveLength(1);
    expect(structured.allEvents.filter((e) => e.domain === 'AE')).toHaveLength(5);
    const lanes = structured.events.map((e) => e.lane);
    expect(lanes).toEqual([...lanes].sort((a, b) => LANE_KEYS.indexOf(a) - LANE_KEYS.indexOf(b)));
    const labDays = structured.events.filter((e) => e.lane === 'labs').map((e) => e.day);
    expect(labDays).toEqual([...labDays].sort((a, b) => a - b));
    expect(structured.lanes.conMeds.enabled).toBe(false);
    expect(structured.lanes.adverseEvents.enabled).toBe(true);
    expect(
      structureData(domains, settings({ lanes: { labs: null } }), state()).lanes.labs.enabled
    ).toBe(false);
  });

  it('PJE-FILT-002: the abnormal-only filter keeps the lab series baseline from the whole record (#142)', () => {
    const structured = structureData(
      domainsOf(data()),
      settings(),
      state({ filters: { LBNRIND: '__abnormal__' } })
    );
    expect(structured.byLane.labs.map((e) => e.id)).toEqual(['LB-5']);
    expect(structured.labSeries.map((s) => s.test)).toEqual(['Alanine Aminotransferase']);
    expect(structured.labSeries[0].baseline).toMatchObject({ day: -7, value: 10, rule: 'flag' });
    expect(structured.labSeries[0].points).toHaveLength(1);
    expect(structured.labSeries[0].domain).toEqual(structured.domain);
  });

  it('PJE-FILT-004: the live filter list drops absent columns with the house warning and their state is ignored (#142)', () => {
    const domains = domainsOf(
      merge(subjectRows('P1', { cm: [{ USUBJID: 'P1', CMTRT: 'X', ASTDY: 1 }] }))
    );
    const structured = structureData(
      domains,
      settings(),
      state({ filters: { CMCLAS: ['UNCODED'] } })
    );
    expect(structured.filters.map((f) => f.value_col)).toEqual(['AESER', 'LBNRIND']);
    expect(structured.byLane.conMeds).toHaveLength(1);
    expect(warn.mock.calls.map((c) => c[0])).toContain(
      'The [ ATC class ] filter has been removed because the variable does not exist.'
    );
  });

  it('PJE-DATA-003: dropped rows are aggregated study-wide by domain and by reason (#142)', () => {
    const rows = data();
    rows.ae.push(
      { USUBJID: '', AETERM: 'no id', ASTDY: 1 },
      { USUBJID: 'P1', AETERM: '', AEDECOD: '', ASTDY: 1 }
    );
    rows.lb.push({ USUBJID: 'P2', LBTEST: 'ALT', LBSTRESN: 'x', LBDY: 1 });
    const structured = structureData(domainsOf(rows), settings(), state());
    expect(structured.droppedCounts.total).toBe(3);
    expect(structured.droppedCounts.byDomain).toEqual({ EX: 0, AE: 2, LB: 1, CM: 0, MH: 0, DS: 0 });
    expect(structured.droppedCounts.byReason).toEqual({
      'missing participant id (USUBJID)': 1,
      'missing adverse-event term (AETERM, AEDECOD)': 1,
      'non-numeric result (LBSTRESN = "x")': 1
    });
    expect(structured.dropped).toHaveLength(3);
    expect(structured.dropped[0].__pje_dropReason).toBe('missing participant id (USUBJID)');
  });

  it('PJE-DATA-008: end-before-start and date-conflict records are kept and counted study-wide in flaggedCounts (#142)', () => {
    const rows = data();
    rows.ae.push(
      { USUBJID: 'P2', AETERM: 'Backwards', ASTDY: 50, AENDY: 40 },
      { USUBJID: 'P1', AETERM: 'Wrong date', ASTDY: 50, AENDY: 51, AESTDTC: '2014-06-01' }
    );
    const structured = structureData(domainsOf(rows), settings(), state());
    expect(structured.flaggedCounts.endBeforeStart).toBe(1);
    expect(structured.flaggedCounts.dateConflict).toBe(1);
    expect(structured.flaggedCounts.total).toBe(2);
    expect(Object.keys(structured.flaggedCounts.byReason)).toHaveLength(2);
    expect(structured.flagged).toHaveLength(2);
    const conflict = structured.allEvents.find((e) => e.label === 'Wrong date');
    expect(conflict.dateConflict).toBe(true);
    expect(conflict.date).toBe('2014-02-03');
    expect(conflict.placeable).toBe(true);
  });

  it('PJE-LANE-010: the row cap draws a deterministic head of the lane order, names the remainder and the sort rule, and carries the truncation into the context bundle (#142)', () => {
    const domains = domainsOf(data());
    const structured = structureData(domains, settings({ max_rows_per_lane: 2 }), state());
    const ae = structured.lanes.adverseEvents;
    expect(ae.rows).toEqual(['AE-7', 'AE-8']);
    expect(ae.drawn.map((e) => e.label)).toEqual(['FALL', 'NAUSEA']);
    expect(ae.rowCount).toBe(4);
    expect(ae.truncated).toBe(2);
    expect(ae.sortRule).toBe('sorted by severity, then onset');
    const cm = structured.lanes.conMeds;
    expect(cm.drawn.map((e) => e.label)).toEqual(['ANCIENT', 'ALSO']);
    expect(cm.truncated).toBe(2);
    expect(cm.sortRule).toBe('sorted by start day, then name');
    expect(structured.lanes.exposure.rows).toEqual(['XANOMELINE']);
    expect(structured.lanes.exposure.truncated).toBe(0);
    expect(structured.lanes.labs.rows).toEqual(['Alanine Aminotransferase', 'Bilirubin']);
    expect(structured.lanes.doseChanges.rows).toEqual(['doseChanges']);
    expect(structured.lanes.doseChanges.truncated).toBe(0);
    expect(structured.truncatedByLane).toEqual({
      exposure: 0,
      doseChanges: 0,
      adverseEvents: 2,
      labs: 0,
      conMeds: 2,
      medicalHistory: 0,
      disposition: 0
    });
    const anchor = structured.byLane.adverseEvents.find((e) => e.label === 'ERYTHEMA');
    const bundle = buildContext(structured, anchor, settings({ max_rows_per_lane: 2 }));
    expect(bundle.notEvaluated.truncatedByLane).toEqual(structured.truncatedByLane);
    expect(bundle.notEvaluated.unplaceableByDomain).toEqual({
      AE: 1,
      LB: 0,
      EX: 0,
      CM: 1,
      MH: 0,
      DS: 0
    });
    expect(bundle.counts.conMeds).toBe(3);
    expect(bundle.notEvaluated.conMedsEndUnrecorded).toBe(3);
    expect(bundle.notEvaluated.conMedsWithoutStart).toBe(1);
  });

  it('PJE-DATA-005: a domain that was not supplied is marked so its lanes can render the empty state (#142)', () => {
    const structured = structureData(
      domainsOf(merge(subjectRows('P1', { mh: [], ds: [] }))),
      settings(),
      state()
    );
    expect(structured.lanes.medicalHistory.supplied).toBe(false);
    expect(structured.lanes.disposition.supplied).toBe(false);
    expect(structured.lanes.adverseEvents.supplied).toBe(true);
    expect(structured.lanes.doseChanges.supplied).toBe(true);
    expect(structured.byLane.medicalHistory).toEqual([]);
  });

  it('PJE-DATA-006: the raw rows are untouched and every event keeps its source by reference (#142)', () => {
    const rows = data();
    const snapshot = JSON.stringify(rows);
    const domains = domainsOf(rows);
    const structured = structureData(domains, settings(), state({ filters: { AESER: 'Y' } }));
    expect(JSON.stringify(rows)).toBe(snapshot);
    for (const event of structured.allEvents) {
      if (event.flags.derived) continue;
      expect(domains[event.domain][event.sourceIndex]).toBe(event.source);
    }
  });

  it('PJE-LANE-004: with nothing placeable the domain is null, the lab series carry a null domain, and lanes still list their unplaceable rows (#142)', () => {
    const structured = structureData(
      domainsOf({ ae: [{ USUBJID: 'P1', AETERM: 'x', ASTDY: '' }] }),
      settings(),
      state()
    );
    expect(structured.domain).toBeNull();
    expect(structured.labSeries).toEqual([]);
    expect(structured.unplaceable.adverseEvents).toHaveLength(1);
    expect(structured.refDate).toBeNull();
  });
});
