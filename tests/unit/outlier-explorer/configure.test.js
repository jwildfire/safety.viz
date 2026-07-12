import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  NORMAL_RANGE_METHODS,
  OE_SEQ,
  GROUP_NONE,
  syncSettings
} from '../../../src/outlier-explorer/configure.js';

// Settings defaults + merge for the outlier-explorer module (#24). Requirement
// keys reference the safety.agent matrix via docs/outlier-explorer-coverage.md.

describe('outlier-explorer configure', () => {
  it('SOE-CFG-defaults: default settings map the standard measure, result, id, unit, and normal-range columns (#24)', () => {
    const settings = syncSettings({});
    expect(settings.measure_col).toBe('TEST');
    expect(settings.value_col).toBe('STRESN');
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.unit_col).toBe('STRESU');
    expect(settings.normal_col_low).toBe('STNRLO');
    expect(settings.normal_col_high).toBe('STNRHI');
    expect(settings.page_size).toBe(10);
    expect(DEFAULT_SETTINGS.group_by).toBe(GROUP_NONE);
    expect(NORMAL_RANGE_METHODS).toEqual(['None', 'LLN-ULN', 'Standard Deviation', 'Quantiles']);
  });

  it('SOE-FUNC-007/SOE-CFG-007..009: normal-range method defaults to LLN-ULN with sd and quantile defaults (#24)', () => {
    const settings = syncSettings({});
    expect(settings.normal_range_method).toBe('LLN-ULN');
    expect(settings.normal_range_sd).toBe(1.96);
    expect(settings.normal_range_quantile_low).toBe(0.05);
    expect(settings.normal_range_quantile_high).toBe(0.95);
  });

  it('SOE-CFG-004: filter specs normalize strings and objects and preserve a start value (#24)', () => {
    const settings = syncSettings({
      filters: [{ value_col: 'ARM', label: 'Treatment Group', start: 'Placebo' }, 'SEX']
    });
    expect(settings.filters).toEqual([
      { value_col: 'ARM', label: 'Treatment Group', start: 'Placebo' },
      { value_col: 'SEX', label: 'SEX' }
    ]);
  });

  it('SOE-REG-048: groups always offer a leading None option and honor group_by (#24)', () => {
    const settings = syncSettings({
      groups: [{ value_col: 'ARM', label: 'Treatment Group' }],
      group_by: 'ARM'
    });
    expect(settings.groups[0]).toEqual({ value_col: GROUP_NONE, label: 'None' });
    expect(settings.groups.map((g) => g.value_col)).toContain('ARM');
    expect(settings.group_by).toBe('ARM');
    // Unknown group_by is added as an option as-is (matching the histogram).
    const unknown = syncSettings({ group_by: 'NOPE' });
    expect(unknown.group_by).toBe('NOPE');
    expect(unknown.groups).toContainEqual({ value_col: 'NOPE', label: 'NOPE' });
    // Falsy group_by falls back to None.
    expect(syncSettings({ group_by: '' }).group_by).toBe(GROUP_NONE);
  });

  it('SOE-FUNC-004: time_cols default to a derived Measurement axis and normalize ordinal specs (#24)', () => {
    const derived = syncSettings({}).time_cols;
    expect(derived).toEqual([
      { value_col: OE_SEQ, label: 'Measurement', type: 'linear', order_col: OE_SEQ }
    ]);
    const configured = syncSettings({
      time_cols: [
        { value_col: 'VISIT', label: 'Visit', type: 'ordinal', order_col: 'VISITNUM' },
        'DY'
      ]
    }).time_cols;
    expect(configured).toEqual([
      { value_col: 'VISIT', label: 'Visit', type: 'ordinal', order_col: 'VISITNUM' },
      { value_col: 'DY', label: 'DY', type: 'linear', order_col: 'DY' }
    ]);
  });

  it('SOE-CFG-005: details default to time, id, result, normal limits, and unit when unset (#24)', () => {
    const settings = syncSettings({});
    expect(settings.details.map((detail) => detail.label)).toEqual([
      'Time',
      'Participant ID',
      'Result',
      'Lower Limit of Normal',
      'Upper Limit of Normal',
      'Unit'
    ]);
    // Explicit details are honored as-is.
    const custom = syncSettings({ details: [{ value_col: 'AGE', label: 'Age' }] });
    expect(custom.details).toEqual([{ value_col: 'AGE', label: 'Age' }]);
  });

  it('SOE-CFG-006/013/014: tooltip_cols normalize and mark attributes merge over defaults (#24)', () => {
    const settings = syncSettings({
      tooltip_cols: [{ value_col: 'DT', label: 'Date' }],
      point_attributes: { radius: 5 }
    });
    expect(settings.tooltip_cols).toEqual([{ value_col: 'DT', label: 'Date' }]);
    expect(settings.point_attributes.radius).toBe(5);
    // Unspecified attribute keys keep their defaults.
    expect(settings.point_attributes.color).toBe(DEFAULT_SETTINGS.point_attributes.color);
    expect(settings.line_attributes).toEqual(DEFAULT_SETTINGS.line_attributes);
  });
});
