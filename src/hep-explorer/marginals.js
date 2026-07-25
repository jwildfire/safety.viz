// Marginal box plots and axis rugs for the eDISH/mDISH scatter
// (safety.viz#47, obot.roadmap#88), restoring parity with the original
// RhoInc/hep-explorer.
//
// The scatter answers "where does this participant sit against the Hy's-Law
// cut-lines?". It does NOT answer "what does this measure's distribution look
// like?" — a cloud of overlapping points hides its own centre and spread. The
// original draws a one-dimensional summary of each axis beside the cloud: a box
// plot in the margin, and a rug of one tick per participant along the axis, so
// the ties and the pile-ups the cloud conceals stay visible.
//
// Statistics come from the shared R-7 `boxStats`, so the marginals, the
// waterfall's flanking panels and results-over-time cannot disagree about what
// a quartile is. The drawing is deliberately its own routine rather than the
// shared drawBoxWhisker: these boxes are horizontal in the top margin and sit
// OUTSIDE the plot area, which is not the shape that renderer draws, and its
// pixels are pinned by results-over-time's evidence baselines.
//
// Requirement group: HEP-MARG-*.

import { boxStats } from '../hep-core/stats.js';

/** The Marginal distributions control's options, in menu order. */
export const MARGINAL_MODES = [
  { value: 'box_rug', label: 'Box plots and rugs' },
  { value: 'box', label: 'Box plots' },
  { value: 'rug', label: 'Rugs' },
  { value: 'none', label: 'Hidden' }
];

/** Pixels reserved outside the plot for a marginal box. @type {number} */
export const MARGIN_STRIP = 30;

/** How long a rug tick is, in pixels. @private */
const RUG_LENGTH = 9;

/** The marginal ink: dark enough to read, quiet enough not to compete. @private */
const MARGINAL_COLOR = 'rgba(71, 85, 105, 0.85)';
const MARGINAL_FILL = 'rgba(71, 85, 105, 0.18)';
const RUG_COLOR = 'rgba(51, 65, 85, 0.7)';

/**
 * Whether a mode draws the marginal boxes. An unrecognized mode draws the
 * default pair rather than silently drawing nothing.
 * @param {string} mode The marginal mode.
 * @returns {boolean} True when boxes are drawn.
 */
export function showsBoxes(mode) {
  return mode !== 'rug' && mode !== 'none';
}

/**
 * Whether a mode draws the axis rugs.
 * @param {string} mode The marginal mode.
 * @returns {boolean} True when rugs are drawn.
 */
export function showsRug(mode) {
  return mode !== 'box' && mode !== 'none';
}

/**
 * The scatter's layout padding for a marginal mode (HEP-MARG-001): a strip
 * above and to the right of the plot when boxes are drawn, and the plain
 * six-pixel breathing room otherwise. Rugs live INSIDE the plot, so they cost
 * no margin at all.
 * @param {string} mode The marginal mode.
 * @returns {{top: number, right: number, bottom: number, left: number}} The padding.
 */
export function scatterPadding(mode) {
  const strip = showsBoxes(mode) ? MARGIN_STRIP : 6;
  return { top: strip, right: strip, bottom: 6, left: 6 };
}

/**
 * Box statistics for both axes of the SHOWN points (HEP-MARG-001) — the points
 * the filters left, not the whole cohort, so the marginals summarize what the
 * reader is looking at.
 * @param {Array<{x: number, y: number}>} points The plotted points.
 * @returns {{x: Object, y: Object}} The per-axis statistics.
 */
export function marginalSummary(points) {
  const rows = points || [];
  return {
    x: boxStats(rows.map((point) => point.x)),
    y: boxStats(rows.map((point) => point.y))
  };
}

