// Pure geometry for the bidirectional migration Sankey (obot.roadmap#43,
// safety.viz#92) implementing Amirzadegan et al., "Emerging Tools to Support
// DILI Assessment in Clinical Trials with Abnormal Baseline Serum Liver Tests
// or Pre-existing Liver Diseases", Drug Safety 2025;48(5):443-453, Figure 3:
// a Sankey MIRRORED ABOUT A PINNED CENTRE COLUMN that holds every participant's
// BASELINE eDISH quadrant. Placebo flows run left from the centre, active-drug
// flows run right, ribbon thickness is participant count, and nodes stack by
// severity with Hy's Law at the top so an unfavourable shift reads as upward
// travel.
//
// This file is deliberately DOM-free, SVG-free and Chart.js-free: it returns
// numbers and one path string per flow. Every claim the picture makes is
// therefore assertable in a unit test rather than only in a screenshot, and the
// migration view (src/hep-explorer/views/migration.js) is reduced to painting
// what it is handed.
//
// Requirement groups: HEP-MIG-001..009, HEP-MIG-012, HEP-MIG-013, HEP-MIG-016.

import {
  SEVERITY_ORDER,
  SEVERITY_TIERS,
  concernOf,
  ribbonColor,
  shiftDirection
} from '../hep-core/quadrants.js';

/**
 * Fixed internal coordinate width. The svg ships `viewBox="0 0 980 540"` with
 * `width="100%"`, so the geometry never depends on clientWidth and evidence
 * screenshots are stable across viewport jitter.
 * @type {number}
 */
export const SANKEY_WIDTH = 980;

/** Fixed internal coordinate height (see SANKEY_WIDTH). @type {number} */
export const SANKEY_HEIGHT = 540;

/** Node rectangle width, in viewBox units. @type {number} */
export const NODE_W = 18;

/** Vertical padding above the first node and below the last. @type {number} */
export const PAD = 12;

/** Vertical gap between two different severity tiers. @type {number} */
export const TIER_GAP = 26;

/**
 * Vertical gap between the two sub-nodes that share a tier (Cholestasis and
 * Temple's Corollary), smaller than TIER_GAP so the pair reads as one band.
 * @type {number}
 */
export const SUB_GAP = 8;

/** The two Sankey sides, in left-to-right order. @private */
const SIDES = ['placebo', 'active'];

/** Which column a side's on-treatment nodes occupy. @private */
const COLUMN_OF_SIDE = { placebo: 'left', active: 'right' };

/** Which sides a column carries faces for. @private */
const COLUMN_SIDES = { left: ['placebo'], centre: SIDES, right: ['active'] };

/**
 * The gap that follows the node at `index` in SEVERITY_ORDER: TIER_GAP when the
 * next quadrant belongs to a different severity tier, SUB_GAP when it shares
 * this one, and 0 after the last node.
 * @param {number} index Position in SEVERITY_ORDER.
 * @returns {number} The gap in viewBox units.
 * @private
 */
function gapAfter(index) {
  const quadrant = SEVERITY_ORDER[index];
  const next = SEVERITY_ORDER[index + 1];
  if (next === undefined) return 0;
  return SEVERITY_TIERS[next] === SEVERITY_TIERS[quadrant] ? SUB_GAP : TIER_GAP;
}

/**
 * Total vertical space spent on gaps in every column — three severity tiers
 * over four quadrants, so two tier gaps and one sub gap. Subtracted from the
 * height before the shared scale is derived, so all three columns have exactly
 * the same room for participants.
 * @type {number}
 */
export const GAP_TOTAL = SEVERITY_ORDER.reduce((total, _, index) => total + gapAfter(index), 0);

/**
 * The x extents of the three node columns for a given viewBox width: the two
 * on-treatment columns flush against the edges and the baseline column pinned
 * dead centre, so left and right are exact mirror images about width / 2.
 * @param {number} [width=SANKEY_WIDTH] The viewBox width.
 * @returns {{left: number[], centre: number[], right: number[]}} [x0, x1] per column.
 */
export function sankeyColumns(width = SANKEY_WIDTH) {
  const centreX0 = Math.round(width / 2 - NODE_W / 2);
  return {
    left: [0, NODE_W],
    centre: [centreX0, centreX0 + NODE_W],
    right: [width - NODE_W, width]
  };
}

/** A quadrant-keyed tally initialised to zero. @private */
function zeroed() {
  const tally = {};
  SEVERITY_ORDER.forEach((quadrant) => {
    tally[quadrant] = 0;
  });
  return tally;
}

