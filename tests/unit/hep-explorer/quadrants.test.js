import { describe, it, expect } from 'vitest';
import {
  COMPOSITE_QUADRANTS,
  CONCERN_COLORS,
  CONCERN_MATRIX,
  SEVERITY_ORDER,
  SEVERITY_TIERS,
  concernOf,
  ribbonColor,
  shiftDirection
} from '../../../src/hep-core/quadrants.js';

// Severity ordering + ribbon colour for the bidirectional migration Sankey
// (Amirzadegan 2025 Fig 3, obot.roadmap#43, safety.viz#91/#92). The one design
// decision the Sankey turns on: CONCERN_MATRIX deliberately declines to rank
// Cholestasis against Temple's Corollary (both directions are yellow), so they
// share one severity tier and the ribbon's fill is taken from concernOf — never
// from the sign of the vertical travel.

const NN = 'Normal & NN';
const CH = 'Cholestasis';
const TC = "Temple's Corollary";
const HL = "Hy's Law";

describe('hep-core quadrants — severity tiers', () => {
  it("HEP-CORE-008: three tiers with Hy's Law on top and Normal & NN at the bottom (#91)", () => {
    expect(SEVERITY_TIERS[HL]).toBe(0);
    expect(SEVERITY_TIERS[CH]).toBe(1);
    expect(SEVERITY_TIERS[TC]).toBe(1);
    expect(SEVERITY_TIERS[NN]).toBe(2);
    // Three distinct tiers over the four quadrants: CH and TC share one.
    expect(new Set(Object.values(SEVERITY_TIERS)).size).toBe(3);
  });

  it('HEP-CORE-008: SEVERITY_ORDER stacks the same four quadrants top-down by tier (#91)', () => {
    expect(SEVERITY_ORDER).toEqual([HL, CH, TC, NN]);
    expect([...SEVERITY_ORDER].sort()).toEqual([...COMPOSITE_QUADRANTS].sort());
    const tiers = SEVERITY_ORDER.map((q) => SEVERITY_TIERS[q]);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });
});

describe('hep-core quadrants — shiftDirection', () => {
  it("HEP-CORE-008: a rise in tier is 'up' and a fall is 'down' (#91)", () => {
    expect(shiftDirection(NN, HL)).toBe('up');
    expect(shiftDirection(CH, HL)).toBe('up');
    expect(shiftDirection(HL, NN)).toBe('down');
    expect(shiftDirection(HL, TC)).toBe('down');
  });

  it("HEP-CORE-008: same-tier and self flows are 'lateral' (#91)", () => {
    expect(shiftDirection(CH, TC)).toBe('lateral');
    expect(shiftDirection(TC, CH)).toBe('lateral');
    COMPOSITE_QUADRANTS.forEach((q) => expect(shiftDirection(q, q)).toBe('lateral'));
  });

  it("HEP-CORE-008: an unknown quadrant degrades to 'lateral' rather than throwing (#91)", () => {
    expect(shiftDirection('Nonsense', HL)).toBe('lateral');
    expect(shiftDirection(HL, undefined)).toBe('lateral');
  });
});

describe('hep-core quadrants — ribbonColor', () => {
  it('HEP-CORE-008: every ribbon fill is the concern colour, for all sixteen pairs (#91)', () => {
    COMPOSITE_QUADRANTS.forEach((pre) =>
      COMPOSITE_QUADRANTS.forEach((post) => {
        expect(ribbonColor(pre, post), `${pre} -> ${post}`).toBe(
          CONCERN_COLORS[concernOf(pre, post)]
        );
      })
    );
    // CONCERN_MATRIX stays the single source of truth, unmodified.
    expect(CONCERN_MATRIX[NN][HL]).toBe('red');
    expect(CONCERN_MATRIX[HL][NN]).toBe('green');
  });

  it('HEP-CORE-008: fill is NOT a function of the vertical travel (#91)', () => {
    // Both pairs have a tier delta of zero; only concernOf tells them apart, so
    // a colour derived from the sign of Δy would collapse them.
    expect(shiftDirection(CH, TC)).toBe(shiftDirection(CH, CH));
    expect(ribbonColor(CH, TC)).toBe(CONCERN_COLORS.yellow);
    expect(ribbonColor(CH, CH)).toBe(CONCERN_COLORS.gray);
    expect(ribbonColor(CH, TC)).not.toBe(ribbonColor(CH, CH));
  });

  it('HEP-CORE-008: an unknown pair falls back to the neutral gray fill (#91)', () => {
    expect(ribbonColor('Nonsense', HL)).toBe(CONCERN_COLORS.gray);
  });
});

describe('hep-core quadrants — the 16-cell correspondence (HEP-MIG-009 invariant)', () => {
  it('HEP-CORE-008: red is up, green is down, yellow and gray are lateral (#91)', () => {
    const tally = { red: [], yellow: [], green: [], gray: [] };
    COMPOSITE_QUADRANTS.forEach((pre) =>
      COMPOSITE_QUADRANTS.forEach((post) => {
        tally[concernOf(pre, post)].push(`${pre} -> ${post}`);
      })
    );

    // The caption's "3 vs 5 types of upward shifts" — 5 unfavourable cells.
    expect(tally.red).toHaveLength(5);
    expect(tally.green).toHaveLength(5);
    expect(tally.yellow).toHaveLength(2);
    expect(tally.gray).toHaveLength(4);

    const directionOf = (label) => {
      const [pre, post] = label.split(' -> ');
      return shiftDirection(pre, post);
    };
    tally.red.forEach((label) => expect(directionOf(label), label).toBe('up'));
    tally.green.forEach((label) => expect(directionOf(label), label).toBe('down'));
    tally.yellow.forEach((label) => expect(directionOf(label), label).toBe('lateral'));
    tally.gray.forEach((label) => expect(directionOf(label), label).toBe('lateral'));

    // The exact cells, spelled out, so the correspondence is readable as a table.
    expect(tally.red.sort()).toEqual(
      [
        `${NN} -> ${CH}`,
        `${NN} -> ${TC}`,
        `${NN} -> ${HL}`,
        `${CH} -> ${HL}`,
        `${TC} -> ${HL}`
      ].sort()
    );
    expect(tally.green.sort()).toEqual(
      [
        `${CH} -> ${NN}`,
        `${TC} -> ${NN}`,
        `${HL} -> ${NN}`,
        `${HL} -> ${CH}`,
        `${HL} -> ${TC}`
      ].sort()
    );
    expect(tally.yellow.sort()).toEqual([`${CH} -> ${TC}`, `${TC} -> ${CH}`].sort());
  });
});
