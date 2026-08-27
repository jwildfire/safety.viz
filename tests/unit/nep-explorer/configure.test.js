import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  KDIGO_STAGES,
  UMOL_PER_MGDL,
  normalizeUnit,
  syncSettings
} from '../../../src/nep-explorer/configure.js';

// Settings + KDIGO-ladder configuration for the nep-explorer module (#120).
// Requirement groups: NEP-CFG-*, and the string-normalization half of
// NEP-UNIT-*.

describe('nep-explorer configure', () => {
  it('NEP-CFG-001: DEFAULT_SETTINGS carries the BDS lab mapping the KDIGO scatter needs (#120)', () => {
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.measure_col).toBe('TEST');
    expect(DEFAULT_SETTINGS.value_col).toBe('STRESN');
    expect(DEFAULT_SETTINGS.unit_col).toBe('STRESU');
    expect(DEFAULT_SETTINGS.visit_col).toBe('VISIT');
    expect(DEFAULT_SETTINGS.visitn_col).toBe('VISITNUM');
    // Phase 1 needs only id, measure, value, unit and a way to find baseline —
    // deliberately small, so the scatter ports to a study with nothing but a
    // chemistry panel (design §5.1).
    expect(DEFAULT_SETTINGS.measure_values).toEqual({ CREAT: 'Creatinine' });
  });

  it('NEP-CFG-002: baseline identification is an explicit setting pair, unset by default (#120)', () => {
    // D7: the R source takes value[1L] after arrange(desc(baseline_flag)) — an
    // arbitrary record when a participant has two flagged rows. nep-explorer
    // inherits hep-explorer's vocabulary instead, and defaults to no flag
    // because neither demo dataset ships one.
    expect(DEFAULT_SETTINGS.baseline_col).toBe(null);
    expect(DEFAULT_SETTINGS.baseline_value).toBe('Y');
  });

  it('NEP-CFG-003: the stage cut-points default to the KDIGO ladder and are configurable (#120)', () => {
    // D4: the source ships three different absolute ladders across two files
    // and a spec (1.5/2.5 in the code, 0.7/1.2 in outline.md), none of them
    // KDIGO. Rather than inherit that argument the module takes the criteria as
    // its default and exposes the numbers, exactly as hep-explorer exposes cuts.
    expect(DEFAULT_SETTINGS.stages).toEqual(KDIGO_STAGES);
    expect(KDIGO_STAGES.fold).toEqual([1.5, 2, 3]);
    expect(KDIGO_STAGES.delta).toBe(0.3);
    expect(KDIGO_STAGES.absolute).toBe(4);

    const custom = syncSettings({ stages: { fold: [2, 2.5, 4], delta: 0.5 } });
    expect(custom.stages.fold).toEqual([2, 2.5, 4]);
    expect(custom.stages.delta).toBe(0.5);
    // Unspecified members fall back to the KDIGO value rather than undefined.
    expect(custom.stages.absolute).toBe(4);
  });

  it('NEP-CFG-004: fold cut-points are sorted and numified, and a bad ladder falls back (#120)', () => {
    expect(syncSettings({ stages: { fold: ['3', '1.5', '2'] } }).stages.fold).toEqual([1.5, 2, 3]);
    expect(syncSettings({ stages: { fold: [1.5, 2] } }).stages.fold).toEqual([1.5, 2, 3]);
    expect(syncSettings({ stages: { fold: ['a', 'b', 'c'] } }).stages.fold).toEqual([1.5, 2, 3]);
    expect(syncSettings({ stages: { delta: 'x' } }).stages.delta).toBe(0.3);
  });

  it('NEP-CFG-005: the units contract targets mg/dL with a configurable factor table (#120)', () => {
    // Sponsor-specific factors vary, which nepExplorer itself warns about, so
    // `factors` is a setting rather than a constant (design §4).
    expect(DEFAULT_SETTINGS.units.target).toBe('mg/dL');
    expect(DEFAULT_SETTINGS.units.factors['mg/dl']).toBe(1);
    expect(DEFAULT_SETTINGS.units.factors['umol/l']).toBeCloseTo(1 / UMOL_PER_MGDL, 12);
    expect(UMOL_PER_MGDL).toBe(88.4);

    const custom = syncSettings({ units: { factors: { 'MG/DL': 1, 'µMOL/L': 0.0113 } } });
    // Caller keys are normalized on the way in, so a lookup never has to guess.
    expect(custom.units.factors['umol/l']).toBe(0.0113);
    expect(custom.units.factors['mg/dl']).toBe(1);
    expect(custom.units.target).toBe('mg/dL');
  });

  it('NEP-UNIT-001: unit strings normalize across the three mu spellings, case and whitespace (#120)', () => {
    // The RhoInc set writes μmol/L with U+03BC (Greek small mu); pharmaverseadam
    // writes umol/L; µ (U+00B5, micro sign) is the third spelling in the wild.
    // All three are the same unit and must resolve to the same factor.
    expect(normalizeUnit('umol/L')).toBe('umol/l');
    expect(normalizeUnit('µmol/L')).toBe('umol/l');
    expect(normalizeUnit('μmol/L')).toBe('umol/l');
    expect(normalizeUnit('  UMOL/L  ')).toBe('umol/l');
    expect(normalizeUnit('mg/dL')).toBe('mg/dl');
    expect(normalizeUnit('')).toBe('');
    expect(normalizeUnit(null)).toBe('');
    expect(normalizeUnit(undefined)).toBe('');
  });

  it('NEP-CFG-006: syncSettings normalizes the field-list settings and defaults the details (#120)', () => {
    const settings = syncSettings({
      filters: ['SEX', { value_col: 'ARM', label: 'Treatment' }],
      details: ['SITE']
    });
    expect(settings.filters).toEqual([
      { value_col: 'SEX', label: 'SEX', start: null, all: true, multiple: false },
      { value_col: 'ARM', label: 'Treatment', start: null, all: true, multiple: false }
    ]);
    expect(settings.details[0]).toEqual({ value_col: 'USUBJID', label: 'Participant ID' });
    expect(settings.details.map((detail) => detail.value_col)).toContain('SITE');
    // A filter whose column duplicates an existing detail is not repeated.
    expect(settings.details.filter((detail) => detail.value_col === 'ARM')).toHaveLength(1);
  });

  it('NEP-CFG-007: zone labels are a shown/hidden setting, defaulting to shown (#120)', () => {
    expect(DEFAULT_SETTINGS.zone_labels).toBe('shown');
    expect(syncSettings({ zone_labels: 'hidden' }).zone_labels).toBe('hidden');
    // An unrecognized value falls back rather than silently hiding the labels.
    expect(syncSettings({ zone_labels: 'maybe' }).zone_labels).toBe('shown');
  });

  it('NEP-CFG-008: the creatinine measure resolves through measure_values (#120)', () => {
    expect(syncSettings({}).measure_values.CREAT).toBe('Creatinine');
    const renamed = syncSettings({ measure_values: { CREAT: 'CREAT' } });
    expect(renamed.measure_values.CREAT).toBe('CREAT');
  });
});
