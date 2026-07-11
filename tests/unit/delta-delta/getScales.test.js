import { describe, it, expect } from 'vitest';
import {
  NA_COLOR,
  NEGATIVE_COLOR,
  POSITIVE_COLOR,
  ZERO_COLOR,
  axisLabel,
  deltaColor,
  deltaDomain,
  formatDelta,
  formatNumber
} from '../../../src/delta-delta/getScales.js';

// Unit evidence for the delta-delta axis/formatting helpers (#25): the change
// value formatting and coloring (SDD-REG-021/022) and the axis labels/domain
// (SDD-REG-003 label semantics, SDD-REG-015 padding).

describe('delta-delta getScales', () => {
  it('SDD-REG-021: change values format with an explicit sign and two decimals (#25)', () => {
    expect(formatDelta(4)).toBe('+4.00');
    expect(formatDelta(-5.2)).toBe('-5.20');
    expect(formatDelta(0)).toBe('+0.00');
  });

  it('SDD-REG-022: a missing change value renders as NA (#25)', () => {
    expect(formatDelta(NaN)).toBe('NA');
    expect(formatDelta(undefined)).toBe('NA');
  });

  it('SDD-REG-021/022: change values are colored by sign, gray for zero/NA (#25)', () => {
    expect(deltaColor(3)).toBe(POSITIVE_COLOR);
    expect(deltaColor(-3)).toBe(NEGATIVE_COLOR);
    expect(deltaColor(0)).toBe(ZERO_COLOR);
    expect(deltaColor(NaN)).toBe(NA_COLOR);
  });

  it('SDD-REG-003: axis labels describe the change in the selected measure (#25)', () => {
    expect(axisLabel('Albumin')).toBe('Change in Albumin');
  });

  it('SDD-REG-015: the delta domain includes 0 and pads beyond the data extent (#25)', () => {
    const [lo, hi] = deltaDomain([2, 6, 10]);
    expect(lo).toBeLessThan(0); // includes 0 then pads below
    expect(hi).toBeGreaterThan(10); // pads above the max
    const [nlo, nhi] = deltaDomain([-4, -2]);
    expect(nlo).toBeLessThan(-4);
    expect(nhi).toBeGreaterThan(0);
  });

  it('SDD-REG-015: an empty or flat domain falls back to a finite window (#25)', () => {
    expect(deltaDomain([])).toEqual([-1, 1]);
    const [lo, hi] = deltaDomain([5, 5]);
    expect(lo).toBeLessThan(hi);
  });

  it('formatNumber trims trailing zeros for compact labels (#25)', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(2)).toBe('2');
  });
});
