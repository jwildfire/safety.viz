import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/histogram/configure.js';
import {
  cleanData,
  measureLabel,
  measureHasNormalRange,
  applyFilters,
  unique,
  quantile,
  mean,
  sd,
  precision,
  calculateBins
} from '../../../src/histogram/structureData.js';

const settings = syncSettings({});
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('histogram structureData', () => {
  it('SH-DATA-002: missing and non-numeric results are removed with a reported count (#2)', () => {
    const { rows, removed } = cleanData(
      [
        { TEST: 'A', STRESN: '1' },
        { TEST: 'A', STRESN: '' },
        { TEST: 'A', STRESN: 'NR' },
        { TEST: 'A', STRESN: '2.5' }
      ],
      settings
    );
    expect(removed).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].__sh_value).toBe(1);
    expect(rows[0].__sh_index).toBe(0);
    expect(rows[1].__sh_value).toBe(2.5);
    expect(rows[1].__sh_index).toBe(3);
  });

  it('SH-DATA-001: measure labels combine the measure with its unit when present (#2)', () => {
    expect(measureLabel({ TEST: 'Albumin', STRESU: 'g/dL' }, settings)).toBe('Albumin (g/dL)');
    expect(measureLabel({ TEST: 'Pulse', STRESU: '' }, settings)).toBe('Pulse');
  });

  it('SH-FUNC-004C: measures without normal-range data are detected (#2)', () => {
    expect(measureHasNormalRange([{ STNRLO: '10', STNRHI: '20' }], settings)).toBe(true);
    expect(measureHasNormalRange([{ STNRLO: '', STNRHI: '' }], settings)).toBe(false);
    expect(measureHasNormalRange([{}], settings)).toBe(false);
    expect(
      measureHasNormalRange([{ STNRLO: '10', STNRHI: '20' }], {
        ...settings,
        normal_col_low: null,
        normal_col_high: null
      })
    ).toBe(false);
  });

  it('SH-CTRL-002: active filters subset rows by stringified equality (#2)', () => {
    const rows = [
      { SEX: 'F', SITEID: 101 },
      { SEX: 'M', SITEID: 101 },
      { SEX: 'F', SITEID: 102 }
    ];
    expect(applyFilters(rows, { SEX: 'F' })).toHaveLength(2);
    expect(applyFilters(rows, { SEX: 'F', SITEID: '102' })).toHaveLength(1);
    expect(applyFilters(rows, { SEX: null })).toHaveLength(3);
  });

  it('helpers: unique drops empty values; quantile, mean, sd, and precision match the pilot (#2)', () => {
    expect(unique(['a', 'b', 'a', '', null, undefined, 'c'])).toEqual(['a', 'b', 'c']);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(mean([1, 2, 3])).toBe(2);
    expect(sd([1, 2, 3])).toBe(1);
    expect(sd([5])).toBe(0);
    expect(precision([1, 2.5, 3.25])).toBe(2);
    expect(precision([1.123456])).toBe(4);
    expect(precision([1, 2])).toBe(0);
  });

  it("SH-CTRL-006: binning algorithms produce the pilot's bin quantities (#2)", () => {
    const values = range(100);
    const expected = {
      'Square-root choice': 10,
      "Sturges' formula": 8,
      'Rice Rule': 10,
      "Scott's normal reference rule": 5,
      "Freedman-Diaconis' choice": 5,
      "Shimazaki and Shinomoto's choice": 10
    };
    for (const [algorithm, quantity] of Object.entries(expected)) {
      const result = calculateBins(values, algorithm, null, null, null);
      expect(result.quantity, algorithm).toBe(quantity);
      expect(result.width, algorithm).toBeCloseTo(99 / quantity, 10);
      expect(result.bins).toHaveLength(quantity);
      const assigned = result.bins.reduce((sum, bin) => sum + bin.records.length, 0);
      expect(assigned, algorithm).toBe(values.length);
      expect(result.bins.at(-1).upper, algorithm).toBe(100);
    }
  });

  it('SH-CTRL-006: custom quantity and custom width drive the bin count (#2)', () => {
    expect(calculateBins(range(100), 'Custom', 4, null, null).quantity).toBe(4);
    expect(calculateBins(range(100), 'Custom', null, 10, null).quantity).toBe(10);
  });

  it('SH-CTRL-005: an explicit domain bounds the bins and clamps edge values (#2)', () => {
    const result = calculateBins([0, 5, 10], 'Custom', 2, null, [0, 10]);
    expect(result.domain).toEqual([0, 10]);
    expect(result.bins).toHaveLength(2);
    expect(result.bins[0].lower).toBe(0);
    expect(result.bins.at(-1).upper).toBe(10);
    const assigned = result.bins.reduce((sum, bin) => sum + bin.records.length, 0);
    expect(assigned).toBe(3);
    expect(result.bins.at(-1).records).toContain(2);
  });
});
