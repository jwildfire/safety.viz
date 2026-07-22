import { describe, it, expect } from 'vitest';
import { SEVERITY_ORDER, SEVERITY_TIERS, concernOf } from '../../../src/hep-core/quadrants.js';
import {
  GAP_TOTAL,
  NODE_W,
  PAD,
  SANKEY_HEIGHT,
  SANKEY_WIDTH,
  SUB_GAP,
  TIER_GAP,
  layoutSankey,
  sankeyColumns
} from '../../../src/hep-explorer/sankeyLayout.js';

// Pure geometry of the bidirectional migration Sankey (Amirzadegan 2025 Fig 3,
// obot.roadmap#43, safety.viz#92). Nothing in sankeyLayout.js touches the DOM,
// an SVG string or Chart.js, so every claim the picture makes is assertable as
// arithmetic here rather than as pixels in a screenshot.
//
// Requirement groups: HEP-MIG-002..009, HEP-MIG-012, HEP-MIG-013, HEP-MIG-016.

const NN = 'Normal & NN';
const CH = 'Cholestasis';
const TC = "Temple's Corollary";
const HL = "Hy's Law";

const cell = (side, pre, post, count) => ({
  side,
  pre,
  post,
  ids: Array.from({ length: count }, (_, i) => `${side[0]}-${pre[0]}${post[0]}-${i}`)
});

/**
 * An asymmetric two-arm cohort of 24 placebo + 24 active participants covering
 * every concern class: red (NN->TC, NN->HL), green (CH->NN, HL->NN), yellow
 * (CH->TC) and gray (the diagonal).
 */
const COHORT = [
  cell('placebo', NN, NN, 20),
  cell('placebo', NN, TC, 2),
  cell('placebo', CH, NN, 1),
  cell('placebo', HL, HL, 1),
  cell('active', NN, NN, 14),
  cell('active', NN, TC, 4),
  cell('active', NN, HL, 2),
  cell('active', CH, TC, 1),
  cell('active', TC, TC, 2),
  cell('active', HL, NN, 1)
];

/** The same flows on both arms, so left and right must mirror exactly. */
const SYMMETRIC = ['placebo', 'active'].flatMap((side) => [
  cell(side, NN, NN, 10),
  cell(side, NN, HL, 3),
  cell(side, HL, NN, 2),
  cell(side, CH, TC, 1)
]);

const layout = (cells, options) => layoutSankey({ cells, ...options });

const nodeAt = (result, column, quadrant) =>
  result.nodes.find((node) => node.column === column && node.quadrant === quadrant);

const ribbonFor = (result, side, pre, post) =>
  result.ribbons.find((r) => r.side === side && r.pre === pre && r.post === post);

/** Every number in a path string, in order: x, y, x, y, ... */
const coordsOf = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);

const midY = (anchor) => (anchor.y0 + anchor.y1) / 2;

/**
 * A rounded span is within one pixel of its exact value: both of its endpoints
 * were rounded independently, so a whole pixel is the tightest honest bound.
 */
const expectWithinPixel = (actual, exact) =>
  expect(Math.abs(actual - exact)).toBeLessThanOrEqual(1);

describe('sankeyLayout — fixed coordinate system', () => {
  it('HEP-MIG-016: the layout uses a fixed 980x540 viewBox so geometry never depends on clientWidth (#92)', () => {
    expect(SANKEY_WIDTH).toBe(980);
    expect(SANKEY_HEIGHT).toBe(540);
    expect(NODE_W).toBe(18);
    expect(PAD).toBe(12);
    expect(TIER_GAP).toBe(26);
    expect(SUB_GAP).toBe(8);
    // Three severity tiers over four quadrants: two tier gaps and one sub gap.
    expect(GAP_TOTAL).toBe(2 * TIER_GAP + SUB_GAP);
  });

  it('HEP-MIG-001: the three node columns are pinned left, centre and right of the fixed viewBox (#92)', () => {
    expect(sankeyColumns()).toEqual({ left: [0, 18], centre: [481, 499], right: [962, 980] });
    const result = layout(COHORT);
    expect(result.nodes).toHaveLength(3 * SEVERITY_ORDER.length);
    expect(nodeAt(result, 'left', NN).x0).toBe(0);
    expect(nodeAt(result, 'left', NN).x1).toBe(18);
    expect(nodeAt(result, 'centre', NN).x0).toBe(481);
    expect(nodeAt(result, 'centre', NN).x1).toBe(499);
    expect(nodeAt(result, 'right', NN).x0).toBe(962);
    expect(nodeAt(result, 'right', NN).x1).toBe(980);
  });

  it('HEP-MIG-002: placebo ribbons run left of the centre spine and active ribbons run right (#92)', () => {
    const result = layout(COHORT);
    result.ribbons.forEach((ribbon) => {
      expect(ribbon.centre.x).toBe(ribbon.side === 'placebo' ? 481 : 499);
      if (ribbon.side === 'placebo') {
        expect(ribbon.outer.x).toBe(18);
        expect(ribbon.outer.x).toBeLessThan(ribbon.centre.x);
      } else {
        expect(ribbon.outer.x).toBe(962);
        expect(ribbon.outer.x).toBeGreaterThan(ribbon.centre.x);
      }
    });
  });
});

