import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, syncSettings } from '../../../src/time-to-event/configure.js';

// Settings defaults + merge for the time-to-event module (#128, design §4): the
// ADTTE-shaped mapping, the display orientation, and the CI toggle. TTE-CFG-*.

describe('DEFAULT_SETTINGS', () => {
  it('carries the ADTTE mapping: id, group, endpoint, time and censor columns (TTE-CFG-001, #128)', () => {
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.group_col).toBe('ARM');
    expect(DEFAULT_SETTINGS.param_col).toBe('PARAM');
    expect(DEFAULT_SETTINGS.paramcd_col).toBe('PARAMCD');
    expect(DEFAULT_SETTINGS.time_col).toBe('AVAL');
    expect(DEFAULT_SETTINGS.censor_col).toBe('CNSR');
    expect(DEFAULT_SETTINGS.event_desc_col).toBe('EVNTDESC');
    expect(DEFAULT_SETTINGS.censor_desc_col).toBe('CNSDTDSC');
  });

  it('defaults to cumulative-incidence orientation with the band on (D2, D3, #128)', () => {
    expect(DEFAULT_SETTINGS.direction).toBe('incidence');
    expect(DEFAULT_SETTINGS.ci).toBe(true);
    expect(DEFAULT_SETTINGS.time_unit).toBe('day');
  });
});

describe('syncSettings', () => {
  it('merges overrides onto the defaults (#128)', () => {
    const synced = syncSettings({ id_col: 'SUBJID', time_col: 'TIME' });
    expect(synced.id_col).toBe('SUBJID');
    expect(synced.time_col).toBe('TIME');
    expect(synced.censor_col).toBe('CNSR');
  });

  it('validates direction: survival is kept, anything else falls back to incidence (TTE-CFG-002, #128)', () => {
    expect(syncSettings({ direction: 'survival' }).direction).toBe('survival');
    expect(syncSettings({ direction: 'incidence' }).direction).toBe('incidence');
    expect(syncSettings({ direction: 'upside-down' }).direction).toBe('incidence');
    expect(syncSettings({}).direction).toBe('incidence');
  });

  it('coerces the ci flag to a boolean, defaulting on (TTE-CFG-003, #128)', () => {
    expect(syncSettings({}).ci).toBe(true);
    expect(syncSettings({ ci: false }).ci).toBe(false);
    expect(syncSettings({ ci: 0 }).ci).toBe(false);
    expect(syncSettings({ ci: true }).ci).toBe(true);
  });

  it('normalizes filters to { value_col, label } and drops empty specs (#128)', () => {
    const synced = syncSettings({ filters: ['ARM', { value_col: 'SEX', label: 'Sex' }, {}] });
    expect(synced.filters).toEqual([
      { value_col: 'ARM', label: 'ARM' },
      { value_col: 'SEX', label: 'Sex' }
    ]);
  });

  it('passes param_value through untouched, defaulting to null (first endpoint in data order) (#128)', () => {
    expect(syncSettings({}).param_value).toBeNull();
    expect(syncSettings({ param_value: 'TTDE' }).param_value).toBe('TTDE');
  });
});
