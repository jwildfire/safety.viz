// Chart.js plugin + mark-styling helpers for the hep-explorer module (#43): the
// color-by-group palette, the point tooltip text, the four Hy's-Law quadrant
// labels, and the quadrant cut-line plugin. Mirrors the outlier-explorer's
// getPlugins.js split of pure helpers (unit-tested) from the canvas plugin
// (browser-tested). Requirement groups: HEP-QUAD-* (quadrants/cutpoints),
// HEP-CTRL-009 (grouping), HEP-CHART-004 (tooltip).

import { formatNumber, measureLabel } from './getScales.js';

// Categorical palette for color-by grouping and the participant lab-over-time
// lines (HEP-CTRL-009). Distinct, print- and colorblind-considerate hues; cycles
// when a grouping has more categories.
export const GROUP_COLORS = [
  '#1f78b4',
  '#e31a1c',
  '#33a02c',
  '#ff7f00',
  '#6a3d9a',
  '#b15928',
  '#00838f',
  '#c2185b'
];

/** How many shaded tiers the palette generates past its base colours. @private */
const PALETTE_TIERS = 3;

/** Shift a #rrggbb colour toward white (positive) or black (negative). @private */
function shade(hex, amount) {
  const clean = hex.replace('#', '');
  const channel = (offset) => {
    const value = parseInt(clean.slice(offset, offset + 2), 16);
    const shifted = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(shifted)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/**
 * The colour for the nth group (HEP-CTRL-016, upstream #236). The base palette
 * is used unchanged, and past it each colour returns as a lighter and then a
 * darker variant rather than as an exact repeat — a legend that hands two arms
 * the same hex is not a legend. Past three tiers the cycle does begin again,
 * because no palette distinguishes 25 categories and pretending otherwise would
 * be a worse lie than an honest repeat.
 * @param {number} index The group's index in legend order.
 * @returns {string} A #rrggbb colour.
 */
export function paletteColor(index) {
  const size = GROUP_COLORS.length;
  const position =
    ((index % (size * PALETTE_TIERS)) + size * PALETTE_TIERS) % (size * PALETTE_TIERS);
  const base = GROUP_COLORS[position % size];
  const tier = Math.floor(position / size);
  if (tier === 0) return base;
  return shade(base, tier === 1 ? 0.45 : -0.4);
}

// Highlight color for the selected participant's point and visit path
// (HEP-SELECT-001).
export const SELECTION_COLOR = '#111827';

/**
 * The four Hy's-Law quadrants (HEP-QUAD-002): the label strings, the corner the
 * label draws in, and the X/Y category combination that lands a participant in
 * the quadrant. classifyQuadrants and the quadrant plugin share this ordering.
 * @type {Array<{position: string, label: string, xCat: string, yCat: string}>}
 */
export const QUADRANT_LABELS = [
  { position: 'upper-right', label: "Possible Hy's Law Range", xCat: 'High', yCat: 'High' },
  { position: 'upper-left', label: 'Hyperbilirubinemia', xCat: 'Normal', yCat: 'High' },
  { position: 'lower-right', label: "Temple's Corollary", xCat: 'High', yCat: 'Normal' },
  { position: 'lower-left', label: 'Normal Range', xCat: 'Normal', yCat: 'Normal' }
];

/**
 * What each quadrant MEANS clinically (HEP-QUAD-008, upstream #107). The four
 * corner labels name a region of the plot; they do not, on their own, tell a
 * reviewer what landing in one implies — and the upper-right label is the one
 * most easily over-read, because "Possible Hy's Law Range" is a place on a
 * scatter and not a finding about a participant.
 * @type {Object<string, string>}
 */
export const QUADRANT_MEANINGS = {
  "Possible Hy's Law Range":
    "Both measures above their cutpoints. A screening range, not a diagnosis: Hy's Law also requires that no other cause explains the injury, which only a full case review can establish.",
  Hyperbilirubinemia:
    'Bilirubin above its cutpoint with the aminotransferase below its own — a bilirubin rise without the hepatocellular injury pattern (consider haemolysis, Gilbert syndrome, or cholestasis).',
  "Temple's Corollary":
    "Aminotransferase above its cutpoint with bilirubin below its own — hepatocellular injury without the loss of function that defines the Hy's Law range.",
  'Normal Range': 'Neither measure above its cutpoint for this participant.'
};

/**
 * The standing caution the chart carries wherever it renders (HEP-CAUTION-001,
 * upstream #240). The clinical guide already says this; the widget travels
 * without the guide, so it has to say it too.
 * @type {string}
 */
export const CLINICAL_CAUTION =
  'Exploratory tool — not validated for clinical use. Confirm any signal with a full case review.';

/**
 * The legend rows for the active grouping (HEP-CTRL-013, upstream #108): each
 * group with its participant count and its share of the plotted points.
 *
 * The percent denominator is EVERY plotted point, not just the grouped ones, so
 * a cohort with missing group values does not silently read as 100% covered.
 * @param {Array<string>} groupValues The distinct group values, in legend order.
 * @param {Object[]} points The plotted points.
 * @returns {Array<{value: string, count: number, percent: number, label: string}>} The rows.
 */
export function groupLegendEntries(groupValues, points) {
  const rows = points || [];
  const total = rows.length;
  return (groupValues || []).map((value) => {
    const count = rows.filter((point) => String(point.group) === String(value)).length;
    const percent = total ? (count / total) * 100 : 0;
    return {
      value: String(value),
      count,
      percent,
      label: `${value} (n=${count}, ${percent.toFixed(1)}%)`
    };
  });
}

/**
 * The sentence explaining what point size encodes (HEP-CTRL-014, upstream
 * #274). Only the R-Ratio setting encodes anything, so only it needs a legend:
 * saying "all points are the same size" is noise.
 * @param {string} pointSize The active Point Size setting.
 * @returns {string} The note, or '' when size carries no meaning.
 */
export function pointSizeNote(pointSize) {
  if (pointSize !== 'rRatio') return '';
  return 'Point size encodes R Ratio: a larger point is a more hepatocellular pattern. Participants with no R Ratio are drawn at the base size.';
}

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
 * Map each group value to a stable palette color (HEP-CTRL-009).
 * @param {Array<string>} groupValues Ordered distinct group values.
 * @returns {Map<string, string>} value -> hex color.
 */
export function groupColorScale(groupValues) {
  const scale = new Map();
  groupValues.forEach((value, index) => {
    scale.set(String(value), paletteColor(index));
  });
  return scale;
}

/**
 * Human-readable study day for a tooltip, 'NA' when the day is unknown.
 * @private
 */
function dayText(day) {
  return Number.isFinite(day) ? String(day) : 'NA';
}

/**
 * Tooltip text lines for a participant point (HEP-CHART-004): the participant
 * id, the R Ratio, each axis measure with its standardized peak value and day,
 * and the day-difference between the two peaks. Each measure is named with its
 * full label from measure_values (e.g. `Total Bilirubin`) rather than the short
 * key, matching the axis titles and the original renderer.
 * @param {Object} point The plotted point ({ id, x, y, days_x, days_y, day_diff, rRatio }).
 * @param {Object} state The live instance state ({ measureX, measureY }).
 * @param {Object} [measureValues] The settings.measure_values map (short key -> full label).
 * @returns {Array<string>} Tooltip lines.
 */
export function pointTooltip(point, state, measureValues) {
  const lines = [
    `Participant: ${point.id}`,
    `R Ratio: ${Number.isFinite(point.rRatio) ? formatNumber(point.rRatio) : 'NA'}`,
    `${measureLabel(state.measureX, measureValues)}: ${formatNumber(point.x)} @ day ${dayText(
      point.days_x
    )}`,
    `${measureLabel(state.measureY, measureValues)}: ${formatNumber(point.y)} @ day ${dayText(
      point.days_y
    )}`
  ];
  if (Number.isFinite(point.day_diff)) {
    lines.push(`${formatNumber(point.day_diff)} days apart`);
  }
  return lines;
}

/**
 * Chart.js plugin drawing dashed reference lines at fixed axis values with
 * small labels (HEP-COMP-001/003): vertical lines at each `vLines` x-value and
 * horizontal lines at each `hLines` y-value. Used by the composite plot for the
 * eDISH cut-lines (ALT 3×ULN, BILI 2×ULN) and the ×Baseline reference lines
 * (1×/3×/5×BLN). Lines outside the current axis range are skipped.
 * @param {{vLines?: Array<{value: number, label?: string}>, hLines?: Array<{value: number, label?: string}>}} config The lines to draw.
 * @returns {Object} A Chart.js plugin object.
 */
export function referenceLinePlugin({ vLines = [], hLines = [] } = {}) {
  return {
    id: `hep-reflines-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.65)';
      ctx.fillStyle = 'rgba(51, 65, 85, 0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.font = '10px system-ui, sans-serif';
      vLines.forEach(({ value, label }) => {
        const px = scales.x.getPixelForValue(value);
        if (!(px >= chartArea.left && px <= chartArea.right)) return;
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        if (label) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, px + 2, chartArea.bottom - 2);
        }
      });
      hLines.forEach(({ value, label }) => {
        const py = scales.y.getPixelForValue(value);
        if (!(py >= chartArea.top && py <= chartArea.bottom)) return;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        if (label) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, chartArea.left + 2, py - 2);
        }
      });
      ctx.restore();
    }
  };
}

/**
 * Chart.js plugin drawing the two Hy's-Law cut-lines and the four corner
 * quadrant labels with live percents (HEP-QUAD-002, HEP-QUAD-003). Reads
 * `instance.state.xCut`/`yCut` for the line positions and `instance.quadrants`
 * (the classifyQuadrants result the entrypoint stores) for the counts and
 * percents. Records the drawn geometry on `chart.$hepQuadrants` so tests can
 * assert against it (mirrors the outlier-explorer's $oeNormalRangeOverlay);
 * null when no cutpoints are resolvable.
 * @param {Object} instance The live hep-explorer instance.
 * @returns {Object} A Chart.js plugin object.
 */
export function quadrantPlugin(instance) {
  return {
    id: `hep-quadrants-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      chart.$hepQuadrants = null;
      const state = instance.state || {};
      const { xCut, yCut } = state;
      if (!Number.isFinite(xCut) || !Number.isFinite(yCut)) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;

      const xPixel = scales.x.getPixelForValue(xCut);
      const yPixel = scales.y.getPixelForValue(yCut);
      const quadrants = instance.quadrants || { labels: [] };
      const counts = {};
      const percents = {};
      quadrants.labels.forEach((entry) => {
        counts[entry.position] = entry.count;
        percents[entry.position] = entry.percent;
      });
      chart.$hepQuadrants = { xCut, yCut, xPixel, yPixel, counts, percents };

      ctx.save();
      // Dashed grey cut-lines spanning the full plot (HEP-QUAD-002).
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (xPixel >= chartArea.left && xPixel <= chartArea.right) {
        ctx.beginPath();
        ctx.moveTo(xPixel, chartArea.top);
        ctx.lineTo(xPixel, chartArea.bottom);
        ctx.stroke();
      }
      if (yPixel >= chartArea.top && yPixel <= chartArea.bottom) {
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPixel);
        ctx.lineTo(chartArea.right, yPixel);
        ctx.stroke();
      }

      // Corner labels with live percents (HEP-QUAD-003), which a reviewer can
      // turn off when they are reading the cloud rather than the regions
      // (HEP-QUAD-007).
      if (state.quadrantLabels === 'hidden') {
        ctx.restore();
        return;
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const anchors = {
        'upper-left': { x: chartArea.left + 6, y: chartArea.top + 12, align: 'left' },
        'upper-right': { x: chartArea.right - 6, y: chartArea.top + 12, align: 'right' },
        'lower-left': { x: chartArea.left + 6, y: chartArea.bottom - 12, align: 'left' },
        'lower-right': { x: chartArea.right - 6, y: chartArea.bottom - 12, align: 'right' }
      };
      quadrants.labels.forEach((entry) => {
        const anchor = anchors[entry.position];
        if (!anchor) return;
        ctx.textAlign = anchor.align;
        const percent = Number.isFinite(entry.percent) ? entry.percent.toFixed(1) : '0.0';
        ctx.fillText(`${entry.label} (${percent}%)`, anchor.x, anchor.y);
      });
      ctx.restore();
    }
  };
}