/** An empty {centre, outer} x {placebo, active} x quadrant tally. @private */
function emptyTally() {
  return {
    centre: { placebo: zeroed(), active: zeroed() },
    outer: { placebo: zeroed(), active: zeroed() }
  };
}

/**
 * Normalize the migration cells into a canonical list. Accepts the Map returned
 * by `migrationCells` (key -> cell), a plain array of cells, or an object bag;
 * a cell's count is its `count` when present and its `ids.length` otherwise.
 * Cells naming an unknown side or quadrant, and empty cells, are dropped.
 * @param {?(Map|Array|Object)} cells The migration cells.
 * @returns {Array<{key: string, side: string, pre: string, post: string, count: number, ids: Array}>}
 * @private
 */
function normalizeCells(cells) {
  const list =
    cells instanceof Map
      ? [...cells.values()]
      : Array.isArray(cells)
        ? cells
        : cells && typeof cells === 'object'
          ? Object.values(cells)
          : [];
  const normalized = [];
  list.forEach((cell) => {
    if (!cell || !SIDES.includes(cell.side)) return;
    if (!SEVERITY_ORDER.includes(cell.pre) || !SEVERITY_ORDER.includes(cell.post)) return;
    const ids = Array.isArray(cell.ids) ? cell.ids : [];
    const count = Number.isFinite(cell.count) ? cell.count : ids.length;
    if (!(count > 0)) return;
    normalized.push({
      key: `${cell.side}|${cell.pre}|${cell.post}`,
      side: cell.side,
      pre: cell.pre,
      post: cell.post,
      count,
      ids
    });
  });
  return normalized;
}

/**
 * Derive the per-side baseline (centre) and on-treatment (outer) node counts
 * from the cells themselves. Deriving rather than trusting a second input makes
 * the conservation invariant — the ribbons leaving a face exactly fill it —
 * true by construction.
 * @param {Array} cellList Normalized cells.
 * @returns {Object} The tally.
 * @private
 */
function deriveCounts(cellList) {
  const tally = emptyTally();
  cellList.forEach((cell) => {
    tally.centre[cell.side][cell.pre] += cell.count;
    tally.outer[cell.side][cell.post] += cell.count;
  });
  return tally;
}

/**
 * Read a caller-supplied `counts` bag into the internal tally shape, tolerating
 * both spellings of centre and both names for the on-treatment half. Supplied
 * counts MUST agree with the cells; when they do not, a face over- or
 * under-fills. Omit `counts` to have them derived.
 * @param {Object} counts The caller's counts.
 * @returns {Object} The tally.
 * @private
 */
function normalizeCounts(counts) {
  const tally = emptyTally();
  const centre = counts.centre || counts.center || {};
  const outer = counts.outer || counts.side || {};
  SIDES.forEach((side) => {
    SEVERITY_ORDER.forEach((quadrant) => {
      tally.centre[side][quadrant] = Number(centre[side]?.[quadrant]) || 0;
      tally.outer[side][quadrant] = Number(outer[side]?.[quadrant]) || 0;
    });
  });
  return tally;
}

/**
 * The participant count behind one face of one node: a centre node's face is
 * that arm's baseline count, an on-treatment node's face is that arm's peak
 * count, and a side a column does not carry is 0.
 * @private
 */
function faceCount(tally, column, side, quadrant) {
  if (!COLUMN_SIDES[column].includes(side)) return 0;
  return column === 'centre' ? tally.centre[side][quadrant] : tally.outer[side][quadrant];
}

/**
 * Build all twelve nodes — four quadrants in each of the three columns —
 * stacked in SEVERITY_ORDER from the top down.
 *
 * A centre node is sized by the LARGER of its two arms (HEP-MIG-006) and each
 * face allocates only its own arm's count, centred within that height, so an
 * arm with fewer baseline participants reads as symmetric padding rather than
 * as a silently rescaled node. A quadrant with no participants still holds its
 * slot as a one-pixel stub (HEP-MIG-005), so the four-row grid is geometrically
 * stable as filters change and screenshots stay comparable.
 * @returns {{nodes: Array, tops: Map}} The nodes plus the UNROUNDED face tops,
 *   which the anchor cursors need so rounding error cannot accumulate.
 * @private
 */
