import { describe, it, expect } from 'vitest';
import { SEVERITY_ORDER } from '../../../src/hep-core/quadrants.js';
import {
  migrationCells,
  migrationMatrix,
  migrationMatrixBySide
} from '../../../src/hep-core/migration.js';

// Per-side cross-tabulation behind the bidirectional migration Sankey
// (Amirzadegan 2025 Fig 3) — obot.roadmap#43, safety.viz#91. migrationMatrix is
// reused UNMODIFIED: the only change is to partition the cohort by arm side and
// call it once per side, plus a per-cell participant index so a ribbon and its
// cross-table cell select exactly the same people.

const NN = 'Normal & NN';
const CH = 'Cholestasis';
const TC = "Temple's Corollary";
const HL = "Hy's Law";

const subject = (id, arm, pre, post) => ({
  id,
  arm,
  pretreatQuadrant: pre,
  onTreatQuadrant: post
});

const subjects = [
  subject('P1', 'Placebo', NN, NN),
  subject('P2', 'Placebo', NN, HL),
  subject('P3', 'Placebo', HL, NN),
  subject('P4', 'Placebo', NN, NN),
  subject('A1', 'Study Drug', NN, HL),
  subject('A2', 'Study Drug', NN, HL),
  subject('A3', 'Study Drug', CH, TC),
  subject('A4', 'Study Drug', HL, NN),
  subject('A5', 'Study Drug', NN, NN),
  subject('O1', 'Open Label', NN, HL)
];

const sides = new Map([
  ['Placebo', 'placebo'],
  ['Study Drug', 'active'],
  ['Open Label', null]
]);

describe('hep-core migration — migrationMatrixBySide', () => {
  const bySide = migrationMatrixBySide(subjects, sides);

  it('HEP-CORE-007: one cross table per designated side (#91)', () => {
    expect([...bySide.keys()]).toEqual(['placebo', 'active']);
    expect(bySide.get('placebo').total).toBe(4);
    expect(bySide.get('active').total).toBe(5);
  });

  it('HEP-CORE-007: each side is exactly migrationMatrix over that side alone (#91)', () => {
    const placeboOnly = subjects.filter((s) => sides.get(s.arm) === 'placebo');
    expect(bySide.get('placebo')).toEqual(migrationMatrix(placeboOnly));
    expect(bySide.get('placebo').counts[NN][NN]).toBe(2);
    expect(bySide.get('placebo').counts[NN][HL]).toBe(1);
    expect(bySide.get('active').counts[NN][HL]).toBe(2);
    expect(bySide.get('active').counts[CH][TC]).toBe(1);
  });

  it('HEP-CORE-007: an undesignated arm is excluded from both sides (#91)', () => {
    expect(bySide.get('placebo').total + bySide.get('active').total).toBe(subjects.length - 1);
  });

  it('HEP-CORE-007: both sides are present even when one is empty (#91)', () => {
    const empty = migrationMatrixBySide(
      subjects.filter((s) => s.arm === 'Placebo'),
      sides
    );
    expect([...empty.keys()]).toEqual(['placebo', 'active']);
    expect(empty.get('active').total).toBe(0);
  });
});

describe('hep-core migration — migrationCells', () => {
  const cells = migrationCells(subjects, sides);

  it('HEP-CORE-007: keyed side|pretreatment|on-treatment with the participant ids (#91)', () => {
    expect(cells.get(`placebo|${NN}|${NN}`)).toEqual({
      side: 'placebo',
      pre: NN,
      post: NN,
      ids: ['P1', 'P4']
    });
    expect(cells.get(`active|${NN}|${HL}`).ids).toEqual(['A1', 'A2']);
    expect(cells.get(`active|${CH}|${TC}`).ids).toEqual(['A3']);
  });

  it('HEP-CORE-007: only non-empty cells of designated sides are emitted (#91)', () => {
    expect(cells.size).toBe(7);
    expect(cells.get(`placebo|${CH}|${TC}`)).toBeUndefined();
    expect([...cells.keys()].some((key) => key.startsWith('null|'))).toBe(false);
    expect([...cells.values()].every((cell) => cell.ids.length > 0)).toBe(true);
  });

  it('HEP-CORE-007: cell counts equal the per-side cross-table counts (#91)', () => {
    const bySide = migrationMatrixBySide(subjects, sides);
    ['placebo', 'active'].forEach((side) => {
      const matrix = bySide.get(side);
      SEVERITY_ORDER.forEach((pre) =>
        SEVERITY_ORDER.forEach((post) => {
          const cell = cells.get(`${side}|${pre}|${post}`);
          expect(cell ? cell.ids.length : 0, `${side}|${pre}|${post}`).toBe(
            matrix.counts[pre][post]
          );
        })
      );
    });
  });

  it('HEP-CORE-007: cell order and ids are deterministic, not input-order dependent (#91)', () => {
    const shuffled = migrationCells([...subjects].reverse(), sides);
    expect([...shuffled.keys()]).toEqual([...cells.keys()]);
    expect(shuffled.get(`placebo|${NN}|${NN}`).ids).toEqual(['P1', 'P4']);
    // Sides first, then both quadrants in severity order (Hy's Law first).
    expect([...cells.keys()]).toEqual([
      `placebo|${HL}|${NN}`,
      `placebo|${NN}|${HL}`,
      `placebo|${NN}|${NN}`,
      `active|${HL}|${NN}`,
      `active|${CH}|${TC}`,
      `active|${NN}|${HL}`,
      `active|${NN}|${NN}`
    ]);
  });

  it('HEP-CORE-007: falls back to each subject own side when no map is supplied (#91)', () => {
    const withSide = subjects.map((s) => ({ ...s, side: sides.get(s.arm) }));
    expect([...migrationCells(withSide).keys()]).toEqual([...cells.keys()]);
  });
});
