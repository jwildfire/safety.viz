import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, ALGORITHMS, syncSettings } from '../../../src/histogram/configure.js';

// Settings defaults + merge extracted from the safety-histogram pilot (#2).
// Requirement keys reference the safety.agent matrix via docs/histogram-coverage.md.

describe('histogram configure', () => {
  it('SH-CFG-004..009: default settings map the standard measure, result, id, unit, and normal-range columns (#2)', () => {
    const settings = syncSettings({});
    expect(settings.measure_col).toBe('TEST');
    expect(settings.value_col).toBe('STRESN');
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.unit_col).toBe('STRESU');
    expect(settings.normal_col_low).toBe('STNRLO');
    expect(settings.normal_col_high).toBe('STNRHI');
    expect(settings.bin_algorithm).toBe("Scott's normal reference rule");
    expect(settings.page_size).toBe(10);
    expect(DEFAULT_SETTINGS.group_by).toBe('sh_none');
    expect(ALGORITHMS).toContain('Custom');
  });

  it('SH-CFG-010: filter specs normalize strings and objects to value_col/label pairs (#2)', () => {
    const settings = syncSettings({
      filters: [{ value_col: 'SEX', label: 'Sex' }, { value_col: 'RACE' }]
    });
    expect(settings.filters).toEqual([
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'RACE', label: 'RACE' }
    ]);
    expect(syncSettings({ filters: 'SEX' }).filters).toEqual([{ value_col: 'SEX', label: 'SEX' }]);
  });

  it('SH-CFG-011: details default to id, filters, result, normal limits, and unit when unset (#2)', () => {
    const settings = syncSettings({ filters: [{ value_col: 'SEX', label: 'Sex' }] });
    expect(settings.details.map((detail) => detail.label)).toEqual([
      'Participant ID',
      'Sex',
      'Result',
      'Lower Limit of Normal',
      'Upper Limit of Normal',
      'Unit'
    ]);
  });

  it('SH-CHART-004: the group list always offers None and adopts an unknown group_by column (#2)', () => {
    const settings = syncSettings({ group_by: 'ARM' });
    expect(settings.groups[0]).toEqual({ value_col: 'sh_none', label: 'None' });
    expect(settings.groups.some((group) => group.value_col === 'ARM')).toBe(true);
    expect(settings.group_by).toBe('ARM');
    expect(syncSettings({ group_by: '' }).group_by).toBe('sh_none');
  });

  it('SH-CFG-013/SH-CFG-014: normal-range control and initial display flags are configurable (#2)', () => {
    expect(syncSettings({}).normal_range).toBe(true);
    expect(syncSettings({}).display_normal_range).toBe(false);
    expect(syncSettings({ display_normal_range: true }).display_normal_range).toBe(true);
    expect(syncSettings({ displayNormalRange: true }).display_normal_range).toBe(true);
  });
});