function buildNodes(tally, columns, unit) {
  const nodes = [];
  const tops = new Map();

  Object.keys(columns).forEach((column) => {
    const [x0, x1] = columns[column];
    let cursor = PAD;
    SEVERITY_ORDER.forEach((quadrant, index) => {
      const sides = COLUMN_SIDES[column];
      const counts = {
        placebo: faceCount(tally, column, 'placebo', quadrant),
        active: faceCount(tally, column, 'active', quadrant)
      };
      const count = Math.max(...sides.map((side) => counts[side]));
      const height = count * unit;
      const y0 = Math.round(cursor);
      const y1 = Math.max(Math.round(cursor + height), y0 + 1);

      const faces = {};
      sides.forEach((side) => {
        const faceHeight = counts[side] * unit;
        const top = cursor + (height - faceHeight) / 2;
        faces[side] = {
          side,
          // The centre column emits from the face pointing at that arm's
          // column; a flanking column emits from the face pointing inward.
          x: column === 'centre' ? (side === 'placebo' ? x0 : x1) : column === 'left' ? x1 : x0,
          y0: Math.round(top),
          y1: Math.round(top + faceHeight),
          count: counts[side]
        };
        tops.set(`${column}|${quadrant}|${side}`, top);
      });

      nodes.push({
        id: `${column}|${quadrant}`,
        column,
        quadrant,
        tier: SEVERITY_TIERS[quadrant],
        x0,
        x1,
        y0,
        y1,
        height: y1 - y0,
        count,
        counts,
        faces,
        stub: height < 1
      });

      cursor += height + gapAfter(index);
    });
  });

  return { nodes, tops };
}

/**
 * The path for one ribbon. ONE formula serves both directions: k is half the
 * horizontal run and goes NEGATIVE on the placebo side, which mirrors the curve
 * for free. k is truncated toward zero rather than rounded, because truncation
 * is antisymmetric under negation — so the left path is the exact reflection of
 * the right one about the centre of the viewBox, which `Math.round`'s half-up
 * tie-breaking would spoil by a pixel.
 *
 * A self-flow (pre === post) is a straight band rather than a loop
 * (HEP-MIG-012): its two tiers are vertically aligned by construction, so a
 * curve would only add a wobble to a horizontal ribbon.
 * @private
 */
function ribbonPath(xCentre, a0, a1, xOuter, b0, b1, straight) {
  const k = Math.trunc((xOuter - xCentre) * 0.5);
  const c0 = xCentre + k;
  const c1 = xOuter - k;
  if (straight) {
    return `M ${xCentre},${a0} L ${xOuter},${b0} L ${xOuter},${b1} L ${xCentre},${a1} Z`;
  }
  return (
    `M ${xCentre},${a0} C ${c0},${a0} ${c1},${b0} ${xOuter},${b0} ` +
    `L ${xOuter},${b1} C ${c1},${b1} ${c0},${a1} ${xCentre},${a1} Z`
  );
}

/**
 * Lay out the bidirectional migration Sankey (Amirzadegan 2025 Fig 3).
 *
 * ONE SHARED SCALE is used for every node and every ribbon in both arms and all
 * three columns — never a scale per column or per arm. "Does the drug arm have
 * more upward shifts than placebo?" is the entire clinical question the figure
 * exists to answer, so a ribbon's thickness has to mean the same number of
 * participants wherever it is drawn.
 *
 * Anchors are allocated by contiguous slices from independent cursors — two per
 * centre node, one per flanking node — each walking the OPPOSITE endpoint's
 * quadrants in SEVERITY_ORDER. Nothing is sorted by size, so the output is
 * fully deterministic: the same cohort always produces byte-identical path data
 * (HEP-MIG-016), however the rows arrived.
 *
 * @param {Object} [options] The layout inputs.
 * @param {?(Map|Array|Object)} [options.cells] Migration cells from
 *   `migrationCells` — `${side}|${pre}|${post}` -> {side, pre, post, ids}.
 * @param {?Object} [options.counts] Optional explicit node counts,
 *   `{centre: {placebo, active}, outer: {placebo, active}}` keyed by quadrant.
 *   Omit to derive them from the cells, which is what keeps the faces exactly
 *   filled.
 * @param {number} [options.width=980] viewBox width.
 * @param {number} [options.height=540] viewBox height.
 * @param {boolean} [options.hideDiagonal=false] Suppress the no-migration
 *   (pre === post) ribbons. Allocation is unaffected, so every surviving ribbon
 *   and every node keeps identical geometry when the control is toggled
 *   (HEP-MIG-013).
 * @returns {{nodes: Array, ribbons: Array, scale: number}} The twelve nodes, the
 *   ribbons thickest-first, and the shared pixels-per-participant scale.
 */
