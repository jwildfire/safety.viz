import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  axisSuffix,
  measureLabel,
  axisLabel,
  edishDomain,
  buildScales
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
