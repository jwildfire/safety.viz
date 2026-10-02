import { describe, it, expect } from 'vitest';
import {
  hasUnscheduledVisits,
  isUnscheduledVisit,
  parseUnscheduledPattern
} from '../../../src/unscheduled-visits.js';
import { partitionUnscheduledRows } from '../../../src/hep-core/rows.js';
import { syncSettings } from '../../../src/hep-explorer/configure.js';

// Unscheduled visits in hep-explorer (HEP-DATA-013, #136). Filed against the
// original renderer in 2019 by @jwildfire — "We can probably use the same
// approach and settings established in other renderers" — and that is exactly
// what this is: results-over-time's predicate, promoted to a shared module so
// a second renderer consumes it without importing a renderer file.
//
// The difference from results-over-time is semantic and is the reason this is
// tested at the row level, not just at the control: in results-over-time
// hiding a visit removes an x-axis box, while here removing a record moves the
// resolved baseline and the on-treatment peak.

const SETTINGS = syncSettings({ visit_col: 'VISIT' });

const ROWS = [
  { USUBJID: 'P1', VISIT: 'Baseline', TEST: 'ALT', STRESN: 20 },
  { USUBJID: 'P1', VISIT: 'Unscheduled 1', TEST: 'ALT', STRESN: 90 },
  { USUBJID: 'P1', VISIT: 'Week 4', TEST: 'ALT', STRESN: 30 },
  { USUBJID: 'P2', VISIT: 'Early Termination', TEST: 'ALT', STRESN: 55 },
  { USUBJID: 'P3', VISIT: '', TEST: 'ALT', STRESN: 22 }
];

describe('unscheduled visits: the shared predicate', () => {
  it('HEP-DATA-013: the default pattern matches unscheduled and early-termination visits (#136)', () => {
    expect(isUnscheduledVisit('Unscheduled 1', SETTINGS)).toBe(true);
    expect(isUnscheduledVisit('EARLY TERMINATION', SETTINGS)).toBe(true);
    expect(isUnscheduledVisit('Week 4', SETTINGS)).toBe(false);
  });

  it('HEP-DATA-013: an explicit values list takes precedence over the pattern (#136)', () => {
    const settings = syncSettings({ visit_col: 'VISIT', unscheduled_visit_values: ['Week 4'] });
    expect(isUnscheduledVisit('Week 4', settings)).toBe(true);
    expect(isUnscheduledVisit('Unscheduled 1', settings)).toBe(false);
  });

  it('HEP-DATA-013: the pattern is read in /source/flags form, as the original settings wrote it (#136)', () => {
    expect(parseUnscheduledPattern('/abc/i').flags).toBe('i');
    expect(parseUnscheduledPattern('abc').source).toBe('abc');
  });

  it('HEP-DATA-013: a blank or unmapped visit column offers no unscheduled visits at all (#136)', () => {
    expect(hasUnscheduledVisits(ROWS, 'VISIT', SETTINGS)).toBe(true);
    expect(hasUnscheduledVisits(ROWS, null, SETTINGS)).toBe(false);
    expect(hasUnscheduledVisits([{ VISIT: '' }], 'VISIT', SETTINGS)).toBe(false);
  });
});

describe('unscheduled visits: the hep-core partition', () => {
  it('HEP-DATA-013: rows split into scheduled and unscheduled, keeping every row somewhere (#136)', () => {
    const { scheduled, unscheduled } = partitionUnscheduledRows(ROWS, SETTINGS);
    expect(unscheduled.map((row) => row.VISIT)).toEqual(['Unscheduled 1', 'Early Termination']);
    expect(scheduled.map((row) => row.VISIT)).toEqual(['Baseline', 'Week 4', '']);
    expect(scheduled.length + unscheduled.length).toBe(ROWS.length);
  });

  it('HEP-DATA-013: a blank visit is scheduled, not unscheduled — absence is not evidence (#136)', () => {
    const { unscheduled } = partitionUnscheduledRows(
      [{ VISIT: '' }, { VISIT: null }, {}],
      SETTINGS
    );
    expect(unscheduled).toEqual([]);
  });

  it('HEP-DATA-013: an unmapped visit column leaves every row scheduled rather than emptying the chart (#136)', () => {
    const settings = syncSettings({ visit_col: null });
    const { scheduled, unscheduled } = partitionUnscheduledRows(ROWS, settings);
    expect(scheduled).toHaveLength(ROWS.length);
    expect(unscheduled).toEqual([]);
  });
});

describe('unscheduled visits: the hep-explorer setting', () => {
  it('HEP-CTRL-018: unscheduled visits are INCLUDED by default, unlike results-over-time (#136)', () => {
    // The divergence is deliberate: an unscheduled draw in a hepatic study is
    // often the draw a suspected injury prompted, so excluding it by default
    // would hide the peak that caused the visit.
    expect(syncSettings({}).unscheduled_visits).toBe(true);
    expect(syncSettings({}).unscheduled_visit_pattern).toBe('/unscheduled|early termination/i');
    expect(syncSettings({}).unscheduled_visit_values).toBe(null);
  });
});
