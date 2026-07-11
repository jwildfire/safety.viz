import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/results-over-time/checkInputs.js';

// Data-contract validation for the results-over-time module (#27):
// SROT-DATA-001/002 — long-format results with one row per participant per
// visit per measure; the measure, result, and visit columns are required.

const settings = { measure_col: 'TEST', value_col: 'STRESN', time_col: 'VISIT' };

describe('results-over-time checkInputs', () => {
  it('SROT-DATA-001: passes when the required measure, result, and visit columns are present (#27)', () => {
    expect(() =>
      checkInputs([{ TEST: 'Albumin', STRESN: '3.2', VISIT: 'Week 1' }], settings)
    ).not.toThrow();
  });

  it('SROT-DATA-001: throws naming every missing required column (#27)', () => {
    expect(() => checkInputs([{ TEST: 'Albumin' }], settings)).toThrow(/STRESN/);
    expect(() => checkInputs([{ TEST: 'Albumin' }], settings)).toThrow(/VISIT/);
  });

  it('SROT-DATA-002: an empty dataset reports all required columns missing (#27)', () => {
    expect(() => checkInputs([], settings)).toThrow(/Required variable/);
  });
});
