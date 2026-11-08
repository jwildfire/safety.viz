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
      { value_col: 'SEX', label: 'Sex', start: null, all: true, multiple: false },
      { value_col: 'RACE', label: 'RACE', start: null, all: true, multiple: false }
    ]);
    expect(syncSettings({ filters: 'SEX' }).filters).toEqual([
      { value_col: 'SEX', label: 'SEX', start: null, all: true, multiple: false }
    ]);
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

  it('SH-LIST-005: with visit_col set and a participant filter, the default listing names the participant once, then the visit (#348)', () => {
    const settings = syncSettings({
      visit_col: 'VISIT',
      studyday_col: 'VISITNUM',
      filters: [
        { value_col: 'SEX', label: 'Sex' },
        { value_col: 'USUBJID', label: 'Participant ID' }
      ]
    });
    expect(settings.details).toEqual([
      { value_col: 'USUBJID', label: 'Participant ID' },
      { value_col: 'VISIT', label: 'Visit' },
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'STRESN', label: 'Result' },
      { value_col: 'STNRLO', label: 'Lower Limit of Normal' },
      { value_col: 'STNRHI', label: 'Upper Limit of Normal' },
      { value_col: 'STRESU', label: 'Unit' }
    ]);
  });

  it('SH-LIST-005: a filter on the visit adds no second Visit column, and the study day is never listed (#348)', () => {
    const settings = syncSettings({
      visit_col: 'VISIT',
      studyday_col: 'ADY',
      filters: [{ value_col: 'VISIT', label: 'Visit name' }]
    });
    const columns = settings.details.map((detail) => detail.value_col);
    expect(columns.filter((column) => column === 'VISIT')).toHaveLength(1);
    expect(columns).not.toContain('ADY');
    expect(settings.details[1]).toEqual({ value_col: 'VISIT', label: 'Visit' });
  });

  it('SH-LIST-005: without visit_col the default listing has no visit column (#348)', () => {
    const labels = syncSettings({
      filters: [{ value_col: 'USUBJID', label: 'Participant ID' }]
    }).details.map((detail) => detail.label);
    expect(labels).toEqual([
      'Participant ID',
      'Result',
      'Lower Limit of Normal',
      'Upper Limit of Normal',
      'Unit'
    ]);
  });

  it("SH-LIST-005: a caller's own details stay as given, visit_col or not (#348)", () => {
    const details = [
      { value_col: 'USUBJID', label: 'Subject' },
      { value_col: 'USUBJID', label: 'Subject again' },
      { value_col: 'STRESN', label: 'Value' }
    ];
    expect(syncSettings({ visit_col: 'VISIT', details }).details).toEqual(details);
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
