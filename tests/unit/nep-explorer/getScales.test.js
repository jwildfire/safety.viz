import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/nep-explorer/configure.js';
import {
  buildScales,
  deltaAxisLabel,
  deltaDomain,
  foldAxisLabel,
  foldDomain,
  formatNumber
} from '../../../src/nep-explorer/getScales.js';

// Axis domains, titles and formatting for the KDIGO scatter (#120).
// Requirement group: NEP-ZONE-005 (the axis floors that keep every cut-point on
// screen) and NEP-UNIT-003 (the native-unit y-axis title).

const SETTINGS = syncSettings({});
const CUTS = SETTINGS.stages.fold;

describe('nep-explorer scales', () => {
  it('NEP-ZONE-005: the fold axis always reaches past the last cut-point (#120)', () => {
    // The R chart's floor, worth keeping: it is what makes an all-Stage-0 study
    // readable as "nothing here" rather than "nothing plotted" (design §6.3).
    const quiet = foldDomain([1.0, 1.1, 1.2], CUTS);
    expect(quiet[0]).toBe(0);
    expect(quiet[1]).toBeGreaterThanOrEqual(3.5);
    // A cohort that runs past the floor is not clipped to it.
    const loud = foldDomain([1.0, 5.6], CUTS);
    expect(loud[1]).toBeGreaterThan(5.6);
  });

  it('NEP-ZONE-005: a custom ladder moves the floor with it (#120)', () => {
    expect(foldDomain([1.0], [2, 4, 8])[1]).toBeGreaterThanOrEqual(8);
  });

  it('NEP-ZONE-005: the delta axis keeps the trigger visible and extends below zero when the data goes there (#120)', () => {
    // D6: the source's scale_y_continuous(limits = c(0, max)) drops every
    // participant whose creatinine only fell — a fifth of the RhoInc cohort,
    // unannounced. The floor moves to the data instead.
    const quiet = deltaDomain([0.02, 0.05], 0.3);
    expect(quiet[0]).toBeLessThanOrEqual(0);
    expect(quiet[1]).toBeGreaterThanOrEqual(0.3);

    const negative = deltaDomain([-0.71, 0.1], 0.3);
    expect(negative[0]).toBeLessThan(-0.71);
    expect(negative[1]).toBeGreaterThanOrEqual(0.3);

    // An empty population still yields a usable domain around the trigger.
    const empty = deltaDomain([], 0.3);
    expect(empty[0]).toBeLessThanOrEqual(0);
    expect(empty[1]).toBeGreaterThanOrEqual(0.3);
  });

  it('NEP-ZONE-005: axis titles name the measure and, in the suppressed mode, the native unit (#120)', () => {
    expect(foldAxisLabel('Creatinine')).toBe('Maximum fold change in Creatinine (× baseline)');
    expect(deltaAxisLabel('Creatinine', 'mg/dL')).toBe(
      'Maximum absolute change in Creatinine (mg/dL)'
    );
    // NEP-UNIT-003: when the unit is unrecognized the axis says so in the
    // native unit rather than claiming mg/dL.
    expect(deltaAxisLabel('Creatinine', 'arb. units')).toBe(
      'Maximum absolute change in Creatinine (arb. units)'
    );
  });

  it('NEP-ZONE-005: the built scales carry the cut-point ticks (#120)', () => {
    const scales = buildScales({
      foldDomain: [0, 3.5],
      deltaDomain: [-0.2, 1.2],
      cuts: CUTS,
      deltaTrigger: 0.3,
      measure: 'Creatinine',
      unit: 'mg/dL'
    });
    expect(scales.x.min).toBe(0);
    expect(scales.x.max).toBe(3.5);
    expect(scales.x.afterBuildTicks).toBeTypeOf('function');
    const xTicks = { ticks: [{ value: 1 }] };
    scales.x.afterBuildTicks(xTicks);
    expect(xTicks.ticks.map((tick) => tick.value)).toEqual(expect.arrayContaining([1.5, 2, 3]));
    const yTicks = { ticks: [{ value: 0 }] };
    scales.y.afterBuildTicks(yTicks);
    expect(yTicks.ticks.map((tick) => tick.value)).toContain(0.3);
    // Ticks stay inside the domain: a cut-point off the top of a zoomed axis is
    // not silently re-added.
    const narrow = buildScales({
      foldDomain: [0, 2.2],
      deltaDomain: [0, 0.2],
      cuts: CUTS,
      deltaTrigger: 0.3,
      measure: 'Creatinine',
      unit: 'mg/dL'
    });
    const clipped = { ticks: [] };
    narrow.x.afterBuildTicks(clipped);
    expect(clipped.ticks.map((tick) => tick.value)).not.toContain(3);
  });

  it('NEP-ZONE-005: formatNumber trims trailing zeroes and guards non-finite values (#120)', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(2.0)).toBe('2');
    expect(formatNumber(1.23456, 2)).toBe('1.23');
    expect(formatNumber(NaN)).toBe('');
    expect(formatNumber(null)).toBe('');
  });
});
