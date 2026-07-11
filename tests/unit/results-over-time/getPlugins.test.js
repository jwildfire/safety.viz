import { describe, it, expect } from 'vitest';
import {
  groupColors,
  outlierTooltip,
  summaryTooltip
} from '../../../src/results-over-time/getPlugins.js';
import { summarize } from '../../../src/results-over-time/structureData.js';

// Tooltip text and group colors for the results-over-time module (#27):
// SROT-REG-014 (tooltip content) and SROT-REG-015 (precision).

describe('results-over-time getPlugins', () => {
  const precisions = { p0: 0, p1: 1, p2: 2 };

  it('SROT-REG-014/015: summaryTooltip lists every statistic at the required precision (#27)', () => {
    const text = summaryTooltip('Placebo', 'Week 4', summarize([1, 2, 3, 4, 5]), precisions);
    expect(text).toContain('Placebo at Week 4');
    expect(text).toContain('N = 5');
    expect(text).toContain('Min = 1');
    expect(text).toContain('5th % = 1.2');
    expect(text).toContain('Q1 = 2.0');
    expect(text).toContain('Median = 3.0');
    expect(text).toContain('Q3 = 4.0');
    expect(text).toContain('95th % = 4.8');
    expect(text).toContain('Max = 5');
    expect(text).toContain('Mean = 3.0');
    expect(text).toContain('StDev = 1.58');
  });

  it('SROT-REG-011: outlierTooltip names the participant and its value (#27)', () => {
    const text = outlierTooltip(
      { USUBJID: '01-001', __srot_value: 12.5 },
      { id_col: 'USUBJID' },
      precisions
    );
    expect(text).toContain('01-001');
    expect(text).toContain('12.5');
  });

  it('SROT-REG-003: groupColors assigns a stable color per group in order (#27)', () => {
    const colors = groupColors(['A', 'B', 'C']);
    expect(Object.keys(colors)).toEqual(['A', 'B', 'C']);
    expect(colors.A).not.toBe(colors.B);
    expect(groupColors(['A', 'B', 'C']).A).toBe(colors.A);
  });
});
