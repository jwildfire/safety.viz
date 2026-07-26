// Direct manipulation of the Hy's-Law cut-lines for the hep-explorer scatter
// (safety.viz#45, obot.roadmap#88), restoring parity with the original
// RhoInc/hep-explorer: the number inputs stay, but the lines themselves can be
// taken hold of and moved, with the quadrant counts reclassifying under the
// pointer as they go.
//
// The GEOMETRY lives here, pure and canvas-free — which line the pointer is on,
// what value a pixel means — so the rules are pinned by unit tests rather than
// by a screenshot. The wiring (pointer capture, the live reclassification, the
// two-way sync with the Reference Line inputs) belongs to the scatter view,
// which owns the chart and the state.
//
// Requirement group: HEP-QUAD-006.

/**
 * How near a cut-line the pointer must be, in pixels, to take hold of it. Wide
 * enough for a one-pixel dashed line to be a realistic target, narrow enough
 * that clicking a point beside the line still selects the point.
 * @type {number}
 */
export const CUT_GRAB_PX = 6;

/**
 * Round a dragged cutpoint to the precision the Reference Line number inputs
 * carry, so the value the drag writes and the value the input shows are the
 * same number rather than two roundings of it.
 * @param {number} value The raw axis value under the pointer.
 * @returns {number} The rounded cutpoint, or NaN when the input was not finite.
 */
export function roundCut(value) {
  if (!Number.isFinite(value)) return NaN;
  // Scale-then-round, with a nudge past the binary representation of exact
  // halves (2.005 is stored a hair below 2.005), matching what a reader typing
  // the same number into the input would get.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Which cut-line, if either, the pointer has hold of.
 *
 * At the crossing both lines are in reach, and moving both at once is not a
 * gesture anyone means: the nearer line wins, so one drag moves one line.
 * @param {{chartArea: Object, scales: Object}} chart The scatter chart.
 * @param {{xCut: number, yCut: number}} cuts The active cutpoints.
 * @param {number} x The pointer's x position in the canvas's CSS pixels.
 * @param {number} y The pointer's y position in the canvas's CSS pixels.
 * @returns {?string} 'x' for the vertical line, 'y' for the horizontal one, or null.
 */
export function cutHandleAt(chart, cuts, x, y) {
  const { chartArea, scales } = chart || {};
  if (!chartArea || !scales || !scales.x || !scales.y) return null;
  if (x < chartArea.left || x > chartArea.right || y < chartArea.top || y > chartArea.bottom) {
    return null;
  }
  const { xCut, yCut } = cuts || {};
  const dx = Number.isFinite(xCut) ? Math.abs(x - scales.x.getPixelForValue(xCut)) : Infinity;
  const dy = Number.isFinite(yCut) ? Math.abs(y - scales.y.getPixelForValue(yCut)) : Infinity;
  if (dx > CUT_GRAB_PX && dy > CUT_GRAB_PX) return null;
  return dy < dx ? 'y' : 'x';
}

/**
 * The cutpoint a drag to this pixel means: the axis value under the pointer,
 * pinned inside the axis so a line can never be dragged off the plot and lost.
 * The floor is the axis minimum rather than zero, because a log axis has no
 * zero to fall back to.
 * @param {{scales: Object}} chart The scatter chart.
 * @param {string} axis 'x' or 'y'.
 * @param {number} pixel The pointer position along that axis, in CSS pixels.
 * @returns {number} The clamped, rounded cutpoint.
 */
export function cutValueFor(chart, axis, pixel) {
  const scale = chart.scales[axis];
  const raw = scale.getValueForPixel(pixel);
  const floor = Number.isFinite(scale.min) ? Math.max(0, scale.min) : 0;
  const ceiling = Number.isFinite(scale.max) ? scale.max : Infinity;
  return roundCut(Math.min(ceiling, Math.max(floor, raw)));
}
