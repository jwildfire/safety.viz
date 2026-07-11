import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, arrayify, fieldSpec, syncSettings } from '../../../src/delta-delta/configure.js';

// Unit evidence for the delta-delta settings layer (#25): the configuration
// defaults and their normalization, keyed to the safety.agent matrix
// (SDD-CFG-004..015).

describe('delta-delta configure', () => {
  it('SDD-CFG-004/005/006/007/008: default column mappings match the data contract (#25)', () => {
    expect(DEFAULT_SETTINGS.measure_col).toBe('TEST');
    expect(DEFAULT_SETTINGS.value_col).toBe('STRESN');
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.visit_col).toBe('VISIT');
    expect(DEFAULT_SETTINGS.visitn_col).toBe('VISITNUM');
  });

  it('SDD-CFG-009/010/011/012/013: measure and visit selections default to data-driven (#25)', () => {
    expect(DEFAULT_SETTINGS.measure_x).toBeNull();
    expect(DEFAULT_SETTINGS.measure_y).toBeNull();
    expect(DEFAULT_SETTINGS.baseline_visits).toEqual([]);
    expect(DEFAULT_SETTINGS.comparison_visits).toEqual([]);
    expect(DEFAULT_SETTINGS.add_regression_line).toBe(true);
  });

  it('SDD-CFG-014: filters accept strings and objects, normalized to { value_col, label } (#25)', () => {
    const synced = syncSettings({ filters: ['SITE', { value_col: 'ARM', label: 'Treatment Group' }] });
    expect(synced.filters).toEqual([
      { value_col: 'SITE', label: 'SITE' },
      { value_col: 'ARM', label: 'Treatment Group' }
    ]);
  });

  it('SDD-CFG-015: details default to Participant ID plus the filter columns (#25)', () => {
    const synced = syncSettings({ filters: [{ value_col: 'SITE', label: 'Site' }] });
    expect(synced.details).toEqual([
      { value_col: 'USUBJID', label: 'Participant ID' },
      { value_col: 'SITE', label: 'Site' }
    ]);
  });

  it('SDD-CFG-015: supplied details extend the defaults without duplicating (#25)', () => {
    const synced = syncSettings({
      filters: ['SITE'],
      details: [{ value_col: 'SITE', label: 'Site' }, { value_col: 'AGE', label: 'Age' }]
    });
    expect(synced.details.map((detail) => detail.value_col)).toEqual(['USUBJID', 'SITE', 'AGE']);
  });

  it('SDD-CFG-012/013: baseline/comparison visit scalars are coerced to arrays (#25)', () => {
    const synced = syncSettings({ baseline_visits: 'Screening', comparison_visits: ['Week 4'] });
    expect(synced.baseline_visits).toEqual(['Screening']);
    expect(synced.comparison_visits).toEqual(['Week 4']);
  });

  it('SDD-CFG-014: arrayify and fieldSpec normalize helpers behave (#25)', () => {
    expect(arrayify(null)).toEqual([]);
    expect(arrayify('a')).toEqual(['a']);
    expect(arrayify(['a', 'b'])).toEqual(['a', 'b']);
    expect(fieldSpec('COL')).toEqual({ value_col: 'COL', label: 'COL' });
    expect(fieldSpec({ value_col: 'COL' })).toEqual({ value_col: 'COL', label: 'COL' });
  });
});
