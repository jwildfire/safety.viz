// Zone geometry, mark styling, tooltip text and the canvas plugin for the
// nep-explorer KDIGO creatinine scatter (#120). Mirrors the house split of pure
// helpers (unit-tested) from the canvas plugin (browser-tested), on
// hep-explorer's quadrantPlugin technique: read the live scales in
// beforeDatasetsDraw and paint in pixel space, so the regions track a resize or
// a domain change without a second source of truth. The difference is that
// these are FILLED regions rather than cut-lines — outlier-explorer's
// normal-range band is the nearer precedent for the fill.
//
// Requirement groups: NEP-ZONE-* (geometry, paint order, labels, colour),
// NEP-SCAT-* (marks, tooltip, selection).

import { formatNumber } from './getScales.js';

/**
 * The stage ramp. Severity is ORDINAL, so the zones take an ordered status ramp
 * rather than a categorical slot — and every zone is labelled, so colour is
 * never the only carrier (NEP-ZONE-003).
 *
 * The source uses ColorBrewer YlOrRd (#ffeda0 / #feb24c / #f03b20); these are
 * the house status hues at the same ordering.
 * @type {Object<number, string>}
 */
export const STAGE_COLORS = {
  0: '#94a3b8',
  1: '#f5c14b',
  2: '#e8873c',
  3: '#c8372d'
};

/** Fill opacity for the painted zones — a background, not a layer. @private */
const ZONE_OPACITY = 0.16;

/** Highlight colour for the selected participant's point. */
export const SELECTION_COLOR = '#111827';

/**
 * Convert a #rrggbb colour to an rgba() string at the given opacity.
 * @param {string} hex Hex colour (with or without leading #).
 * @param {number} opacity Alpha in [0, 1].
 * @returns {string} The rgba() colour string.
 */
export function hexToRgba(hex, opacity) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** The human label for a stage. */
export function stageLabel(stage) {
  if (stage === null || stage === undefined) return 'Not staged';
  return stage === 0 ? 'No stage' : `Stage ${stage}`;
}

/**
 * The stage regions in VALUE space, worst stage first (NEP-ZONE-001,
 * NEP-ZONE-002).
 *
 * Under the KDIGO ladder the stage at a point is the worse of its two axes, so
 * the regions are bands rather than the source's four nested rectangles — and
 * the silhouette a nepExplorer reader recognizes is the L: Stage 1 is the
 * 1.5–2× fold band at any change, PLUS everything at or above the 0.3 mg/dL
 * trigger below 1.5×. The no-stage box — the one region where both criteria are
 * clear — is left unpainted rather than filled, so the grid stays readable
 * where most of a real cohort sits.
 *
 * Regions are clipped to the visible domain and omitted when it excludes them,
 * so a zoomed axis never paints a band off the edge of its own meaning.
 * @param {number[]} cuts The ascending fold ladder.
 * @param {?number} deltaTrigger The absolute-change Stage-1 cut-point, or null when the unit is unresolved and no absolute claim can be drawn (NEP-UNIT-003).
 * @param {number[]} xDomain The visible fold domain.
 * @param {number[]} yDomain The visible change domain.
 * @returns {Array<Object>} The regions, worst stage first.
 */
export function stageZones(cuts, deltaTrigger, xDomain, yDomain) {
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const [one, two, three] = cuts;
  const band = (stage, x0, x1, y0, y1, label) => {
    const left = Math.max(xMin, x0);
    const right = Math.min(xMax, x1);
    const bottom = Math.max(yMin, y0);
    const top = Math.min(yMax, y1);
    if (!(right > left) || !(top > bottom)) return null;
    return {
      stage,
      label: label ?? null,
      x0: left,
      x1: right,
      y0: bottom,
      y1: top,
      fill: hexToRgba(STAGE_COLORS[stage], ZONE_OPACITY)
    };
  };

  const zones = [
    band(3, three, Infinity, -Infinity, Infinity, 'Stage 3'),
    band(2, two, three, -Infinity, Infinity, 'Stage 2'),
    band(1, one, two, -Infinity, Infinity, 'Stage 1')
  ];
  // The absolute-change arm of Stage 1 exists only when there is a mg/dL
  // contract to express 0.3 in.
  if (Number.isFinite(deltaTrigger)) {
    zones.push(band(1, -Infinity, one, deltaTrigger, Infinity, null));
  }
  return zones.filter(Boolean);
}

/**
 * Per-point mark styling (NEP-SCAT-001).
 *
 * Fill is the combined stage, so the cloud reads by severity even with the
 * zones hidden. The >= 4.0 mg/dL rule takes a distinct, larger, ringed marker
 * (D5): the rule is about the VALUE reached, so it is invisible in the point's
 * position — a participant can sit deep in the Stage-1 zone and be Stage 3.
 * Drawing it as a mark keeps the rule visible without distorting either axis.
 * @param {Object[]} points The plotted points.
 * @param {number} selectedIndex The selected point's index, or -1.
 * @returns {Object} Chart.js per-point style arrays.
 */
export function markStyles(points, selectedIndex) {
  const rows = points || [];
  const borders = selectionBorders(rows.length, selectedIndex);
  return {
    background: rows.map((point) => hexToRgba(STAGE_COLORS[point.stage ?? 0], 0.8)),
    border: borders.colors,
    borderWidth: borders.widths,
    radius: rows.map((point) => (point.absoluteRule ? 8 : 5)),
    hoverRadius: rows.map((point) => (point.absoluteRule ? 10 : 7)),
    pointStyle: rows.map((point) => (point.absoluteRule ? 'triangle' : 'circle'))
  };
}

