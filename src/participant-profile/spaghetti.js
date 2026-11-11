// The labs-over-time spaghetti chart for the participant-profile module (#98,
// PPRF-3): one Chart.js line per key measure present, in the active ×ULN /
// ×Baseline display units, points filled at or above the measure's reference
// cut and hollow below it, with the hovered/focused measure's dashed cut line
// drawn by an afterDatasetsDraw plugin. Non-key measures render behind the
// extras toggle; the lab subsetter filters datasets. Parity target: the original
// renderer's spaghettiPlot/* (onPreprocess, onResize fill-opacity, drawCutLine).
// Direct lift of the drawDetail line-chart idiom from src/hep-explorer.js.

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  Tooltip
} from 'chart.js';

import { createElement } from '../shell.js';
import { PLOT_GUTTER_LEFT, PLOT_GUTTER_RIGHT } from './aeTracks.js';
import { timeLabel } from './structureData.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, LogarithmicScale, Tooltip);

const FOOTNOTE =
  'Points are filled for values above the current reference value. ' +
  'Mouseover a line to see the reference line for that lab.';

// End-of-line measure annotations (SafetyGraphics/hep-explorer#290, sv#54).
// The legend used to name the lines by their short keys alone, so a reader who
// did not already know ALT / ALP / AST / TB had nothing to read them against.
// Upstream's resolution is the one taken here: the legend names each measure in
// FULL, and the abbreviation is written on the line itself, which is also what
// makes a dense chart readable without hunting between plot and legend.
//
// The annotations are drawn INSIDE the plot area on purpose. The chart's right
// gutter is pinned to PLOT_GUTTER_RIGHT so the adverse-event timeline below can
// share this x-axis by construction (PPRF-AXIS-002); widening it to park labels
// outside the frame would silently break that alignment.
const ANNOTATION_GAP = 12;
const ANNOTATION_FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';

// The day-1 line (#369, PPRF-XAX-004): first dose, in the muted ink the
// profile's other annotations use, so it reads as a reference, not as data.
const DAY_ONE_COLOR = '#7b8b96';

/**
 * A point's position on the active axis: its `x` (visit position or study
 * day, #369), or its study day for a point built without one.
 * @param {Object} point A spaghetti or spark point.
 * @returns {number} The position.
 */
export function pointX(point) {
  return point.x !== undefined ? point.x : point.day;
}

/**
 * The x scale for a profile chart in the active view (#369, PPRF-XAX-002/003).
 * Visit view is an ordinal axis drawn on a linear scale: one evenly spaced
 * position per visit, a tick at each labelled by the visit name, half a step
 * of padding either end. Study day view is linear in days, pinned to the
 * shared domain when one is given. The title always names the view.
 * @param {?Object} axis The profile's time axis ({ type, title, ticks }), or null for a day-indexed chart.
 * @param {?number[]} [domain=null] The shared study-day domain (Study day view only).
 * @returns {Object} The Chart.js scale options.
 */
export function timeScale(axis, domain = null) {
  if (axis && axis.type === 'ordinal') {
    const ticks = axis.ticks || [];
    const labels = new Map(ticks.map((tick) => [tick.value, tick.label]));
    return {
      type: 'linear',
      min: -0.5,
      max: Math.max(ticks.length, 1) - 0.5,
      title: { display: true, text: axis.title },
      // One tick per visit, whatever Chart.js would have generated.
      afterBuildTicks: (scale) => {
        scale.ticks = ticks.map((tick) => ({ value: tick.value }));
      },
      ticks: {
        autoSkip: true,
        maxRotation: 45,
        callback: (value) => (labels.has(value) ? labels.get(value) : '')
      }
    };
  }
  return {
    type: 'linear',
    title: { display: true, text: axis ? axis.title : 'Study day' },
    ...(Array.isArray(domain) && domain.length === 2 ? { min: domain[0], max: domain[1] } : {})
  };
}

