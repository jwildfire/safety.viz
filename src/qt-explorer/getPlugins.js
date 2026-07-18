// Chart.js plugins + mark-styling helpers for the qt-explorer module (#68): the
// color-by-arm palette (shared with hep/outlier-explorer), the outlier-scatter
// threshold plugin (absolute-QTc diagonals, change horizontals, and the zero
// no-change line), the central-tendency plugin (per-arm CI band, the reference
// line, and the peak-effect-visit marker), and the tooltip text. Pure helpers
// are unit-tested; the canvas plugins are browser-tested. The plugins record the
// geometry they draw on chart.$qtThresholds / chart.$qtCentral so tests can
// assert against it (the hep-explorer $hepQuadrants pattern). Requirement groups:
// QT-OUT-* (scatter), QT-CT-* (central tendency).

import { formatNumber, formatSigned } from './getScales.js';

/** Categorical palette for color-by-arm; matches the hep/outlier-explorer palette. */
export const ARM_COLORS = [
  '#1f78b4',
  '#e31a1c',
  '#33a02c',
  '#ff7f00',
  '#6a3d9a',
  '#b15928',
  '#00838f',
  '#c2185b'
];

/** Reference-line / threshold color (dashed grey, matching the sibling explorers). */
export const THRESHOLD_COLOR = 'rgba(100, 116, 139, 0.75)';

/**
 * Convert a #rrggbb hex color to an rgba() string at the given opacity.
 * @param {string} hex Hex color (with or without leading #).
 * @param {number} opacity Alpha in [0, 1].
 * @returns {string} The rgba() color string.
 */
export function hexToRgba(hex, opacity) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Map each arm to a stable palette color (QT-OUT-004, QT-CT-001).
 * @param {Array<string>} arms Ordered distinct arm values.
 * @returns {Map<string, string>} arm -> hex color.
 */
export function armColorScale(arms) {
  const scale = new Map();
  (arms || []).forEach((arm, index) => {
    scale.set(String(arm), ARM_COLORS[index % ARM_COLORS.length]);
  });
  return scale;
}

/**
 * Tooltip lines for an outlier-scatter point (QT-OUT-006).
 * @param {{id:string, arm:string, baseline:number, value:number, change:number, visit:string}} point The point.
 * @param {string} measure The active measure name.
 * @returns {string[]} The tooltip lines.
 */
export function scatterTooltip(point, measure) {
  return [
    `Participant: ${point.id}`,
    `Arm: ${point.arm}`,
    `Baseline ${measure}: ${formatNumber(point.baseline)}`,
    `${measure}: ${formatNumber(point.value)}`,
    `Change: ${formatSigned(point.change)}`,
    `Visit: ${point.visit}`
  ];
}

