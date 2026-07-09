import { describe, it, expect } from 'vitest';
import {
  formatPValue,
  approximateNormalityP,
  approximateGroupP,
  binDescription,
  selectionColors
} from '../../../src/histogram/getPlugins.js';

describe('histogram getPlugins', () => {
  it('SH-CHART-005: p-values format with bounded precision (#2)', () => {
    expect(formatPValue(NaN)).toBe('NA');
    expect(formatPValue(0.0005)).toBe('<0.001');
    expect(formatPValue(0.9995)).toBe('>0.999');
    expect(formatPValue(0.512)).toBe('0.512');
  });

  it('SH-CHART-005: the normality screen needs at least 3 values and stays within (0, 1) (#2)', () => {
    expect(approximateNormalityP([1, 2])).toBeNaN();
    const p = approximateNormalityP(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('SH-CHART-005: the group-comparison screen needs 2+ groups and separates distinct groups (#2)', () => {
    expect(approximateGroupP({ a: [1, 2, 3] })).toBeNaN();
    expect(approximateGroupP({ a: [1, 2, 3], b: [1, 2, 3] })).toBe(0.9999);
    expect(approximateGroupP({ a: [1, 2, 3], b: [101, 102, 103] })).toBe(0.0001);
  });

  it("SH-CHART-002: bin descriptions report the count and value range in the pilot's wording (#2)", () => {
    const bin = { records: [{}, {}, {}], lower: 1, upper: 5 };
    expect(binDescription(bin, 'Albumin (g/dL)', 0)).toBe(
      '3 records with Albumin (g/dL) values >= 1 and <= 5'
    );
  });

  it('SH-FUNC-011: selection colors keep the selected bar and fade the rest (#2)', () => {
    const base = 'rgba(37, 99, 235, .72)';
    const colors = selectionColors(base, 4, 1);
    expect(colors).toHaveLength(4);
    expect(colors[1]).toBe(base);
    expect(colors[0]).not.toBe(base);
    expect(colors[0]).toBe(colors[2]);
    expect(colors[0]).toBe(colors[3]);
  });
});
