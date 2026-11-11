import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/outlier-explorer/configure.js';
import {
  buildSeries,
  categoryNames,
  cleanData,
  computeNormalRange,
  countInliers,
  measureLabel,
  median,
  orderedCategories,
  timeLabels
} from '../../../src/outlier-explorer/structureData.js';

const VISIT = {
  key: 'visit',
  col: 'VISITNUM',
  label_col: 'VISIT',
  type: 'ordinal',
  title: 'Visit'
};
const DAY = { key: 'day', col: 'DY', label_col: null, type: 'linear', title: 'Study day' };

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

  it('SOE-FUNC-010/SOE-REG-016: buildSeries makes one time-sorted series per participant (#24)', () => {
    const rows = [
      { USUBJID: 'P2', __oe_value: 5, DY: '1', ARM: 'Drug' },
      { USUBJID: 'P1', __oe_value: 9, DY: '29', ARM: 'Placebo' },
      { USUBJID: 'P1', __oe_value: 7, DY: '1', ARM: 'Placebo' }
    ];
    const series = buildSeries(rows, settings, DAY, 'ARM');
    expect(series.map((s) => s.id)).toEqual(['P1', 'P2']);
    // P1's points come out sorted by study day (1 then 29).
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
    expect(orderedCategories(rows, VISIT)).toEqual(['Baseline', 'Week 2', 'Week 4']);
    // A visit option read from time_cols orders by its order_col.
    const fromTimeCols = { key: 'visit', col: 'VISIT', type: 'ordinal', order_col: 'VISITNUM' };
    expect(orderedCategories(rows, fromTimeCols)).toEqual(['Baseline', 'Week 2', 'Week 4']);
  });

  it('SOE-XAX-006: buildSeries places points by visit name or by study day, and leaves out a record with no place on the axis (#371)', () => {
    const rows = [
      { USUBJID: 'P1', __oe_value: 9, VISIT: 'Week 2', VISITNUM: '2', DY: '15' },
      { USUBJID: 'P1', __oe_value: 7, VISIT: 'Baseline', VISITNUM: '0', DY: '' }
    ];
    const byVisit = buildSeries(rows, settings, VISIT, null)[0].points;
    expect(byVisit.map((p) => p.x)).toEqual(['Baseline', 'Week 2']);
    // With no study day the baseline record has no place on a day axis; it is
    // not plotted at day 0.
    const byDay = buildSeries(rows, settings, DAY, null)[0].points;
    expect(byDay.map((p) => p.x)).toEqual([15]);
  });

  it('SOE-XAX-006: visits that share a name but not a number stay apart, each named with its number (#384)', () => {
    const rows = [
      ['Baseline', 0],
      ['Week 2', 2],
      ['UNSCHEDULED', 2.1],
      ['Week 4', 4],
      ['UNSCHEDULED', 4.1],
      ['Week 6', 6]
    ].map(([visit, number], i) => ({
      USUBJID: 'P1',
      __oe_value: i,
      VISIT: visit,
      VISITNUM: number
    }));
    const expected = [
      'Baseline',
      'Week 2',
      'UNSCHEDULED (2.1)',
      'Week 4',
      'UNSCHEDULED (4.1)',
      'Week 6'
    ];
    expect(orderedCategories(rows, VISIT)).toEqual(expected);
    // The line runs left to right through both, never back to the first.
    const names = categoryNames(rows, VISIT);
    expect(buildSeries(rows, settings, VISIT, null, names)[0].points.map((p) => p.x)).toEqual(
      expected
    );
    // A name used once keeps its own label.
    expect(names.get('2')).toBe('Week 2');
  });

  it('SOE-XAX-006: the tooltip and listing name both the visit and the study day where the row has them (#371)', () => {
    const options = [VISIT, DAY];
    expect(timeLabels({ VISIT: 'Week 8', VISITNUM: '8', DY: '57' }, options)).toBe(
      'Week 8 · Day 57'
    );
    expect(timeLabels({ VISIT: 'Week 8', VISITNUM: '8', DY: '' }, options)).toBe('Week 8');
    expect(timeLabels({ DY: '-3' }, options)).toBe('Day -3');
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
