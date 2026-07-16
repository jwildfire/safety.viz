// Inline row-plot scale math for the ae-explorer module (#60): the shared
// percent axis for the rate dot plot and the symmetric axis for the
// difference plot, inset by the configured margins (AE-REG-046).

import { describe, expect, it } from 'vitest';
import {
  formatPercent,
  makeDiffScale,
  makePercentScale
} from '../../../src/ae-explorer/getScales.js';

describe('ae-explorer getScales', () => {
  it('AE-USER-012: the percent scale maps 0..max onto the margin-inset plot width (#60)', () => {
    const scale = makePercentScale(50, { width: 200, margin: { left: 40, right: 40 } });
    expect(scale.domain).toEqual([0, 50]);
    expect(scale.x(0)).toBe(40);
    expect(scale.x(50)).toBe(160);
    expect(scale.x(25)).toBe(100);
  });

  it('AE-REG-046: margins inset the rate axis exactly as configured (#60)', () => {
    const wide = makePercentScale(100, { width: 200, margin: { left: 10, right: 30 } });
    expect(wide.x(0)).toBe(10);
    expect(wide.x(100)).toBe(170);
  });

  it('AE-USER-013: the difference scale is symmetric around zero over the observed extent (#60)', () => {
    const scale = makeDiffScale([-10, 30], { width: 200, diff_margin: { left: 5, right: 5 } });
    expect(scale.domain).toEqual([-30, 30]);
    expect(scale.x(-30)).toBe(5);
    expect(scale.x(0)).toBe(100);
    expect(scale.x(30)).toBe(195);
  });

  it('a degenerate extent still yields a drawable scale (#60)', () => {
    const scale = makeDiffScale([0, 0], { width: 200, diff_margin: { left: 5, right: 5 } });
    expect(scale.domain[0]).toBeLessThan(scale.domain[1]);
    expect(Number.isFinite(scale.x(0))).toBe(true);
  });

  it('percentages format to one decimal (#60)', () => {
    expect(formatPercent(33.3)).toBe('33.3');
    expect(formatPercent(50)).toBe('50.0');
    expect(formatPercent(0)).toBe('0.0');
  });
});