/**
 * Chart.js plugin drawing the day-1 line in Study day view (#369,
 * PPRF-XAX-004): a dashed vertical line at study day 1 — the first dose; there
 * is no day 0 — marked "Day 1", so pre-dose records read as pre-dose. Nothing
 * is drawn when day 1 is off the axis.
 * @returns {Object} The Chart.js plugin.
 */
export function dayOnePlugin() {
  return {
    id: 'sv-profile-day-one',
    afterDatasetsDraw(chart) {
      const scale = chart.scales && chart.scales.x;
      if (!scale) return;
      if (Number.isFinite(scale.min) && scale.min > 1) return;
      if (Number.isFinite(scale.max) && scale.max < 1) return;
      const x = scale.getPixelForValue(1);
      const { left, right, top, bottom } = chart.chartArea;
      if (!Number.isFinite(x) || x < left || x > right) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = DAY_ONE_COLOR;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = DAY_ONE_COLOR;
      ctx.font = ANNOTATION_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Day 1', x + 3, top + 2);
      ctx.restore();
    }
  };
}

/**
 * The measures to draw for the current control state (PPRF-3): key measures only
 * by default; the extras toggle adds the non-key measures; an explicit lab
 * subset selects exactly the named keys (key or extra).
 * @param {Object[]} series The full series list from the profile model.
 * @param {Object} state The live state ({ showExtras, labs }).
 * @returns {Object[]} The visible series, in the original order.
 */
export function visibleSeries(series, state = {}) {
  // The lab subset filters WITHIN the extras-aware base, so the extras toggle
  // stays live after a subset is chosen and the chart always agrees with the
  // Measures control (which lists only the available measures).
  const base = state.showExtras ? series.slice() : series.filter((entry) => entry.isKey);
  if (!state.labs) return base;
  const wanted = new Set(state.labs);
  return base.filter((entry) => wanted.has(entry.key));
}

/**
 * Build one Chart.js line dataset per series (PPRF-3): points at their position
 * on the active axis (visit position or study day, #369), the
 * measure color, and a scriptable pointBackgroundColor that fills points at or
 * above the measure's cut and hollows the rest. The cut travels on `svCut` for
 * the cut-line plugin.
 *
 * The dataset LABEL is the measure's full name, so the legend reads
 * `Total Bilirubin` rather than `TB` (PPRF-SPAG-004, #290); the short key stays
 * on `svKey`, which the line annotations and the tooltip use — a tooltip
 * carrying the full name on every row would crowd the point readout it exists
 * to keep compact.
 * @param {Object[]} series The visible series.
 * @returns {Object[]} The Chart.js datasets.
 */
export function spaghettiDatasets(series) {
  return series.map((entry) => {
    // A record with no position in the active view (no visit in Visit view,
    // no study day in Study day view) is not drawn (#369).
    const points = entry.points.filter((point) => Number.isFinite(pointX(point)));
    const cut = entry.cut;
    const color = entry.color;
    return {
      label: entry.label || entry.key,
      data: points.map((point) => ({ x: pointX(point), y: point.value })),
      borderColor: color,
      backgroundColor: color,
      pointBorderColor: color,
      pointBackgroundColor: (ctx) => {
        const point = points[ctx.dataIndex];
        return point && Number.isFinite(cut) && point.value >= cut ? color : '#fff';
      },
      showLine: true,
      spanGaps: true,
      borderWidth: 1.5,
      pointRadius: 3,
      pointHoverRadius: 5,
      svCut: cut,
      svKey: entry.key,
      // The full point models (raw value, visit fields) for the tooltip
      // callbacks (parity: the original's addPointTitles).
      svPoints: points
    };
  });
}

/**
 * Draw one dataset's dashed reference cut line and its right-aligned 0.1f
 * label, clipped to the chart area so a cut outside the visible domain can
 * never paint over the legend or axes.
 * @param {Object} chart The Chart.js instance.
 * @param {Object} dataset The dataset carrying svCut.
 * @private
 */
function drawCutLine(chart, dataset) {
  if (!dataset || !Number.isFinite(dataset.svCut)) return;
  const y = chart.scales.y.getPixelForValue(dataset.svCut);
  const { left, right, top, bottom } = chart.chartArea;
  const color = dataset.borderColor;
  const ctx = chart.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(dataset.svCut.toFixed(1), right, y - 2);
  ctx.restore();
}

