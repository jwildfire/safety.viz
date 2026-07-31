import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  axisSuffix,
  measureLabel,
  axisLabel,
  edishDomain,
  buildScales,
  logTicks,
  formatLogTick
} from '../../../src/hep-explorer/getScales.js';

// Full measure labels, as settings.measure_values maps the short keys.
const MEASURE_VALUES = {
  ALT: 'Aminotransferase, alanine (ALT)',
  TB: 'Total Bilirubin'
};

describe('hep-explorer getScales', () => {
  it('HEP-CHART-004: formatNumber trims trailing zeros at the requested precision and blanks non-finite values (port)', () => {
    expect(formatNumber(3.14159)).toBe('3.14');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(1.23456, 3)).toBe('1.235');
    expect(formatNumber(NaN)).toBe('');
    expect(formatNumber(Infinity)).toBe('');
  });

  it('HEP-DISPLAY-001/HEP-CHART-002: axis suffix and label reflect the active display mode and use the full measure label (port)', () => {
    expect(axisSuffix('relative_uln')).toBe(' [×ULN]');
    expect(axisSuffix('relative_baseline')).toBe(' [×Baseline]');
    // Without a measure_values map, axisLabel falls back to the short key.
    expect(axisLabel('ALT', 'relative_uln')).toBe('ALT [×ULN]');
    expect(axisLabel('TB', 'relative_baseline')).toBe('TB [×Baseline]');
    // measureLabel resolves the full label; an unmapped key falls back to itself.
    expect(measureLabel('TB', MEASURE_VALUES)).toBe('Total Bilirubin');
    expect(measureLabel('ALP', MEASURE_VALUES)).toBe('ALP');
    expect(measureLabel('TB')).toBe('TB');
    // With a map, axisLabel titles the axis with the full measure label.
    expect(axisLabel('TB', 'relative_uln', MEASURE_VALUES)).toBe('Total Bilirubin [×ULN]');
    expect(axisLabel('ALT', 'relative_baseline', MEASURE_VALUES)).toBe(
      'Aminotransferase, alanine (ALT) [×Baseline]'
    );
  });

  it('HEP-CHART-003: a linear eDISH domain starts at 0 and always keeps the cutpoint in view (port)', () => {
    // Values below the cut -> the cut sets the padded max.
    expect(edishDomain([1, 2], 3)).toEqual([0, 3 * 1.05]);
    // Values above the cut -> the max value sets it.
    expect(edishDomain([5], 3)).toEqual([0, 5 * 1.05]);
    // Non-finite values are ignored.
    expect(edishDomain([NaN, 2], 3)).toEqual([0, 3 * 1.05]);
  });

  it('HEP-CHART-003: degenerate linear domains fall back sanely (port)', () => {
    expect(edishDomain([], NaN)).toEqual([0, 1]);
    expect(edishDomain([0], NaN)).toEqual([0, 1]);
  });

  it('HEP-CHART-003/HEP-CTRL-006: a log domain runs from the smallest positive value to the max, padded, including the cut (port)', () => {
    // Zero is dropped from the log floor; min 2, max 8 with the cut 3 inside.
    expect(edishDomain([0, 2, 8], 3, 'log')).toEqual([2 / 1.5, 8 * 1.5]);
    // A cut below every value widens the floor to keep it visible.
    expect(edishDomain([2, 8], 0.5, 'log')).toEqual([0.5 / 1.5, 8 * 1.5]);
    // Empty log domain fallback.
    expect(edishDomain([], NaN, 'log')).toEqual([0.1, 1]);
  });

  it('HEP-CHART-002: buildScales titles both axes with the full measure labels in the active display units (port)', () => {
    const scales = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_uln', axisType: 'linear' },
      [0, 5],
      [0, 3],
      MEASURE_VALUES
    );
    expect(scales.x.type).toBe('linear');
    expect(scales.y.type).toBe('linear');
    expect(scales.x.min).toBe(0);
    expect(scales.x.max).toBe(5);
    expect(scales.y.max).toBe(3);
    expect(scales.x.title).toEqual({
      display: true,
      text: 'Aminotransferase, alanine (ALT) [×ULN]'
    });
    expect(scales.y.title).toEqual({ display: true, text: 'Total Bilirubin [×ULN]' });
  });

  it('HEP-CTRL-006: the log axis type switches both scales to logarithmic and drops a non-positive min (port)', () => {
    const scales = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_baseline', axisType: 'log' },
      [0, 5],
      [0.5, 3],
      MEASURE_VALUES
    );
    expect(scales.x.type).toBe('logarithmic');
    expect(scales.y.type).toBe('logarithmic');
    // Chart.js rejects a 0 lower bound on a log axis -> left undefined.
    expect(scales.x.min).toBeUndefined();
    expect(scales.y.min).toBe(0.5);
    expect(scales.x.title.text).toBe('Aminotransferase, alanine (ALT) [×Baseline]');
    expect(scales.y.title.text).toBe('Total Bilirubin [×Baseline]');
  });
});

