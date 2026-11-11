// @vitest-environment jsdom
// The outlier explorer's main x-axis takes the shared x_axis setting (#371,
// obot.roadmap#436): Visit or Study day, chosen with the shared X-axis control
// in the "X-axis" section. `time_cols` from the original chart still works as
// a synonym. With neither a visit nor a study day the chart shows a message
// instead of a chart, and the old "Measurement" sequence axis is gone.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    ScatterController: stub(),
    LineController: stub(),
    PointElement: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { Chart } = await import('chart.js');
const { default: outlierExplorer } = await import('../../../src/outlier-explorer.js');
const { NO_TIME_AXIS } = await import('../../../src/x-axis.js');
const { makeRows } = await import('../participant-profile/fixture.js');

const X_AXIS = {
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
    { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
  ],
  default: 'visit'
};

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

function build(settings, rows = makeRows()) {
  const instance = outlierExplorer(document.querySelector('#host'), {
    profile: false,
    ...settings
  });
  instance.init(rows);
  return instance;
}

const live = () => Chart.built.filter((chart) => !chart.destroyed);
const xScale = () => live()[0].options.scales.x;

/** The X-axis section of the sidebar, and the buttons of its control. */
function xAxisSection(instance) {
  return [...instance.controls.querySelectorAll('.sv-control-section')].find(
    (section) => section.querySelector('.sv-section-title')?.textContent === 'X-axis'
  );
}
const button = (instance, title) =>
  [...xAxisSection(instance).querySelectorAll('.sv-xaxis-option')].find(
    (candidate) => candidate.textContent === title
  );

