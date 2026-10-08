import { describe, it, expect } from 'vitest';
import { binDescription, selectionColors } from '../../../src/histogram/getPlugins.js';

describe('histogram getPlugins', () => {
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
