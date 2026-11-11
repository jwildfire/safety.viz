// @vitest-environment jsdom
// The shift plot has no time axis: it compares the visits the reader chose
// (#374, obot.roadmap#436). Its listing says which visits each pair compares,
// and on which study days, in a Visit column and — when `studyday_col` is
// configured — a Study day column, baseline first: "Baseline → Week 12" and
// "-7 → 85".
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
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
const { default: shiftPlot } = await import('../../../src/shift-plot.js');
const { syncSettings } = await import('../../../src/shift-plot/configure.js');

const row = (id, visit, visitnum, value, day) => ({
  USUBJID: id,
  TEST: 'Albumin',
  STRESU: 'g/L',
  STRESN: String(value),
  STNRLO: '33',
  STNRHI: '49',
  VISIT: visit,
  VISITNUM: String(visitnum),
  DY: day === null ? '' : String(day)
});

const rows = [
  row('P1', 'Baseline', 0, 38, -7),
  row('P1', 'Week 8', 8, 39, 57),
  row('P1', 'Week 12', 12, 41, 85),
  row('P2', 'Baseline', 0, 40, -3),
  row('P2', 'Week 12', 12, 42, null)
];

function build(settings, data = rows) {
  document.body.innerHTML = '<div id="host"></div>';
  const instance = shiftPlot(document.querySelector('#host'), {
    baseline_visits: ['Baseline'],
    comparison_visits: ['Week 8', 'Week 12'],
    profile: false,
    ...settings
  });
  instance.init(data);
  // Select every pair, as a brush over the whole plot does; the brush's pixel
  // geometry needs a real canvas, so this enters past it.
  instance.showSelection(new Set(instance.chartPairs.map((_, index) => index)), null);
  return instance;
}

const headers = (instance) =>
  [...instance.listingWrap.querySelectorAll('th')].map((th) =>
    th.textContent.replace(/[ ▲▼]+$/, '')
  );
const cells = (instance, id) =>
  [...instance.listingWrap.querySelectorAll('tbody tr')]
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))
    .find((values) => values[0] === id);

beforeEach(() => {
  Chart.built.length = 0;
});

describe('shift plot listing names the visits and study days it compares', () => {
  it('SSP-XAX-001: the listing shows a Visit and a Study day column, baseline then comparison, when the columns are configured (#374)', () => {
    expect(syncSettings({ studyday_col: 'DY' }).details.map((detail) => detail.label)).toEqual([
      'Participant ID',
      'Visit',
      'Study day',
      'Baseline',
      'Comparison',
      'Change',
      'Percent Change'
    ]);

    const instance = build({ studyday_col: 'DY' });
    expect(headers(instance).slice(0, 3)).toEqual(['Participant ID', 'Visit', 'Study day']);
    expect(cells(instance, 'P1').slice(1, 3)).toEqual([
      'Baseline → Week 8, Week 12',
      '-7 → 57, 85'
    ]);
    // Only the visits a pair used, and a blank day says so.
    expect(cells(instance, 'P2').slice(1, 3)).toEqual(['Baseline → Week 12', '-3 → —']);

    // No study-day column configured: the Visit column alone.
    // studyday_col defaults to DY since #370; null leaves the column out.
    expect(headers(build({}))).toContain('Study day');
    const visitOnly = build({ studyday_col: null });
    expect(headers(visitOnly)).not.toContain('Study day');
    expect(cells(visitOnly, 'P1')[1]).toBe('Baseline → Week 8, Week 12');
  });

  it('SSP-XAX-001: with no study day in the data, the default listing leaves the Study day column out (#384)', () => {
    const noDay = rows.map(({ DY, ...rest }) => rest);
    expect(headers(build({}, noDay))).not.toContain('Study day');
    // Data with a study day brings it back.
    const instance = build({}, noDay);
    instance.setData(rows);
    instance.showSelection(new Set(instance.chartPairs.map((_, index) => index)), null);
    expect(headers(instance)).toContain('Study day');
  });
});
