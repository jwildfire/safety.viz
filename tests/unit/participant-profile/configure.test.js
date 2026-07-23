import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MEASURE_COLORS,
  measureColorScale,
  syncSettings,
  templateProfileURL
} from '../../../src/participant-profile/configure.js';

describe('participant-profile DEFAULT_SETTINGS (PPRF-1/2/3/4)', () => {
  it('carries the house long-lab column defaults', () => {
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.measure_col).toBe('TEST');
    expect(DEFAULT_SETTINGS.value_col).toBe('STRESN');
    expect(DEFAULT_SETTINGS.unit_col).toBe('STRESU');
    expect(DEFAULT_SETTINGS.normal_col_high).toBe('STNRHI');
    expect(DEFAULT_SETTINGS.normal_col_low).toBe('STNRLO');
    expect(DEFAULT_SETTINGS.studyday_col).toBe('DY');
    expect(DEFAULT_SETTINGS.visit_col).toBe('VISIT');
    expect(DEFAULT_SETTINGS.visitn_col).toBe('VISITNUM');
    expect(DEFAULT_SETTINGS.baseline_col).toBeNull();
    expect(DEFAULT_SETTINGS.baseline_value).toBe('Y');
  });

  it('defaults the display to relative_uln with the two toggle options (PPRF-3)', () => {
    expect(DEFAULT_SETTINGS.display).toBe('relative_uln');
    expect(DEFAULT_SETTINGS.display_options).toEqual([
      { value: 'relative_uln', label: 'ULN adjusted' },
      { value: 'relative_baseline', label: 'Baseline adjusted' }
    ]);
  });

  it('defaults measureBounds to the 1st/99th percentiles (PPRF-4)', () => {
    expect(DEFAULT_SETTINGS.measureBounds).toEqual([0.01, 0.99]);
  });

  it('defaults the header/link/event settings off (PPRF-2/5/6)', () => {
    expect(DEFAULT_SETTINGS.participantProfileURL).toBeNull();
    expect(DEFAULT_SETTINGS.p_alt_col).toBeNull();
    expect(DEFAULT_SETTINGS.listen_to).toBeNull();
    expect(DEFAULT_SETTINGS.on_clear).toBeNull();
    expect(DEFAULT_SETTINGS.on_step).toBeNull();
    expect(DEFAULT_SETTINGS.details).toEqual([]);
  });
});

describe('participant-profile syncSettings (PPRF-1)', () => {
  it('deep-merges a partial cuts override, back-filling the untouched measures', () => {
    const synced = syncSettings({ cuts: { TB: { relative_uln: 5 } } });
    expect(synced.cuts.TB.relative_uln).toBe(5);
    expect(synced.cuts.TB.relative_baseline).toBe(4.8);
    expect(synced.cuts.ALP).toEqual({ relative_uln: 1, relative_baseline: 3.8 });
    expect(synced.cuts.defaults).toEqual({ relative_uln: 3, relative_baseline: 3.8 });
  });

  it('deep-merges a partial measure_values override, keeping the other keys', () => {
    const synced = syncSettings({ measure_values: { ALT: 'ALT (SI)' } });
    expect(synced.measure_values.ALT).toBe('ALT (SI)');
    expect(synced.measure_values.TB).toBe('Total Bilirubin');
    expect(synced.measure_values.AST).toBe('Aminotransferase, aspartate (AST)');
    expect(synced.measure_values.ALP).toBe('Alkaline phosphatase (ALP)');
  });

  it('normalizes details to {value_col, label} specs from strings and objects (PPRF-2)', () => {
    const synced = syncSettings({ details: ['SEX', { value_col: 'AGE', label: 'Age' }] });
    expect(synced.details).toEqual([
      { value_col: 'SEX', label: 'SEX' },
      { value_col: 'AGE', label: 'Age' }
    ]);
  });

  it('normalizes filters and groups to empty arrays so hep-core reducers can run', () => {
    const synced = syncSettings({});
    expect(synced.filters).toEqual([]);
    expect(synced.groups).toEqual([]);
    expect(syncSettings({ filters: 'SEX' }).filters).toEqual([{ value_col: 'SEX', label: 'SEX' }]);
  });

  it('coerces measureBounds back to a two-quantile array', () => {
    expect(syncSettings({ measureBounds: [0.05, 0.95] }).measureBounds).toEqual([0.05, 0.95]);
    expect(syncSettings({ measureBounds: null }).measureBounds).toEqual([0.01, 0.99]);
    expect(syncSettings({ measureBounds: [0.1] }).measureBounds).toEqual([0.01, 0.99]);
  });
});

describe('templateProfileURL (PPRF-2, closes #53)', () => {
  it('replaces every literal {id} token with the encoded id', () => {
    expect(templateProfileURL('https://x.test/{id}/profile?p={id}', 'P 1')).toBe(
      'https://x.test/P%201/profile?p=P%201'
    );
  });

  it('passes a token-less URL through unchanged (original static-URL back-compat)', () => {
    expect(templateProfileURL('https://x.test/profiles', 'P1')).toBe('https://x.test/profiles');
  });

  it('returns null for a missing URL', () => {
    expect(templateProfileURL(null, 'P1')).toBeNull();
    expect(templateProfileURL(undefined, 'P1')).toBeNull();
  });
});

describe('measure color palette (PPRF-3)', () => {
  it('assigns stable palette colors in key order, cycling when exhausted', () => {
    const scale = measureColorScale(['ALT', 'AST', 'TB']);
    expect(scale.get('ALT')).toBe(MEASURE_COLORS[0]);
    expect(scale.get('AST')).toBe(MEASURE_COLORS[1]);
    expect(scale.get('TB')).toBe(MEASURE_COLORS[2]);
    const many = measureColorScale(
      Array.from({ length: MEASURE_COLORS.length + 1 }, (_, i) => `M${i}`)
    );
    expect(many.get(`M${MEASURE_COLORS.length}`)).toBe(MEASURE_COLORS[0]);
  });
});
