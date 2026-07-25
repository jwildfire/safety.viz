import { describe, it, expect } from 'vitest';
import {
  IMPUTATION_METHODS,
  imputeBelowLloq,
  lloqFor
} from '../../../src/hep-explorer/imputation.js';

// Below-LLOQ imputation (#50), ported from the original renderer's
// callbacks/onInit/cleanData/imputeData.js + imputeData/imputeColumn.js. The
// rules below were read off that source rather than inferred, per the v1.0 QC
// discipline. Requirement group HEP-IMPUTE-*.

const SETTINGS = {
  measure_col: 'TEST',
  value_col: 'VALUE',
  measure_values: { ALT: 'Alanine', TB: 'Bilirubin' },
  imputation_methods: { ALT: 'data-driven', TB: 'data-driven' },
  imputation_values: null
};

const row = (test, value, uln = 40) => ({
  TEST: test,
  VALUE: value,
  __hep_value: Number(value),
  __hep_uln: uln,
  __hep_relative_uln: Number(value) / uln
});

describe('hep-explorer below-LLOQ imputation (HEP-IMPUTE-*)', () => {
  it("HEP-IMPUTE-001: the method enum is the original renderer's three (#50)", () => {
    expect(IMPUTATION_METHODS).toEqual(['data-driven', 'user-defined', 'drop']);
  });

  it('HEP-IMPUTE-001: data-driven takes the smallest POSITIVE value as the limit (#50)', () => {
    const rows = [row('Alanine', 0), row('Alanine', 12), row('Alanine', 30), row('Alanine', -4)];
    expect(lloqFor(rows, SETTINGS, 'ALT')).toBe(12);
    // A measure with nothing positive has no data-driven limit to take.
    expect(lloqFor([row('Alanine', 0)], SETTINGS, 'ALT')).toBeNaN();
    // The limit is per MEASURE, so another analyte's values never set it.
    expect(lloqFor([...rows, row('Bilirubin', 0.4)], SETTINGS, 'ALT')).toBe(12);
  });

  it('HEP-IMPUTE-001: user-defined takes the configured limit instead of the data (#50)', () => {
    const settings = {
      ...SETTINGS,
      imputation_methods: { ALT: 'user-defined' },
      imputation_values: { ALT: 5 }
    };
    const rows = [row('Alanine', 0), row('Alanine', 12)];
    expect(lloqFor(rows, settings, 'ALT')).toBe(5);
  });

  it('HEP-IMPUTE-002: values from zero up to the limit become half the limit (#50)', () => {
    const rows = [row('Alanine', 0), row('Alanine', 12), row('Alanine', 30)];
    const result = imputeBelowLloq(rows, SETTINGS);

    // llod = 12 (smallest positive), so the imputed value is 6.
    expect(rows[0].__hep_value).toBe(6);
    expect(rows[0].__hep_relative_uln).toBeCloseTo(6 / 40);
    expect(rows[0].__hep_imputed).toBe(true);
    // The original value is kept beside the imputed one, as the original does.
    expect(rows[0].__hep_valueOriginal).toBe(0);
    // At or above the limit, nothing is touched.
    expect(rows[1].__hep_value).toBe(12);
    expect(rows[1].__hep_imputed).toBeFalsy();
    expect(result.imputed).toBe(1);
    expect(result.rows).toHaveLength(3);
    expect(result.limits.ALT).toBe(12);
  });

  it('HEP-IMPUTE-002: negatives are left alone — the rule runs from zero up (#50)', () => {
    const rows = [row('Alanine', -4), row('Alanine', 0), row('Alanine', 20)];
    imputeBelowLloq(rows, SETTINGS);
    expect(rows[0].__hep_value).toBe(-4);
    expect(rows[0].__hep_imputed).toBeFalsy();
    expect(rows[1].__hep_value).toBe(10);
  });

  it('HEP-IMPUTE-003: the drop method removes non-positive records instead (#50)', () => {
    const settings = { ...SETTINGS, imputation_methods: { ALT: 'drop', TB: 'data-driven' } };
    const rows = [row('Alanine', 0), row('Alanine', 20), row('Bilirubin', 0), row('Bilirubin', 1)];
    const result = imputeBelowLloq(rows, settings);
    expect(result.rows.map((r) => r.__hep_value)).toEqual([20, 0.5, 1]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].__hep_dropReason).toMatch(/below the limit|not positive/i);
  });

  it('HEP-IMPUTE-003: an unmapped or absent method leaves the data untouched (#50)', () => {
    const settings = { ...SETTINGS, imputation_methods: null };
    const rows = [row('Alanine', 0), row('Alanine', 20)];
    const result = imputeBelowLloq(rows, settings);
    expect(rows[0].__hep_value).toBe(0);
    expect(result.imputed).toBe(0);
    expect(result.dropped).toHaveLength(0);
    // A measure with no positive values has no data-driven limit, so nothing
    // can be imputed against it.
    const noLimit = [row('Alanine', 0), row('Alanine', 0)];
    expect(imputeBelowLloq(noLimit, SETTINGS).imputed).toBe(0);
    expect(noLimit[0].__hep_value).toBe(0);
  });
});
