import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/shift-plot/configure.js';
import {
  applyFilters,
  applyStat,
  cleanData,
  computeDomain,
  computeShiftPairs,
  formatPercent,
  listVisits,
  measureLabel,
  roundValue,
  unique
} from '../../../src/shift-plot/structureData.js';

// Data-preparation transforms for the shift-plot module (#14). Requirement
// keys reference the safety.agent matrix via docs/shift-plot-coverage.md.

const settings = syncSettings({});

const raw = [
  { USUBJID: 'S1', TEST: 'Albumin', STRESN: '10', VISIT: 'Baseline', VISITNUM: '1', SEX: 'F' },
  { USUBJID: 'S1', TEST: 'Albumin', STRESN: '14', VISIT: 'Week 12', VISITNUM: '2', SEX: 'F' },
  { USUBJID: 'S2', TEST: 'Albumin', STRESN: '20', VISIT: 'Baseline', VISITNUM: '1', SEX: 'M' },
  { USUBJID: 'S2', TEST: 'Albumin', STRESN: '15', VISIT: 'Week 12', VISITNUM: '2', SEX: 'M' },
  { USUBJID: 'S3', TEST: 'Albumin', STRESN: '8', VISIT: 'Baseline', VISITNUM: '1', SEX: 'F' },
  { USUBJID: 'S3', TEST: 'Albumin', STRESN: '8', VISIT: 'Week 12', VISITNUM: '2', SEX: 'F' },
  { USUBJID: 'S3', TEST: 'Albumin', STRESN: '12', VISIT: 'Week 24', VISITNUM: '3', SEX: 'F' },
  { USUBJID: 'S4', TEST: 'Albumin', STRESN: '5', VISIT: 'Baseline', VISITNUM: '1', SEX: 'M' },
  { USUBJID: 'S5', TEST: 'Albumin', STRESN: '9', VISIT: 'Week 12', VISITNUM: '2', SEX: 'M' },
  { USUBJID: 'S1', TEST: 'Pulse', STRESN: '70', VISIT: 'Baseline', VISITNUM: '1', SEX: 'F' },
  { USUBJID: 'S1', TEST: 'Pulse', STRESN: '72', VISIT: 'Week 12', VISITNUM: '2', SEX: 'F' }
];

const clean = (rows = raw) => cleanData(rows, settings).rows;

const pairsFor = (overrides = {}) =>
  computeShiftPairs({
    rows: clean(),
    measure: 'Albumin',
    baselineVisits: ['Baseline'],
    comparisonVisits: ['Week 12'],
    baselineStat: 'mean',
    comparisonStat: 'mean',
    settings,
    ...overrides
  });

