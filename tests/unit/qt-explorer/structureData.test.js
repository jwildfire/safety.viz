import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, syncSettings } from '../../../src/qt-explorer/configure.js';
import {
  unique,
  mean,
  sd,
  quantile,
  median,
  cleanData,
  forMeasure,
  measuresPresent,
  armsPresent,
  orderVisits,
  applyFilters,
  centralTendencySeries,
  ichE14Metric,
  peakVisits,
  subjectPoints,
  subjectExtremes,
  classifyThresholds,
  placeboArmFor
} from '../../../src/qt-explorer/structureData.js';

// Deterministic QTcF cohort: 2 arms × 2 subjects × 3 visits, hand-computed
// so every statistic below is checked against a value derived by hand.
//   Placebo: P1, P2   Drug: D1, D2
//   Week 4 Drug changes [50,70] → mean 60, sd √200≈14.142, se 10
//   Week 4 Placebo changes [2,2] → mean 2, se 0
const SETTINGS = syncSettings({});
function q(arm, id, visit, visitn, value, baseline, change, ablfl) {
  return {
    USUBJID: id,
    ARM: arm,
    VISIT: visit,
    VISITNUM: visitn,
    TEST: 'QTcF',
    STRESN: value,
    BASE: baseline,
    CHG: change,
    ABLFL: ablfl,
    SEX: id.startsWith('P') ? 'F' : 'M'
  };
}
const DATA = [
  q('Placebo', 'P1', 'Baseline', 0, 400, 400, 0, 'Y'),
  q('Placebo', 'P1', 'Week 2', 2, 405, 400, 5, ''),
  q('Placebo', 'P1', 'Week 4', 4, 402, 400, 2, ''),
  q('Placebo', 'P2', 'Baseline', 0, 410, 410, 0, 'Y'),
  q('Placebo', 'P2', 'Week 2', 2, 418, 410, 8, ''),
  q('Placebo', 'P2', 'Week 4', 4, 412, 410, 2, ''),
  q('Drug', 'D1', 'Baseline', 0, 420, 420, 0, 'Y'),
  q('Drug', 'D1', 'Week 2', 2, 445, 420, 25, ''),
  q('Drug', 'D1', 'Week 4', 4, 470, 420, 50, ''),
  q('Drug', 'D2', 'Baseline', 0, 430, 430, 0, 'Y'),
  q('Drug', 'D2', 'Week 2', 2, 460, 430, 30, ''),
  q('Drug', 'D2', 'Week 4', 4, 500, 430, 70, '')
];

