import { describe, it, expect } from 'vitest';
import {
  linearRegression,
  participantCountText,
  selectionBorders
} from '../../../src/delta-delta/getPlugins.js';

// Unit evidence for the delta-delta plugins' pure math (#25): the regression
// fit (SDD-REG-026), the participant-count text (SDD-FUNC-004), and the
// point-selection styling (SDD-REG-012).

describe('delta-delta getPlugins', () => {
  it('SDD-REG-026: linear regression recovers a perfect fit (#25)', () => {
    const result = linearRegression([
      [0, 0],
      [1, 1],
      [2, 2]
    ]);
    expect(result.slope).toBeCloseTo(1, 10);
    expect(result.intercept).toBeCloseTo(0, 10);
    expect(result.r2).toBeCloseTo(1, 10);
    expect(result.predict(3)).toBeCloseTo(3, 10);
  });

  it('SDD-REG-026: linear regression matches a hand-computed non-trivial fit (#25)', () => {
    const result = linearRegression([
      [1, 2],
      [2, 4],
      [3, 5]
    ]);
    // slope = Sxy/Sxx = 3/2 = 1.5; intercept = 11/3 − 1.5·2 = 0.6667; R² = 9/(2·4.6667) = 0.9643.
    expect(result.slope).toBeCloseTo(1.5, 4);
    expect(result.intercept).toBeCloseTo(0.66667, 4);
    expect(result.r2).toBeCloseTo(0.96429, 4);
    expect(result.string).toBe('y = 1.5x + 0.67');
  });

  it('SDD-REG-026: regression is null without a resolvable fit (#25)', () => {
    expect(linearRegression([[1, 1]])).toBeNull();
    expect(
      linearRegression([
        [1, 1],
        [1, 2]
      ])
    ).toBeNull();
  });

  it('SDD-FUNC-004: participant count text reports total and percentage to one decimal (#25)', () => {
    expect(participantCountText(3, 10)).toBe('3 of 10 participants shown (30.0%).');
    expect(participantCountText(1, 1)).toBe('1 of 1 participant shown (100.0%).');
    expect(participantCountText(0, 0)).toBe('0 of 0 participants shown (0.0%).');
  });

  it('SDD-REG-012: selection borders thicken and blacken the selected point only (#25)', () => {
    const { colors, widths } = selectionBorders(3, 1);
    expect(colors[1]).toBe('#111827');
    expect(widths[1]).toBe(3);
    expect(colors[0]).not.toBe('#111827');
    expect(widths[0]).toBe(0.5);
  });
});
