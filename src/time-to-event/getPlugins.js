// Plugins and pure geometry for the time-to-event module (#128): the step-curve
// vertices, the pointwise-CI band, the censor marks' data, the in-canvas at-risk /
// cumulative-events table (design D4), and the tooltip text. Pure helpers are
// unit-tested; the canvas plugins are browser-tested and record what they draw on
// chart.$tteBand / chart.$tteRiskTable so tests can assert against the geometry
// (the hep-explorer $hepQuadrants pattern).

import { bandValues, displayValue, formatPercent1 } from './getScales.js';

/**
 * Categorical palette for color-by-group. The hues are the house arm palette
 * (hep/outlier/qt explorers) REORDERED so adjacent pairs pass the colorblind
 * separation check: the shared ordering puts red (#e31a1c) beside green
 * (#33a02c), a deutan ΔE of 3 — indistinguishable. This order was validated
 * (OKLab CVD simulation, 2026-08-15) to pass all adjacency checks through six
 * slots; beyond six the palette cycles, which a six-arm safety display should
 * never reach. Dash patterns below are the secondary, non-color encoding.
 */
export const GROUP_COLORS = ['#1f78b4', '#e31a1c', '#ff7f00', '#6a3d9a', '#33a02c', '#c2185b'];

/**
 * Per-group line dash patterns — the survival-plot print convention doubling as
 * the non-color identity channel (colorblind readers, monochrome print). Solid
 * first; every later slot distinct.
 */
export const GROUP_DASHES = [[], [6, 4], [2, 3], [8, 3, 2, 3], [4, 4], [10, 4]];

/**
 * The style for the group at a fixed index — identity, never rank: filters and
 * legend toggles must not repaint surviving groups.
 * @param {number} index The group's index in data order.
 * @returns {{color: string, dash: number[]}} Line color and dash pattern.
 */
export function groupStyle(index) {
  return {
    color: GROUP_COLORS[index % GROUP_COLORS.length],
    dash: GROUP_DASHES[index % GROUP_DASHES.length]
  };
}

/**
 * Convert a #rrggbb hex color to an rgba() string at the given opacity.
 * @param {string} hex `#rrggbb`.
 * @param {number} alpha Opacity in [0, 1].
 * @returns {string} `rgba(r, g, b, alpha)`.
 */
export function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The step-curve vertices for one group: (0, origin), one vertex per event step,
 * and a terminal vertex extending the curve flat to the group's largest observed
 * time when that is a censoring. Rendered with Chart.js `stepped: 'after'`, the
 * only correct KM interpolation — the value holds until the next event.
 * @param {Object} estimate A km.js estimate.
 * @param {string} direction `incidence` or `survival`.
 * @returns {Array<{x: number, y: number, kind: string, point: ?Object}>} The vertices.
 */
export function curveVertices(estimate, direction) {
  const vertices = [{ x: 0, y: displayValue(1, direction), kind: 'origin', point: null }];
  for (const point of estimate.points)
    vertices.push({ x: point.time, y: displayValue(point.surv, direction), kind: 'event', point });
  const last = estimate.points[estimate.points.length - 1];
  const lastY = last ? displayValue(last.surv, direction) : displayValue(1, direction);
  if (estimate.maxTime > (last ? last.time : 0))
    vertices.push({ x: estimate.maxTime, y: lastY, kind: 'terminal', point: null });
  return vertices;
}

/**
 * The pointwise-CI band as step rectangles: one per inter-event interval where
 * the interval is defined, the last extending to the curve end. A step
 * function's band is exactly a union of axis-aligned rectangles, so drawing
 * rectangles is exact — no diagonal joins to mislead. Undefined bounds produce
 * no rectangle (design §3.2): the band visibly gaps rather than extrapolating.
 * @param {Object} estimate A km.js estimate.
 * @param {string} direction `incidence` or `survival`.
 * @returns {Array<{x0: number, x1: number, lo: number, hi: number}>} The rectangles.
 */