export function layoutSankey({
  counts = null,
  cells = null,
  width = SANKEY_WIDTH,
  height = SANKEY_HEIGHT,
  hideDiagonal = false
} = {}) {
  const cellList = normalizeCells(cells);
  const byKey = new Map(cellList.map((cell) => [cell.key, cell]));
  const tally = counts ? normalizeCounts(counts) : deriveCounts(cellList);
  const columns = sankeyColumns(width);

  // 3. ONE SHARED SCALE. The centre column is sized by the larger arm in each
  //    quadrant; a flanking column by whichever arm has more participants
  //    overall. Whichever stack is taller sets the unit for everything.
  const centreTotal = SEVERITY_ORDER.reduce(
    (total, quadrant) =>
      total + Math.max(tally.centre.placebo[quadrant], tally.centre.active[quadrant]),
    0
  );
  const sideTotal = Math.max(
    ...SIDES.map((side) =>
      SEVERITY_ORDER.reduce((total, quadrant) => total + tally.outer[side][quadrant], 0)
    )
  );
  const usable = Math.max(0, height - 2 * PAD - GAP_TOTAL);
  const denominator = Math.max(centreTotal, sideTotal);
  const unit = denominator > 0 ? usable / denominator : 0;

  const { nodes, tops } = buildNodes(tally, columns, unit);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // 6. ANCHOR ALLOCATION. One cursor per face, seeded at that face's unrounded
  //    top. The double loop below advances each centre face through the
  //    opposite endpoint's quadrants in SEVERITY_ORDER and, simultaneously,
  //    each flanking face through the baseline quadrants in the same order.
  const cursors = new Map(tops);
  const ribbons = [];

  SIDES.forEach((side) => {
    const outerColumn = COLUMN_OF_SIDE[side];
    SEVERITY_ORDER.forEach((pre) => {
      SEVERITY_ORDER.forEach((post) => {
        const cell = byKey.get(`${side}|${pre}|${post}`);
        if (!cell) return;

        const centreKey = `centre|${pre}|${side}`;
        const outerKey = `${outerColumn}|${post}|${side}`;
        const span = cell.count * unit;
        const centreTop = cursors.get(centreKey);
        const outerTop = cursors.get(outerKey);
        cursors.set(centreKey, centreTop + span);
        cursors.set(outerKey, outerTop + span);

        const centreNode = nodeById.get(`centre|${pre}`);
        const outerNode = nodeById.get(`${outerColumn}|${post}`);
        const xCentre = centreNode.faces[side].x;
        const xOuter = outerNode.faces[side].x;

        // Rounding the running cursor rather than the span keeps the slices
        // contiguous and telescoping: they sum to exactly the face height.
        const a0 = Math.round(centreTop);
        const a1 = Math.max(Math.round(centreTop + span), a0 + 1);
        const b0 = Math.round(outerTop);
        const b1 = Math.max(Math.round(outerTop + span), b0 + 1);
        const diagonal = pre === post;

        if (hideDiagonal && diagonal) return;

        ribbons.push({
          key: cell.key,
          side,
          pre,
          post,
          count: cell.count,
          ids: cell.ids,
          diagonal,
          concern: concernOf(pre, post),
          direction: shiftDirection(pre, post),
          color: ribbonColor(pre, post),
          centreNode: centreNode.id,
          outerNode: outerNode.id,
          centre: { x: xCentre, y0: a0, y1: a1 },
          outer: { x: xOuter, y0: b0, y1: b1 },
          // Both edges are count x unit, but each rounds against its own face's
          // cursor, so they can differ by a pixel. `thickness` reports the
          // on-treatment edge; a conservation check must use the anchor
          // belonging to the face under test.
          thickness: b1 - b0,
          // The control point's x doubles as the horizontal centre of the
          // ribbon, so a pointer test can click the flow without re-deriving
          // the curve.
          centroid: {
            x: xCentre + Math.trunc((xOuter - xCentre) * 0.5),
            y: Math.round((a0 + a1 + b0 + b1) / 4)
          },
          d: ribbonPath(xCentre, a0, a1, xOuter, b0, b1, diagonal)
        });
      });
    });
  });

  // 8. PAINT ORDER: thickest first, so a thin ribbon is drawn last, sits on top
  //    and stays clickable. Array#sort is stable, so ties keep the canonical
  //    (side, pre, post) order the loops above emitted them in.
  ribbons.sort((a, b) => b.count - a.count);

  return { nodes, ribbons, scale: unit };
}
