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

Chart.register(LineController, LineElement, PointElement, LinearScale, LogarithmicScale, Tooltip);

const FOOTNOTE =
  'Points are filled for values above the current reference value. ' +
  'Mouseover a line to see the reference line for that lab.';

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
 * Build one Chart.js line dataset per series (PPRF-3): day-indexed points, the
 * measure color, and a scriptable pointBackgroundColor that fills points at or
 * above the measure's cut and hollows the rest. The cut travels on `svCut` for
 * the cut-line plugin.
 * @param {Object[]} series The visible series.
 * @returns {Object[]} The Chart.js datasets.
 */
export function spaghettiDatasets(series) {
  return series.map((entry) => {
    const points = entry.points;
    const cut = entry.cut;
    const color = entry.color;
    return {
      label: entry.key,
      data: points.map((point) => ({ x: point.day, y: point.value })),
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
 * Render the spaghetti card into a host element (PPRF-3): the Chart.js line
 * chart of the visible series plus the filled-points footnote. Returns the live
 * Chart.js instance so the caller owns its teardown.
 * @param {HTMLElement} host The element to render into.
 * @param {Object} model The spaghetti model ({ series, yLabel, display }).
 * @param {Object} state The live state ({ showExtras, labs }).
 * @returns {Object} The Chart.js instance.
 */
export function renderSpaghetti(host, model, state = {}) {
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
  canvas.setAttribute(
    'aria-label',
    `Labs over time: ${series.map((entry) => entry.key).join(', ') || 'no measures'} (${model.yLabel})`
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
            // Visit context in the title, raw + adjusted pairing in the body
            // (parity: the original's addPointTitles).
            title: (items) => {
              if (!items.length) return '';
              const item = items[0];
              const point = (item.dataset.svPoints || [])[item.dataIndex];
              if (!point) return `Study day: ${item.parsed.x}`;
              const lines = [`Study day: ${point.day}`];
              if (point.visit !== undefined && point.visit !== null && point.visit !== '') {
                const n =
                  point.visitn !== undefined && point.visitn !== null && point.visitn !== ''
                    ? ` (${point.visitn})`
                    : '';
                lines.push(`Visit: ${point.visit}${n}`);
              }
              return lines;
            },
            label: (ctx) => {
              const point = (ctx.dataset.svPoints || [])[ctx.dataIndex];
              const key = ctx.dataset.label;
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
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Study Day' } },
        y: yScale
      }
    },
    plugins: [cutLinePlugin()]
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