describe('sankeyLayout — node stacking', () => {
  it("HEP-MIG-003: node stacking places Hy's Law at the top of every column (#92)", () => {
    const result = layout(COHORT);
    ['left', 'centre', 'right'].forEach((column) => {
      const stacked = SEVERITY_ORDER.map((quadrant) => nodeAt(result, column, quadrant));
      expect(stacked.map((node) => node.quadrant)).toEqual(SEVERITY_ORDER);
      // Hy's Law is strictly the topmost node of this column.
      stacked.slice(1).forEach((node) => {
        expect(stacked[0].y0).toBeLessThan(node.y0);
      });
      // and the stack descends monotonically in severity order.
      stacked.slice(1).forEach((node, index) => {
        expect(node.y0).toBeGreaterThanOrEqual(stacked[index].y1);
      });
      expect(stacked[0].y0).toBe(PAD);
    });
  });

  it('HEP-MIG-004: Cholestasis and Temple’s Corollary share one tier, separated by the sub gap (#92)', () => {
    const result = layout(COHORT);
    const [hl, ch, tc, nn] = SEVERITY_ORDER.map((q) => nodeAt(result, 'centre', q));
    expect([hl.tier, ch.tier, tc.tier, nn.tier]).toEqual([0, 1, 1, 2]);
    expect(SEVERITY_TIERS[CH]).toBe(SEVERITY_TIERS[TC]);
    expect(ch.y0 - hl.y1).toBe(TIER_GAP);
    expect(tc.y0 - ch.y1).toBe(SUB_GAP);
    expect(nn.y0 - tc.y1).toBe(TIER_GAP);
  });

  it('HEP-MIG-005: node height is the count times the one shared pixels-per-participant scale (#92)', () => {
    const result = layout(COHORT);
    result.nodes
      .filter((node) => !node.stub)
      .forEach((node) => {
        expectWithinPixel(node.height, node.count * result.scale);
      });
    // The whole stack fills exactly the usable height on its tallest column.
    const usable = SANKEY_HEIGHT - 2 * PAD - GAP_TOTAL;
    const centreTotal = SEVERITY_ORDER.reduce(
      (sum, q) => sum + nodeAt(result, 'centre', q).count,
      0
    );
    expect(centreTotal * result.scale).toBeCloseTo(usable, 6);
  });

  it('HEP-MIG-005: a zero-count quadrant still renders as a one-pixel stub so the grid stays stable (#92)', () => {
    const result = layout(COHORT);
    const emptyLeft = nodeAt(result, 'left', CH);
    expect(emptyLeft.count).toBe(0);
    expect(emptyLeft.stub).toBe(true);
    expect(emptyLeft.height).toBe(1);
    // and it holds its slot: the four-row grid is still four rows.
    const rows = ['left', 'centre', 'right'].map(
      (column) => SEVERITY_ORDER.filter((q) => nodeAt(result, column, q)).length
    );
    expect(rows).toEqual([4, 4, 4]);
  });

  it('HEP-MIG-006: a centre node is sized by its larger arm, each face allocating its own arm centred (#92)', () => {
    const result = layout(COHORT);
    const nn = nodeAt(result, 'centre', NN);
    expect(nn.counts).toEqual({ placebo: 22, active: 20 });
    expect(nn.count).toBe(22);
    expectWithinPixel(nn.height, 22 * result.scale);
    expectWithinPixel(nn.faces.placebo.y1 - nn.faces.placebo.y0, 22 * result.scale);
    expectWithinPixel(nn.faces.active.y1 - nn.faces.active.y0, 20 * result.scale);
    // The shortfall reads as symmetric padding on the smaller arm's face.
    const above = nn.faces.active.y0 - nn.y0;
    const below = nn.y1 - nn.faces.active.y1;
    expect(above).toBeGreaterThan(0);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    // The larger arm's face fills the node outright.
    expect(nn.faces.placebo.y0).toBe(nn.y0);
    // Faces sit on the outward-facing edge of the spine.
    expect(nn.faces.placebo.x).toBe(nn.x0);
    expect(nn.faces.active.x).toBe(nn.x1);
  });
});

