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
const { formatNumber } = await import('../../../src/histogram/getScales.js');
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

  // Small multiples (#359; @jwildfire, 2026-11-08: "One line + Hover. No #."
  // and, for the grouped panels, "Yes, same"): no y-axis title; the overview's
  // line says what the bars count, and a bar's tooltip gives its range and count.
  const tooltip = (chart) => chart.options.plugins.tooltip;
  const tipTitle = (chart, index) => tooltip(chart).callbacks.title([{ dataIndex: index }]);
  const tipLabel = (chart, index) =>
    tooltip(chart).callbacks.label({ dataIndex: index, raw: chart.data.datasets[0].data[index] });
  const range = (chart, index) => {
    const bin = chart.$shBins[index];
    const digits = chart.$shDigits;
    return `${formatNumber(bin.lower, digits)}–${formatNumber(bin.upper, digits)} U/L`;
  };

  it('SH-AXIS-006: no overview panel titles either axis, and the line above the grid says what the bars count (#359)', () => {
    const instance = build();
    expect(instance.isOverview()).toBe(true);
    const panels = drawn(instance);
    expect(panels.length).toBe(instance.measures().length);
    for (const panel of panels) {
      expect(title(panel, 'y')).toBeUndefined();
      expect(title(panel, 'x')).toBeUndefined();
      expect(panel.options.scales.x.ticks).toEqual({ display: false });
      expect(panel.options.scales.y.ticks).toEqual({ precision: 0 });
    }
    expect(instance.footnote.textContent).toBe(
      'Each bar counts results in its range of values. Click a chart to view that measure.'
    );
  });

  it('SH-AXIS-006: hovering an overview bar shows its range, with the unit, and its count of results; the panel stays a button (#359)', () => {
    const instance = build();
    for (const panel of drawn(instance)) {
      expect(tooltip(panel).enabled).toBe(true);
      expect(panel.options.events).toEqual(['mousemove', 'mouseout']);
      panel.$shBins.forEach((bin, index) => {
        expect(tipTitle(panel, index)).toBe(range(panel, index));
        const n = bin.records.length;
        expect(tipLabel(panel, index)).toBe(`${n} ${n === 1 ? 'result' : 'results'}`);
      });
    }
    const [first] = instance.multiplesWrap.querySelectorAll('.sv-overview-panel');
    expect(first.getAttribute('role')).toBe('button');
    first.onclick();
    expect(instance.isOverview()).toBe(false);
  });

  it('SH-AXIS-006: no grouped panel titles either axis, and hovering a bar shows its range and count, under a titled single-measure chart (#359)', () => {
    const instance = build({ start_value: ALT, group_by: 'SEX' });
    const [main, ...multiples] = drawn(instance);
    expect(title(main, 'x').text).toBe(ALT);
    expect(title(main, 'y').text).toBe(COUNT);
    expect(multiples.length).toBeGreaterThan(1);
    for (const panel of multiples) {
      expect(title(panel, 'y')).toBeUndefined();
      expect(title(panel, 'x')).toBeUndefined();
      expect(panel.options.scales.x.ticks).toEqual({ display: false });
      panel.$shBins.forEach((bin, index) => {
        expect(tipTitle(panel, index)).toBe(range(panel, index));
        expect(tipLabel(panel, index)).toMatch(/^\d+ results?$/);
      });
    }
    expect(instance.footnote.textContent).toBe('Hover over or click a bar for details.');
  });

  it('SH-AXIS-006: a bar holding one record says "1 result" (#359)', async () => {
    const { countLabel } = await import('../../../src/histogram/getPlugins.js');
    expect(countLabel(1)).toBe('1 result');
    expect(countLabel(0)).toBe('0 results');
    expect(countLabel(12)).toBe('12 results');
  });
});