/** Draw one box-and-whisker along an axis, in the strip outside the plot. @private */
function drawMarginalBox(ctx, stats, project, { across, thickness, horizontal }) {
  if (!stats || !stats.n) return;
  const centre = across + thickness / 2;
  const q1 = project(stats.q25);
  const q3 = project(stats.q75);
  const low = project(stats.q5);
  const high = project(stats.q95);
  const median = project(stats.median);
  const near = Math.min(q1, q3);
  const span = Math.abs(q3 - q1);

  ctx.strokeStyle = MARGINAL_COLOR;
  ctx.fillStyle = MARGINAL_FILL;
  ctx.lineWidth = 1;

  // Whisker: 5th to 95th percentile, with caps.
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(low, centre);
    ctx.lineTo(high, centre);
    ctx.moveTo(low, across + 2);
    ctx.lineTo(low, across + thickness - 2);
    ctx.moveTo(high, across + 2);
    ctx.lineTo(high, across + thickness - 2);
  } else {
    ctx.moveTo(centre, low);
    ctx.lineTo(centre, high);
    ctx.moveTo(across + 2, low);
    ctx.lineTo(across + thickness - 2, low);
    ctx.moveTo(across + 2, high);
    ctx.lineTo(across + thickness - 2, high);
  }
  ctx.stroke();

  // Box: Q1 to Q3, with the median rule across it.
  if (horizontal) {
    ctx.fillRect(near, across, span, thickness);
    ctx.strokeRect(near, across, span, thickness);
    ctx.beginPath();
    ctx.moveTo(median, across);
    ctx.lineTo(median, across + thickness);
  } else {
    ctx.fillRect(across, near, thickness, span);
    ctx.strokeRect(across, near, thickness, span);
    ctx.beginPath();
    ctx.moveTo(across, median);
    ctx.lineTo(across + thickness, median);
  }
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** Draw one tick per point along an axis, just inside the plot. @private */
function drawRug(ctx, values, project, { from, length, horizontal }) {
  ctx.strokeStyle = RUG_COLOR;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    const at = project(value);
    if (horizontal) {
      ctx.moveTo(at, from);
      ctx.lineTo(at, from - length);
    } else {
      ctx.moveTo(from, at);
      ctx.lineTo(from + length, at);
    }
  });
  ctx.stroke();
}

/**
 * The marginal-distribution plugin (HEP-MARG-001, HEP-MARG-002): a horizontal
 * box for the x measure in the top strip, a vertical box for the y measure in
 * the right strip, and a rug of one tick per shown participant along the bottom
 * and left edges inside the plot.
 *
 * Drawn AFTER the datasets so the rug reads over the grid rather than under it,
 * and the geometry is stashed on the chart as numbers — the `$hepQuadrants`
 * convention — so browser evidence asserts statistics rather than pixels.
 * @param {Object} instance The live renderer, whose `points` and `state` the plugin reads.
 * @returns {Object} A Chart.js plugin object.
 */
export function marginalPlugin(instance) {
  return {
    id: `hep-marginals-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      chart.$hepMarginals = null;
      const mode = (instance.state || {}).marginals;
      const points = instance.points || [];
      if (mode === 'none' || !points.length) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;

      const summary = marginalSummary(points);
      chart.$hepMarginals = {
        mode: mode || 'box_rug',
        x: summary.x,
        y: summary.y,
        rug: points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).length
      };

      ctx.save();
      if (showsBoxes(mode)) {
        const thickness = MARGIN_STRIP - 14;
        drawMarginalBox(ctx, summary.x, (value) => scales.x.getPixelForValue(value), {
          across: chartArea.top - MARGIN_STRIP + 4,
          thickness,
          horizontal: true
        });
        drawMarginalBox(ctx, summary.y, (value) => scales.y.getPixelForValue(value), {
          across: chartArea.right + 10,
          thickness,
          horizontal: false
        });
      }
      if (showsRug(mode)) {
        drawRug(
          ctx,
          points.map((point) => point.x),
          (value) => scales.x.getPixelForValue(value),
          {
            from: chartArea.bottom,
            length: RUG_LENGTH,
            horizontal: true
          }
        );
        drawRug(
          ctx,
          points.map((point) => point.y),
          (value) => scales.y.getPixelForValue(value),
          {
            from: chartArea.left,
            length: RUG_LENGTH,
            horizontal: false
          }
        );
      }
      ctx.restore();
    }
  };
}