describe('qt-explorer structureData statistics helpers', () => {
  it('QT-STAT-001: unique keeps first-seen non-empty values', () => {
    expect(unique(['a', 'b', 'a', '', null, 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('QT-STAT-002: mean/sd/quantile/median match hand values', () => {
    expect(mean([50, 70])).toBe(60);
    expect(sd([50, 70])).toBeCloseTo(Math.sqrt(200), 6);
    expect(sd([5])).toBeNaN();
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(median([2, 2])).toBe(2);
    expect(mean([])).toBeNaN();
  });
});

describe('qt-explorer cleanData (QT-DATA-003/004)', () => {
  it('QT-DATA-003: drops missing / non-numeric values with a count', () => {
    const withBad = [
      ...DATA,
      q('Drug', 'D3', 'Week 2', 2, '', 400, '', ''),
      q('Drug', 'D3', 'Week 4', 4, 'NA', 400, '', '')
    ];
    const { rows, removed } = cleanData(withBad, SETTINGS);
    expect(removed).toBe(2);
    expect(rows).toHaveLength(DATA.length);
  });
  it('QT-DATA-004: derives change as value − baseline when the change column is blank', () => {
    const row = [q('Drug', 'DX', 'Week 2', 2, 448, 420, '', '')];
    const { rows } = cleanData(row, SETTINGS);
    expect(rows[0].__qt_change).toBe(28);
  });
  it('QT-DATA-004: keeps the source change when present', () => {
    const { rows } = cleanData([q('Drug', 'DX', 'Week 2', 2, 448, 420, 25, '')], SETTINGS);
    expect(rows[0].__qt_change).toBe(25);
  });
  it('QT-DATA-005: flags the ABLFL=Y baseline record as not post-baseline', () => {
    const { rows } = cleanData(DATA, SETTINGS);
    const baseline = rows.find((r) => r.USUBJID === 'P1' && r.VISIT === 'Baseline');
    const week2 = rows.find((r) => r.USUBJID === 'P1' && r.VISIT === 'Week 2');
    expect(baseline.__qt_postBaseline).toBe(false);
    expect(week2.__qt_postBaseline).toBe(true);
  });
  it('QT-DATA-005: when the flag column is present, a post-baseline change-0 row with a missing flag stays post-baseline', () => {
    // Sparse-ABLFL delivery: only the baseline row carries the flag key. A
    // post-baseline reading that returns exactly to baseline (change 0) must not
    // be misread as the baseline record via the change===0 fallback.
    const sparse = [
      {
        USUBJID: 'S1',
        ARM: 'Drug',
        VISIT: 'Baseline',
        VISITNUM: 0,
        TEST: 'QTcF',
        STRESN: 460,
        BASE: 460,
        CHG: 0,
        ABLFL: 'Y'
      },
      {
        USUBJID: 'S1',
        ARM: 'Drug',
        VISIT: 'Week 2',
        VISITNUM: 2,
        TEST: 'QTcF',
        STRESN: 460,
        BASE: 460,
        CHG: 0
      },
      {
        USUBJID: 'S1',
        ARM: 'Drug',
        VISIT: 'Week 4',
        VISITNUM: 4,
        TEST: 'QTcF',
        STRESN: 430,
        BASE: 460,
        CHG: -30
      }
    ];
    const { rows } = cleanData(sparse, SETTINGS);
    const week2 = rows.find((r) => r.VISIT === 'Week 2');
    expect(week2.__qt_postBaseline).toBe(true);
    // The subject's worst post-baseline absolute value is the change-0 Week-2 460,
    // so the > 450 ms exceedance is counted (it would be missed if Week 2 dropped).
    const result = classifyThresholds(rows, {
      idCol: 'USUBJID',
      arms: ['Drug'],
      absoluteThresholds: [450],
      changeThresholds: []
    });
    expect(result.rows[0].cells.Drug.count).toBe(1);
  });
  it('QT-DATA-005: with no baseline-flag column at all, a change-0 row is treated as the baseline', () => {
    const noFlag = [
      {
        USUBJID: 'S1',
        ARM: 'Drug',
        VISIT: 'Baseline',
        VISITNUM: 0,
        TEST: 'QTcF',
        STRESN: 460,
        BASE: 460,
        CHG: 0
      },
      {
        USUBJID: 'S1',
        ARM: 'Drug',
        VISIT: 'Week 4',
        VISITNUM: 4,
        TEST: 'QTcF',
        STRESN: 500,
        BASE: 460,
        CHG: 40
      }
    ];
    const { rows } = cleanData(noFlag, SETTINGS);
    expect(rows.find((r) => r.VISIT === 'Baseline').__qt_postBaseline).toBe(false);
    expect(rows.find((r) => r.VISIT === 'Week 4').__qt_postBaseline).toBe(true);
  });
});

describe('qt-explorer arms/visits/measures/filters', () => {
  const { rows } = cleanData(DATA, SETTINGS);
  it('QT-DATA-006: measuresPresent lists distinct measures', () => {
    expect(measuresPresent(rows)).toEqual(['QTcF']);
  });
  it('QT-CT-004: armsPresent puts the placebo arm first', () => {
    expect(armsPresent(rows, 'Placebo')).toEqual(['Placebo', 'Drug']);
  });
  it('QT-CT-001: orderVisits sorts by numeric visit', () => {
    expect(orderVisits(rows, SETTINGS)).toEqual(['Baseline', 'Week 2', 'Week 4']);
  });
  it('QT-CTRL-003: applyFilters constrains on active selections only', () => {
    expect(applyFilters(rows, { SEX: 'F' }).every((r) => r.SEX === 'F')).toBe(true);
    expect(applyFilters(rows, { SEX: '' })).toHaveLength(rows.length);
  });
  it('QT-CT-004: placeboArmFor auto-detects /placebo/i', () => {
    expect(placeboArmFor(rows, null)).toBe('Placebo');
  });
});

describe('qt-explorer centralTendencySeries (QT-CT-001/004/005)', () => {
  const { rows } = cleanData(DATA, SETTINGS);
  const measureRows = forMeasure(rows, 'QTcF');
  const arms = ['Placebo', 'Drug'];
  const visitOrder = ['Baseline', 'Week 2', 'Week 4'];

  it('QT-CT-002: Δ mean series carries per-arm means and a 90% CI', () => {
    const t = centralTendencySeries(measureRows, {
      statistic: 'mean',
      mode: 'delta',
      arms,
      visitOrder,
      placeboArm: 'Placebo',
      ciLevel: 0.9
    });
    const drug = t.series.find((s) => s.arm === 'Drug');
    const wk4 = drug.points.find((p) => p.visit === 'Week 4');
    expect(wk4.value).toBe(60);
    expect(wk4.n).toBe(2);
    // se = √200/√2 = 10; 90% z = 1.6449 → hi ≈ 76.45
    expect(wk4.hi).toBeCloseTo(60 + 1.6449 * 10, 2);
    expect(wk4.lo).toBeCloseTo(60 - 1.6449 * 10, 2);
  });

  it('QT-CT-004: ΔΔ drops placebo and subtracts placebo mean change', () => {
    const t = centralTendencySeries(measureRows, {
      statistic: 'mean',
      mode: 'deltadelta',
      arms,
      visitOrder,
      placeboArm: 'Placebo',
      ciLevel: 0.9
    });
    expect(t.series.map((s) => s.arm)).toEqual(['Drug']);
    const wk4 = t.series[0].points.find((p) => p.visit === 'Week 4');
    // 60 − 2 = 58; se_diff = √(10² + 0²) = 10
    expect(wk4.value).toBe(58);
    expect(wk4.hi).toBeCloseTo(58 + 1.6449 * 10, 2);
  });

  it('QT-CT-002: median mode carries no CI (lo/hi NaN)', () => {
    const t = centralTendencySeries(measureRows, {
      statistic: 'median',
      mode: 'delta',
      arms,
      visitOrder,
      placeboArm: 'Placebo'
    });
    const drug = t.series.find((s) => s.arm === 'Drug');
    const wk4 = drug.points.find((p) => p.visit === 'Week 4');
    expect(wk4.value).toBe(60);
    expect(wk4.hi).toBeNaN();
  });
});

describe('qt-explorer ICH-E14 metric + peak visit (QT-CT-005/006)', () => {
  const { rows } = cleanData(DATA, SETTINGS);
  const measureRows = forMeasure(rows, 'QTcF');
  const base = {
    arms: ['Placebo', 'Drug'],
    visitOrder: ['Baseline', 'Week 2', 'Week 4'],
    placeboArm: 'Placebo',
    ciLevel: 0.9
  };
  it('QT-CT-005: ICH-E14 metric is the largest ΔΔ upper CI bound, flagged vs 10 ms', () => {
    const t = centralTendencySeries(measureRows, {
      statistic: 'mean',
      mode: 'deltadelta',
      ...base
    });
    const metric = ichE14Metric(t, 10);
    expect(metric).toHaveLength(1);
    expect(metric[0].arm).toBe('Drug');
    expect(metric[0].visit).toBe('Week 4');
    expect(metric[0].maxUpper).toBeCloseTo(58 + 1.6449 * 10, 2);
    expect(metric[0].exceeds).toBe(true);
  });
  it('QT-CT-005: metric is empty outside mean + ΔΔ', () => {
    const t = centralTendencySeries(measureRows, { statistic: 'mean', mode: 'delta', ...base });
    expect(ichE14Metric(t, 10)).toEqual([]);
  });
  it('QT-CT-006: peakVisits returns each arm peak', () => {
    const t = centralTendencySeries(measureRows, { statistic: 'mean', mode: 'delta', ...base });
    const peaks = peakVisits(t);
    expect(peaks.get('Drug').visit).toBe('Week 4');
    expect(peaks.get('Drug').value).toBe(60);
  });
});

describe('qt-explorer subjectPoints (QT-OUT-001/002)', () => {
  const { rows } = cleanData(DATA, SETTINGS);
  const measureRows = forMeasure(rows, 'QTcF');
  it('QT-OUT-002: maximum post-baseline picks the max absolute value row', () => {
    const points = subjectPoints(measureRows, { timepoint: '__qt_max', idCol: 'USUBJID' });
    const d2 = points.find((p) => p.id === 'D2');
    expect(d2.value).toBe(500);
    expect(d2.change).toBe(70);
    expect(d2.baseline).toBe(430);
    expect(d2.visit).toBe('Week 4');
    // baseline record is excluded from max-post-baseline
    expect(points).toHaveLength(4);
  });
  it('QT-OUT-002: a specific visit picks that visit row', () => {
    const points = subjectPoints(measureRows, { timepoint: 'Week 2', idCol: 'USUBJID' });
    const d1 = points.find((p) => p.id === 'D1');
    expect(d1.value).toBe(445);
    expect(d1.change).toBe(25);
  });
  it('QT-OUT-002: matches a numeric-typed visit against a string timepoint', () => {
    // JSON-typed data can carry numeric visit values; the selector value is a
    // string, so the comparison must coerce both sides.
    const numericVisit = [
      {
        USUBJID: 'N1',
        ARM: 'Drug',
        VISIT: 0,
        VISITNUM: 0,
        TEST: 'QTcF',
        STRESN: 400,
        BASE: 400,
        CHG: 0,
        ABLFL: 'Y'
      },
      {
        USUBJID: 'N1',
        ARM: 'Drug',
        VISIT: 4,
        VISITNUM: 4,
        TEST: 'QTcF',
        STRESN: 470,
        BASE: 400,
        CHG: 70
      }
    ];
    const { rows } = cleanData(numericVisit, SETTINGS);
    const points = subjectPoints(forMeasure(rows, 'QTcF'), { timepoint: '4', idCol: 'USUBJID' });
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(470);
  });
});

describe('qt-explorer classifyThresholds (QT-CAT-002/003)', () => {
  const { rows } = cleanData(DATA, SETTINGS);
  const measureRows = forMeasure(rows, 'QTcF');
  const result = classifyThresholds(measureRows, {
    idCol: 'USUBJID',
    arms: ['Placebo', 'Drug'],
    absoluteThresholds: [450, 480, 500],
    changeThresholds: [30, 60]
  });
  it('QT-CAT-001: denominators are post-baseline subjects per arm', () => {
    expect(result.denominators).toEqual({ Placebo: 2, Drug: 2 });
    expect(result.allDenom).toBe(4);
  });
  it('QT-CAT-002: absolute >450 counts D1(470) and D2(500) in Drug', () => {
    const row = result.rows.find((r) => r.kind === 'absolute' && r.threshold === 450);
    expect(row.cells.Drug).toEqual({ count: 2, denom: 2, percent: 100 });
    expect(row.cells.Placebo.count).toBe(0);
    expect(row.cells.All).toEqual({ count: 2, denom: 4, percent: 50 });
  });
  it('QT-CAT-002: absolute >500 excludes the boundary value 500 (strict >)', () => {
    const row = result.rows.find((r) => r.kind === 'absolute' && r.threshold === 500);
    expect(row.cells.Drug.count).toBe(0);
  });
  it('QT-CAT-003: change >60 counts only D2(70) using max change independently', () => {
    const row = result.rows.find((r) => r.kind === 'change' && r.threshold === 60);
    expect(row.cells.Drug.count).toBe(1);
    expect(row.cells.Drug.percent).toBe(50);
  });
});

describe('qt-explorer subjectExtremes (QT-CAT-001)', () => {
  it('QT-CAT-001: tracks max value and max change independently', () => {
    const { rows } = cleanData(DATA, SETTINGS);
    const extremes = subjectExtremes(forMeasure(rows, 'QTcF'), 'USUBJID');
    expect(extremes.get('D2')).toEqual({ arm: 'Drug', maxValue: 500, maxChange: 70 });
    expect(extremes.get('P2')).toEqual({ arm: 'Placebo', maxValue: 418, maxChange: 8 });
  });
});

describe('qt-explorer configure defaults', () => {
  it('QT-DATA-001: default settings carry the ADEG column mapping', () => {
    expect(DEFAULT_SETTINGS.baseline_col).toBe('BASE');
    expect(DEFAULT_SETTINGS.change_col).toBe('CHG');
    expect(DEFAULT_SETTINGS.arm_col).toBe('ARM');
  });
});
