// Settings defaults, merge, and column-plan behavior for the ae-explorer
// module (#60), against the original renderer's defaultSettings/setDefaults
// (RhoInc/aeexplorer v3.4.1).

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SUMMARIZE_OPTIONS,
  columnPlan,
  syncSettings
} from '../../../src/ae-explorer/configure.js';

describe('ae-explorer configure', () => {
  it('AE-CFG-001/AE-DATA-003: every setting has a default, so an empty settings object maps the ADaM ADAE columns (#60)', () => {
    const settings = syncSettings({});
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.major_col).toBe('AEBODSYS');
    expect(settings.minor_col).toBe('AEDECOD');
    expect(settings.group_col).toBe('ARM');
    expect(settings.summarize_by).toBe('participant');
    expect(settings.total_col).toBe(true);
    expect(settings.group_cols).toBe(true);
    expect(settings.diff_col).toBe(true);
    expect(settings.pref_terms).toBe(false);
    expect(settings.validation).toBe(false);
    expect(settings.max_prevalence).toBe(0);
    expect(settings.max_groups).toBe(6);
  });

  it('AE-CFG-002/AE-CFG-003: caller overrides win over any default, remapping the variables (#60)', () => {
    const settings = syncSettings({
      id_col: 'SUBJID',
      major_col: 'BODSYS',
      minor_col: 'PT',
      group_col: 'TRT',
      summarize_by: 'event'
    });
    expect(settings.id_col).toBe('SUBJID');
    expect(settings.major_col).toBe('BODSYS');
    expect(settings.minor_col).toBe('PT');
    expect(settings.group_col).toBe('TRT');
    expect(settings.summarize_by).toBe('event');
  });

  it('AE-USER-002/AE-USER-003/AE-USER-004/AE-USER-005: filters default to the four ADAE event filters (#60)', () => {
    const { filters } = syncSettings({});
    expect(filters.map((filter) => filter.value_col)).toEqual(['AESER', 'AESEV', 'AEREL', 'AEOUT']);
    expect(filters.map((filter) => filter.label)).toEqual([
      'Serious?',
      'Severity',
      'Relationship',
      'Outcome'
    ]);
    filters.forEach((filter) => expect(filter.type).toBe('event'));
    filters.forEach((filter) => expect(filter.start).toBeNull());
  });

  it('AE-USER-018/AE-REG-031: custom filter specs normalize with type and start preserved (#60)', () => {
    const { filters } = syncSettings({
      filters: [
        { value_col: 'AESER', label: 'Srs?', type: 'event', start: ['Y'] },
        { value_col: 'SEX', type: 'participant' },
        'RACE'
      ]
    });
    expect(filters).toEqual([
      { value_col: 'AESER', label: 'Srs?', type: 'event', start: ['Y'] },
      { value_col: 'SEX', label: 'SEX', type: 'participant', start: null },
      { value_col: 'RACE', label: 'RACE', type: 'event', start: null }
    ]);
  });

  it('AE-CFG-007/AE-CFG-008/AE-REG-046: defaults-style options and plot_settings merge key-by-key onto their defaults (#60)', () => {
    const settings = syncSettings({
      placeholder_flag: { values: [''] },
      plot_settings: { width: 300, margin: { left: 40, right: 40 } }
    });
    expect(settings.placeholder_flag.value_col).toBe('AEBODSYS');
    expect(settings.placeholder_flag.values).toEqual(['']);
    expect(settings.plot_settings.width).toBe(300);
    expect(settings.plot_settings.height).toBe(DEFAULT_SETTINGS.plot_settings.height);
    expect(settings.plot_settings.radius).toBe(DEFAULT_SETTINGS.plot_settings.radius);
    expect(settings.plot_settings.margin).toEqual({ left: 40, right: 40 });
    expect(settings.plot_settings.diff_margin).toEqual(DEFAULT_SETTINGS.plot_settings.diff_margin);
  });

  it('AE-DATA-001: the placeholder flag column follows a remapped major_col unless set explicitly (#60)', () => {
    expect(syncSettings({ major_col: 'BODSYS' }).placeholder_flag.value_col).toBe('BODSYS');
    expect(
      syncSettings({ major_col: 'BODSYS', placeholder_flag: { value_col: 'FLAG' } })
        .placeholder_flag.value_col
    ).toBe('FLAG');
  });

  it('AE-REG-033/AE-REG-035: summarize_by accepts participant and event and falls back on anything else (#60)', () => {
    expect(SUMMARIZE_OPTIONS).toEqual(['participant', 'event']);
    expect(syncSettings({ summarize_by: 'event' }).summarize_by).toBe('event');
    expect(syncSettings({ summarize_by: 'bogus' }).summarize_by).toBe('participant');
  });

  it('AE-USER-019: a single shown group suppresses the Total and Difference columns (#60)', () => {
    const plan = columnPlan(1, syncSettings({}));
    expect(plan).toEqual({ groupCols: true, totalCol: false, diffCol: false });
  });

  it('AE-REG-037: group_cols false leaves a Total-only table and suppresses the Difference column (#60)', () => {
    const plan = columnPlan(3, syncSettings({ group_cols: false }));
    expect(plan).toEqual({ groupCols: false, totalCol: true, diffCol: false });
  });

  it('AE-REG-037: hiding both the group and Total columns is a configuration error (#60)', () => {
    expect(() => columnPlan(3, syncSettings({ group_cols: false, total_col: false }))).toThrow(
      /group/i
    );
  });

  it('AE-CFG-005/AE-CFG-006: groups and colors pass through as arrays (#60)', () => {
    const settings = syncSettings({ groups: ['Placebo'], colors: ['#000'] });
    expect(settings.groups).toEqual(['Placebo']);
    expect(settings.colors).toEqual(['#000']);
  });
});
