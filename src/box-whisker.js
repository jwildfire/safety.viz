// Shared box-and-whisker drawing for Chart.js canvases (#91). Promoted
// verbatim from results-over-time/getPlugins.js (HEP-CORE-010) so other
// modules — first hep-waterfall's flanking summary panels (#93) — can reuse
// the same marks: whiskers at the 5th/95th percentiles with caps, box Q1–Q3,
// median line, and a two-tone mean marker, projected through the chart's x/y
// scales from staged specs {stats, color, x, halfWidth} where stats carries
// {n, q5, q25, median, q75, q95, mean}. The drawing body must not change:
// results-over-time has shipped evidence baselines pinned to these pixels.

/**
 * Convert a #rrggbb color to an rgba() string at the given alpha.
 * @param {string} hex A #rrggbb color.
 * @param {number} alpha Opacity in [0, 1].
 * @returns {string} The rgba() color.
 */
export function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Draw box-and-whisker marks on a canvas: for each spec, a Q1–Q3 box, 5th/95th
 * percentile whiskers with caps, a median line, and a two-tone mean marker.
 * Specs whose stats are missing or empty (n of 0) are skipped. Marks are
 * clamped vertically to the chart area.
 * @param {CanvasRenderingContext2D} ctx The canvas context to draw on.
 * @param {{scales: Object, chartArea: Object}} chart The Chart.js chart (or a
 *   subset exposing scales.x/scales.y with getPixelForValue and chartArea).
 * @param {Array<{stats: Object, color: string, x: number, halfWidth: number}>} specs
 *   The staged box specs in data space.
 */
export function drawBoxWhisker(ctx, { scales, chartArea }, specs) {
  const yOf = (value) => scales.y.getPixelForValue(value);
  ctx.save();
  for (const box of specs) {
    const { stats, color } = box;
    if (!stats || !stats.n) continue;
    const centerX = scales.x.getPixelForValue(box.x);
    const left = scales.x.getPixelForValue(box.x - box.halfWidth);
    const right = scales.x.getPixelForValue(box.x + box.halfWidth);
    const clamp = (y) => Math.max(chartArea.top, Math.min(chartArea.bottom, y));

    // Box: Q1–Q3.
    ctx.fillStyle = hexToRgba(color, 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const top = clamp(yOf(stats.q75));
    const bottom = clamp(yOf(stats.q25));
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeRect(left, top, right - left, bottom - top);

    // Whiskers: q5→Q1 and Q3→q95, with caps at the 5th/95th percentiles.
    ctx.beginPath();
    ctx.moveTo(centerX, clamp(yOf(stats.q5)));
    ctx.lineTo(centerX, bottom);
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, clamp(yOf(stats.q95)));
    ctx.moveTo(left, clamp(yOf(stats.q5)));
    ctx.lineTo(right, clamp(yOf(stats.q5)));
    ctx.moveTo(left, clamp(yOf(stats.q95)));
    ctx.lineTo(right, clamp(yOf(stats.q95)));
    ctx.stroke();

    // Median line.
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.moveTo(left, clamp(yOf(stats.median)));
    ctx.lineTo(right, clamp(yOf(stats.median)));
    ctx.stroke();

    // Mean: outer light circle + inner colored dot.
    const meanY = clamp(yOf(stats.mean));
    const radius = Math.min((right - left) / 6, 6);
    ctx.beginPath();
    ctx.fillStyle = '#eee';
    ctx.arc(centerX, meanY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(centerX, meanY, radius / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A Chart.js plugin factory for the box-and-whisker marks: draws whatever
 * specs the getter yields at draw time, so callers can stage specs on their
 * instance between renders. The id prefix keeps concurrent charts' plugins
 * distinct (each call also appends a random suffix).
 * @param {string} idPrefix Module prefix for the plugin id (e.g. 'srot').
 * @param {function(): ?Array} getSpecs Returns the box specs to draw, or a
 *   nullish/empty value to draw nothing.
 * @returns {Object} A Chart.js plugin object.
 */
export function boxWhiskerPlugin(idPrefix, getSpecs) {
  return {
    id: `${idPrefix}-boxwhisker-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      const specs = getSpecs() || [];
      if (!specs.length) return;
      drawBoxWhisker(chart.ctx, chart, specs);
    }
  };
}
