import { describe, it, expect } from 'vitest';
import { syncSettings, OE_SEQ } from '../../../src/outlier-explorer/configure.js';
import {
  assignSequence,
  buildSeries,
  cleanData,
  computeNormalRange,
  countInliers,
  measureLabel,
  median,
  orderedCategories
} from '../../../src/outlier-explorer/structureData.js';

const settings = syncSettings({});

describe('outlier-explorer structureData', () => {
  it('SOE-REG-037/SOE-REG-038: cleanData drops missing and non-numeric results with a count (#24)', () => {
    const { rows, removed } = cleanData(
      [
        { TEST: 'Albumin', STRESN: '10', USUBJID: 'P1' },
        { TEST: 'Albumin', STRESN: '', USUBJID: 'P2' },
        { TEST: 'Albumin', STRESN: 'NA', USUBJID: 'P3' },
        { TEST: 'Albumin', STRESN: '12', USUBJID: 'P4' }
      ],
      settings
    );
    expect(removed).toBe(2);
    expect(rows.map((r) => r.__oe_value)).toEqual([10, 12]);
  });

  it('SOE-REG-029/SOE-REG-031: measureLabel appends the unit when present (#24)', () => {
    expect(measureLabel({ TEST: 'Albumin', STRESU: 'g/dL' }, settings)).toBe('Albumin (g/dL)');
    expect(measureLabel({ TEST: 'Pulse', STRESU: '' }, settings)).toBe('Pulse');
  });

  it('SOE-FUNC-004: assignSequence derives a 1-based per-participant measurement index (#24)', () => {
    const rows = [
      { USUBJID: 'P1', __oe_value: 1 },
      { USUBJID: 'P2', __oe_value: 2 },
      { USUBJID: 'P1', __oe_value: 3 },
      { USUBJID: 'P1', __oe_value: 4 }
    ];
    assignSequence(rows, 'USUBJID');
    expect(rows.map((r) => r[OE_SEQ])).toEqual([1, 1, 2, 3]);
  });

  it('SOE-FUNC-010/SOE-REG-016: buildSeries makes one time-sorted series per participant (#24)', () => {
    const rows = [
      { USUBJID: 'P2', __oe_value: 5, [OE_SEQ]: 1, ARM: 'Drug' },
      { USUBJID: 'P1', __oe_value: 9, [OE_SEQ]: 2, ARM: 'Placebo' },
      { USUBJID: 'P1', __oe_value: 7, [OE_SEQ]: 1, ARM: 'Placebo' }
    ];
    const timeCol = { value_col: OE_SEQ, label: 'Measurement', type: 'linear', order_col: OE_SEQ };
    const series = buildSeries(rows, settings, timeCol, 'ARM');
    expect(series.map((s) => s.id)).toEqual(['P1', 'P2']);
    // P1's points come out sorted by the sequence (1 then 2).
    expect(series[0].points.map((p) => p.y)).toEqual([7, 9]);
    expect(series[0].group).toBe('Placebo');
    expect(series[1].points.map((p) => p.y)).toEqual([5]);
  });

  it('SOE-REG-028: orderedCategories sorts ordinal visits by their order column (#24)', () => {
    const rows = [
      { VISIT: 'Week 4', VISITNUM: 4 },
      { VISIT: 'Baseline', VISITNUM: 1 },
      { VISIT: 'Week 4', VISITNUM: 4 },
      { VISIT: 'Week 2', VISITNUM: 2 }
    ];
    const timeCol = { value_col: 'VISIT', label: 'Visit', type: 'ordinal', order_col: 'VISITNUM' };
    expect(orderedCategories(rows, timeCol)).toEqual(['Baseline', 'Week 2', 'Week 4']);
  });

  it('SOE-FUNC-007/SOE-CFG-007: Standard Deviation normal range uses mean +/- k*sd (#24)', () => {
    const rows = [10, 12, 14, 16, 18].map((v) => ({ __oe_value: v }));
    const nr = computeNormalRange(
      rows,
      syncSettings({ normal_range_method: 'Standard Deviation', normal_range_sd: 2 })
    );
    // mean 14, sample sd = sqrt(10) ≈ 3.16228; 14 ± 2*sd.
    expect(nr.low).toBeCloseTo(14 - 2 * Math.sqrt(10), 6);
    expect(nr.high).toBeCloseTo(14 + 2 * Math.sqrt(10), 6);
  });

  it('SOE-FUNC-007/SOE-CFG-008: Quantiles normal range uses the configured quantiles (#24)', () => {
    const rows = [10, 12, 14, 16, 18].map((v) => ({ __oe_value: v }));
    const nr = computeNormalRange(
      rows,
      syncSettings({
        normal_range_method: 'Quantiles',
        normal_range_quantile_low: 0.25,
        normal_range_quantile_high: 0.75
      })
    );
    expect(nr).toEqual({ low: 12, high: 16 });
  });

  it('SOE-FUNC-007/SOE-REG-025: LLN-ULN normal range is the median of the limit columns; None is null (#24)', () => {
    const rows = [
      { __oe_value: 11, STNRLO: 10, STNRHI: 20 },
      { __oe_value: 15, STNRLO: 10, STNRHI: 20 },
      { __oe_value: 22, STNRLO: 12, STNRHI: 24 }
    ];
    expect(computeNormalRange(rows, syncSettings({ normal_range_method: 'LLN-ULN' }))).toEqual({
      low: median([10, 10, 12]),
      high: median([20, 20, 24])
    });
    expect(computeNormalRange(rows, syncSettings({ normal_range_method: 'None' }))).toBeNull();
  });

  it('SOE-FUNC-007: countInliers counts observations inside the band (#24)', () => {
    const rows = [8, 12, 15, 25].map((v) => ({ __oe_value: v }));
    expect(countInliers(rows, { low: 10, high: 20 })).toBe(2);
    expect(countInliers(rows, null)).toBeNull();
  });
});
