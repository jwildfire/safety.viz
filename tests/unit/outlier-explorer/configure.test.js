import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  NORMAL_RANGE_METHODS,
  GROUP_NONE,
  syncSettings,
  xAxisSetting
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
      { value_col: 'ARM', label: 'Treatment Group', start: 'Placebo', all: true, multiple: false },
      { value_col: 'SEX', label: 'SEX', start: null, all: true, multiple: false }
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

  it('SOE-FUNC-004: time_cols specs normalize, and no Measurement axis is derived when they are empty (#24, #371)', () => {
    expect(syncSettings({}).time_cols).toEqual([]);
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

  it('SOE-XAX-001: the main axis reads x_axis, the setting every chart takes (#371)', () => {
    const axis = xAxisSetting(
      syncSettings({
        x_axis: {
          options: [
            { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
            { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
          ],
          default: 'day'
        },
        // x_axis wins over the synonym and over the old column settings.
        time_cols: [{ value_col: 'AVISIT', type: 'ordinal' }],
        studyday_col: 'ADY'
      })
    );
    expect(axis).toEqual({
      options: [
        { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
        { key: 'day', col: 'DY', label_col: null, type: 'linear', title: 'Study day' }
      ],
      default: 'day'
    });
    // An x_axis with no default opens on Visit, the outlier explorer's default.
    expect(
      xAxisSetting(syncSettings({ x_axis: { options: [{ key: 'day', col: 'DY' }] } })).default
    ).toBe('visit');
  });

  it('SOE-XAX-002: without x_axis, each time_cols entry becomes an x_axis option (#371)', () => {
    const axis = xAxisSetting(
      syncSettings({
        time_cols: [
          { value_col: 'DY', label: 'Study Day', type: 'linear' },
          { value_col: 'VISIT', label: 'Visit', type: 'ordinal', order_col: 'VISITNUM' }
        ]
      })
    );
    expect(axis.options).toEqual([
      { key: 'day', col: 'DY', label_col: null, type: 'linear', title: 'Study Day' },
      {
        key: 'visit',
        col: 'VISIT',
        label_col: null,
        type: 'ordinal',
        title: 'Visit',
        order_col: 'VISITNUM'
      }
    ]);
    // The default is the setting's default by key, not the first entry.
    expect(axis.default).toBe('visit');

    // Two entries of one type cannot both be "visit": each is keyed by its column.
    const twoVisits = xAxisSetting(
      syncSettings({
        time_cols: [
          { value_col: 'VISIT', type: 'ordinal', order_col: 'VISITNUM' },
          { value_col: 'AVISIT', type: 'ordinal', order_col: 'AVISITN' },
          { value_col: 'DY', type: 'linear' }
        ]
      })
    );
    expect(twoVisits.options.map((option) => option.key)).toEqual(['VISIT', 'AVISIT', 'day']);
  });

  it('SOE-XAX-003: without x_axis or time_cols, the axis is built from visitn_col, visit_col and studyday_col (#371)', () => {
    const axis = xAxisSetting(
      syncSettings({ visit_col: 'VISIT', visitn_col: 'VISITNUM', studyday_col: 'DY' })
    );
    expect(axis).toEqual({
      options: [
        { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
        { key: 'day', col: 'DY', label_col: null, type: 'linear', title: 'Study day' }
      ],
      default: 'visit'
    });
    // Nothing set: Visit on VISITNUM labelled by VISIT (#384) and Study day on
    // DY (#370), opening on Visit.
    expect(xAxisSetting(syncSettings({})).options.map((option) => option.col)).toEqual([
      'VISITNUM',
      'DY'
    ]);
    // No column at all: no option, and so no time axis (no Measurement sequence).
    expect(
      xAxisSetting(syncSettings({ visitn_col: null, visit_col: null, studyday_col: null })).options
    ).toEqual([]);
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
