import { describe, it, expect } from 'vitest';
import {
  formatFixed,
  normalizeDomain,
  resolveYDomain,
  statPrecisions,
  yPrecision
} from '../../../src/results-over-time/getScales.js';

// Y-axis domain, limit normalization, and precision for the results-over-time
// module (#27): SROT-REG-015 (precision), SROT-REG-016/017/020 (limit
// controls, invert-on-cross, reset).

describe('results-over-time getScales', () => {
  it('SROT-REG-017: normalizeDomain swaps a crossed lower/upper pair in place (#27)', () => {
    const state = { lower: 25, upper: 5 };
    normalizeDomain(state);
    expect(state).toEqual({ lower: 5, upper: 25 });
  });

  it('SROT-REG-016/020: resolveYDomain uses the data extent unless a limit overrides it (#27)', () => {
    expect(resolveYDomain([3, 1, 9, 4], null, null)).toEqual([1, 9]);
    expect(resolveYDomain([3, 1, 9, 4], 0, 10)).toEqual([0, 10]);
    expect(resolveYDomain([3, 1, 9, 4], 2, null)).toEqual([2, 9]);
  });

  it('SROT-REG-015: yPrecision follows the original log10-range rule (#27)', () => {
    expect(yPrecision([0, 100]).precision).toBe(0);
    expect(yPrecision([1, 2]).precision).toBe(1);
    expect(yPrecision([0, 0.1]).precision).toBe(2);
  });

  it('SROT-REG-015: statPrecisions gives min/max the base, quantiles +1, and StDev +2 (#27)', () => {
    expect(statPrecisions(0)).toEqual({ p0: 0, p1: 1, p2: 2 });
    expect(statPrecisions(1)).toEqual({ p0: 1, p1: 2, p2: 3 });
  });

  it('formatFixed keeps trailing zeros and reports NA for non-finite input (#27)', () => {
    expect(formatFixed(3, 1)).toBe('3.0');
    expect(formatFixed(4.8, 1)).toBe('4.8');
    expect(formatFixed(Number.NaN, 2)).toBe('NA');
  });
});