describe('shift-plot structureData', () => {
  it('SSP-REG-020: missing and non-numeric results are removed with a reported count (#14)', () => {
    const { rows, removed } = cleanData(
      [{ STRESN: '10' }, { STRESN: '' }, { STRESN: 'NR' }, { STRESN: '2.5' }],
      settings
    );
    expect(removed).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].__ssp_value).toBe(10);
    expect(rows[0].__ssp_index).toBe(0);
    expect(rows[1].__ssp_value).toBe(2.5);
    expect(rows[1].__ssp_index).toBe(3);
  });

  it('SSP-DATA-001: measure labels are the raw measure value (#14)', () => {
    expect(measureLabel({ TEST: 'Albumin' }, settings)).toBe('Albumin');
  });

  it('SSP-REG-013/SSP-REG-014: visits order by visit_order_col, else alphanumerically (#14)', () => {
    const rows = [
      { VISIT: 'End', VISITNUM: '99' },
      { VISIT: 'Baseline', VISITNUM: '1' },
      { VISIT: 'Screening', VISITNUM: '0' }
    ];
    // {"visit_col":"VISIT","visit_order_col":"VISITNUM"} → sequential order.
    expect(listVisits(rows, settings)).toEqual(['Screening', 'Baseline', 'End']);
    // No usable order column → alphanumeric order (SSP-REG-014 second form).
    const noOrder = rows.map(({ VISIT }) => ({ VISIT }));
    expect(listVisits(noOrder, { ...settings, visit_order_col: 'VISITNUM' })).toEqual([
      'Baseline',
      'End',
      'Screening'
    ]);
  });

  it('SSP-REQ-005/SSP-REG-019: pairs baseline against comparison per participant with change and percent change (#14)', () => {
    const pairs = pairsFor();
    // S4 (baseline only) and S5 (comparison only) drop out — a participant
    // needs a value at both a baseline and a comparison visit to plot.
    expect(pairs.map((pair) => pair.USUBJID)).toEqual(['S1', 'S2', 'S3']);
    expect(pairs[0]).toMatchObject({
      USUBJID: 'S1',
      x: 10,
      y: 14,
      __ssp_baseline: 10,
      __ssp_comparison: 14,
      __ssp_chg: 4,
      __ssp_pchg: '40.0%'
    });
    expect(pairs[1]).toMatchObject({ x: 20, y: 15, __ssp_chg: -5, __ssp_pchg: '-25.0%' });
    expect(pairs[2]).toMatchObject({ x: 8, y: 8, __ssp_chg: 0, __ssp_pchg: '0.0%' });
    // Raw participant columns survive for filters/listing.
    expect(pairs[0].SEX).toBe('F');
  });

  it('SSP-CFG-005: multiple comparison visits collapse with the comparison statistic (#14)', () => {
    const pairs = computeShiftPairs({
      rows: clean(),
      measure: 'Albumin',
      baselineVisits: ['Baseline'],
      comparisonVisits: ['Week 12', 'Week 24'],
      baselineStat: 'mean',
      comparisonStat: 'mean',
      settings
    });
    // S3 comparison = mean(Week12=8, Week24=12) = 10.
    const s3 = pairs.find((pair) => pair.USUBJID === 'S3');
    expect(s3).toMatchObject({ x: 8, y: 10, __ssp_chg: 2, __ssp_pchg: '25.0%' });
  });

  it('SSP-CTRL-001: only the selected measure is paired (#14)', () => {
    const pulse = pairsFor({ measure: 'Pulse' });
    expect(pulse.map((pair) => pair.USUBJID)).toEqual(['S1']);
    expect(pulse[0]).toMatchObject({ x: 70, y: 72 });
  });

  it('applyStat collapses a visit set with mean/min/max/first and the single-value shortcut (#14)', () => {
    expect(applyStat([2, 4, 6], 'mean')).toBe(4);
    expect(applyStat([2, 4, 6], 'min')).toBe(2);
    expect(applyStat([2, 4, 6], 'max')).toBe(6);
    expect(applyStat([2, 4, 6], 'first')).toBe(2);
    expect(applyStat([9], 'mean')).toBe(9);
    expect(Number.isNaN(applyStat([], 'mean'))).toBe(true);
  });

  it('SSP-CHART-002: the shared domain spans both axes with padding (#14)', () => {
    const domain = computeDomain([
      { x: 10, y: 14 },
      { x: 8, y: 20 }
    ]);
    // extent [8, 20], pad = (20 - 8) * 0.05 = 0.6.
    expect(domain[0]).toBeCloseTo(7.4, 10);
    expect(domain[1]).toBeCloseTo(20.6, 10);
    expect(computeDomain([])).toEqual([0, 1]);
  });

  it('SSP-CTRL-003: active filters subset rows by stringified equality (#14)', () => {
    const rows = [
      { SEX: 'F', SITEID: 101 },
      { SEX: 'M', SITEID: 101 }
    ];
    expect(applyFilters(rows, { SEX: 'F' })).toHaveLength(1);
    expect(applyFilters(rows, { SEX: null })).toHaveLength(2);
  });

  it('helpers: unique drops empties; roundValue and formatPercent format cleanly (#14)', () => {
    expect(unique(['a', 'a', '', null, 'b'])).toEqual(['a', 'b']);
    expect(roundValue(3.14159)).toBe(3.14);
    expect(roundValue(4)).toBe(4);
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatPercent(NaN)).toBe('');
  });
});