/**
 * Chart.js plugin drawing the reference cut lines (PPRF-3, parity:
 * drawCutLine): the hovered dataset's cut on pointer hover, or EVERY visible
 * dataset's cut while the canvas holds keyboard focus (`chart.$svShowCuts`,
 * set by renderSpaghetti's focus/blur wiring — the "focus" half of the
 * hover/focus requirement). Nothing is drawn otherwise.
 * @returns {Object} The Chart.js plugin.
 */
export function cutLinePlugin() {
  return {
    id: 'sv-profile-cut-line',
    afterDatasetsDraw(chart) {
      if (chart.$svShowCuts) {
        chart.data.datasets.forEach((dataset) => drawCutLine(chart, dataset));
        return;
      }
      const active = chart.getActiveElements ? chart.getActiveElements() : [];
      if (!active || !active.length) return;
      drawCutLine(chart, chart.data.datasets[active[0].datasetIndex]);
    }
  };
}

/**
 * Deconflict a set of end-of-line annotations so two measures whose lines end
 * at the same height do not overprint each other (PPRF-SPAG-004). Entries are
 * ordered top-down and each is pushed below the previous one until it clears by
 * `gap` pixels; an entry that already clears keeps the y its line ended at, so
 * the common case annotates exactly where the reader is looking.
 * @param {Array<{key: string, x: number, y: number}>} entries The candidate annotations.
 * @param {number} [gap=ANNOTATION_GAP] Minimum vertical separation in pixels.
 * @returns {Array<Object>} The entries, top-down, with deconflicted y values.
 */
export function annotationPlacements(entries, gap = ANNOTATION_GAP) {
  let last = -Infinity;
  return entries
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((entry) => {
      const y = Math.max(entry.y, last + gap);
      last = y;
      return { ...entry, y };
    });
}

/**
 * Chart.js plugin writing each visible line's short measure key at the line's
 * last drawn point (PPRF-SPAG-004, #290), in the line's own color so the
 * annotation and the trace cannot be mismatched. Datasets with no drawn points
 * are skipped rather than annotated at the origin, and every label is clamped
 * inside the plot area — the right gutter is pinned for the AE timeline's
 * alignment and is not ours to draw into (PPRF-AXIS-002).
 * @returns {Object} The Chart.js plugin.
 */
