// @vitest-environment jsdom
// The Axis Type control for the shift-plot module (#136), answering the oldest
// request in the legacy sweep (RhoInc/safety-shift-plot#3, April 2016):
// "Auto-scaling was throwing people off ... toggle between log axis and
// linear." Because the module has ONE domain shared by both axes — that is
// what keeps the dashed identity line meaning y = x — the toggle switches the
// pair together (SSP-SCALE-001). A log axis has no room for zero or a negative
// number, so a pair with a non-positive baseline OR comparison value is
// removed rather than clamped, and the removal is REPORTED in the note above
// the chart (SSP-SCALE-003) — a silently dropped participant would be a lie
// about the data. Requirement keys route via docs/shift-plot-coverage.md.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
    getDatasetMeta() {
      return { data: [] };
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

const { default: shiftPlot } = await import('../../../src/shift-plot.js');

// Four participants with a Baseline and a Week 12 Albumin result. S4's
// baseline is 0 — a real possibility for a measure with a zero floor, and the
// one value a log axis cannot place.
const rows = [
  { USUBJID: 'S1', TEST: 'Albumin', STRESN: '10', VISIT: 'Baseline', VISITNUM: '1' },
  { USUBJID: 'S1', TEST: 'Albumin', STRESN: '14', VISIT: 'Week 12', VISITNUM: '2' },
  { USUBJID: 'S2', TEST: 'Albumin', STRESN: '20', VISIT: 'Baseline', VISITNUM: '1' },
  { USUBJID: 'S2', TEST: 'Albumin', STRESN: '15', VISIT: 'Week 12', VISITNUM: '2' },
  { USUBJID: 'S3', TEST: 'Albumin', STRESN: '8', VISIT: 'Baseline', VISITNUM: '1' },
  { USUBJID: 'S3', TEST: 'Albumin', STRESN: '9', VISIT: 'Week 12', VISITNUM: '2' },
  { USUBJID: 'S4', TEST: 'Albumin', STRESN: '0', VISIT: 'Baseline', VISITNUM: '1' },
  { USUBJID: 'S4', TEST: 'Albumin', STRESN: '11', VISIT: 'Week 12', VISITNUM: '2' }
];

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = shiftPlot(document.querySelector('#host'), { profile: false, ...settings });
  instance.init(rows.map((row) => ({ ...row })));
  return instance;
}

/** The labelled <select> the Axis Type control renders, or null when absent. */
function axisControl(instance) {
  const wrap = [...instance.controls.querySelectorAll('.sv-control')].find((el) => {
    const label = el.querySelector('label');
    return label && label.textContent === 'Axis Type';
  });
  return wrap ? wrap.querySelector('select') : null;
}

function setAxisType(instance, value) {
  const select = axisControl(instance);
  expect(select).not.toBeNull();
  select.value = value;
  select.onchange();
}

describe('shift-plot axis-type toggle (SSP-SCALE)', () => {
  it('SSP-SCALE-001: an Axis Type control offers linear and log, starting on linear (#136)', () => {
    const instance = build();
    const select = axisControl(instance);
    expect(select).not.toBeNull();
    expect([...select.options].map((opt) => opt.value)).toEqual(['linear', 'log']);
    expect(select.value).toBe('linear');
    expect(instance.chart.options.scales.x.type).toBe('linear');
  });

  it('SSP-SCALE-001: choosing log switches both chart axes together, never one alone (#136)', () => {
    const instance = build();
    setAxisType(instance, 'log');
    const scales = instance.chart.options.scales;
    expect(scales.x.type).toBe('logarithmic');
    expect(scales.y.type).toBe('logarithmic');
    expect(scales.x.min).toBe(scales.y.min);
    expect(scales.x.max).toBe(scales.y.max);
  });

  it('SSP-SCALE-002: the shared domain stays strictly positive under the log scale (#136)', () => {
    const instance = build();
    setAxisType(instance, 'log');
    expect(instance.state.domain[0]).toBeGreaterThan(0);
    expect(instance.chart.options.scales.x.min).toBeGreaterThan(0);
  });

  it('SSP-SCALE-003: a pair with a non-positive value is removed on the log scale and the removal is reported (#136)', () => {
    const instance = build();
    expect(instance.chartPairs).toHaveLength(4);
    expect(instance.notes.textContent).toContain('4 of 4 participants shown');

    setAxisType(instance, 'log');
    expect(instance.chartPairs).toHaveLength(3);
    expect(instance.chartPairs.some((pair) => pair.USUBJID === 'S4')).toBe(false);
    expect(instance.notes.textContent).toContain('3 of 4 participants shown');
    expect(instance.notes.textContent).toMatch(/nonpositive/i);
    expect(instance.notes.innerHTML).toContain('sv-warning');
  });

  it('SSP-SCALE-003: switching back to linear restores the removed pair and clears the note (#136)', () => {
    const instance = build();
    setAxisType(instance, 'log');
    expect(instance.chartPairs).toHaveLength(3);

    setAxisType(instance, 'linear');
    expect(instance.chartPairs).toHaveLength(4);
    expect(instance.notes.textContent).toContain('4 of 4 participants shown');
    expect(instance.notes.textContent).not.toMatch(/nonpositive/i);
    expect(instance.chart.options.scales.x.type).toBe('linear');
  });

  it('SSP-SCALE-003: a measure with no positive pair at all reports the removals rather than going quiet (#136)', () => {
    const instance = shiftPlot(document.querySelector('#host'), { profile: false });
    instance.init([
      { USUBJID: 'S1', TEST: 'Albumin', STRESN: '0', VISIT: 'Baseline', VISITNUM: '1' },
      { USUBJID: 'S1', TEST: 'Albumin', STRESN: '-2', VISIT: 'Week 12', VISITNUM: '2' }
    ]);
    setAxisType(instance, 'log');
    expect(instance.chartPairs).toHaveLength(0);
    expect(instance.notes.textContent).toContain('0 of 1 participants shown');
    expect(instance.notes.textContent).toMatch(/nonpositive/i);
  });

  it('SSP-SCALE-001: the axis_type setting seeds the control and setSettings updates it (#136)', () => {
    const instance = build({ axis_type: 'log' });
    expect(instance.state.axisType).toBe('log');
    expect(axisControl(instance).value).toBe('log');
    expect(instance.chart.options.scales.y.type).toBe('logarithmic');

    instance.setSettings({ axis_type: 'linear' });
    expect(instance.state.axisType).toBe('linear');
    expect(instance.chart.options.scales.y.type).toBe('linear');
  });
});