/**
 * Chart.js plugin for the outlier scatter: the zero no-change line, the absolute
 * QTc cut-line diagonals (change = threshold − baseline; QTc measures only), and
 * the change-from-baseline horizontals (QT-OUT-003, QT-OUT-005). Diagonals are
 * straight only on linear scales, so the scatter pins both axes to linear; the
 * plugin guards against unresolved scales. Records chart.$qtThresholds.
 * @param {Object} instance The live qt-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function thresholdScatterPlugin(instance) {
  return {
    id: `qt-thresholds-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$qtThresholds = null;
      const spec = instance.scatterThresholds || {};
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;
      const xMin = scales.x.min;
      const xMax = scales.x.max;
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin === xMax) return;

      const recorded = { zero: false, absolute: [], change: [] };
      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();

      // Zero no-change reference (solid, subtle) — the anchor the change lines read against.
      const yZero = scales.y.getPixelForValue(0);
      if (yZero >= chartArea.top && yZero <= chartArea.bottom) {
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yZero);
        ctx.lineTo(chartArea.right, yZero);
        ctx.stroke();
        recorded.zero = true;
      }

      ctx.strokeStyle = THRESHOLD_COLOR;
      ctx.fillStyle = 'rgba(71, 85, 105, 0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.font = '11px system-ui, sans-serif';

      // Absolute-QTc diagonals: change = threshold − baseline (slope −1).
      if (spec.showAbsolute) {
        for (const threshold of spec.absolute || []) {
          const left = {
            x: scales.x.getPixelForValue(xMin),
            y: scales.y.getPixelForValue(threshold - xMin)
          };
          const right = {
            x: scales.x.getPixelForValue(xMax),
            y: scales.y.getPixelForValue(threshold - xMax)
          };
          ctx.beginPath();
          ctx.moveTo(left.x, left.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();
          // Label the diagonal where it enters the plot: at the left edge when it
          // crosses there, or at its top-edge crossing when the line (slope −1,
          // running top-left to bottom-right) enters from above — so multiple
          // thresholds spread along the top instead of stacking in the corner.
          // Skip when the line never crosses the plot area.
          const enters = left.y <= chartArea.bottom && right.y >= chartArea.top;
          if (enters) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            let labelX = chartArea.left + 4;
            let labelY = left.y - 2;
            if (left.y < chartArea.top) {
              // Enters through the top edge (change = scales.y.max there).
              const topBaseline = threshold - scales.y.max;
              labelX = Math.min(
                Math.max(scales.x.getPixelForValue(topBaseline) + 4, chartArea.left + 4),
                chartArea.right - 44
              );
              labelY = chartArea.top + 12;
            }
            ctx.fillText(`${threshold} ms`, labelX, labelY);
          }
          recorded.absolute.push(threshold);
        }
      }

      // Change-from-baseline horizontals.
      if (spec.showChange) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        for (const threshold of spec.change || []) {
          const y = scales.y.getPixelForValue(threshold);
          if (y < chartArea.top || y > chartArea.bottom) continue;
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.fillText(`Δ ${threshold} ms`, chartArea.right - 4, y - 2);
          recorded.change.push(threshold);
        }
      }

      ctx.restore();
      chart.$qtThresholds = recorded;
    }
  };
}

/**
 * Chart.js plugin for the central-tendency view: the per-arm CI band (drawn from
 * the arm's lo/hi series in data coords, converted at draw time so it tracks the
 * live scales — the results-over-time boxSpecs pattern), the mode-labelled
 * reference line, and the peak-effect-visit marker (QT-CT-002/003/006). Drawn in
 * beforeDatasetsDraw so the arm lines and points paint over the band. Records
 * chart.$qtCentral.
 * @param {Object} instance The live qt-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function centralTendencyPlugin(instance) {
  return {
    id: `qt-central-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$qtCentral = null;
      const spec = instance.centralSpec;
      if (!spec) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;
      const xOf = (visit) => scales.x.getPixelForValue(spec.visitIndex.get(visit));
      const yOf = (value) => scales.y.getPixelForValue(value);
      const recorded = { bands: [], reference: null, peaks: [] };

      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();

      // Per-arm CI band: a filled ribbon between the lo and hi series.
      for (const band of spec.series) {
        const withCi = band.points.filter(
          (p) => Number.isFinite(p.lo) && Number.isFinite(p.hi) && spec.visitIndex.has(p.visit)
        );
        if (withCi.length < 2) continue;
        const color = spec.colorScale.get(String(band.arm)) || ARM_COLORS[0];
        ctx.fillStyle = hexToRgba(color, 0.14);
        ctx.beginPath();
        withCi.forEach((p, i) => {
          const x = xOf(p.visit);
          const y = yOf(p.hi);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        for (let i = withCi.length - 1; i >= 0; i -= 1) {
          ctx.lineTo(xOf(withCi[i].visit), yOf(withCi[i].lo));
        }
        ctx.closePath();
        ctx.fill();
        recorded.bands.push({ arm: band.arm, n: withCi.length });
      }

      // Reference line (mode-labelled); omitted for non-QTc measures.
      if (spec.showReference) {
        const y = yOf(spec.referenceThreshold);
        if (y >= chartArea.top && y <= chartArea.bottom) {
          ctx.strokeStyle = THRESHOLD_COLOR;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(71, 85, 105, 0.85)';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(spec.referenceLabel, chartArea.right - 4, y - 2);
          recorded.reference = spec.referenceThreshold;
        }
      }

      // Peak-effect-visit marker for the largest-peak arm (vertical dashed line).
      if (spec.peak && spec.visitIndex.has(spec.peak.visit)) {
        const x = xOf(spec.peak.visit);
        if (x >= chartArea.left && x <= chartArea.right) {
          const color = spec.colorScale.get(String(spec.peak.arm)) || ARM_COLORS[0];
          ctx.strokeStyle = hexToRgba(color, 0.7);
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = hexToRgba(color, 0.95);
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('Peak-effect visit', x, chartArea.top + 2);
          recorded.peaks.push({ arm: spec.peak.arm, visit: spec.peak.visit });
        }
      }

      ctx.restore();
      chart.$qtCentral = recorded;
    }
  };
}
