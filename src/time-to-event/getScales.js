// Scales for the time-to-event module (#128): the tick generator the in-canvas
// risk table aligns to, and the display-orientation transform (design D2). The
// ticks are generated here rather than left to Chart.js so the risk-table plugin
// and the axis are guaranteed to agree on the same times (TTE-RISK-002).

/** Nice step ladder: 1/2/5 per decade. */
const STEP_LADDER = [1, 2, 5];

/** Target maximum number of intervals on the time axis. */
const MAX_INTERVALS = 7;

/**
 * Generate the time-axis ticks: the smallest 1/2/5-decade step that covers
 * maxTime in at most seven intervals, from zero.
 * @param {number} maxTime The largest observed time.
 * @returns {{step: number, max: number, ticks: number[]}} The step, the axis
 *   maximum (last tick), and the tick values.
 */
export function axisTicks(maxTime) {
  const extent = Number.isFinite(maxTime) && maxTime > 0 ? maxTime : 1;
  let step = 1;
  for (let decade = 1; ; decade *= 10) {
    for (const base of STEP_LADDER) {
      step = base * decade;
      if (Math.ceil(extent / step) <= MAX_INTERVALS) {
        const max = Math.ceil(extent / step) * step;
        const ticks = [];
        for (let t = 0; t <= max; t += step) ticks.push(t);
        return { step, max, ticks };
      }
    }
  }
}

/**
 * Transform a survival value to the display orientation (D2).
 * @param {number} surv S(t).
 * @param {string} direction `incidence` or `survival`.
 * @returns {number} 1 − S(t) for incidence, S(t) for survival.
 */
export function displayValue(surv, direction) {
  return direction === 'incidence' ? 1 - surv : surv;
}

/**
 * Transform a confidence interval to the display orientation: incidence flips
 * and swaps the bounds; undefined bounds stay undefined (never extrapolated).
 * @param {{lo: ?number, hi: ?number}} point A km.js point (or any {lo, hi}).
 * @param {string} direction `incidence` or `survival`.
 * @returns {{lo: ?number, hi: ?number}} The display-space bounds.
 */
export function bandValues(point, direction) {
  if (point.lo == null || point.hi == null) return { lo: null, hi: null };
  if (direction !== 'incidence') return { lo: point.lo, hi: point.hi };
  return { lo: 1 - point.hi, hi: 1 - point.lo };
}

/**
 * The y-axis title always names the estimator (TTE-CURV-004) — never a bare
 * percentage, because 1 − KM and "absolute risk" are not the same claim.
 * @param {string} direction `incidence` or `survival`.
 * @returns {string} The axis title.
 */
export function yAxisTitle(direction) {
  return direction === 'incidence'
    ? 'Cumulative incidence (1 − KM)'
    : 'Event-free probability (KM)';
}

/**
 * The x-axis title names the analysis time origin and unit.
 * @param {string} timeUnit The time unit label (e.g. `day`).
 * @returns {string} The axis title.
 */
export function xAxisTitle(timeUnit) {
  return `Time since first dose (${timeUnit}s)`;
}

/**
 * Format a proportion as a whole percentage.
 * @param {number} value A proportion in [0, 1].
 * @returns {string} e.g. `25%`.
 */
export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Format a proportion as a percentage with one decimal.
 * @param {number} value A proportion in [0, 1].
 * @returns {string} e.g. `25.0%`.
 */
export function formatPercent1(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Build the Chart.js scales: a linear time axis over the generated ticks and a
 * [0, 1] probability axis with percent labels, titled with the estimator name.
 * @param {{maxTime: number, direction: string, timeUnit: string}} spec The axis spec.
 * @returns {Object} Chart.js `scales` options.
 */
export function buildScales({ maxTime, direction, timeUnit }) {
  const { step, max } = axisTicks(maxTime);
  return {
    x: {
      type: 'linear',
      min: 0,
      max,
      ticks: { stepSize: step, maxRotation: 0, color: '#52616f' },
      grid: { color: 'rgba(148, 163, 184, 0.18)' },
      title: { display: true, text: xAxisTitle(timeUnit), color: '#334155' }
    },
    y: {
      type: 'linear',
      min: 0,
      max: 1,
      ticks: { stepSize: 0.25, callback: (value) => formatPercent(value), color: '#52616f' },
      grid: { color: 'rgba(148, 163, 184, 0.18)' },
      title: { display: true, text: yAxisTitle(direction), color: '#334155' }
    }
  };
}