export function bandRects(estimate, direction) {
  const rects = [];
  const points = estimate.points;
  for (let i = 0; i < points.length; i += 1) {
    const { lo, hi } = bandValues(points[i], direction);
    if (lo == null || hi == null) continue;
    const x1 =
      i + 1 < points.length ? points[i + 1].time : Math.max(estimate.maxTime, points[i].time);
    rects.push({ x0: points[i].time, x1, lo, hi });
  }
  return rects;
}

/**
 * The two strip-table row groups the FDA ST&F guide mandates beneath every
 * time-to-event plot: number at risk and cumulative events, per group at each
 * axis tick — read from the same km.js pass that drew the curves (TTE-RISK-001).
 * @param {Array<{name: string, estimate: Object}>} groups The structured groups.
 * @param {number[]} ticks The time-axis tick values.
 * @returns {Array<{label: string, groups: Array<{name: string, counts: number[]}>}>}
 *   The two strips, in display order.
 */
export function riskRows(groups, ticks) {
  const tables = groups.map((group) => ({
    name: group.name,
    rows: group.estimate.riskTableAt(ticks)
  }));
  return [
    {
      label: 'No. at risk',
      groups: tables.map((table) => ({
        name: table.name,
        counts: table.rows.map((row) => row.atRisk)
      }))
    },
    {
      label: 'Cumulative events',
      groups: tables.map((table) => ({
        name: table.name,
        counts: table.rows.map((row) => row.cumEvents)
      }))
    }
  ];
}

/** Vertical metrics for the in-canvas risk table. @private */
const RISK_HEADER_PX = 16;
const RISK_ROW_PX = 14;
const RISK_STRIP_GAP_PX = 6;
const RISK_TOP_GAP_PX = 46; // clears the x-axis tick labels and title

/**
 * The bottom padding the chart reserves for the risk table.
 * @param {number} groupCount Number of visible groups.
 * @returns {number} Height in pixels.
 */
export function riskTableHeight(groupCount) {
  const strip = RISK_HEADER_PX + groupCount * RISK_ROW_PX;
  return RISK_TOP_GAP_PX + 2 * strip + RISK_STRIP_GAP_PX;
}

/**
 * Tooltip lines for an event step (TTE-USER-005): the day, the group, the
 * display value with its pointwise interval, and the step's arithmetic.
 * @param {Object} point A km.js point.
 * @param {{groupName: string, direction: string, timeUnit: string}} context Display context.
 * @returns {string[]} Tooltip lines.
 */
export function pointTooltip(point, { groupName, direction, timeUnit }) {
  const unit = timeUnit.charAt(0).toUpperCase() + timeUnit.slice(1);
  const value = displayValue(point.surv, direction);
  const { lo, hi } = bandValues(point, direction);
  const lines = [
    `${unit} ${point.time} — ${groupName}`,
    `${direction === 'incidence' ? 'Cumulative incidence (1 − KM)' : 'Event-free probability (KM)'}: ${formatPercent1(value)}`
  ];
  if (lo != null && hi != null)
    lines.push(`Pointwise 95% CI: ${formatPercent1(lo)} – ${formatPercent1(hi)}`);
  lines.push(
    `${point.events} event${point.events === 1 ? '' : 's'} of ${point.atRisk} at risk` +
      (point.censored ? `; ${point.censored} censored here` : '')
  );
  return lines;
}

/**
 * Tooltip lines for a censor mark (TTE-USER-006): the day, the count, and the
 * censoring reasons when the data carries them.
 * @param {Object} mark A km.js censorTimes entry.
 * @param {{groupName: string, timeUnit: string, censorDescs: string[]}} context Display context.
 * @returns {string[]} Tooltip lines.
 */
export function censorTooltip(mark, { groupName, timeUnit, censorDescs }) {
  const unit = timeUnit.charAt(0).toUpperCase() + timeUnit.slice(1);
  const lines = [
    `${unit} ${mark.time} — ${groupName}`,
    `${mark.count} participant${mark.count === 1 ? '' : 's'} censored`
  ];
  const reasons = [...new Set((censorDescs || []).filter(Boolean))];
  if (reasons.length) lines.push(reasons.join('; '));
  return lines;
}

/**
 * The CI-band canvas plugin: fills each visible group's band rectangles at low
 * opacity before the curves draw. Reads chart.$tteGroups (set by the module)
 * and records what it drew on chart.$tteBand for tests.
 * @returns {Object} A Chart.js plugin.
 */
