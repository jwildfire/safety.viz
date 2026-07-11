import { describe, it, expect } from 'vitest';
import {
  cleanData,
  computeVisitOrder,
  flagOutliers,
  isUnscheduledVisit,
  measureLabel,
  parseUnscheduledPattern,
  quantile,
  sd,
  summarize,
  summarizeVisitGroups,
  unique
} from '../../../src/results-over-time/structureData.js';

// Data preparation for the results-over-time module (#27): per-visit-group
// summary statistics, quantiles, outlier flagging, visit ordering, and
// unscheduled-visit detection — the unit-routed rows of the safety.agent
// matrix (SROT-DATA-001/002, SROT-CFG-005/006/017/018/019, SROT-REG-010/012).

const settings = {
  id_col: 'USUBJID',
  measure_col: 'TEST',
  value_col: 'STRESN',
  unit_col: 'STRESU',
  time_col: 'VISIT',
  time_order_col: 'VISITNUM'
};

describe('results-over-time structureData', () => {
  it('SROT-DATA-002: cleanData drops missing and non-numeric results with a reported count (#27)', () => {
    const { rows, removed } = cleanData(
      [
        { STRESN: '1.5', VISIT: 'V1' },
        { STRESN: '', VISIT: 'V1' },
        { STRESN: 'NA', VISIT: 'V2' },
        { STRESN: '3', VISIT: 'V2' }
      ],
      settings
    );
    expect(rows.map((row) => row.__srot_value)).toEqual([1.5, 3]);
    expect(removed).toBe(2);
  });

  it('quantile follows the R-7 / d3.quantile rule (#27)', () => {
    const values = [1, 2, 3, 4, 5];
    expect(quantile(values, 0.5)).toBe(3);
    expect(quantile(values, 0.25)).toBe(2);
    expect(quantile(values, 0.05)).toBeCloseTo(1.2, 10);
    expect(quantile(values, 0.95)).toBeCloseTo(4.8, 10);
  });

  it('SROT-REG-014/015: summarize returns the tooltip statistics for a sorted sample (#27)', () => {
    const stats = summarize([5, 1, 3, 2, 4]);
    expect(stats.n).toBe(5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.median).toBe(3);
    expect(stats.q25).toBe(2);
    expect(stats.q75).toBe(4);
    expect(stats.q5).toBeCloseTo(1.2, 10);
    expect(stats.q95).toBeCloseTo(4.8, 10);
    expect(stats.mean).toBe(3);
    expect(stats.deviation).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it('sd is the sample (n-1) standard deviation (#27)', () => {
    expect(sd([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10);
    expect(sd([7])).toBeNaN();
  });

  it('SROT-CFG-005/006: computeVisitOrder sorts by the numeric order column when present (#27)', () => {
    const rows = [
      { VISIT: 'Visit 10', VISITNUM: '10' },
      { VISIT: 'Visit 2', VISITNUM: '2' },
      { VISIT: 'Baseline', VISITNUM: '0' },
      { VISIT: 'Visit 2', VISITNUM: '2' }
    ];
    expect(computeVisitOrder(rows, settings)).toEqual(['Baseline', 'Visit 2', 'Visit 10']);
  });

  it('SROT-CFG-005: computeVisitOrder falls back to alphanumeric order without an order column (#27)', () => {
    const rows = [{ VISIT: 'Visit 10' }, { VISIT: 'Visit 2' }, { VISIT: 'Baseline' }];
    expect(computeVisitOrder(rows, { time_col: 'VISIT', time_order_col: 'MISSING' })).toEqual([
      'Baseline',
      'Visit 10',
      'Visit 2'
    ]);
  });

  it('summarizeVisitGroups nests statistics by visit then group (#27)', () => {
    const rows = [
      { VISIT: 'V1', ARM: 'A', __srot_value: 1 },
      { VISIT: 'V1', ARM: 'A', __srot_value: 3 },
      { VISIT: 'V1', ARM: 'B', __srot_value: 10 },
      { VISIT: 'V2', ARM: 'A', __srot_value: 5 }
    ];
    const nested = summarizeVisitGroups(rows, {
      timeCol: 'VISIT',
      valueCol: '__srot_value',
      groupCol: 'ARM'
    });
    expect(nested.V1.A.n).toBe(2);
    expect(nested.V1.A.median).toBe(2);
    expect(nested.V1.B.n).toBe(1);
    expect(nested.V2.A.median).toBe(5);
  });

  it('SROT-REG-010/012: flagOutliers marks values outside the 5th/95th percentiles only when enabled (#27)', () => {
    const statsByVisitGroup = { V1: { All: { q5: 1.2, q95: 4.8 } } };
    const rows = [
      { VISIT: 'V1', __srot_value: 0.5 },
      { VISIT: 'V1', __srot_value: 3 },
      { VISIT: 'V1', __srot_value: 5 }
    ];
    flagOutliers(rows, statsByVisitGroup, { time_col: 'VISIT', outliers: true });
    expect(rows.map((row) => row.__srot_outlier)).toEqual([true, false, true]);

    flagOutliers(rows, statsByVisitGroup, { time_col: 'VISIT', outliers: false });
    expect(rows.every((row) => row.__srot_outlier === false)).toBe(true);
  });

  it('SROT-REG-013: flagOutliers recomputes each row group when the grouping changes between renders (#27)', () => {
    // Same row objects flagged twice, as render does when the Group-by control
    // changes: first grouped by ARM, then pooled. The pooled pass must key its
    // stats lookups on the pooled group, not a group memoized on first render.
    const rows = [
      ...Array.from({ length: 18 }, (_, i) => ({ VISIT: 'V1', ARM: 'A', __srot_value: i + 1 })),
      { VISIT: 'V1', ARM: 'B', __srot_value: 95 },
      { VISIT: 'V1', ARM: 'B', __srot_value: 100 },
      { VISIT: 'V1', ARM: 'B', __srot_value: 105 }
    ];
    const columns = { timeCol: 'VISIT', valueCol: '__srot_value' };
    const flagSettings = { time_col: 'VISIT', outliers: true };

    const grouped = summarizeVisitGroups(rows, { ...columns, groupCol: 'ARM' });
    flagOutliers(rows, grouped, flagSettings, 'ARM');

    const pooled = summarizeVisitGroups(rows, { ...columns, groupCol: null });
    flagOutliers(rows, pooled, flagSettings, null);

    // Pooled n=21: q5 = 2, q95 = 100 — outliers are exactly 1 and 105.
    const flagged = rows.filter((row) => row.__srot_outlier).map((row) => row.__srot_value);
    expect(flagged).toEqual([1, 105]);
  });

  it('SROT-CFG-017/018: parseUnscheduledPattern reads the /.../flags string form (#27)', () => {
    const regex = parseUnscheduledPattern('/unscheduled|early termination/i');
    expect(regex.test('Unscheduled 1')).toBe(true);
    expect(regex.test('Early Termination')).toBe(true);
    expect(regex.test('Week 4')).toBe(false);
  });

  it('SROT-CFG-019: isUnscheduledVisit lets an explicit values list take precedence over the pattern (#27)', () => {
    const patternSettings = {
      unscheduled_visit_pattern: '/unscheduled/i',
      unscheduled_visit_values: null
    };
    expect(isUnscheduledVisit('Unscheduled', patternSettings)).toBe(true);
    expect(isUnscheduledVisit('Week 4', patternSettings)).toBe(false);

    const valuesSettings = {
      unscheduled_visit_pattern: '/unscheduled/i',
      unscheduled_visit_values: ['Early Term']
    };
    expect(isUnscheduledVisit('Early Term', valuesSettings)).toBe(true);
    expect(isUnscheduledVisit('Unscheduled', valuesSettings)).toBe(false);
  });

  it('SROT-REG-021: measureLabel appends the unit when present (#27)', () => {
    expect(measureLabel({ TEST: 'Albumin', STRESU: 'g/dL' }, settings)).toBe('Albumin (g/dL)');
    expect(measureLabel({ TEST: 'Albumin' }, settings)).toBe('Albumin');
  });

  it('unique keeps distinct, non-empty values in first-seen order (#27)', () => {
    expect(unique(['b', 'a', 'b', '', null, 'a'])).toEqual(['b', 'a']);
  });
});
