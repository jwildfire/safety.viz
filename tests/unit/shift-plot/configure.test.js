import { describe, it, expect } from 'vitest';
import safetyViz from '../../../src/main.js';
import { DEFAULT_SETTINGS, STATS, syncSettings } from '../../../src/shift-plot/configure.js';

// Settings defaults + merge for the shift-plot module (#14). Requirement keys
// reference the safety.agent matrix via docs/shift-plot-coverage.md.

describe('shift-plot configure', () => {
  it('SSP-CFG-004/005/006: default settings map the standard measure, result, visit, and id columns (#14)', () => {
    const settings = syncSettings({});
    expect(settings.measure_col).toBe('TEST');
    expect(settings.value_col).toBe('STRESN');
    expect(settings.visit_col).toBe('VISIT');
    expect(settings.visit_order_col).toBe('VISITNUM');
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.unit_col).toBe('STRESU');
    expect(settings.baseline_visits).toBeNull();
    expect(settings.comparison_visits).toBeNull();
    expect(settings.baseline_stat).toBe('mean');
    expect(settings.comparison_stat).toBe('mean');
    expect(settings.page_size).toBe(10);
    expect(DEFAULT_SETTINGS.filters).toEqual([]);
    expect(STATS).toEqual(['mean', 'min', 'max', 'first']);
  });

  it('SSP-CFG-006: filter specs normalize strings and objects to value_col/label pairs (#14)', () => {
    const settings = syncSettings({
      filters: [{ value_col: 'SEX', label: 'Sex' }, 'RACE']
    });
    expect(settings.filters).toEqual([
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'RACE', label: 'RACE' }
    ]);
  });

  it('SSP-CFG-004/005: baseline/comparison visits normalize to arrays and stats fall back to mean (#14)', () => {
    expect(syncSettings({ baseline_visits: 'Baseline' }).baseline_visits).toEqual(['Baseline']);
    expect(syncSettings({ comparison_visits: ['Week 12', 'Week 24'] }).comparison_visits).toEqual([
      'Week 12',
      'Week 24'
    ]);
    expect(syncSettings({ baseline_stat: 'median' }).baseline_stat).toBe('mean');
    expect(syncSettings({ comparison_stat: 'max' }).comparison_stat).toBe('max');
  });

  it('SSP-REQ-005: details default to id, baseline, comparison, change, and percent change (#14)', () => {
    const settings = syncSettings({});
    expect(settings.details).toEqual([
      { value_col: 'USUBJID', label: 'Participant ID' },
      { value_col: '__ssp_baseline', label: 'Baseline' },
      { value_col: '__ssp_comparison', label: 'Comparison' },
      { value_col: '__ssp_chg', label: 'Change' },
      { value_col: '__ssp_pchg', label: 'Percent Change' }
    ]);
  });

  it('SSP-API: the module collection exposes the shift-plot factory (#14)', () => {
    expect(typeof safetyViz.shiftPlot).toBe('function');
  });
});
