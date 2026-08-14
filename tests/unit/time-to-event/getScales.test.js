import { describe, it, expect } from 'vitest';
import {
  axisTicks,
  bandValues,
  buildScales,
  displayValue,
  formatPercent,
  xAxisTitle,
  yAxisTitle
} from '../../../src/time-to-event/getScales.js';

// Scales for the time-to-event module (#128, design §6): the tick generator the
// risk table aligns to, and the display-orientation transform (D2). TTE-CURV-*.

describe('axisTicks', () => {
  it('produces 1/2/5-decade steps from zero, covering the maximum time (#128)', () => {
    expect(axisTicks(213)).toEqual({ step: 50, max: 250, ticks: [0, 50, 100, 150, 200, 250] });
    expect(axisTicks(35)).toEqual({ step: 5, max: 35, ticks: [0, 5, 10, 15, 20, 25, 30, 35] });
    expect(axisTicks(7)).toEqual({ step: 1, max: 7, ticks: [0, 1, 2, 3, 4, 5, 6, 7] });
  });

  it('degrades to a single interval when there is no time extent (#128)', () => {
    expect(axisTicks(0).ticks).toEqual([0, 1]);
  });
});

describe('displayValue / bandValues', () => {
  it('incidence orientation shows 1 − S with the bounds swapped (D2, #128)', () => {
    expect(displayValue(0.75, 'incidence')).toBeCloseTo(0.25, 12);
    expect(displayValue(0.75, 'survival')).toBeCloseTo(0.75, 12);
    expect(bandValues({ lo: 0.6, hi: 0.9 }, 'incidence')).toEqual({
      lo: expect.closeTo(0.1, 12),
      hi: expect.closeTo(0.4, 12)
    });
    expect(bandValues({ lo: 0.6, hi: 0.9 }, 'survival')).toEqual({ lo: 0.6, hi: 0.9 });
  });

  it('undefined bounds stay undefined in both orientations (#128)', () => {
    expect(bandValues({ lo: null, hi: null }, 'incidence')).toEqual({ lo: null, hi: null });
  });
});

describe('axis titles', () => {
  it('the y-axis always names the estimator (TTE-CURV-004, #128)', () => {
    expect(yAxisTitle('incidence')).toBe('Cumulative incidence (1 − KM)');
    expect(yAxisTitle('survival')).toBe('Event-free probability (KM)');
  });

  it('the x-axis names the time unit (#128)', () => {
    expect(xAxisTitle('day')).toBe('Time since first dose (days)');
    expect(xAxisTitle('week')).toBe('Time since first dose (weeks)');
  });
});

describe('buildScales', () => {
  it('spans x over the generated ticks and y over [0, 1] with percent labels (#128)', () => {
    const scales = buildScales({ maxTime: 213, direction: 'incidence', timeUnit: 'day' });
    expect(scales.x.min).toBe(0);
    expect(scales.x.max).toBe(250);
    expect(scales.x.ticks.stepSize).toBe(50);
    expect(scales.y.min).toBe(0);
    expect(scales.y.max).toBe(1);
    expect(scales.y.title.text).toBe('Cumulative incidence (1 − KM)');
    expect(formatPercent(0.25)).toBe('25%');
    expect(scales.y.ticks.callback(0.25)).toBe('25%');
  });
});
