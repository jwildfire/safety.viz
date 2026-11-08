// @vitest-environment jsdom
// Axis titles for the histogram (SH-AXIS-005/006, #347): the single-measure
// chart titles its x-axis with the measure and its unit and its y-axis with
// what each bar counts; each small multiple, in the overview and the grouped
// view, titles its y-axis. The original safety-histogram titled both axes; the
// port drew none. Display only: the bins, ticks and counts are unchanged.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { Chart } = await import('chart.js');
const { default: histogram } = await import('../../../src/histogram.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

const ALT = `${ALT_TEST} (U/L)`;
const COUNT = 'Number of results';

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

function build(settings = {}) {
  const instance = histogram(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    groups: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** The charts the latest render drew, main chart first. */
const drawn = (instance) => instance.charts;

const title = (chart, axis) => chart.options.scales[axis].title;

describe('histogram axis titles (#347)', () => {
  it('SH-AXIS-005: the single-measure chart titles its x-axis with the measure and unit, and its y-axis with what the bars count (#347)', () => {
    const instance = build({ start_value: ALT });
    const [main] = drawn(instance);
    expect(main).toBe(instance.chart);
    expect(title(main, 'x')).toEqual({ display: true, text: ALT });
    expect(title(main, 'y')).toEqual({ display: true, text: COUNT });
  });

  it('SH-AXIS-005: the x-axis title follows the Measure control (#347)', () => {
    const instance = build({ start_value: ALT });
    const other = instance.measures().find((measure) => measure !== ALT);
    instance.selectMeasure(other);
    expect(title(instance.chart, 'x').text).toBe(other);
  });

  it('SH-AXIS-005: the titles change no tick or count: the count axis stays integer-based at zero and the x ticks keep their rotation (#347)', () => {
    const instance = build({ start_value: ALT });
    const { x, y } = instance.chart.options.scales;
    expect(y.beginAtZero).toBe(true);
    expect(y.ticks).toEqual({ precision: 0 });
    expect(x.ticks).toEqual({ maxRotation: 45, minRotation: 0 });
    const counts = instance.chart.data.datasets[0].data;
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(instance.filteredData.length);
  });

  it('SH-AXIS-006: each all-measures overview panel titles its y-axis and leaves its x-axis untitled and unticked (#347)', () => {
    const instance = build();
    expect(instance.isOverview()).toBe(true);
    const panels = drawn(instance);
    expect(panels.length).toBe(instance.measures().length);
    for (const panel of panels) {
      expect(title(panel, 'y')).toEqual({ display: true, text: COUNT });
      expect(title(panel, 'x')).toBeUndefined();
      expect(panel.options.scales.x.ticks).toEqual({ display: false });
    }
  });

  it('SH-AXIS-006: each grouped small multiple titles its y-axis, under a titled single-measure chart (#347)', () => {
    const instance = build({ start_value: ALT, group_by: 'SEX' });
    const [main, ...multiples] = drawn(instance);
    expect(title(main, 'x').text).toBe(ALT);
    expect(multiples.length).toBeGreaterThan(1);
    for (const panel of multiples) {
      expect(title(panel, 'y')).toEqual({ display: true, text: COUNT });
      expect(title(panel, 'x')).toBeUndefined();
      expect(panel.options.scales.x.ticks).toEqual({ display: false });
    }
  });
});
