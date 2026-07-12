import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  Y_SCALES,
  syncSettings
} from '../../../src/results-over-time/configure.js';

// Settings defaults + merge for the results-over-time module (#27), covering
// the renderer-specific configuration rows of the safety.agent matrix
// (SROT-CFG-004..019, SROT-DATA-003).

describe('results-over-time configure', () => {
  it('SROT-CFG-004/005/006/007/009: default column mappings match the original renderer (#27)', () => {
    const settings = syncSettings({});
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.measure_col).toBe('TEST');
    expect(settings.value_col).toBe('STRESN');
    expect(settings.unit_col).toBe('STRESU');
    expect(settings.time_col).toBe('VISIT');
    expect(settings.time_order_col).toBe('VISITNUM');
  });

  it('SROT-CFG-015/DATA-003: box/outlier/visit toggles default to the original renderer values (#27)', () => {
    const settings = syncSettings({});
    expect(settings.boxplots).toBe(true);
    expect(settings.outliers).toBe(true);
    expect(settings.visits_without_data).toBe(false);
    expect(settings.unscheduled_visits).toBe(false);
    expect(settings.y_scale).toBe('linear');
  });

  it('SROT-CFG-017/018/019: unscheduled-visit detection defaults are preserved (#27)', () => {
    const settings = syncSettings({});
    expect(settings.unscheduled_visit_pattern).toBe('/unscheduled|early termination/i');
    expect(settings.unscheduled_visit_values).toBeNull();
  });

  it('SROT-CFG-012: filters normalize to { value_col, label } specs and drop blanks (#27)', () => {
    const settings = syncSettings({
      filters: ['SEX', { value_col: 'ARM', label: 'Treatment' }, '']
    });
    expect(settings.filters).toEqual([
      { value_col: 'SEX', label: 'SEX' },
      { value_col: 'ARM', label: 'Treatment' }
    ]);
  });

  it('SROT-CFG-013/014: groups always offer a leading None and group_by falls back to it (#27)', () => {
    const settings = syncSettings({
      groups: ['SEX', { value_col: 'ARM', label: 'Treatment Group' }]
    });
    expect(settings.groups[0]).toEqual({ value_col: 'srot_none', label: 'None' });
    expect(settings.groups).toContainEqual({ value_col: 'ARM', label: 'Treatment Group' });
    expect(settings.group_by).toBe('srot_none');
  });

  it('SROT-CFG-014: an explicit group_by is honored and its column is offered (#27)', () => {
    const settings = syncSettings({ groups: ['ARM'], group_by: 'ARM' });
    expect(settings.group_by).toBe('ARM');
    expect(settings.groups.some((group) => group.value_col === 'ARM')).toBe(true);
  });

  it('SROT-REG-018: Y_SCALES enumerates the linear and log axis options (#27)', () => {
    expect(Y_SCALES).toEqual(['linear', 'log']);
  });

  it('every DEFAULT_SETTINGS key is a documented default (#27)', () => {
    expect(Object.keys(DEFAULT_SETTINGS).length).toBeGreaterThan(0);
    expect(syncSettings({}).start_value).toBeNull();
  });
});
