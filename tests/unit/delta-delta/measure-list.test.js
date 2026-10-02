import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMeasures } from '../../../src/delta-delta/structureData.js';
import { syncSettings } from '../../../src/delta-delta/configure.js';

// The `measures` setting on delta-delta (SDD-MEAS-001/002, #136): an ordered
// whitelist for the X and Y Measure pickers. Both pickers read one list, and
// the default selections are its first two entries — so ordering the list is
// also how a study says which comparison the chart opens on, which is what
// RhoInc/safety-delta-delta#38 ("Need to apply measure order in small
// multiples") asked for.

const ROWS = [
  { USUBJID: 'P1', TEST: 'Sodium', STRESN: 140, VISIT: 'Week 1' },
  { USUBJID: 'P1', TEST: 'Albumin', STRESN: 4.1, VISIT: 'Week 1' },
  { USUBJID: 'P1', TEST: 'Creatinine', STRESN: 0.9, VISIT: 'Week 1' }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('delta-delta: the measures whitelist', () => {
  it('SDD-MEAS-001: no whitelist offers every measure in the data, alphabetically (#136)', () => {
    expect(getMeasures(ROWS, syncSettings({}))).toEqual(['Albumin', 'Creatinine', 'Sodium']);
  });

  it('SDD-MEAS-001: a whitelist offers exactly the listed measures, in the listed order (#136)', () => {
    expect(getMeasures(ROWS, syncSettings({ measures: ['Sodium', 'Albumin'] }))).toEqual([
      'Sodium',
      'Albumin'
    ]);
  });

  it('SDD-MEAS-001: a bare string is accepted as a one-entry whitelist (#136)', () => {
    expect(syncSettings({ measures: 'Sodium' }).measures).toEqual(['Sodium']);
    expect(syncSettings({}).measures).toEqual([]);
  });

  it('SDD-MEAS-002: a configured measure absent from the data is dropped with a warning (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getMeasures(ROWS, syncSettings({ measures: ['Sodium', 'Bilirubin'] }))).toEqual([
      'Sodium'
    ]);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('Bilirubin'))).toBe(true);
  });

  it('SDD-MEAS-002: a whitelist matching nothing falls back to every measure (#136)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getMeasures(ROWS, syncSettings({ measures: ['Bilirubin'] }))).toEqual([
      'Albumin',
      'Creatinine',
      'Sodium'
    ]);
  });
});
