import { describe, it, expect } from 'vitest';
import { calculatePalt } from '../../../src/hep-core/palt.js';
import { cleanData, deriveBaseline } from '../../../src/hep-core/rows.js';
import { syncSettings } from '../../../src/hep-explorer/configure.js';

// The P_ALT hepatocyte-loss estimate (#49): ALT AUC × peak ALT^0.18 / 10^5,
// from Chung et al., "A Rapid Method to Estimate Hepatocyte Loss Due to
// Drug-Induced Liver Injury" (PMID 30303523). Ported from the original
// renderer's src/callbacks/onPreprocess/flattenData/calculatePalt.js, including
// the trapezoidal AUC over HOURS (study day × 24) — a detail that changes the
// answer by a factor of 24 if it is dropped. Requirement group HEP-PALT-*.

const settings = syncSettings({
  id_col: 'ID',
  measure_col: 'TEST',
  value_col: 'VALUE',
  normal_col_high: 'ULN',
  studyday_col: 'DAY',
  measure_values: { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' }
});

const rowsFor = (raw) => deriveBaseline(cleanData(raw, settings).rows, settings);

// Two ALT draws, ten days apart: 40 U/L then 400 U/L.
const SIMPLE = [
  { ID: 'P1', TEST: 'ALT', VALUE: 40, ULN: 40, DAY: 0 },
  { ID: 'P1', TEST: 'ALT', VALUE: 400, ULN: 40, DAY: 10 }
];

describe('calculatePalt (HEP-PALT-001)', () => {
  it('reproduces the original’s ALT AUC × peak^0.18 / 1e5 on hand-computable data', () => {
    // Trapezoid over one segment: mean(40, 400) = 220 U/L across 240 hours
    // = 52 800 U·h/L. P_ALT = 52 800 × 400^0.18 / 1e5.
    const expectedAuc = 52800;
    const expected = (expectedAuc * Math.pow(400, 0.18)) / 1e5;
    const result = calculatePalt(rowsFor(SIMPLE), settings);
    expect(result.components.auc).toBeCloseTo(expectedAuc, 6);
    expect(result.components.peak).toBe(400);
    expect(result.value).toBeCloseTo(expected, 6);
    expect(result.text_value).toBe(expected.toFixed(2));
  });

  it('sums every trapezoid, in study-day order rather than input order', () => {
    const shuffled = [
      { ID: 'P1', TEST: 'ALT', VALUE: 400, ULN: 40, DAY: 10 },
      { ID: 'P1', TEST: 'ALT', VALUE: 40, ULN: 40, DAY: 0 },
      { ID: 'P1', TEST: 'ALT', VALUE: 200, ULN: 40, DAY: 20 }
    ];
    // (40+400)/2 × 240 + (400+200)/2 × 240 = 52 800 + 72 000 = 124 800.
    expect(calculatePalt(rowsFor(shuffled), settings).components.auc).toBeCloseTo(124800, 6);
  });

  it('uses the raw result, not the ×ULN standardization', () => {
    // Same trajectory with a different ULN must give the same P_ALT: the
    // estimate is defined on IU/L, not on multiples of normal.
    const otherUln = SIMPLE.map((row) => ({ ...row, ULN: 10 }));
    expect(calculatePalt(rowsFor(otherUln), settings).value).toBeCloseTo(
      calculatePalt(rowsFor(SIMPLE), settings).value,
      6
    );
  });

  it('reads only the ALT rows', () => {
    const withOthers = [
      ...SIMPLE,
      { ID: 'P1', TEST: 'TB', VALUE: 9000, ULN: 1.2, DAY: 5 },
      { ID: 'P1', TEST: 'AST', VALUE: 9000, ULN: 40, DAY: 5 }
    ];
    expect(calculatePalt(rowsFor(withOthers), settings).value).toBeCloseTo(
      calculatePalt(rowsFor(SIMPLE), settings).value,
      6
    );
  });
});

describe('calculatePalt — when it declines to answer (HEP-PALT-002)', () => {
  it('returns null for a single ALT result (no interval to integrate)', () => {
    expect(calculatePalt(rowsFor([SIMPLE[0]]), settings)).toBeNull();
  });

  it('returns null when no ALT result is present at all', () => {
    const noAlt = [{ ID: 'P1', TEST: 'TB', VALUE: 2, ULN: 1.2, DAY: 0 }];
    expect(calculatePalt(rowsFor(noAlt), settings)).toBeNull();
  });

  it('returns null when the ALT results carry no study days — an AUC over an unknown time axis is not an AUC', () => {
    const undated = SIMPLE.map((row) => {
      const copy = { ...row };
      delete copy.DAY;
      return copy;
    });
    expect(calculatePalt(rowsFor(undated), settings)).toBeNull();
  });

  it('returns null when every ALT result falls on the same study day', () => {
    const sameDay = SIMPLE.map((row) => ({ ...row, DAY: 3 }));
    expect(calculatePalt(rowsFor(sameDay), settings)).toBeNull();
  });
});

describe('calculatePalt — the shown note (HEP-PALT-003)', () => {
  it('shows the arithmetic that produced the number and cites the source paper', () => {
    const result = calculatePalt(rowsFor(SIMPLE), settings);
    expect(result.note).toContain('52800.00');
    expect(result.note).toContain('400.00');
    expect(result.note).toContain(result.text_value);
    expect(result.note).toContain('30303523');
  });

  it('names the unit assumption the estimate rests on', () => {
    expect(calculatePalt(rowsFor(SIMPLE), settings).note).toMatch(/IU\/L/);
  });
});