export function ciBandPlugin() {
  return {
    id: 'tteCiBand',
    beforeDatasetsDraw(chart) {
      const groups = chart.$tteGroups || [];
      const { ctx, chartArea } = chart;
      const drawn = [];
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        chartArea.left,
        chartArea.top,
        chartArea.right - chartArea.left,
        chartArea.bottom - chartArea.top
      );
      ctx.clip();
      for (const group of groups) {
        if (!group.ci || !chart.isDatasetVisible(group.curveIndex)) continue;
        ctx.fillStyle = hexToRgba(group.color, 0.14);
        for (const rect of group.bandRects) {
          const x0 = chart.scales.x.getPixelForValue(rect.x0);
          const x1 = chart.scales.x.getPixelForValue(rect.x1);
          const yLo = chart.scales.y.getPixelForValue(rect.lo);
          const yHi = chart.scales.y.getPixelForValue(rect.hi);
          ctx.fillRect(x0, yHi, x1 - x0, yLo - yHi);
          drawn.push({ group: group.name, ...rect });
        }
      }
      ctx.restore();
      chart.$tteBand = drawn;
    }
  };
}

/**
 * The in-canvas risk-table plugin (design D4): draws the "No. at risk" and
 * "Cumulative events" strips beneath the time axis, each count centered on its
 * tick's pixel via the live scale — aligned by construction, from the same
 * estimator pass as the curves. Hidden groups (legend toggles) drop their rows.
 * Records the drawn numbers on chart.$tteRiskTable for tests.
 * @param {{ticks: () => number[]}} context Supplies the current axis ticks.
 * @returns {Object} A Chart.js plugin.
 */
export function riskTablePlugin(context) {
  return {
    id: 'tteRiskTable',
    afterDraw(chart) {
      const allGroups = chart.$tteGroups || [];
      const groups = allGroups.filter((group) => chart.isDatasetVisible(group.curveIndex));
      if (!groups.length) {
        chart.$tteRiskTable = [];
        return;
      }
      const ticks = context.ticks();
      const strips = riskRows(
        groups.map((group) => ({ name: group.name, estimate: group.estimate })),
        ticks
      );
      const { ctx, chartArea } = chart;
      const xScale = chart.scales.x;
      // Anchor the strips to the reserved padding at the canvas BOTTOM, not to
      // chartArea.bottom: the axis tick labels and title render between the two,
      // and anchoring from the top of that region draws the strips through the
      // axis title. riskTableHeight() reserves the strips' height plus the
      // clearance, so bottom-anchoring keeps both intact at any axis depth.
      const stripHeight = RISK_HEADER_PX + strips[0].groups.length * RISK_ROW_PX;
      let y = chart.height - (2 * stripHeight + RISK_STRIP_GAP_PX) - 4;
      const drawn = [];
      ctx.save();
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.textBaseline = 'top';
      for (const strip of strips) {
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'left';
        ctx.fillText(strip.label, 4, y);
        y += RISK_HEADER_PX;
        strip.groups.forEach((row, rowIndex) => {
          const color = groups[rowIndex].color;
          ctx.fillStyle = color;
          ctx.textAlign = 'left';
          // The row label is the visible-text relief for the palette's contrast
          // warning: identity is never color-alone.
          ctx.fillText(truncate(ctx, row.name, Math.max(40, chartArea.left - 8)), 4, y);
          ctx.textAlign = 'center';
          row.counts.forEach((count, tickIndex) => {
            const x = xScale.getPixelForValue(ticks[tickIndex]);
            if (x >= chartArea.left - 1 && x <= chartArea.right + 1) {
              ctx.fillText(String(count), x, y);
              drawn.push({ strip: strip.label, group: row.name, time: ticks[tickIndex], count });
            }
          });
          y += RISK_ROW_PX;
        });
        y += RISK_STRIP_GAP_PX;
      }
      ctx.restore();
      chart.$tteRiskTable = drawn;
    }
  };
}

/**
 * Truncate a string to fit a pixel width with an ellipsis.
 * @private
 */
function truncate(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out}…`;
}
