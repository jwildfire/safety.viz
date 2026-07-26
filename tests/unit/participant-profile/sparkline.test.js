// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

import {
  SPARK_WIDTH,
  SPARK_HEIGHT,
  SPARK_OFFSET,
  sparkDomain,
  sparklineSVG
} from '../../../src/participant-profile/sparkline.js';

// A hand-built measure model (the buildProfileModel shape): three ALT results
// with two high outliers, LLN 5 / ULN 40, population extent [20, 200].
const measure = {
  key: 'ALT',
  label: 'Aminotransferase, alanine (ALT)',
  isKey: true,
  color: '#e41a1c',
  n: 3,
  min: 35,
  median: 80,
  max: 160,
  populationExtent: [20, 200],
  spark: [
    { day: 0, value: 35, lln: 5, uln: 40, outlier: false },
    { day: 30, value: 160, lln: 5, uln: 40, outlier: true },
    { day: 60, value: 80, lln: 5, uln: 40, outlier: true }
  ]
};

// The parity domain: values ∪ population extent, padded ×0.99 / ×1.01.
const yMin = 20 * 0.99;
const yMax = 200 * 1.01;

// Reference scales mirroring the spec geometry: day extent → [offset, width -
// offset], padded domain → [height - offset, offset].
function x(day) {
  return SPARK_OFFSET + ((day - 0) / (60 - 0)) * (SPARK_WIDTH - 2 * SPARK_OFFSET);
}
function y(value) {
  return (
    SPARK_HEIGHT -
    SPARK_OFFSET -
    ((value - yMin) / (yMax - yMin)) * (SPARK_HEIGHT - 2 * SPARK_OFFSET)
  );
}

function points(attr) {
  return attr
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
}

describe('sparkDomain (PPRF-4, PPRF-TBL-002)', () => {
  it('pads the union of participant values and the population extent ×0.99/×1.01', () => {
    expect(sparkDomain(measure)).toEqual([yMin, yMax]);
  });

  it('unions participant outliers beyond the population extent', () => {
    const wide = { ...measure, populationExtent: [40, 100] };
    expect(sparkDomain(wide)).toEqual([35 * 0.99, 160 * 1.01]);
  });
});

describe('sparklineSVG (PPRF-4, PPRF-TBL-002)', () => {
  it('builds a 100×25 svg with band, guides, line, and outliers — no listeners', () => {
    const svg = sparklineSVG(measure);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe(String(SPARK_WIDTH));
    expect(svg.getAttribute('height')).toBe(String(SPARK_HEIGHT));
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('.sv-spark-band')).not.toBeNull();
    expect(svg.querySelectorAll('.sv-spark-guide')).toHaveLength(2);
    expect(svg.querySelector('.sv-spark-line')).not.toBeNull();
    expect(svg.querySelectorAll('.sv-spark-outlier')).toHaveLength(2);
    expect(svg.onclick).toBeNull();
  });

  it('draws the LLN–ULN normal-range band polygon (ULN forward, LLN reversed)', () => {
    const band = sparklineSVG(measure).querySelector('.sv-spark-band');
    expect(band.getAttribute('fill')).toBe('#eee');
    expect(band.getAttribute('stroke')).toBe('none');
    const coords = points(band.getAttribute('points'));
    expect(coords).toHaveLength(6);
    // ULN at days 0/30/60, then LLN at days 60/30/0.
    [
      [x(0), y(40)],
      [x(30), y(40)],
      [x(60), y(40)],
      [x(60), y(5)],
      [x(30), y(5)],
      [x(0), y(5)]
    ].forEach(([ex, ey], index) => {
      expect(coords[index][0]).toBeCloseTo(ex, 6);
      expect(coords[index][1]).toBeCloseTo(ey, 6);
    });
  });

  it('draws dashed full-width guide lines at the population-extent values', () => {
    const guides = [...sparklineSVG(measure).querySelectorAll('.sv-spark-guide')];
    const ys = guides.map((line) => Number(line.getAttribute('y1'))).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(y(200), 6); // upper extent sits higher on the svg
    expect(ys[1]).toBeCloseTo(y(20), 6);
    guides.forEach((line) => {
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('x2')).toBe(String(SPARK_WIDTH));
      expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
      expect(line.getAttribute('stroke')).toBe('#ccc');
      expect(line.getAttribute('stroke-dasharray')).toBe('2 2');
    });
  });

  it('draws the value path in the measure color over the day-ordered points', () => {
    const line = sparklineSVG(measure).querySelector('.sv-spark-line');
    expect(line.getAttribute('stroke')).toBe('#e41a1c');
    expect(line.getAttribute('fill')).toBe('none');
    const coords = points(line.getAttribute('points'));
    expect(coords).toHaveLength(3);
    [
      [x(0), y(35)],
      [x(30), y(160)],
      [x(60), y(80)]
    ].forEach(([ex, ey], index) => {
      expect(coords[index][0]).toBeCloseTo(ex, 6);
      expect(coords[index][1]).toBeCloseTo(ey, 6);
    });
  });

  it('marks outliers with filled r=2 circles in the measure color', () => {
    const circles = [...sparklineSVG(measure).querySelectorAll('.sv-spark-outlier')];
    expect(circles).toHaveLength(2);
    const expected = [
      [x(30), y(160)],
      [x(60), y(80)]
    ];
    circles.forEach((circle, index) => {
      expect(Number(circle.getAttribute('cx'))).toBeCloseTo(expected[index][0], 6);
      expect(Number(circle.getAttribute('cy'))).toBeCloseTo(expected[index][1], 6);
      expect(circle.getAttribute('r')).toBe('2');
      expect(circle.getAttribute('fill')).toBe('#e41a1c');
      expect(circle.getAttribute('stroke')).toBe('#e41a1c');
    });
  });

  it('centers a single-day series instead of dividing by zero', () => {
    const single = {
      ...measure,
      spark: [{ day: 10, value: 35, lln: 5, uln: 40, outlier: false }]
    };
    const line = sparklineSVG(single).querySelector('.sv-spark-line');
    const [[cx]] = points(line.getAttribute('points'));
    expect(cx).toBeCloseTo(SPARK_WIDTH / 2, 6);
  });
});