describe('sankeyLayout — ribbons', () => {
  it('HEP-MIG-007: ribbon thickness is the count on the same shared scale as node heights (#92)', () => {
    const result = layout(COHORT);
    expect(result.ribbons.length).toBe(COHORT.length);
    result.ribbons.forEach((ribbon) => {
      expectWithinPixel(ribbon.thickness, ribbon.count * result.scale);
      expect(ribbon.outer.y1 - ribbon.outer.y0).toBe(ribbon.thickness);
      // Both endpoints are drawn on the same scale; only the rounding differs.
      expectWithinPixel(ribbon.centre.y1 - ribbon.centre.y0, ribbon.count * result.scale);
    });
  });

  it('HEP-MIG-007: exactly one pixels-per-participant scale is used for every ribbon in the output (#92)', () => {
    const doubled = COHORT.map((c) =>
      c.side === 'active' ? cell(c.side, c.pre, c.post, c.ids.length * 2) : c
    );
    const result = layout(doubled);
    // One unit, derived once: every ribbon is count x scale, whatever its arm.
    result.ribbons.forEach((ribbon) => {
      expectWithinPixel(ribbon.thickness, ribbon.count * result.scale);
    });
    // and no arm or column carries a scale of its own.
    const placebo = result.ribbons.filter((r) => r.side === 'placebo');
    const active = result.ribbons.filter((r) => r.side === 'active');
    const perPerson = (list) =>
      list.reduce((sum, r) => sum + r.thickness, 0) / list.reduce((sum, r) => sum + r.count, 0);
    expectWithinPixel(perPerson(placebo), perPerson(active));
  });

  it('HEP-MIG-007: ribbons are emitted thickest first so thin ribbons paint on top and stay clickable (#92)', () => {
    const result = layout(COHORT);
    const counts = result.ribbons.map((ribbon) => ribbon.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBe(20);
    expect(counts[counts.length - 1]).toBe(1);
  });

  it('HEP-MIG-008: ribbon colour comes from concernOf and never from the vertical travel (#92)', () => {
    const result = layout(COHORT);
    result.ribbons.forEach((ribbon) => {
      expect(ribbon.concern).toBe(concernOf(ribbon.pre, ribbon.post));
      expect(ribbon.color).toMatch(/^#[0-9a-f]{6}$/);
    });
    // The two yellow CH<->TC flows travel vertically but stay yellow.
    const lateral = ribbonFor(result, 'active', CH, TC);
    expect(lateral.concern).toBe('yellow');
    expect(lateral.direction).toBe('lateral');
  });

  it('HEP-MIG-009: every red ribbon ends above where it starts and every green ribbon below (#92)', () => {
    const result = layout(COHORT);
    const seen = new Set();
    result.ribbons.forEach((ribbon) => {
      seen.add(ribbon.concern);
      const from = midY(ribbon.centre);
      const to = midY(ribbon.outer);
      if (ribbon.concern === 'red') {
        expect(ribbon.direction).toBe('up');
        expect(to).toBeLessThan(from);
      } else if (ribbon.concern === 'green') {
        expect(ribbon.direction).toBe('down');
        expect(to).toBeGreaterThan(from);
      } else {
        // yellow and gray never cross a tier boundary.
        expect(ribbon.direction).toBe('lateral');
        expect(SEVERITY_TIERS[ribbon.pre]).toBe(SEVERITY_TIERS[ribbon.post]);
      }
    });
    expect([...seen].sort()).toEqual(['gray', 'green', 'red', 'yellow']);
  });

  it('HEP-MIG-012: a diagonal flow renders as a straight band rather than a curved loop (#92)', () => {
    const result = layout(COHORT);
    const self = ribbonFor(result, 'placebo', NN, NN);
    expect(self.diagonal).toBe(true);
    expect(self.d).not.toContain('C');
    expect(self.d.startsWith('M ')).toBe(true);
    // Same baseline and on-treatment tier: the band runs horizontally.
    const shifted = ribbonFor(result, 'placebo', NN, TC);
    expect(shifted.diagonal).toBe(false);
    expect(shifted.d).toContain('C');
    // The Hy's Law self-flow is exactly horizontal when both arms match there.
    const hl = ribbonFor(result, 'placebo', HL, HL);
    expect(hl.centre.y0).toBe(hl.outer.y0);
    expect(hl.centre.y1).toBe(hl.outer.y1);
  });

  it('HEP-MIG-013: hiding unchanged flows drops the diagonals and moves nothing else (#92)', () => {
    const shown = layout(COHORT);
    const hidden = layout(COHORT, { hideDiagonal: true });
    expect(hidden.ribbons.every((ribbon) => !ribbon.diagonal)).toBe(true);
    expect(hidden.ribbons).toHaveLength(shown.ribbons.filter((r) => !r.diagonal).length);
    // Nodes and the surviving ribbons keep byte-identical geometry.
    expect(hidden.nodes).toEqual(shown.nodes);
    expect(hidden.scale).toBe(shown.scale);
    hidden.ribbons.forEach((ribbon) => {
      expect(ribbon.d).toBe(ribbonFor(shown, ribbon.side, ribbon.pre, ribbon.post).d);
    });
  });
});

describe('sankeyLayout — the invariants that catch allocation bugs', () => {
  it('HEP-MIG-016: repeated layouts of the same cohort produce byte-identical path data (#92)', () => {
    const first = layout(COHORT);
    const second = layout([...COHORT].reverse());
    expect(second.ribbons.map((r) => r.d)).toEqual(first.ribbons.map((r) => r.d));
    expect(second.nodes).toEqual(first.nodes);
    expect(second.scale).toBe(first.scale);
  });

  it('HEP-MIG-016: every coordinate is integer-rounded before it lands in the path string (#92)', () => {
    const result = layout(COHORT);
    result.ribbons.forEach((ribbon) => {
      expect(ribbon.d).toMatch(/^[MCLZ0-9,.\s-]+$/);
      coordsOf(ribbon.d).forEach((value) => expect(Number.isInteger(value)).toBe(true));
      [ribbon.centre, ribbon.outer].forEach((anchor) => {
        expect(Number.isInteger(anchor.x)).toBe(true);
        expect(Number.isInteger(anchor.y0)).toBe(true);
        expect(Number.isInteger(anchor.y1)).toBe(true);
      });
      expect(Number.isInteger(ribbon.centroid.x)).toBe(true);
      expect(Number.isInteger(ribbon.centroid.y)).toBe(true);
    });
    result.nodes.forEach((node) => {
      [node.x0, node.x1, node.y0, node.y1].forEach((value) =>
        expect(Number.isInteger(value)).toBe(true)
      );
      Object.values(node.faces).forEach((face) => {
        expect(Number.isInteger(face.x)).toBe(true);
        expect(Number.isInteger(face.y0)).toBe(true);
        expect(Number.isInteger(face.y1)).toBe(true);
      });
    });
  });

  it('HEP-MIG-006: the ribbons leaving a node face exactly fill that face (conservation) (#92)', () => {
    const result = layout(COHORT);
    result.nodes.forEach((node) => {
      Object.entries(node.faces).forEach(([side, face]) => {
        const attached = result.ribbons.filter((ribbon) =>
          node.column === 'centre'
            ? ribbon.centreNode === node.id && ribbon.side === side
            : ribbon.outerNode === node.id
        );
        // Measured at THIS face's anchors: a ribbon's two endpoints round
        // independently, so only the near edge belongs to this face's budget.
        const anchors = attached
          .map((ribbon) => (node.column === 'centre' ? ribbon.centre : ribbon.outer))
          .sort((a, b) => a.y0 - b.y0);
        const allocated = anchors.reduce((sum, anchor) => sum + (anchor.y1 - anchor.y0), 0);
        expect(allocated).toBe(face.y1 - face.y0);
        // and the slices are contiguous, in the opposite endpoint's severity order.
        anchors.forEach((anchor, index) => {
          if (index === 0) expect(anchor.y0).toBe(face.y0);
          else expect(anchor.y0).toBe(anchors[index - 1].y1);
        });
      });
    });
  });

  it('HEP-MIG-002: a symmetric cohort produces left and right geometry that mirror about x=490 (#92)', () => {
    const result = layout(SYMMETRIC);
    const mirror = (x) => SANKEY_WIDTH - x;

    SEVERITY_ORDER.forEach((quadrant) => {
      const left = nodeAt(result, 'left', quadrant);
      const right = nodeAt(result, 'right', quadrant);
      expect(mirror(right.x1)).toBe(left.x0);
      expect(mirror(right.x0)).toBe(left.x1);
      expect(right.y0).toBe(left.y0);
      expect(right.y1).toBe(left.y1);

      const centre = nodeAt(result, 'centre', quadrant);
      expect(centre.faces.placebo.y0).toBe(centre.faces.active.y0);
      expect(centre.faces.placebo.y1).toBe(centre.faces.active.y1);
      expect(mirror(centre.faces.active.x)).toBe(centre.faces.placebo.x);
    });

    [
      [NN, NN],
      [NN, HL],
      [HL, NN],
      [CH, TC]
    ].forEach(([pre, post]) => {
      const left = ribbonFor(result, 'placebo', pre, post);
      const right = ribbonFor(result, 'active', pre, post);
      const leftCoords = coordsOf(left.d);
      const rightCoords = coordsOf(right.d);
      expect(rightCoords).toHaveLength(leftCoords.length);
      leftCoords.forEach((value, index) => {
        // even indices are x, odd are y
        expect(rightCoords[index]).toBe(index % 2 === 0 ? mirror(value) : value);
      });
      expect(right.thickness).toBe(left.thickness);
      expect(mirror(right.centroid.x)).toBe(left.centroid.x);
      expect(right.centroid.y).toBe(left.centroid.y);
    });
  });
});

describe('sankeyLayout — degenerate input', () => {
  it('HEP-MIG-005: an empty cohort still lays out the full four-row grid as stubs (#92)', () => {
    const result = layoutSankey({ cells: new Map() });
    expect(result.nodes).toHaveLength(12);
    expect(result.ribbons).toEqual([]);
    expect(result.scale).toBe(0);
    result.nodes.forEach((node) => {
      expect(node.stub).toBe(true);
      expect(node.height).toBe(1);
    });
  });

  it('HEP-MIG-016: cells supplied as a Map, an array or explicit counts lay out identically (#92)', () => {
    const asArray = layout(COHORT);
    const asMap = layoutSankey({
      cells: new Map(COHORT.map((c) => [`${c.side}|${c.pre}|${c.post}`, c]))
    });
    const withCounts = layoutSankey({
      cells: COHORT,
      counts: {
        centre: {
          placebo: { [NN]: 22, [CH]: 1, [TC]: 0, [HL]: 1 },
          active: { [NN]: 20, [CH]: 1, [TC]: 2, [HL]: 1 }
        },
        outer: {
          placebo: { [NN]: 21, [CH]: 0, [TC]: 2, [HL]: 1 },
          active: { [NN]: 15, [CH]: 0, [TC]: 7, [HL]: 2 }
        }
      }
    });
    expect(asMap.nodes).toEqual(asArray.nodes);
    expect(asMap.ribbons.map((r) => r.d)).toEqual(asArray.ribbons.map((r) => r.d));
    expect(withCounts.nodes).toEqual(asArray.nodes);
    expect(withCounts.ribbons.map((r) => r.d)).toEqual(asArray.ribbons.map((r) => r.d));
  });

  it('HEP-MIG-001: each ribbon carries its cell key, participants and endpoint node ids (#92)', () => {
    const result = layout(COHORT);
    const ribbon = ribbonFor(result, 'active', NN, HL);
    expect(ribbon.key).toBe(`active|${NN}|${HL}`);
    expect(ribbon.count).toBe(2);
    expect(ribbon.ids).toHaveLength(2);
    expect(ribbon.centreNode).toBe(`centre|${NN}`);
    expect(ribbon.outerNode).toBe(`right|${HL}`);
    expect(nodeAt(result, 'centre', NN).id).toBe(`centre|${NN}`);
  });
});
