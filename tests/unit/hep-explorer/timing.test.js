// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// hep-explorer's 30-day timing test runs only on study days, and says when it
// could not (#376, obot.roadmap#437). A participant is drawn hollow when their
// peak ALT and peak bilirubin are more than visit_window days apart. The test
// reads the day option's column whatever the time slider's view, never the
// visit number; with no study day it is "not evaluated", and every point is
// drawn one neutral way. Chart.js is stubbed the way the other jsdom module
// tests stub it.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
    stop() {}
    getDatasetMeta() {
      return { data: [] };
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    CategoryScale: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    TimeScale: stub(),
    Title: stub(),
    Tooltip: stub(),
    Legend: stub(),
    Filler: stub()
  };
});

const { default: hepExplorer } = await import('../../../src/hep-explorer.js');
const { pointTooltip } = await import('../../../src/hep-explorer/getPlugins.js');

const MEASURES = { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' };
const BASE = {
  id_col: 'ID',
  measure_col: 'TEST',
  value_col: 'VALUE',
  normal_col_high: 'ULN',
  studyday_col: 'DAY',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  measure_values: MEASURES,
  profile: false
};

// GAP's ALT peaks at Week 2 (day 10) and its bilirubin at Week 8 (day 55): 45
// days apart, but only six visit numbers. NEAR's two peaks share Week 2.
const rec = (id, test, value, uln, day, visit, visitnum) => ({
  ID: id,
  TEST: test,
  VALUE: value,
  ULN: uln,
  DAY: day,
  VISIT: visit,
  VISITNUM: visitnum
});
const RAW = [
  rec('GAP', 'ALT', 40, 40, 1, 'Baseline', 0),
  rec('GAP', 'ALT', 200, 40, 10, 'Week 2', 2),
  rec('GAP', 'ALT', 80, 40, 55, 'Week 8', 8),
  rec('GAP', 'TB', 1, 1, 1, 'Baseline', 0),
  rec('GAP', 'TB', 1.5, 1, 10, 'Week 2', 2),
  rec('GAP', 'TB', 3, 1, 55, 'Week 8', 8),
  rec('NEAR', 'ALT', 40, 40, 1, 'Baseline', 0),
  rec('NEAR', 'ALT', 160, 40, 10, 'Week 2', 2),
  rec('NEAR', 'TB', 1, 1, 1, 'Baseline', 0),
  rec('NEAR', 'TB', 2.5, 1, 10, 'Week 2', 2)
];
const withoutDay = () => RAW.map(({ DAY, ...rest }) => rest);

let element;
beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
});

const mount = (settings = {}, data = RAW) =>
  hepExplorer(element, { ...BASE, ...settings }).init(data);
const point = (instance, id) => instance.points.find((entry) => String(entry.id) === id);
const style = (instance, key, id) => {
  const dataset = instance.chart.config.data.datasets[0];
  const dataIndex = instance.points.findIndex((entry) => String(entry.id) === id);
  return dataset[key]({ dataIndex });
};
const visitOption = (axis) => ({
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT' },
    { key: 'day', col: axis }
  ],
  default: 'visit'
});