export function measureAnnotationPlugin() {
  return {
    id: 'sv-profile-measure-annotation',
    afterDatasetsDraw(chart) {
      const entries = [];
      chart.data.datasets.forEach((dataset, index) => {
        const meta = chart.getDatasetMeta ? chart.getDatasetMeta(index) : null;
        const drawn = (meta && meta.data) || [];
        const last = drawn[drawn.length - 1];
        if (!last || !Number.isFinite(last.x) || !Number.isFinite(last.y)) return;
        entries.push({
          key: dataset.svKey || dataset.label,
          x: last.x,
          y: last.y,
          color: dataset.borderColor
        });
      });
      if (!entries.length) return;
      const { left, right, top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = ANNOTATION_FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      annotationPlacements(entries).forEach((entry) => {
        ctx.fillStyle = entry.color;
        const width = ctx.measureText ? ctx.measureText(entry.key).width : 0;
        const x = Math.min(Math.max(entry.x, left + width), right);
        const y = Math.min(Math.max(entry.y - 4, top + 10), bottom);
        ctx.fillText(entry.key, x, y);
      });
      ctx.restore();
    }
  };
}

/**
 * Render the spaghetti card into a host element (PPRF-3): the Chart.js line
 * chart of the visible series plus the filled-points footnote. Returns the live
 * Chart.js instance so the caller owns its teardown.
 * @param {HTMLElement} host The element to render into.
 * @param {Object} model The spaghetti model ({ series, yLabel, display, axis }); `axis` is the active view (#369), absent for a day-indexed chart.
 * @param {Object} state The live state ({ showExtras, labs }).
 * @param {?number[]} [domain=null] The shared study-day domain (decision D7), Study day view only; null lets the chart autoscale.
 * @returns {Object} The Chart.js instance.
 */
export function renderSpaghetti(host, model, state = {}, domain = null) {
  const card = createElement('div', 'sv-profile-spaghetti-card');
  const canvas = createElement('canvas', 'sv-profile-spaghetti-canvas');
  card.append(canvas);
  host.append(card);

  const series = visibleSeries(model.series, state);
  const datasets = spaghettiDatasets(series);

  // Text alternative + keyboard path for the canvas (PPRF-8): the chart is
  // named for assistive tech, and focusing it draws every visible measure's
  // reference cut line — the keyboard half of PPRF-3's hover/focus cut.
  canvas.setAttribute('role', 'img');
  // Named in full, matching the legend (PPRF-SPAG-004): the text alternative is
  // the substitute for what is drawn, so it should not be the one place the
  // abbreviations are left unexplained.
  canvas.setAttribute(
    'aria-label',
    `Labs over time: ${series.map((entry) => entry.label || entry.key).join(', ') || 'no measures'} (${model.yLabel})`
  );
  canvas.tabIndex = 0;

  // The original spaghetti fixed its y-domain to [0, max(values, cuts)] so the
  // reference cut lines are always on-plot; suggestedMax reproduces the cut
  // half (data autoscaling covers the values) and linear scales pin min to 0.
  const cuts = datasets.map((dataset) => dataset.svCut).filter(Number.isFinite);
  const suggestedMax = cuts.length ? Math.max(...cuts) : undefined;
  const yScale =
    model.axisType === 'log'
      ? { type: 'logarithmic', suggestedMax, title: { display: true, text: model.yLabel } }
      : { type: 'linear', min: 0, suggestedMax, title: { display: true, text: model.yLabel } };

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      parsing: false,
      interaction: { mode: 'dataset', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            // Visit and study day in the title, whichever view is active —
            // "Week 8 · Day 57" (#369, PPRF-XAX-005) — raw + adjusted pairing
            // in the body (parity: the original's addPointTitles).
            title: (items) => {
              if (!items.length) return '';
              const item = items[0];
              const point = (item.dataset.svPoints || [])[item.dataIndex];
              const line = timeLabel(point);
              return line ? [line] : '';
            },
            label: (ctx) => {
              const point = (ctx.dataset.svPoints || [])[ctx.dataIndex];
              // The short key, not the legend's full name (PPRF-SPAG-004).
              const key = ctx.dataset.svKey || ctx.dataset.label;
              if (!point || !Number.isFinite(point.raw))
                return `${key}: ${Number(ctx.parsed.y).toFixed(2)}`;
              return [
                `Raw ${key}: ${point.raw.toFixed(2)}`,
                `Adjusted ${key}: ${Number(ctx.parsed.y).toFixed(2)}`
              ];
            }
          }
        }
      },
      // The plot gutters are pinned rather than fitted so the adverse-event
      // timeline below can share this chart's x-axis by construction — same
      // left gutter, same right padding, same domain — instead of measuring the
      // canvas after every render (PPRF-AXIS-002).
      layout: { padding: { right: PLOT_GUTTER_RIGHT } },
      scales: {
        x: timeScale(model.axis || null, domain),
        y: {
          ...yScale,
          afterFit: (scale) => {
            scale.width = PLOT_GUTTER_LEFT;
          }
        }
      }
    },
    plugins: [
      cutLinePlugin(),
      measureAnnotationPlugin(),
      // The day-1 line belongs to the day axis only (#369, PPRF-XAX-004).
      ...(model.axis && model.axis.type === 'ordinal' ? [] : [dayOnePlugin()])
    ]
  });

  canvas.addEventListener('focus', () => {
    chart.$svShowCuts = true;
    chart.draw();
  });
  canvas.addEventListener('blur', () => {
    chart.$svShowCuts = false;
    chart.draw();
  });

  host.append(createElement('p', 'sv-profile-spaghetti-footnote', FOOTNOTE));
  return chart;
}
