import { describe, it, expect } from 'vitest';
import {
  axisStep,
  buildXScale,
  defaultYDomain,
  normalizeYDomain,
  resolveYDomain
} from '../../../src/outlier-explorer/getScales.js';

describe('outlier-explorer getScales', () => {
  it('SOE-FUNC-005/SOE-REG-034: default y-domain pads the measure extent so points are not clipped (#24)', () => {
    const [low, high] = defaultYDomain([10, 20]);
    expect(low).toBeLessThan(10);
    expect(high).toBeGreaterThan(20);
  });

  it('SOE-FUNC-005: resolveYDomain honors user lower/upper and falls back to default (#24)', () => {
    expect(resolveYDomain([10, 20], 5, 25)).toEqual([5, 25]);
    const [low, high] = resolveYDomain([10, 20], null, null);
    expect(low).toBeLessThan(10);
    expect(high).toBeGreaterThan(20);
  });

  it('SOE-FUNC-005/SOE-REG-004: normalizeYDomain swaps inverted limits in place (#24)', () => {
    const state = { lower: 25, upper: 5 };
    normalizeYDomain(state);
    expect(state).toEqual({ lower: 5, upper: 25 });
  });

  it('SOE-REG-033: axisStep snaps ~1/15 of the range to a power of ten (#24)', () => {
    expect(axisStep(150)).toBe(10);
    expect(axisStep(1.5)).toBe(0.1);
    expect(axisStep(0)).toBe(1);
  });

  it('SOE-REG-028: buildXScale rotates ordinal visit ticks and keeps linear ticks upright (#24)', () => {
    const ordinal = buildXScale(
      { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
      ['Baseline', 'Week 2']
    );
    expect(ordinal.type).toBe('category');
    expect(ordinal.labels).toEqual(['Baseline', 'Week 2']);
    expect(ordinal.ticks.maxRotation).toBe(45);

    const linear = buildXScale({ key: 'day', col: 'DY', type: 'linear', title: 'Study day' }, []);
    expect(linear.type).toBe('linear');
    expect(linear.ticks.maxRotation).toBe(0);
  });

  it('SOE-XAX-006: the x-axis title names what is plotted, Visit or Study day (#371)', () => {
    const visit = {
      key: 'visit',
      col: 'VISITNUM',
      label_col: 'VISIT',
      type: 'ordinal',
      title: 'Visit'
    };
    const day = { key: 'day', col: 'DY', type: 'linear', title: 'Study day' };
    expect(buildXScale(visit, ['Baseline']).title).toEqual({ display: true, text: 'Visit' });
    expect(buildXScale(day, []).title).toEqual({ display: true, text: 'Study day' });
  });
});
