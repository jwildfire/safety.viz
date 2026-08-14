import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTteRecords,
  isDermEvent,
  TTE_COLUMNS,
  TTE_PARAMS
} from '../../../scripts/demo-data-lib.mjs';

// ADTTE demo-data derivation (safety.viz#128, design obot.roadmap 161_design.html §5).
// One row per safety participant per endpoint: time to first dermatologic event (TTDE),
// time to first serious AE (TTSAE), time to first any treatment-emergent AE (TTAE).
// Day 1 = TRTSDT (the ASTDY convention); participants without a qualifying event are
// censored at end of study, EOSDT − TRTSDT + 1. The derivation is deterministic and the
// committed site/data/adtte.csv is guarded below against silent upstream drift.

// An adsl-shaped subject-level row.
function subject({
  id,
  arm = 'Placebo',
  saffl = 'Y',
  trtsdt = '2014-01-01',
  eosdt = '2014-06-30',
  trtedt = ''
} = {}) {
  return {
    USUBJID: id,
    TRT01A: arm,
    ARM: arm,
    SAFFL: saffl,
    TRTSDT: trtsdt,
    EOSDT: eosdt,
    TRTEDT: trtedt
  };
}

// An adae-shaped adverse-event row (source shape, before the demo projection).
function event({
  id,
  astdy,
  decod = 'HEADACHE',
  bodsys = 'NERVOUS SYSTEM DISORDERS',
  ser = 'N',
  trtemfl = 'Y',
  aeseq = '1'
} = {}) {
  return {
    USUBJID: id,
    AEDECOD: decod,
    AEBODSYS: bodsys,
    AESER: ser,
    TRTEMFL: trtemfl,
    ASTDY: String(astdy),
    AESEQ: aeseq
  };
}

const rowsFor = (records, id, paramcd) =>
  records.filter((r) => r.USUBJID === id && r.PARAMCD === paramcd);

