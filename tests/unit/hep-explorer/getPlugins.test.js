import { describe, it, expect } from 'vitest';
import {
  GROUP_COLORS,
  SELECTION_COLOR,
  hexToRgba,
  groupColorScale,
  QUADRANT_LABELS,
  pointTooltip
} from '../../../src/hep-explorer/getPlugins.js';

describe('hep-explorer getPlugins', () => {
  it('HEP-CTRL-009: groupColorScale maps distinct group values to palette colors and cycles (port)', () => {
    const scale = groupColorScale(['Placebo', 'Drug']);
    expect(scale.get('Placebo')).toBe(GROUP_COLORS[0]);
    expect(scale.get('Drug')).toBe(GROUP_COLORS[1]);
    const long = groupColorScale(new Array(GROUP_COLORS.length + 1).fill(0).map((_, i) => `g${i}`));
    expect(long.get(`g${GROUP_COLORS.length}`)).toBe(GROUP_COLORS[0]);
    // Non-string group values are keyed by their string form.
    expect(groupColorScale([1, 2]).get('1')).toBe(GROUP_COLORS[0]);
  });

  it('HEP-SELECT-001: the selection highlight color is a hex color distinct from the group palette (port)', () => {
    expect(SELECTION_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(GROUP_COLORS).not.toContain(SELECTION_COLOR);
  });

  it("HEP-QUAD-002: QUADRANT_LABELS pin the four Hy's-Law quadrants to their corner and High/Normal combination (port)", () => {
    expect(QUADRANT_LABELS).toHaveLength(4);
    const byPosition = Object.fromEntries(QUADRANT_LABELS.map((q) => [q.position, q]));
    expect(byPosition['upper-right']).toEqual({
      position: 'upper-right',
      label: "Possible Hy's Law Range",
      xCat: 'High',
      yCat: 'High'
    });
    expect(byPosition['upper-left']).toEqual({
      position: 'upper-left',
      label: 'Hyperbilirubinemia',
      xCat: 'Normal',
      yCat: 'High'
    });
    expect(byPosition['lower-right']).toEqual({
      position: 'lower-right',
      label: "Temple's Corollary",
      xCat: 'High',
      yCat: 'Normal'
    });
    expect(byPosition['lower-left']).toEqual({
      position: 'lower-left',
      label: 'Normal Range',
      xCat: 'Normal',
      yCat: 'Normal'
    });
  });

  it('hexToRgba converts a hex color to rgba at the given opacity (port)', () => {
    expect(hexToRgba('#1f78b4', 0.5)).toBe('rgba(31, 120, 180, 0.5)');
    expect(hexToRgba('1f78b4', 1)).toBe('rgba(31, 120, 180, 1)');
  });

  it('HEP-CHART-004: pointTooltip lists participant, R Ratio, both peaks with days, and the day gap (port)', () => {
    const state = { measureX: 'ALT', measureY: 'TB' };
    const lines = pointTooltip(
      { id: 'P1', x: 4, y: 3, days_x: 10, days_y: 12, day_diff: 2, rRatio: 4 / 1.2 },
      state
    );
    expect(lines).toEqual([
      'Participant: P1',
      'R Ratio: 3.33',
      'ALT: 4 @ day 10',
      'TB: 3 @ day 12',
      '2 days apart'
    ]);
  });

  it('HEP-CHART-004: pointTooltip shows NA for a missing R Ratio or day and omits an unknown day gap (port)', () => {
    const state = { measureX: 'ALT', measureY: 'TB' };
    const lines = pointTooltip(
      { id: 'P2', x: 0.75, y: 0.8, days_x: NaN, days_y: NaN, day_diff: NaN, rRatio: NaN },
      state
    );
    expect(lines).toEqual([
      'Participant: P2',
      'R Ratio: NA',
      'ALT: 0.75 @ day NA',
      'TB: 0.8 @ day NA'
    ]);
  });

  it('HEP-CHART-004: pointTooltip names each measure with its full label from measure_values (port)', () => {
    const state = { measureX: 'ALT', measureY: 'TB' };
    const measureValues = { ALT: 'Aminotransferase, alanine (ALT)', TB: 'Total Bilirubin' };
    const lines = pointTooltip(
      { id: 'P1', x: 4, y: 3, days_x: 10, days_y: 12, day_diff: 2, rRatio: 4 / 1.2 },
      state,
      measureValues
    );
    expect(lines).toEqual([
      'Participant: P1',
      'R Ratio: 3.33',
      'Aminotransferase, alanine (ALT): 4 @ day 10',
      'Total Bilirubin: 3 @ day 12',
      '2 days apart'
    ]);
  });
});