// HEP-CTRL-017 (SafetyGraphics/hep-explorer#112): "each unit increase would be
// an X fold increase on the original scale". Position on a log axis is
// base-independent — log_b(x) differs from log10(x) only by a constant factor —
// so the base is not a rescaling, it is the choice of WHICH multiples the
// gridlines land on. Base 2 is the one clinicians ask for: a gridline every
// doubling, on data where a 2-fold rise is the unit of interest.
describe('log axis base (HEP-CTRL-017, #54)', () => {
  it('places a tick at every power of the base inside the domain', () => {
    expect(logTicks([0.2, 9], 2)).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    expect(logTicks([0.05, 500], 10)).toEqual([0.1, 1, 10, 100]);
  });

  it('includes a bound that IS a power of the base, floating-point error aside', () => {
    // Math.log(0.1) / Math.log(10) is -0.9999999999999998, so a naive ceil()
    // drops the 0.1 decade the domain actually starts on.
    expect(logTicks([0.1, 100], 10)).toEqual([0.1, 1, 10, 100]);
    expect(logTicks([0.25, 8], 2)).toEqual([0.25, 0.5, 1, 2, 4, 8]);
  });

  it('declines a domain too narrow to carry two gridlines, rather than drawing one', () => {
    expect(logTicks([1.2, 8], 10)).toEqual([]);
    expect(logTicks([1.2, 1.9], 2)).toEqual([]);
  });

  it('declines a domain a log axis cannot take at all', () => {
    expect(logTicks([0, 10], 10)).toEqual([]);
    expect(logTicks([-5, 10], 10)).toEqual([]);
    expect(logTicks([5, 1], 10)).toEqual([]);
    expect(logTicks([1, 100], 1)).toEqual([]);
  });

  it('formats a tick at the precision the value needs, not in exponent notation', () => {
    expect(formatLogTick(1024)).toBe('1024');
    expect(formatLogTick(0.125)).toBe('0.125');
    expect(formatLogTick(1)).toBe('1');
    expect(formatLogTick(Number.NaN)).toBe('');
  });

  it('drives both scales from state.logBase when the axis is logarithmic', () => {
    const scales = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_uln', axisType: 'log', logBase: 2 },
      [0.2, 9],
      [0.2, 5],
      MEASURE_VALUES
    );
    // afterBuildTicks REPLACES the tick array on the scale it is handed.
    const xScale = { ticks: [] };
    scales.x.afterBuildTicks(xScale);
    expect(xScale.ticks.map((tick) => tick.value)).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    const yScale = { ticks: [] };
    scales.y.afterBuildTicks(yScale);
    expect(yScale.ticks.map((tick) => tick.value)).toEqual([0.25, 0.5, 1, 2, 4]);
  });

  it('leaves Chart.js its own ticks when the base cannot span the domain', () => {
    const scales = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_uln', axisType: 'log', logBase: 10 },
      [0.4, 6],
      [0.4, 6],
      MEASURE_VALUES
    );
    expect(scales.x.afterBuildTicks).toBeUndefined();
    expect(scales.y.afterBuildTicks).toBeUndefined();
  });

  it('defaults to base 10 and touches nothing on a linear axis', () => {
    const log = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_uln', axisType: 'log' },
      [0.05, 500],
      [0.05, 500],
      MEASURE_VALUES
    );
    const scale = { ticks: [] };
    log.x.afterBuildTicks(scale);
    expect(scale.ticks.map((tick) => tick.value)).toEqual([0.1, 1, 10, 100]);

    const linear = buildScales(
      { measureX: 'ALT', measureY: 'TB', display: 'relative_uln', axisType: 'linear', logBase: 2 },
      [0, 9],
      [0, 5],
      MEASURE_VALUES
    );
    expect(linear.x.afterBuildTicks).toBeUndefined();
    expect(linear.x.type).toBe('linear');
  });
});
