import { describe, it, expect } from 'vitest';
import {
  GROUP_NONE,
  DISPLAY_MODES,
  AXIS_TYPES,
  POINT_SIZE_OPTIONS,
  MEASURE_KEYS,
  DEFAULT_SETTINGS,
  arrayify,
  fieldSpec,
  syncSettings,
  cutFor
} from '../../../src/hep-explorer/configure.js';

// Settings defaults + merge for the hep-explorer module. Requirement keys
// reference the condensed HEP-* scheme via docs/hep-explorer-coverage.md.

describe('hep-explorer configure', () => {
  it('HEP-DATA-001..004: default settings map the standard id, measure, value, unit, normal-range, and timing columns (port)', () => {
    const settings = syncSettings({});
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.measure_col).toBe('TEST');
    expect(settings.value_col).toBe('STRESN');
    expect(settings.unit_col).toBe('STRESU');
    expect(settings.normal_col_high).toBe('STNRHI');
    expect(settings.normal_col_low).toBe('STNRLO');
    expect(settings.studyday_col).toBe('DY');
    expect(settings.visit_col).toBe('VISIT');
    expect(settings.visitn_col).toBe('VISITNUM');
    expect(settings.page_size).toBe(10);
    expect(DEFAULT_SETTINGS.group_by).toBe(GROUP_NONE);
  });

  it('HEP-DISPLAY-001/HEP-CTRL-006/007: display, axis-type, point-size, and measure constants match the original renderer (port)', () => {
    expect(DISPLAY_MODES.map((mode) => mode.value)).toEqual(['relative_uln', 'relative_baseline']);
    expect(DISPLAY_MODES[0].label).toBe('Upper limit of normal adjusted (eDISH)');
    expect(DISPLAY_MODES[1].label).toBe('Baseline adjusted (mDISH)');
    expect(AXIS_TYPES).toEqual(['linear', 'log']);
    expect(POINT_SIZE_OPTIONS).toEqual(['Uniform', 'rRatio']);
    expect(MEASURE_KEYS).toEqual(['ALT', 'AST', 'TB', 'ALP']);
  });

  it('HEP-DATA-002/HEP-CTRL-001/002: measure_values map the short keys to full TEST strings and x/y defaults are ALT vs TB (port)', () => {
    const settings = syncSettings({});
    expect(settings.measure_values).toEqual({
      ALT: 'Aminotransferase, alanine (ALT)',
      AST: 'Aminotransferase, aspartate (AST)',
      TB: 'Total Bilirubin',
      ALP: 'Alkaline phosphatase (ALP)'
    });
    expect(settings.x_default).toBe('ALT');
    expect(settings.y_default).toBe('TB');
    expect(settings.x_options).toEqual(['ALT', 'AST', 'TB', 'ALP']);
    expect(settings.y_options).toEqual(['TB']);
  });

  it('HEP-QUAD-001: default cuts give the classic eDISH view — ALT >= 3xULN via the defaults entry, TB >= 2xULN (port)', () => {
    const { cuts } = syncSettings({});
    expect(cuts.TB).toEqual({ relative_uln: 2, relative_baseline: 4.8 });
    expect(cuts.ALP).toEqual({ relative_uln: 1, relative_baseline: 3.8 });
    expect(cuts.rRatio).toEqual({ relative_uln: 5, relative_baseline: 5 });
    expect(cuts.defaults).toEqual({ relative_uln: 3, relative_baseline: 3.8 });
    // ALT and AST have no entry of their own — they resolve via defaults.
    expect(cutFor(cuts, 'ALT', 'relative_uln')).toBe(3);
    expect(cutFor(cuts, 'AST', 'relative_baseline')).toBe(3.8);
    expect(cutFor(cuts, 'TB', 'relative_uln')).toBe(2);
    expect(cutFor(cuts, 'TB', 'relative_baseline')).toBe(4.8);
    expect(cutFor(cuts, 'rRatio', 'relative_uln')).toBe(5);
  });

  it('HEP-QUAD-001: cutFor back-fills unlisted measures and missing display modes from the defaults entry (port)', () => {
    const { cuts } = syncSettings({ cuts: { GGT: { relative_uln: 7 } } });
    // Unknown measure with no entry at all -> defaults for both modes.
    expect(cutFor(cuts, 'BUN', 'relative_uln')).toBe(3);
    expect(cutFor(cuts, 'BUN', 'relative_baseline')).toBe(3.8);
    // Partial entry keeps its own value and back-fills the other mode.
    expect(cutFor(cuts, 'GGT', 'relative_uln')).toBe(7);
    expect(cutFor(cuts, 'GGT', 'relative_baseline')).toBe(3.8);
  });

  it('HEP-QUAD-001: a partial cuts override deep-merges onto the defaults so untouched measures keep their cuts (port)', () => {
    const { cuts } = syncSettings({ cuts: { TB: { relative_uln: 2.5 } } });
    expect(cuts.TB.relative_uln).toBe(2.5);
    expect(cuts.TB.relative_baseline).toBe(4.8);
    expect(cuts.ALP).toEqual({ relative_uln: 1, relative_baseline: 3.8 });
    expect(cuts.defaults).toEqual({ relative_uln: 3, relative_baseline: 3.8 });
  });

  it('HEP-DATA-002: a partial measure_values override back-fills the other measures from the defaults (port)', () => {
    const settings = syncSettings({ measure_values: { TB: 'BILI' } });
    expect(settings.measure_values.TB).toBe('BILI');
    expect(settings.measure_values.ALT).toBe('Aminotransferase, alanine (ALT)');
    expect(settings.measure_values.ALP).toBe('Alkaline phosphatase (ALP)');
  });

  it('HEP-CTRL-011: filter specs normalize strings and objects and preserve a start value (port)', () => {
    const settings = syncSettings({
      filters: [{ value_col: 'ARM', label: 'Treatment Group', start: 'Placebo' }, 'SEX']
    });
    expect(settings.filters).toEqual([
      { value_col: 'ARM', label: 'Treatment Group', start: 'Placebo' },
      { value_col: 'SEX', label: 'SEX' }
    ]);
  });

  it('HEP-CTRL-009: groups always offer a leading None option and honor group_by (port)', () => {
    const settings = syncSettings({
      groups: [{ value_col: 'ARM', label: 'Treatment Group' }],
      group_by: 'ARM'
    });
    expect(settings.groups[0]).toEqual({ value_col: GROUP_NONE, label: 'None' });
    expect(settings.groups.map((g) => g.value_col)).toContain('ARM');
    expect(settings.group_by).toBe('ARM');
    // Unknown group_by is added as an option as-is (matching the other modules).
    const unknown = syncSettings({ group_by: 'NOPE' });
    expect(unknown.group_by).toBe('NOPE');
    expect(unknown.groups).toContainEqual({ value_col: 'NOPE', label: 'NOPE' });
    // Falsy group_by falls back to None.
    expect(syncSettings({ group_by: '' }).group_by).toBe(GROUP_NONE);
  });

  it('HEP-CTRL-010: r_ratio normalizes to a [min, max] pair with a data-resolved null max by default (port)', () => {
    expect(syncSettings({}).r_ratio).toEqual([0, null]);
    expect(syncSettings({ r_ratio: [1, 10] }).r_ratio).toEqual([1, 10]);
    // A single value cannot form a range -> falls back to the default pair.
    expect(syncSettings({ r_ratio: 5 }).r_ratio).toEqual([0, null]);
    expect(syncSettings({}).r_ratio_filter).toBe(true);
    expect(syncSettings({ r_ratio_filter: false }).r_ratio_filter).toBe(false);
  });

  it('HEP-CTRL-008: the timing window defaults to 30 days (port)', () => {
    expect(syncSettings({}).visit_window).toBe(30);
    expect(syncSettings({ visit_window: 7 }).visit_window).toBe(7);
  });

  it('HEP-CTRL-001/002: measure-option lists coerce a single string to an array (port)', () => {
    const settings = syncSettings({ x_options: 'ALT', y_options: 'TB' });
    expect(settings.x_options).toEqual(['ALT']);
    expect(settings.y_options).toEqual(['TB']);
  });

  it('HEP-SELECT-006: details normalize to spec arrays and default to an empty list for the derived columns (port)', () => {
    expect(syncSettings({}).details).toEqual([]);
    expect(
      syncSettings({ details: ['AGE', { value_col: 'RACE', label: 'Race' }] }).details
    ).toEqual([
      { value_col: 'AGE', label: 'AGE' },
      { value_col: 'RACE', label: 'Race' }
    ]);
  });

  it('HEP-API: arrayify and fieldSpec normalize scalars, nullish values, and spec objects (port)', () => {
    expect(arrayify(null)).toEqual([]);
    expect(arrayify(undefined)).toEqual([]);
    expect(arrayify('')).toEqual([]);
    expect(arrayify('SEX')).toEqual(['SEX']);
    expect(arrayify(['SEX'])).toEqual(['SEX']);
    expect(fieldSpec('SEX')).toEqual({ value_col: 'SEX', label: 'SEX' });
    expect(fieldSpec('SEX', 'Sex')).toEqual({ value_col: 'SEX', label: 'Sex' });
    expect(fieldSpec({ value_col: 'ARM' })).toEqual({ value_col: 'ARM', label: 'ARM' });
    expect(fieldSpec({ value_col: 'ARM', label: 'Arm', start: 'A' })).toEqual({
      value_col: 'ARM',
      label: 'Arm',
      start: 'A'
    });
  });
});
