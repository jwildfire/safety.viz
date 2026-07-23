// The labs-over-time spaghetti chart for the participant-profile module (#98,
// PPRF-3): one Chart.js line per key measure present, in the active ×ULN /
// ×Baseline display units, points filled at or above the measure's reference
// cut and hollow below it, with the hovered/focused measure's dashed cut line
// drawn by an afterDatasetsDraw plugin. Non-key measures render behind the
// extras toggle; the lab subsetter filters datasets. Parity target: the original
// renderer's spaghettiPlot/* (onPreprocess, onResize fill-opacity, drawCutLine).
// Direct lift of the drawDetail line-chart idiom from src/hep-explorer.js.

import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip } from 'chart.js';

import { createElement } from '../shell.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);

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
  if (state.labs) {
    const wanted = new Set(state.labs);
    return series.filter((entry) => wanted.has(entry.key));
  }
  if (state.showExtras) return series.slice();
  return series.filter((entry) => entry.isKey);
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
      svKey: entry.key
    };
  });
}

/**
 * Chart.js plugin drawing the hovered/focused dataset's dashed reference cut
 * line and its right-aligned 0.1f label, keyed off the active tooltip/hover
 * element (PPRF-3, parity: drawCutLine). Nothing is drawn when no element is
 * active.
 * @returns {Object} The Chart.js plugin.
 */
export function cutLinePlugin() {
  return {
    id: 'sv-profile-cut-line',
    afterDatasetsDraw(chart) {
      const active = chart.getActiveElements ? chart.getActiveElements() : [];
      if (!active || !active.length) return;
      const dataset = chart.data.datasets[active[0].datasetIndex];
      if (!dataset || !Number.isFinite(dataset.svCut)) return;
      const y = chart.scales.y.getPixelForValue(dataset.svCut);
      const { left, right } = chart.chartArea;
      const color = dataset.borderColor;
      const ctx = chart.ctx;
      ctx.save();
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
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} @ day ${ctx.parsed.x}`
          }
        }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Study Day' } },
        y: { type: 'linear', title: { display: true, text: model.yLabel } }
      }
    },
    plugins: [cutLinePlugin()]
  });

  host.append(createElement('p', 'sv-profile-spaghetti-footnote', FOOTNOTE));
  return chart;
}
