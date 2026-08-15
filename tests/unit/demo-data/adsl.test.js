import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADSL_COLUMNS, buildAdslRecords } from '../../../scripts/demo-data-lib.mjs';

// Population demo-data derivation (safety.viz#128, design obot.roadmap
// 161_design.html §5 as revised by the sv#131 review). One row per safety
// participant: the analysis denominator for the Time-to-Event Explorer, whose
// endpoint is composed live from filters over adae.csv. Day 1 = TRTSDT (the
// ASTDY convention), so the follow-up-end day is EOSDY = EOSDT − TRTSDT + 1,
// falling back to TRTEDT. The derivation is deterministic and the committed
// site/data/adsl.csv is guarded below against silent upstream drift.

// An adsl-shaped subject-level row.
function subject({
  id,
  arm = 'Placebo',
  saffl = 'Y',
  trtsdt = '2014-01-01',
  eosdt = '2014-06-30',
  trtedt = '',
  eosstt = 'COMPLETED'
} = {}) {
  return {
    USUBJID: id,
    TRT01A: arm,
    ARM: arm,
    SAFFL: saffl,
    TRTSDT: trtsdt,
    EOSDT: eosdt,
    TRTEDT: trtedt,
    EOSSTT: eosstt
  };
}

describe('buildAdslRecords', () => {
  it('writes one row per safety participant in adsl input order, in the declared columns (#128)', () => {
    const { columns, records } = buildAdslRecords([subject({ id: '01' }), subject({ id: '02' })]);
    expect(columns).toEqual(ADSL_COLUMNS);
    expect(ADSL_COLUMNS).toEqual(['USUBJID', 'ARM', 'EOSDY', 'EOSSTT']);
    expect(records.map((r) => r.USUBJID)).toEqual(['01', '02']);
  });

  it('excludes non-safety participants and participants with no treatment start (#128)', () => {
    const { records } = buildAdslRecords([
      subject({ id: '01', saffl: 'N' }),
      subject({ id: '02', trtsdt: 'NA' }),
      subject({ id: '03' })
    ]);
    expect(records.map((r) => r.USUBJID)).toEqual(['03']);
  });

  it('derives EOSDY = EOSDT − TRTSDT + 1 and carries the end-of-study status (#128)', () => {
    const { records } = buildAdslRecords([
      subject({ id: '01', trtsdt: '2014-01-01', eosdt: '2014-01-31', eosstt: 'DISCONTINUED' })
    ]);
    expect(records[0]).toMatchObject({ EOSDY: 31, EOSSTT: 'DISCONTINUED' });
  });

  it('falls back to TRTEDT when EOSDT is missing, and keeps a blank EOSDY with a warning when neither exists (#128)', () => {
    const warnings = [];
    const { records } = buildAdslRecords(
      [
        subject({ id: '01', trtsdt: '2014-01-01', eosdt: 'NA', trtedt: '2014-01-21' }),
        subject({ id: '02', trtsdt: '2014-01-01', eosdt: 'NA', trtedt: 'NA' })
      ],
      { warn: (msg) => warnings.push(msg) }
    );
    expect(records[0]).toMatchObject({ EOSDY: 21 });
    expect(records[1]).toMatchObject({ EOSDY: '' });
    expect(warnings.some((w) => w.includes('02'))).toBe(true);
  });

  it('takes the group from the subject-level actual treatment (#128)', () => {
    const { records } = buildAdslRecords([subject({ id: '01', arm: 'Xanomeline High Dose' })]);
    expect(records[0].ARM).toBe('Xanomeline High Dose');
  });
});

describe('committed adsl.csv', () => {
  // Guard against silent upstream drift: these are the measured facts (computed
  // 2026-08-15 from live pharmaverseadam adsl, matching the retired ADTTE
  // derivation's population). If pharmaverseadam changes, regeneration breaks
  // here loudly instead of shifting the demo quietly.
  const csvPath = join(dirname(fileURLToPath(import.meta.url)), '../../../site/data/adsl.csv');

  function parse() {
    const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split('\n');
    const cols = header.split(',');
    return lines.map((l) => {
      const cells = l.split(',');
      return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    });
  }

  it('carries the 254 safety participants across the three arms (TTE-DEMO-002, #128)', () => {
    const rows = parse();
    expect(rows).toHaveLength(254);
    expect(new Set(rows.map((r) => r.USUBJID)).size).toBe(254);
    expect(new Set(rows.map((r) => r.ARM))).toEqual(
      new Set(['Placebo', 'Xanomeline High Dose', 'Xanomeline Low Dose'])
    );
  });

  it('every EOSDY is a positive integer day within the measured 1–213 range, with a status for each (TTE-DEMO-002, #128)', () => {
    const rows = parse();
    for (const r of rows) {
      const day = Number(r.EOSDY);
      expect(Number.isInteger(day) && day >= 1 && day <= 213).toBe(true);
      expect(r.EOSSTT).toBeTruthy();
    }
  });
});
