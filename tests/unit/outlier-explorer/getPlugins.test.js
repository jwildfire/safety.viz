import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/outlier-explorer/configure.js';
import {
  GROUP_COLORS,
  groupColorScale,
  hexToRgba,
  pointTooltip
} from '../../../src/outlier-explorer/getPlugins.js';

describe('outlier-explorer getPlugins', () => {
  it('SOE-REG-049: groupColorScale maps distinct group values to palette colors and cycles (#24)', () => {
    const scale = groupColorScale(['Placebo', 'Drug']);
    expect(scale.get('Placebo')).toBe(GROUP_COLORS[0]);
    expect(scale.get('Drug')).toBe(GROUP_COLORS[1]);
    const long = groupColorScale(new Array(GROUP_COLORS.length + 1).fill(0).map((_, i) => `g${i}`));
    expect(long.get(`g${GROUP_COLORS.length}`)).toBe(GROUP_COLORS[0]);
  });

  it('SOE-REG-011: pointTooltip lists participant, result, and time (#24)', () => {
    const settings = syncSettings({});
    const point = { y: 12, label: '#3', raw: { USUBJID: 'SUBJ-007' } };
    const lines = pointTooltip(point, settings, 'Albumin (g/dL)');
    expect(lines[0]).toBe('SUBJ-007');
    expect(lines[1]).toBe('Albumin (g/dL): 12');
    expect(lines[2]).toBe('Time: #3');
  });

  it('SOE-CFG-006/SOE-REG-012: pointTooltip appends configured tooltip_cols when present (#24)', () => {
    const settings = syncSettings({ tooltip_cols: [{ value_col: 'DT', label: 'Date' }] });
    const withDate = pointTooltip(
      { y: 1, label: '#1', raw: { USUBJID: 'P', DT: '2026-01-02' } },
      settings,
      'M'
    );
    expect(withDate).toContain('Date: 2026-01-02');
    const withoutDate = pointTooltip(
      { y: 1, label: '#1', raw: { USUBJID: 'P', DT: '' } },
      settings,
      'M'
    );
    expect(withoutDate.some((line) => line.startsWith('Date:'))).toBe(false);
  });

  it('hexToRgba converts a hex color to rgba at the given opacity (#24)', () => {
    expect(hexToRgba('#1f78b4', 0.5)).toBe('rgba(31, 120, 180, 0.5)');
  });
});
