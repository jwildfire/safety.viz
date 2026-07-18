import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  syncSettings,
  zForCi,
  resolvePlaceboArm,
  TIMEPOINT_MAX,
  VIEWS
} from '../../../src/qt-explorer/configure.js';

describe('qt-explorer configure.syncSettings', () => {
  it('QT-CFG-001: fills defaults and normalizes field lists', () => {
    const s = syncSettings({ filters: ['SEX', { value_col: 'RACE', label: 'Race' }] });
    expect(s.id_col).toBe('USUBJID');
    expect(s.filters).toEqual([
      { value_col: 'SEX', label: 'SEX' },
      { value_col: 'RACE', label: 'Race' }
    ]);
  });
  it('QT-CFG-002: sorts and numifies threshold lists', () => {
    const s = syncSettings({
      absolute_thresholds: ['500', 450, '480'],
      change_thresholds: [60, 30]
    });
    expect(s.absolute_thresholds).toEqual([450, 480, 500]);
    expect(s.change_thresholds).toEqual([30, 60]);
  });
  it('QT-CFG-003: falls back start_measure to the first available measure', () => {
    const s = syncSettings({ measures: ['QTcB', 'Heart Rate'], start_measure: 'QTcF' });
    expect(s.start_measure).toBe('QTcB');
  });
  it('QT-CFG-004: rejects an out-of-range ci_level, keeping the default', () => {
    expect(syncSettings({ ci_level: 1.5 }).ci_level).toBe(DEFAULT_SETTINGS.ci_level);
    expect(syncSettings({ ci_level: 0.95 }).ci_level).toBe(0.95);
  });
  it('QT-CFG-005: VIEWS and TIMEPOINT_MAX are stable', () => {
    expect(VIEWS.map((v) => v.value)).toEqual(['central', 'outlier', 'categorical']);
    expect(TIMEPOINT_MAX).toBe('__qt_max');
  });
});

describe('qt-explorer configure.zForCi', () => {
  it('QT-CFG-006: returns the two-sided z for common levels', () => {
    expect(zForCi(0.9)).toBeCloseTo(1.6449, 3);
    expect(zForCi(0.95)).toBeCloseTo(1.96, 3);
    expect(zForCi(0.8)).toBeCloseTo(1.2816, 3);
  });
  it('QT-CFG-006: interpolates between table points and clamps the ends', () => {
    expect(zForCi(0.925)).toBeGreaterThan(1.6449);
    expect(zForCi(0.925)).toBeLessThan(1.96);
    expect(zForCi(0.5)).toBeCloseTo(1.2816, 3);
    expect(zForCi(0.999)).toBeCloseTo(2.5758, 3);
  });
});

describe('qt-explorer configure.resolvePlaceboArm', () => {
  it('QT-CFG-007: prefers the explicit setting when present', () => {
    expect(resolvePlaceboArm(['Placebo', 'Drug'], 'Drug')).toBe('Drug');
  });
  it('QT-CFG-007: auto-detects /placebo/i otherwise', () => {
    expect(resolvePlaceboArm(['Xanomeline', 'Placebo'], null)).toBe('Placebo');
    expect(resolvePlaceboArm(['Drug A', 'Drug B'], null)).toBeNull();
    expect(resolvePlaceboArm(['Drug', 'Placebo'], 'Missing')).toBe('Placebo');
  });
});
