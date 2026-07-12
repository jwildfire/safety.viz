// Scale construction for the ae-timelines module (#26): a linear study-day
// x-axis mirrored at the top of the chart (the original's addTopXaxis /
// drawTopXaxis) and a category y-axis of participants in sorted order.

/**
 * The study-day domain spanned by a set of timeline events: earliest start
 * to latest stop day (start days count as stop days for zero-length events).
 */
export function dayDomain(events) {
  if (!events.length) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  events.forEach((event) => {
    if (event.start < min) min = event.start;
    if (event.start > max) max = event.start;
    if (event.end > max) max = event.end;
  });
  return [min, max];
}

/**
 * Chart.js scales for a timeline chart: bottom x-axis and mirrored top
 * x-axis sharing the study-day domain, and a category y-axis listing every
 * subject (no tick skipping — every participant keeps a labeled row).
 */
export function buildScales({ domain, subjects }) {
  const [min, max] = domain;
  return {
    x: {
      type: 'linear',
      position: 'bottom',
      min,
      max,
      title: { display: true, text: 'Study Day' }
    },
    x2: {
      type: 'linear',
      position: 'top',
      min,
      max,
      grid: { drawOnChartArea: false }
    },
    y: {
      type: 'category',
      labels: subjects,
      ticks: { autoSkip: false },
      grid: { display: true }
    }
  };
}
