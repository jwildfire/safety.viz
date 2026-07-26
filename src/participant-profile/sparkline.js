// The inline-SVG sparkline for the participant-profile measure table (#98,
// PPRF-4): a ~100×25 static miniature per table row — the LLN–ULN normal-range
// band polygon, dashed population-extent guide lines at the configured
// measureBounds quantiles, the value path in the measure color, and filled r=2
// circles on out-of-range results. Parity target: the original renderer's
// sparkLine/addSparkLines.js, including its padded y-domain (values ∪
// population extent, ×0.99/×1.01). Pure DOM builder — dozens render per table,
// so no canvas instances and no listeners (the spark cell's button owns
// interaction, see measureTable.js).

export const SPARK_WIDTH = 100;
export const SPARK_HEIGHT = 25;
export const SPARK_OFFSET = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

/**
 * The padded sparkline y-domain (PPRF-4, parity addSparkLines): the union of
 * the participant's values and the population extent, ×0.99 below and ×1.01
 * above, so population guides and any participant outliers both stay in view.
 * @param {Object} measure The measure model ({ spark, populationExtent }).
 * @returns {[number, number]} The [min, max] y-domain.
 */
export function sparkDomain(measure) {
  const pool = measure.spark
    .map((point) => point.value)
    .concat(measure.populationExtent || [])
    .filter(Number.isFinite);
  if (!pool.length) return [0, 1];
  return [Math.min(...pool) * 0.99, Math.max(...pool) * 1.01];
}

// Linear scale factory: domain → range, constant at the range midpoint when
// the domain collapses (a single study day, or a flat series).
function linear([d0, d1], [r0, r1]) {
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

function pointsAttr(coords) {
  return coords.map(([px, py]) => `${px},${py}`).join(' ');
}

/**
 * Build the sparkline SVG for one measure-table row (PPRF-4). Pure: consumes
 * the measure model from buildProfileModel, returns a detached, listener-free
 * SVG element marked aria-hidden (the table row carries the numbers; the cell
 * button carries the interaction).
 * @param {Object} measure The measure model ({ color, spark, populationExtent }).
 * @returns {SVGElement} The sparkline.
 */
export function sparklineSVG(measure) {
  const svg = svgElement('svg', {
    class: 'sv-spark',
    width: SPARK_WIDTH,
    height: SPARK_HEIGHT,
    'aria-hidden': 'true'
  });

  const spark = measure.spark || [];
  const days = spark.map((point) => point.day).filter(Number.isFinite);
  if (!days.length) return svg;

  const x = linear(
    [Math.min(...days), Math.max(...days)],
    [SPARK_OFFSET, SPARK_WIDTH - SPARK_OFFSET]
  );
  const y = linear(sparkDomain(measure), [SPARK_HEIGHT - SPARK_OFFSET, SPARK_OFFSET]);

  // The LLN–ULN normal-range band: ULN vertices forward, LLN vertices reversed
  // (parity: the original's merged upper + lower path).
  const upper = spark
    .filter((point) => Number.isFinite(point.uln))
    .map((point) => [x(point.day), y(point.uln)]);
  const lower = spark
    .filter((point) => Number.isFinite(point.lln))
    .map((point) => [x(point.day), y(point.lln)])
    .reverse();
  const band = upper.concat(lower);
  if (band.length) {
    svg.append(
      svgElement('polygon', {
        class: 'sv-spark-band',
        points: pointsAttr(band),
        fill: '#eee',
        stroke: 'none'
      })
    );
  }

  // Dashed full-width guides at the population-extent values (PPRF-4).
  (measure.populationExtent || []).filter(Number.isFinite).forEach((value) => {
    svg.append(
      svgElement('line', {
        class: 'sv-spark-guide',
        x1: 0,
        x2: SPARK_WIDTH,
        y1: y(value),
        y2: y(value),
        stroke: '#ccc',
        'stroke-dasharray': '2 2'
      })
    );
  });

  // The value path, in the measure color.
  const valuePoints = spark
    .filter((point) => Number.isFinite(point.value))
    .map((point) => [x(point.day), y(point.value)]);
  if (valuePoints.length) {
    svg.append(
      svgElement('polyline', {
        class: 'sv-spark-line',
        points: pointsAttr(valuePoints),
        fill: 'none',
        stroke: measure.color,
        'stroke-width': 1
      })
    );
  }

  // Filled circles on out-of-range results.
  spark
    .filter((point) => point.outlier && Number.isFinite(point.value))
    .forEach((point) => {
      svg.append(
        svgElement('circle', {
          class: 'sv-spark-outlier',
          cx: x(point.day),
          cy: y(point.value),
          r: 2,
          stroke: measure.color,
          fill: measure.color
        })
      );
    });

  return svg;
}