describe('isDermEvent', () => {
  it('qualifies the skin SOC and APPLICATION SITE preferred terms, nothing else (#128)', () => {
    expect(
      isDermEvent(event({ id: 'x', astdy: 1, bodsys: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS' }))
    ).toBe(true);
    expect(
      isDermEvent(
        event({
          id: 'x',
          astdy: 1,
          decod: 'APPLICATION SITE ERYTHEMA',
          bodsys: 'GENERAL DISORDERS AND ADMINISTRATION SITE CONDITIONS'
        })
      )
    ).toBe(true);
    expect(isDermEvent(event({ id: 'x', astdy: 1 }))).toBe(false);
  });
});

describe('buildTteRecords', () => {
  it('writes one row per safety participant per endpoint, in the declared column and param order (#128)', () => {
    const { columns, records } = buildTteRecords(
      [event({ id: '01', astdy: 5 })],
      [subject({ id: '01' }), subject({ id: '02' })]
    );
    expect(columns).toEqual(TTE_COLUMNS);
    expect(TTE_COLUMNS).toEqual([
      'USUBJID',
      'ARM',
      'PARAMCD',
      'PARAM',
      'AVAL',
      'CNSR',
      'EVNTDESC',
      'CNSDTDSC'
    ]);
    expect(records).toHaveLength(2 * TTE_PARAMS.length);
    // Params grouped in declared order, participants in adsl input order within each.
    expect(records.map((r) => r.PARAMCD)).toEqual(
      TTE_PARAMS.flatMap((p) => ['01', '02'].map(() => p.paramcd))
    );
    const paramById = Object.fromEntries(TTE_PARAMS.map((p) => [p.paramcd, p.param]));
    for (const r of records) expect(r.PARAM).toBe(paramById[r.PARAMCD]);
  });

  it('excludes non-safety participants and participants with no treatment start (#128)', () => {
    const { records } = buildTteRecords(
      [],
      [
        subject({ id: '01', saffl: 'N' }),
        subject({ id: '02', trtsdt: 'NA' }),
        subject({ id: '03' })
      ]
    );
    expect(new Set(records.map((r) => r.USUBJID))).toEqual(new Set(['03']));
  });

  it('events: AVAL is the earliest qualifying ASTDY, CNSR 0, EVNTDESC the first qualifying term (#128)', () => {
    const { records } = buildTteRecords(
      [
        event({
          id: '01',
          astdy: 12,
          decod: 'RASH',
          bodsys: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS'
        }),
        event({
          id: '01',
          astdy: 4,
          decod: 'PRURITUS',
          bodsys: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS'
        }),
        event({
          id: '01',
          astdy: 30,
          decod: 'SEPSIS',
          bodsys: 'INFECTIONS AND INFESTATIONS',
          ser: 'Y'
        })
      ],
      [subject({ id: '01', trtsdt: '2014-01-01', eosdt: '2014-05-30' })]
    );
    const [ttde] = rowsFor(records, '01', 'TTDE');
    expect(ttde).toMatchObject({ AVAL: 4, CNSR: 0, EVNTDESC: 'PRURITUS', CNSDTDSC: '' });
    const [ttsae] = rowsFor(records, '01', 'TTSAE');
    expect(ttsae).toMatchObject({ AVAL: 30, CNSR: 0, EVNTDESC: 'SEPSIS' });
    const [ttae] = rowsFor(records, '01', 'TTAE');
    expect(ttae).toMatchObject({ AVAL: 4, CNSR: 0, EVNTDESC: 'PRURITUS' });
  });

  it('breaks earliest-day ties by numeric AESEQ so the derivation is order-independent (#128)', () => {
    const tied = [
      event({
        id: '01',
        astdy: 4,
        decod: 'ERYTHEMA',
        bodsys: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS',
        aeseq: '10'
      }),
      event({
        id: '01',
        astdy: 4,
        decod: 'PRURITUS',
        bodsys: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS',
        aeseq: '2'
      })
    ];
    const subjects = [subject({ id: '01' })];
    const forward = buildTteRecords(tied, subjects).records;
    const reversed = buildTteRecords([...tied].reverse(), subjects).records;
    expect(rowsFor(forward, '01', 'TTDE')[0].EVNTDESC).toBe('PRURITUS');
    expect(rowsFor(reversed, '01', 'TTDE')[0].EVNTDESC).toBe('PRURITUS');
  });

  it('censors event-free participants at end of study: AVAL = EOSDT − TRTSDT + 1, CNSR 1 (#128)', () => {
    const { records } = buildTteRecords(
      [],
      [subject({ id: '01', trtsdt: '2014-01-01', eosdt: '2014-01-31' })]
    );
    const [ttae] = rowsFor(records, '01', 'TTAE');
    expect(ttae).toMatchObject({ AVAL: 31, CNSR: 1, EVNTDESC: '', CNSDTDSC: 'END OF STUDY' });
  });

  it('ignores non-treatment-emergent rows and rows with no usable positive ASTDY (#128)', () => {
    const { records } = buildTteRecords(
      [
        event({ id: '01', astdy: 5, trtemfl: 'N' }),
        event({ id: '01', astdy: 'NA' }),
        event({ id: '01', astdy: 0 }),
        event({ id: '01', astdy: -3 })
      ],
      [subject({ id: '01', trtsdt: '2014-01-01', eosdt: '2014-01-10' })]
    );
    const [ttae] = rowsFor(records, '01', 'TTAE');
    expect(ttae).toMatchObject({ AVAL: 10, CNSR: 1 });
  });

  it('falls back to TRTEDT for a censored participant with no EOSDT, and drops with a warning when neither exists (#128)', () => {
    const warnings = [];
    const { records } = buildTteRecords(
      [],
      [
        subject({ id: '01', trtsdt: '2014-01-01', eosdt: 'NA', trtedt: '2014-01-21' }),
        subject({ id: '02', trtsdt: '2014-01-01', eosdt: 'NA', trtedt: 'NA' })
      ],
      { warn: (msg) => warnings.push(msg) }
    );
    const [ttae] = rowsFor(records, '01', 'TTAE');
    expect(ttae).toMatchObject({ AVAL: 21, CNSR: 1 });
    expect(records.some((r) => r.USUBJID === '02')).toBe(false);
    expect(warnings.some((w) => w.includes('02'))).toBe(true);
  });

  it('takes the group from the subject-level actual treatment, covering AE-free participants (#128)', () => {
    const { records } = buildTteRecords(
      [event({ id: '01', astdy: 3 })],
      [
        subject({ id: '01', arm: 'Xanomeline High Dose' }),
        subject({ id: '02', arm: 'Xanomeline Low Dose' })
      ]
    );
    expect(rowsFor(records, '01', 'TTAE')[0].ARM).toBe('Xanomeline High Dose');
    expect(rowsFor(records, '02', 'TTAE')[0].ARM).toBe('Xanomeline Low Dose');
  });
});

describe('committed adtte.csv', () => {
  // Guard against silent upstream drift: these are the measured facts the design's §5.1
  // states (computed 2026-08-15 from live pharmaverseadam adae + adsl). If pharmaverseadam
  // changes, regeneration breaks here loudly instead of shifting the demo quietly.
  const csvPath = join(dirname(fileURLToPath(import.meta.url)), '../../../site/data/adtte.csv');

  function parse() {
    const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split('\n');
    const cols = header.split(',');
    return lines.map((l) => {
      const cells = l.split(',');
      return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    });
  }

  it('carries 254 safety participants × 3 endpoints with the measured event counts (TTE-DEMO-002, #128)', () => {
    const rows = parse();
    expect(rows).toHaveLength(254 * 3);
    const ids = new Set(rows.map((r) => r.USUBJID));
    expect(ids.size).toBe(254);
    const events = (paramcd) => rows.filter((r) => r.PARAMCD === paramcd && r.CNSR === '0').length;
    expect(events('TTDE')).toBe(156);
    expect(events('TTSAE')).toBe(3);
    expect(events('TTAE')).toBe(217);
  });

  it('every AVAL is a positive integer day and censor days stay within the measured 1–213 range (TTE-DEMO-002, #128)', () => {
    const rows = parse();
    for (const r of rows) {
      const t = Number(r.AVAL);
      expect(Number.isInteger(t) && t >= 1).toBe(true);
    }
    const censorDays = rows.filter((r) => r.CNSR === '1').map((r) => Number(r.AVAL));
    expect(Math.min(...censorDays)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...censorDays)).toBeLessThanOrEqual(213);
  });
});