describe('hep-explorer timing on study days (HEP-XAX-006)', () => {
  it('HEP-XAX-006: peaks 45 study days apart are drawn hollow, peaks on one day filled (#376)', () => {
    const instance = mount();
    expect(point(instance, 'GAP')).toMatchObject({
      day_diff: 45,
      withinWindow: false,
      timing: 'outside'
    });
    expect(point(instance, 'NEAR')).toMatchObject({
      day_diff: 0,
      withinWindow: true,
      timing: 'within'
    });
    expect(style(instance, 'pointBackgroundColor', 'GAP')).toBe('rgba(0,0,0,0)');
    expect(style(instance, 'pointBackgroundColor', 'NEAR')).not.toBe('rgba(0,0,0,0)');
  });

  it('HEP-XAX-006: in Visit view the test still measures study days, never visit numbers (#376)', () => {
    // Opened on Visit, and switched to it: six visit numbers apart is still
    // 45 study days apart.
    const opened = mount({ x_axis: visitOption('DAY') });
    expect(opened.state.xAxis ?? opened.timeAxis.active).toBe('visit');
    expect(point(opened, 'GAP')).toMatchObject({ day_diff: 45, timing: 'outside' });
    const switched = mount();
    element.querySelector('.hep-animation-axis [data-key="visit"]').click();
    expect(switched.state.xAxis).toBe('visit');
    switched.render();
    expect(point(switched, 'GAP')).toMatchObject({ day_diff: 45, timing: 'outside' });
  });

  it("HEP-XAX-006: the test reads the x_axis day option's column, not studyday_col (#376)", () => {
    // ADY holds the real days; DAY holds visit-like numbers that would put
    // GAP's peaks six apart.
    const data = RAW.map((row) => ({ ...row, ADY: row.DAY, DAY: row.VISITNUM }));
    const instance = mount({ studyday_col: 'DAY', x_axis: visitOption('ADY') }, data);
    expect(point(instance, 'GAP')).toMatchObject({ day_diff: 45, timing: 'outside' });
  });
});

describe('hep-explorer timing without study days (HEP-XAX-007)', () => {
  it('HEP-XAX-007: with no study day every point is not evaluated and drawn as a cross, neither filled nor hollow (#376)', () => {
    const instance = mount({}, withoutDay());
    expect(instance.points.map((entry) => entry.timing)).toEqual([
      'not_evaluated',
      'not_evaluated'
    ]);
    expect(instance.points.every((entry) => entry.withinWindow === null)).toBe(true);
    ['GAP', 'NEAR'].forEach((id) => expect(style(instance, 'pointStyle', id)).toBe('crossRot'));
    // On dated data the same chart draws circles.
    const dated = mount();
    ['GAP', 'NEAR'].forEach((id) => expect(style(dated, 'pointStyle', id)).toBe('circle'));
  });

  it('HEP-XAX-007: the footnote says timing was not evaluated and why (#376)', () => {
    mount({}, withoutDay());
    expect(element.querySelector('.sv-footnote').textContent).toBe(
      'Use controls to update the chart or click a point to see participant details. ' +
        'Timing was not evaluated: the data has no study day, so each point is drawn as a ' +
        'cross, neither filled (peak ALT and peak TB within 30 days of each other) nor hollow.'
    );
    mount();
    expect(element.querySelector('.sv-footnote').textContent).toContain(
      "Points are filled when a participant's peak ALT and peak TB occur within 30 days of each other."
    );
  });

  it('HEP-XAX-007: the tooltip leaves out "days apart" and says the timing was not evaluated (#376)', () => {
    const instance = mount({}, withoutDay());
    const lines = pointTooltip(point(instance, 'GAP'), instance.state, MEASURES);
    expect(lines.join('\n')).not.toContain('days apart');
    expect(lines).toContain('Timing not evaluated (no study day)');
  });

  it('HEP-XAX-007: the Study day option is greyed out and says why (#376)', () => {
    mount({}, withoutDay());
    const day = element.querySelector('.hep-animation-axis [data-key="day"]');
    expect(day.disabled).toBe(true);
    expect(day.title).toBe('No study day in this data');
    // With studyday_col unset the option is still offered, greyed.
    mount({ studyday_col: null }, withoutDay());
    expect(element.querySelector('.hep-animation-axis [data-key="day"]').disabled).toBe(true);
  });

  it('HEP-XAX-007: a participant whose peak has no study day is not evaluated, and the notes count them (#376)', () => {
    const data = RAW.map((row) =>
      row.ID === 'NEAR' && row.TEST === 'TB' && row.VISIT === 'Week 2' ? { ...row, DAY: '' } : row
    );
    const instance = mount({}, data);
    expect(point(instance, 'GAP').timing).toBe('outside');
    expect(point(instance, 'NEAR').timing).toBe('not_evaluated');
    expect(style(instance, 'pointStyle', 'NEAR')).toBe('crossRot');
    expect(instance.notes.textContent).toContain(
      '1 participant not evaluated for timing: a peak has no study day (drawn as a cross).'
    );
  });
});