/**
 * Per-point border styling that thickens and blackens the selected point
 * (NEP-SCAT-004); unselected points keep a thin dark border so a light fill
 * still has an edge.
 * @param {number} count How many points.
 * @param {number} selectedIndex The selected index, or -1.
 * @returns {{colors: string[], widths: number[]}} The border arrays.
 */
export function selectionBorders(count, selectedIndex) {
  return {
    colors: Array.from({ length: count }, (_, index) =>
      index === selectedIndex ? SELECTION_COLOR : 'rgba(51, 65, 85, 0.65)'
    ),
    widths: Array.from({ length: count }, (_, index) => (index === selectedIndex ? 3 : 1))
  };
}

/** A signed change with a real minus glyph. @private */
function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  const text = formatNumber(Math.abs(value), digits);
  return value < 0 ? `−${text}` : `+${text}`;
}

/**
 * The point tooltip (NEP-SCAT-002), keeping the source's lines: participant,
 * KDIGO stage, fold change and its stage, absolute change and its stage,
 * baseline and maximum creatinine with the visits they came from, and the study
 * day of the maximum.
 *
 * Two lines behave differently from the source. The study-day line is omitted
 * rather than blank when the data carries no study-day column — the vendored
 * demo extract does not, so that is the demo's own path. And the absolute-value
 * rule adds a line of its own when it fires (D5), because a Stage-3 participant
 * sitting in the Stage-1 zone otherwise has nothing on screen to explain it.
 * @param {Object} point The plotted point.
 * @param {Object} settings Normalized settings.
 * @param {string} measure The measure's display name.
 * @returns {string[]} The tooltip lines.
 */
export function pointTooltip(point, settings, measure) {
  const unit = point.unit;
  const staged = (stage) =>
    stage === null || stage === undefined ? 'not staged — unit not recognized' : stageLabel(stage);
  const lines = [
    `Participant: ${point.id}`,
    `KDIGO stage: ${stageLabel(point.stage)}`,
    `Fold change: ${formatNumber(point.fold)}× baseline (${staged(point.foldStage)})`,
    `Absolute change: ${formatSigned(point.delta)} ${unit} (${staged(point.deltaStage)})`,
    `Baseline ${measure}: ${formatNumber(point.baseline)} ${unit} (${point.baselineVisit})`,
    `Maximum ${measure}: ${formatNumber(point.max)} ${unit} (${point.maxVisit})`
  ];
  if (point.maxDay !== null && point.maxDay !== undefined)
    lines.push(`Maximum on study day: ${point.maxDay}`);
  if (point.absoluteRule)
    lines.push(
      `Maximum reached ${formatNumber(settings.stages.absolute)} ${settings.units.target}: ` +
        'Stage 3 by the absolute-value rule'
    );
  return lines;
}

/**
 * Chart.js plugin painting the stage zones behind the points (NEP-ZONE-001,
 * NEP-ZONE-002).
 *
 * `beforeDatasetsDraw` is the hook that guarantees the order: the zones are a
 * background, and a participant must never be hidden under the region that
 * describes them. Geometry is read from the LIVE scales each draw — the same
 * technique as hep-explorer's quadrantPlugin — so the regions follow a resize
 * or a domain change with no second copy of the cut-points.
 *
 * The drawn geometry is recorded on `chart.$nepZones` so the browser suite can
 * assert the regions rather than a screenshot alone.
 * @param {Object} instance The live nep-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function stageZonesPlugin(instance) {
  return {
    id: `nep-stage-zones-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$nepZones = null;
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;
      const settings = instance.settings;
      const trigger = instance.unitsResolved ? settings.stages.delta : null;
      const zones = stageZones(
        settings.stages.fold,
        trigger,
        [scales.x.min, scales.x.max],
        [scales.y.min, scales.y.max]
      );
      const painted = zones.map((zone) => {
        const left = scales.x.getPixelForValue(zone.x0);
        const right = scales.x.getPixelForValue(zone.x1);
        const top = scales.y.getPixelForValue(zone.y1);
        const bottom = scales.y.getPixelForValue(zone.y0);
        return { ...zone, left, right, top, bottom };
      });
      chart.$nepZones = painted;

      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();
      painted.forEach((zone) => {
        ctx.fillStyle = zone.fill;
        ctx.fillRect(zone.left, zone.top, zone.right - zone.left, zone.bottom - zone.top);
      });
      // Boundaries, so the edge of a stage is a line a reviewer can read a
      // value against and not only a change of tint.
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      painted.forEach((zone) => {
        ctx.beginPath();
        ctx.moveTo(zone.left, zone.top);
        ctx.lineTo(zone.left, zone.bottom);
        ctx.stroke();
        if (zone.y0 > scales.y.min) {
          ctx.beginPath();
          ctx.moveTo(zone.left, zone.bottom);
          ctx.lineTo(zone.right, zone.bottom);
          ctx.stroke();
        }
      });

      if (settings.zone_labels !== 'hidden') {
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        painted.forEach((zone) => {
          if (!zone.label) return;
          ctx.fillText(zone.label, zone.left + 4, chartArea.top + 6);
        });
      }
      ctx.restore();
    }
  };
}
