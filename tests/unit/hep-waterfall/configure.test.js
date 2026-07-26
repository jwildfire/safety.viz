import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SUMMARY_MODES,
  ULN_DISPLAYS,
  syncSettings
} from '../../../src/hep-waterfall/configure.js';
import { resolveArmDesignation } from '../../../src/hep-core/arms.js';

// Settings normalization for the modified ALT waterfall (safety.viz#93,
// obot.roadmap#43). Requirement group HWF-CFG-*.

describe('hep-waterfall configure.syncSettings', () => {
  it('HWF-CFG-001: fills every default and normalizes field lists (#93)', () => {
    const synced = syncSettings({
      filters: ['SEX', { value_col: 'RACE', label: 'Race' }],
      details: 'USUBJID'
    });
    expect(synced.id_col).toBe('USUBJID');
    expect(synced.measure_col).toBe('TEST');
    expect(synced.normal_col_high).toBe('STNRHI');
    expect(synced.filters).toEqual([
      { value_col: 'SEX', label: 'SEX' },
      { value_col: 'RACE', label: 'Race' }
    ]);
    expect(synced.details).toEqual([{ value_col: 'USUBJID', label: 'USUBJID' }]);
    // Every default survives a partial override.
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      expect(synced, `setting ${key} was dropped`).toHaveProperty(key);
    });
  });

  it('HWF-CFG-002: measure, thresholds and the cohort toggle are coerced (#93)', () => {
    const synced = syncSettings({
      measure: 'AST',
      jaundice_uln: '2.5',
      baseline_tb_max: '1.5',
      apply_tb_cohort: 0
    });
    expect(synced.measure).toBe('AST');
    expect(synced.jaundice_uln).toBe(2.5);
    expect(synced.baseline_tb_max).toBe(1.5);
    expect(synced.apply_tb_cohort).toBe(false);
    // Unparseable numbers fall back to the documented defaults rather than NaN.
    const bad = syncSettings({ jaundice_uln: 'high', baseline_tb_max: '', measure: '' });
    expect(bad.jaundice_uln).toBe(DEFAULT_SETTINGS.jaundice_uln);
    expect(bad.baseline_tb_max).toBe(DEFAULT_SETTINGS.baseline_tb_max);
    expect(bad.measure).toBe(DEFAULT_SETTINGS.measure);
    expect(syncSettings({ apply_tb_cohort: undefined }).apply_tb_cohort).toBe(true);
  });

  it('HWF-CFG-003: placebo_arm and active_arms normalize to a resolved side map (#93)', () => {
    const synced = syncSettings({ placebo_arm: 'Placebo', active_arms: 'Drug' });
    expect(synced.active_arms).toEqual(['Drug']);
    const { sides } = resolveArmDesignation(['Placebo', 'Drug', 'Other'], synced);
    expect(sides.get('Placebo')).toBe('placebo');
    expect(sides.get('Drug')).toBe('active');
    expect(sides.get('Other')).toBeNull();
    // An empty list is "not designated": every non-placebo arm pools active.
    const pooled = syncSettings({ placebo_arm: '', active_arms: [] });
    expect(pooled.placebo_arm).toBeNull();
    expect(pooled.active_arms).toBeNull();
    const auto = resolveArmDesignation(['Placebo', 'Drug', 'Other'], pooled).sides;
    expect(auto.get('Placebo')).toBe('placebo');
    expect(auto.get('Other')).toBe('active');
  });

  it('HWF-CFG-004: uln_display accepts band, per_subject and none (#93)', () => {
    expect(ULN_DISPLAYS).toEqual(['band', 'per_subject', 'none']);
    ULN_DISPLAYS.forEach((value) =>
      expect(syncSettings({ uln_display: value }).uln_display).toBe(value)
    );
    expect(syncSettings({ uln_display: 'rainbow' }).uln_display).toBe('band');
    expect(syncSettings({}).uln_display).toBe('band');
  });

  it('HWF-CFG-005: summary accepts baseline_peak and peak (#93)', () => {
    expect(SUMMARY_MODES).toEqual(['baseline_peak', 'peak']);
    expect(syncSettings({ summary: 'peak' }).summary).toBe('peak');
    expect(syncSettings({ summary: 'both' }).summary).toBe('baseline_peak');
    expect(syncSettings({}).summary).toBe('baseline_peak');
  });
});
