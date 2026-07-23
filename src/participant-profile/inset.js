// The expandable inset line chart behind each measure-table sparkline (#98,
// PPRF-4): a Chart.js line chart of the measure's absolute values by study day,
// with a custom beforeDatasetsDraw plugin painting the LLN–ULN normal-range
// band and the dashed population-extent guides in chart space, outlier points
// filled and in-range points hollow. Parity target: the original renderer's
// measureTable/lineChart/* (setDomain, drawNormalRange, drawPopulationExtent,
// updatePointFill). The measure table owns the expand/collapse lifecycle — this
// file only builds the chart; the caller destroys it on collapse and on any
// re-render.

import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip } from 'chart.js';

import { createElement } from '../shell.js';

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
        .map((point) => [x.getPixelForValue(point.day), y.getPixelForValue(point.uln)]);
      const lower = measure.spark
        .filter((point) => Number.isFinite(point.lln))
        .map((point) => [x.getPixelForValue(point.day), y.getPixelForValue(point.lln)])
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
 * absolute values by study day, outliers filled, band + guides painted by the
 * plugin, y-domain unioned with both. Returns the live Chart.js instance so the
 * measure table owns its teardown.
 * @param {HTMLElement} host The element to render into (the inset row's cell).
 * @param {Object} measure The measure model from buildProfileModel.
 * @returns {Object} The Chart.js instance.
 */
export function renderInset(host, measure) {
  const card = createElement('div', 'sv-profile-inset-card');
  const canvas = createElement('canvas', 'sv-profile-inset-canvas');
  // Text alternative for the inset canvas (PPRF-8).
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${measure.label} over time`);
  card.append(canvas);
  host.append(card);

  const points = measure.spark.filter((point) => Number.isFinite(point.value));
  const color = measure.color;
  const [yMin, yMax] = insetYDomain(measure);

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: measure.label,
          data: points.map((point) => ({ x: point.day, y: point.value })),
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
            // Visit context in the title (parity: the original lineChart's
            // addPointTitles: study day, visit, visit number, value).
            title: (items) => {
              if (!items.length) return '';
              const point = points[items[0].dataIndex];
              if (!point) return `Study day: ${items[0].parsed.x}`;
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
            label: (ctx) => `${measure.label}: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Study Day' } },
        y: {
          type: 'linear',
          min: yMin,
          max: yMax,
          title: { display: true, text: measure.label }
        }
      }
    },
    plugins: [bandGuidePlugin(measure)]
  });
}
