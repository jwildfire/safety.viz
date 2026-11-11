// The expandable inset line chart behind each measure-table sparkline (#98,
// PPRF-4): a Chart.js line chart of the measure's absolute values in the
// active view (by visit or by study day, #369), with a custom
// beforeDatasetsDraw plugin painting the LLN–ULN normal-range band and the
// dashed population-extent guides in chart space, outlier points filled and
// in-range points hollow. Parity target: the original renderer's
// measureTable/lineChart/* (setDomain, drawNormalRange, drawPopulationExtent,
// updatePointFill). The measure table owns the expand/collapse lifecycle — this
// file only builds the chart; the caller destroys it on collapse and on any
// re-render.

import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip } from 'chart.js';

import { createElement } from '../shell.js';
import { dayOnePlugin, pointX, timeScale } from './spaghetti.js';
import { timeLabel } from './structureData.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);

/**
 * The padded inset y-domain (PPRF-4, parity setDomain, widened per the spec to
 * union the band): the participant's values ∪ the population extent ∪ the
 * finite normal-range limits, ×0.99 below and ×1.01 above, so the band, the
 * guides, and every point stay in view.
 * @param {Object} measure The measure model ({ spark, populationExtent }).
 * @returns {[number, number]} The [min, max] y-domain.
 */
export function insetYDomain(measure) {
  const pool = measure.spark
    .flatMap((point) => [point.value, point.lln, point.uln])
    .concat(measure.populationExtent || [])
    .filter(Number.isFinite);
  if (!pool.length) return [0, 1];
  return [Math.min(...pool) * 0.99, Math.max(...pool) * 1.01];
}

/**
 * Chart.js plugin drawing, before the datasets, the LLN–ULN normal-range band
 * (ULN vertices forward, LLN reversed — parity drawNormalRange) and the dashed
 * population-extent guide lines across the chart area (parity
 * drawPopulationExtent).
 * @param {Object} measure The measure model ({ spark, populationExtent }).
 * @returns {Object} The Chart.js plugin.
 */
export function bandGuidePlugin(measure) {
  return {
    id: 'sv-profile-inset-band',
    beforeDatasetsDraw(chart) {
      const { x, y } = chart.scales;
      const { left, right } = chart.chartArea;
      const ctx = chart.ctx;

      const upper = measure.spark
        .filter((point) => Number.isFinite(point.uln))
        .filter((point) => Number.isFinite(pointX(point)))
        .map((point) => [x.getPixelForValue(pointX(point)), y.getPixelForValue(point.uln)]);
      const lower = measure.spark
        .filter((point) => Number.isFinite(point.lln))
        .filter((point) => Number.isFinite(pointX(point)))
        .map((point) => [x.getPixelForValue(pointX(point)), y.getPixelForValue(point.lln)])
        .reverse();
      const band = upper.concat(lower);

      if (band.length) {
        ctx.save();
        ctx.fillStyle = '#eee';
        ctx.beginPath();
        band.forEach(([px, py], index) => {
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      const guides = (measure.populationExtent || []).filter(Number.isFinite);
      if (guides.length) {
        ctx.save();
        ctx.strokeStyle = '#ccc';
        ctx.setLineDash([2, 2]);
        guides.forEach((value) => {
          const py = y.getPixelForValue(value);
          ctx.beginPath();
          ctx.moveTo(left, py);
          ctx.lineTo(right, py);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  };
}

/**
 * Render the inset line chart for one measure into a host element (PPRF-4):
 * absolute values in the active view (by visit or by study day, #369),
 * outliers filled, band + guides painted by the plugin, y-domain unioned with
 * both. Returns the live Chart.js instance so the measure table owns its
 * teardown.
 * @param {HTMLElement} host The element to render into (the inset row's cell).
 * @param {Object} measure The measure model from buildProfileModel.
 * @param {?Object} [axis=null] The profile's time axis (#369); null for a day-indexed inset.
 * @returns {Object} The Chart.js instance.
 */
export function renderInset(host, measure, axis = null) {
  const card = createElement('div', 'sv-profile-inset-card');
  const canvas = createElement('canvas', 'sv-profile-inset-canvas');
  // Text alternative for the inset canvas (PPRF-8).
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${measure.label} over time`);
  card.append(canvas);
  host.append(card);

  const points = measure.spark.filter(
    (point) => Number.isFinite(point.value) && Number.isFinite(pointX(point))
  );
  const color = measure.color;
  const [yMin, yMax] = insetYDomain(measure);

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: measure.label,
          data: points.map((point) => ({ x: pointX(point), y: point.value })),
          borderColor: color,
          backgroundColor: color,
          pointBorderColor: color,
          pointBackgroundColor: (ctx) => {
            const point = points[ctx.dataIndex];
            return point && point.outlier ? color : '#fff';
          },
          showLine: true,
          spanGaps: true,
          borderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // Visit and study day in the title, whichever view is active —
            // "Week 8 · Day 57" (#369, PPRF-XAX-005).
            title: (items) => {
              if (!items.length) return '';
              const line = timeLabel(points[items[0].dataIndex]);
              return line ? [line] : '';
            },
            label: (ctx) => `${measure.label}: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: timeScale(axis),
        y: {
          type: 'linear',
          min: yMin,
          max: yMax,
          title: { display: true, text: measure.label }
        }
      }
    },
    plugins: [
      bandGuidePlugin(measure),
      ...(axis && axis.type === 'ordinal' ? [] : [dayOnePlugin()])
    ]
  });
}
