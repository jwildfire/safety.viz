import { describe, it, expect } from 'vitest';
import {
  CLINICAL_CAUTION,
  GROUP_COLORS,
  QUADRANT_LABELS,
  QUADRANT_MEANINGS,
  SELECTION_COLOR,
  groupColorScale,
  groupLegendEntries,
  hexToRgba,
  pointSizeNote,
  pointTooltip
} from '../../../src/hep-explorer/getPlugins.js';

describe('hep-explorer getPlugins', () => {
  it('HEP-CTRL-009: groupColorScale maps distinct group values to palette colors and cycles (port)', () => {
    const scale = groupColorScale(['Placebo', 'Drug']);
    expect(scale.get('Placebo')).toBe(GROUP_COLORS[0]);
    expect(scale.get('Drug')).toBe(GROUP_COLORS[1]);
    // Past the base palette the scale shades rather than repeats (HEP-CTRL-016,
    // #55): the ninth group is a variant of the first, not the first again.
    const long = groupColorScale(new Array(GROUP_COLORS.length + 1).fill(0).map((_, i) => `g${i}`));
    expect(long.get(`g${GROUP_COLORS.length}`)).not.toBe(GROUP_COLORS[0]);
    expect(long.get(`g${GROUP_COLORS.length}`)).toMatch(/^#[0-9a-f]{6}$/);
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

// Quadrant/legend/axis polish carried from the upstream backlog (#54): the
// clinical meaning of each quadrant, the per-group counts the legend was
// missing, and the point-size encoding it never explained. Requirement groups
// HEP-QUAD-007/008, HEP-CTRL-013/014, HEP-CAUTION-001.

describe('hep-explorer quadrant and legend polish (#54)', () => {
  it('HEP-QUAD-008: every quadrant carries the clinical reading it stands for (#54)', () => {
    QUADRANT_LABELS.forEach((entry) => {
      const meaning = QUADRANT_MEANINGS[entry.label];
      expect(meaning, `no meaning for ${entry.label}`).toBeTruthy();
      expect(meaning.length).toBeGreaterThan(20);
    });
    // The one a reviewer must not misread: the upper-right quadrant is a
    // RANGE, not a diagnosis, and the note has to say so.
    expect(QUADRANT_MEANINGS["Possible Hy's Law Range"]).toMatch(/not a diagnosis|case review/i);
    expect(QUADRANT_MEANINGS['Hyperbilirubinemia']).toMatch(/bilirubin/i);
    expect(QUADRANT_MEANINGS["Temple's Corollary"]).toMatch(/aminotransferase|ALT|transaminase/i);
  });

  it('HEP-CAUTION-001: the chart carries a standing not-for-clinical-use caution (#54)', () => {
    expect(CLINICAL_CAUTION).toMatch(/not validated for clinical use/i);
    expect(CLINICAL_CAUTION).toMatch(/exploratory/i);
  });

  it("HEP-CTRL-013: legend entries carry each group's count and percent (#54)", () => {
    const points = [{ group: 'A' }, { group: 'A' }, { group: 'B' }, { group: null }];
    const entries = groupLegendEntries(['A', 'B'], points);
    expect(entries.map((entry) => entry.value)).toEqual(['A', 'B']);
    expect(entries[0].count).toBe(2);
    expect(entries[1].count).toBe(1);
    // Percent is of the plotted points, so the ungrouped point is in the
    // denominator — a legend that quietly dropped it would not add up.
    expect(entries[0].percent).toBeCloseTo(50);
    expect(entries[0].label).toBe('A (n=2, 50.0%)');
    expect(entries[1].label).toBe('B (n=1, 25.0%)');
    expect(groupLegendEntries([], points)).toEqual([]);
    expect(groupLegendEntries(['A'], [])[0].label).toBe('A (n=0, 0.0%)');
  });

  it('HEP-CTRL-014: the point-size encoding is explained only when it encodes something (#54)', () => {
    expect(pointSizeNote('rRatio')).toMatch(/R Ratio/);
    expect(pointSizeNote('rRatio')).toMatch(/larger|bigger/i);
    expect(pointSizeNote('Uniform')).toBe('');
  });
});
