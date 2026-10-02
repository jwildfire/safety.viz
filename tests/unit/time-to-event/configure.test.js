import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, syncSettings } from '../../../src/time-to-event/configure.js';

// Settings defaults + merge for the time-to-event module (#128, design §4 as
// revised by the sv#131 review): the events + population mapping, the
// multiselect event-filter specs that compose the endpoint, the display
// orientation, and the CI toggle. TTE-CFG-*.

describe('DEFAULT_SETTINGS', () => {
  it('carries the population mapping: id, group, follow-up day and censor description columns (TTE-CFG-001, #128)', () => {
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.group_col).toBe('ARM');
    expect(DEFAULT_SETTINGS.fu_day_col).toBe('EOSDY');
    expect(DEFAULT_SETTINGS.censor_desc_col).toBe('EOSSTT');
  });

  it('carries the event mapping: onset day and event description columns (TTE-CFG-001, #128)', () => {
    expect(DEFAULT_SETTINGS.event_day_col).toBe('ASTDY');
    expect(DEFAULT_SETTINGS.event_desc_col).toBe('AEDECOD');
  });

  it('defaults the event filters to the ADAE descriptor columns (TTE-FILT-001, #128)', () => {
    expect(DEFAULT_SETTINGS.event_filters).toEqual(['AEBODSYS', 'AEDECOD', 'AESER', 'AESEV']);
  });

  it('defaults to cumulative-incidence orientation with the band on (D2, D3, #128)', () => {
    expect(DEFAULT_SETTINGS.direction).toBe('incidence');
    expect(DEFAULT_SETTINGS.ci).toBe(true);
    expect(DEFAULT_SETTINGS.time_unit).toBe('day');
  });
});

describe('syncSettings', () => {
  it('merges overrides onto the defaults (#128)', () => {
    const synced = syncSettings({ id_col: 'SUBJID', event_day_col: 'AESTDY' });
    expect(synced.id_col).toBe('SUBJID');
    expect(synced.event_day_col).toBe('AESTDY');
    expect(synced.fu_day_col).toBe('EOSDY');
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

  it('normalizes event filters to { value_col, label } and drops empty specs (TTE-FILT-001, #128)', () => {
    const synced = syncSettings({
      event_filters: ['AEBODSYS', { value_col: 'AESEV', label: 'Severity' }, {}]
    });
    expect(synced.event_filters).toEqual([
      { value_col: 'AEBODSYS', label: 'AEBODSYS' },
      { value_col: 'AESEV', label: 'Severity' }
    ]);
  });

  it('normalizes population filters to { value_col, label }, defaulting to none (#128)', () => {
    expect(syncSettings({}).filters).toEqual([]);
    expect(syncSettings({ filters: 'ARM' }).filters).toEqual([
      { value_col: 'ARM', label: 'ARM', start: null, all: true, multiple: false }
    ]);
  });

  it('keeps the endpoint label a non-empty string (TTE-FILT-003, #128)', () => {
    expect(syncSettings({}).endpoint_label).toBe('Time to first qualifying event');
    expect(syncSettings({ endpoint_label: 'Time to first rash' }).endpoint_label).toBe(
      'Time to first rash'
    );
    expect(syncSettings({ endpoint_label: '' }).endpoint_label).toBe(
      'Time to first qualifying event'
    );
  });
});