describe('outlier explorer: the main x-axis', () => {
  it('SOE-XAX-001: x_axis drives the main axis and the shared X-axis control (#371)', () => {
    const instance = build({ x_axis: X_AXIS });
    const section = xAxisSection(instance);
    expect(section).toBeTruthy();
    expect(section.querySelector('.sv-xaxis-control')).toBeTruthy();
    // The original chart's "Plot by" select is gone.
    expect(section.querySelector('select')).toBeNull();
    expect(
      [...section.querySelectorAll('.sv-xaxis-option')].map((option) => option.textContent)
    ).toEqual(['Visit', 'Study day']);

    button(instance, 'Study day').onclick();
    expect(xScale().type).toBe('linear');
    expect(xScale().title.text).toBe('Study day');
    expect(button(instance, 'Study day').getAttribute('aria-pressed')).toBe('true');

    button(instance, 'Visit').onclick();
    expect(xScale().type).toBe('category');
    expect(xScale().title.text).toBe('Visit');
    // Visit view: the ticks are the visit names, in visit-number order.
    expect(xScale().labels[0]).toBe('Baseline');
  });

  it('SOE-XAX-002: time_cols still works, read as the x_axis options (#371)', () => {
    const instance = build({
      time_cols: [
        { value_col: 'DY', label: 'Study Day', type: 'linear' },
        { value_col: 'VISIT', label: 'Visit', type: 'ordinal', order_col: 'VISITNUM' }
      ]
    });
    expect(
      [...xAxisSection(instance).querySelectorAll('.sv-xaxis-option')].map(
        (option) => option.textContent
      )
    ).toEqual(['Study Day', 'Visit']);
    // It opens on Visit by key, although Study Day is listed first.
    expect(xScale().type).toBe('category');
    expect(xScale().labels[0]).toBe('Baseline');
    button(instance, 'Study Day').onclick();
    expect(xScale().type).toBe('linear');
    expect(xScale().title.text).toBe('Study Day');
  });

  it("SOE-XAX-004: the chart opens on the setting's default view by key, not on the first option (#371)", () => {
    const options = [X_AXIS.options[1], X_AXIS.options[0]];
    const visit = build({ x_axis: { options, default: 'visit' } });
    expect(xScale().type).toBe('category');
    expect(button(visit, 'Visit').getAttribute('aria-pressed')).toBe('true');

    Chart.built.length = 0;
    document.body.innerHTML = '<div id="host"></div>';
    build({ x_axis: { ...X_AXIS, default: 'day' } });
    expect(xScale().type).toBe('linear');
  });

  it('SOE-XAX-004: Reset chart puts the x-axis back on the default view (#371)', () => {
    const instance = build({ x_axis: X_AXIS });
    button(instance, 'Study day').onclick();
    expect(xScale().type).toBe('linear');
    instance.controls.querySelector('.sv-reset').onclick();
    expect(xScale().type).toBe('category');
    expect(button(instance, 'Visit').getAttribute('aria-pressed')).toBe('true');
  });

  it('SOE-XAX-005: an option the data cannot draw is greyed with its reason, and the control still shows (#371)', () => {
    const noDay = makeRows().map(({ DY, ...row }) => row);
    const instance = build({ x_axis: { ...X_AXIS, default: 'day' } }, noDay);
    const day = button(instance, 'Study day');
    expect(day.disabled).toBe(true);
    expect(day.title).toBe('No study day in this data');
    // The default it cannot draw gives way to the view it can.
    expect(button(instance, 'Visit').getAttribute('aria-pressed')).toBe('true');
    expect(xScale().type).toBe('category');

    // One option configured: the control shows all the same.
    document.body.innerHTML = '<div id="host"></div>';
    const single = build({ x_axis: { options: [X_AXIS.options[0]] } });
    expect(xAxisSection(single).querySelectorAll('.sv-xaxis-option')).toHaveLength(1);
  });

  it('SOE-XAX-006: the tooltip and the listing name both the visit and the study day (#371)', () => {
    const rows = makeRows().map((row) =>
      row.VISIT === 'Day 30' ? { ...row, VISIT: 'Week 4', DY: 29 } : row
    );
    const instance = build({ x_axis: X_AXIS }, rows);
    const index = instance.pointMeta.findIndex((meta) => meta && meta.point.raw.VISIT === 'Week 4');
    const label = (view) =>
      live()[0].options.plugins.tooltip.callbacks.label({ datasetIndex: 0, dataIndex: index });
    expect(label()[2]).toBe('Week 4 · Day 29');
    expect(instance.pointMeta[index].point.raw.__oe_timeLabel).toBe('Week 4 · Day 29');
    // The same in Study day view: the tooltip does not change with the view.
    button(instance, 'Study day').onclick();
    expect(label()[2]).toBe('Week 4 · Day 29');
  });

  it('SOE-XAX-007: with neither a visit nor a study day the chart shows a message and no chart (#371)', () => {
    const neither = makeRows().map(({ DY, VISIT, VISITNUM, ...row }) => row);
    let instance;
    expect(() => {
      instance = build({ x_axis: X_AXIS }, neither);
    }).not.toThrow();
    const message = instance.main.querySelector('.sv-no-time-axis');
    expect(message).toBeTruthy();
    expect(message.textContent).toBe(NO_TIME_AXIS);
    expect(live()).toHaveLength(0);
    expect(instance.chart).toBeNull();
    expect(instance.chartWrap.hidden).toBe(true);
    // Both options are greyed, each with its reason.
    expect(button(instance, 'Visit').disabled).toBe(true);
    expect(button(instance, 'Study day').disabled).toBe(true);
    // No derived "Measurement" axis stands in for the missing time axis.
    expect(instance.main.textContent).not.toContain('Measurement');
  });

  it('SOE-XAX-007: with no time setting at all there is no Measurement sequence axis, only the message (#371)', () => {
    // The visit and study-day columns have defaults (#370, #384), so "no time
    // setting" sets each to null.
    const instance = build({ visitn_col: null, visit_col: null, studyday_col: null });
    expect(instance.main.querySelector('.sv-no-time-axis').textContent).toBe(NO_TIME_AXIS);
    expect(live()).toHaveLength(0);
  });

  it('SOE-XAX-007: the message goes when data with a time axis arrives (#371)', () => {
    const neither = makeRows().map(({ DY, VISIT, VISITNUM, ...row }) => row);
    const instance = build({ x_axis: X_AXIS }, neither);
    instance.setData(makeRows());
    expect(instance.main.querySelector('.sv-no-time-axis')).toBeNull();
    expect(instance.chartWrap.hidden).toBe(false);
    expect(live()).toHaveLength(1);
  });
});
