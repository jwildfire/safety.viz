import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  normalizeDomain,
  resolveDomain,
  buildTickLabels,
  buildScales
} from '../../../src/histogram/getScales.js';

describe('histogram getScales', () => {
  it('formatNumber trims to significant digits and blanks non-finite values (#2)', () => {
    expect(formatNumber(3.14159, 2)).toBe('3.14');
    expect(formatNumber(2.5, 2)).toBe('2.5');
    expect(formatNumber(10, 0)).toBe('10');
    expect(formatNumber(NaN)).toBe('');
  });

  it('SH-CTRL-005: normalizeDomain swaps inverted lower/upper limits (#2)', () => {
    const inverted = { lower: 25, upper: 5 };
    normalizeDomain(inverted);
    expect(inverted).toEqual({ lower: 5, upper: 25 });

    const partial = { lower: null, upper: 5 };
    normalizeDomain(partial);
    expect(partial).toEqual({ lower: null, upper: 5 });
  });

  it('SH-CTRL-005/SH-FUNC-005A/SH-FUNC-005B: resolveDomain applies user limits over the data extent (#2)', () => {
    expect(resolveDomain([1, 5, 30], null, null)).toEqual([1, 30]);
    expect(resolveDomain([1, 5, 30], 5, null)).toEqual([5, 30]);
    expect(resolveDomain([1, 5, 30], null, 25)).toEqual([1, 25]);
  });

  it('SH-CTRL-007: tick labels switch between bin centers and bin boundaries (#2)', () => {
    const bins = [
      { lower: 1, upper: 5 },
      { lower: 5, upper: 9 }
    ];
    expect(buildTickLabels(bins, 0, false)).toEqual(['3', '7']);
    expect(buildTickLabels(bins, 0, true)).toEqual(['1–5', '5–9']);
  });

  it('buildScales keeps the count axis integer-based at zero (#2)', () => {
    const scales = buildScales();
    expect(scales.y.beginAtZero).toBe(true);
    expect(scales.y.ticks.precision).toBe(0);
    expect(scales.x.ticks.maxRotation).toBe(45);
  });
});
