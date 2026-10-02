// @vitest-environment jsdom
// The whole-chart reset control (#136, SSP-CTRL-004): the way back to the
// opening view the legacy tracker asked for, built on the shared addReset
// builder so this is not a fifth reset style.
//
// The crux is that shift-plot's opening state is NOT the constructor's object
// literal. `start_value`, `baseline_visits` and `comparison_visits` all
// default to null (src/shift-plot/configure.js), and validateAndCleanData
// resolves all three from the data — the measure fallback plus resolveVisits
// (SSP-CFG-004/005). A reset that re-seeds from the literal alone blanks the
// chart and empties both visit controls.
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

const { Chart } = await import('chart.js');
const { default: shiftPlot } = await import('../../../src/shift-plot.js');
const { makeRows, ALT_TEST, TB_TEST } = await import('../participant-profile/fixture.js');

// shift-plot labels measures by the bare measure column (its measureLabel
// does not append the unit), unlike the sibling renderers.
const measure = (test) => test;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

function build(settings = {}) {
  const instance = shiftPlot(document.querySelector('#host'), settings);
  instance.init(makeRows());
  return instance;
}

/** The labeled control wrapper, e.g. 'Measure' or 'Axis Type'. */
function control(instance, label) {
  return [...instance.controls.querySelectorAll('.sv-control')].find(
    (wrap) => wrap.querySelector('label')?.textContent === label
  );
}

function choose(instance, label, value) {
  const select = control(instance, label).querySelector('select');
  select.value = value;
  select.onchange();
}

/** Drive a multiple-select visit control through its real change handler. */
function chooseVisits(instance, label, values) {
  const select = control(instance, label).querySelector('select');
  [...select.options].forEach((option) => {
    option.selected = values.includes(option.value);
  });
  select.onchange();
}

/** Press the shared reset button through its real handler. */
function pressReset(instance) {
  instance.controls.querySelector('.sv-reset').onclick();
}

/** Brush a set of participants through the same path the mouse handlers use. */
function brush(instance, ids) {
  const indices = new Set(
    ids.map((id) =>
      instance.chartPairs.findIndex((pair) => String(pair[instance.settings.id_col]) === id)
    )
  );
  expect([...indices].every((index) => index >= 0)).toBe(true);
  instance.showSelection(indices, { left: 0, right: 10, top: 0, bottom: 10 });
}

describe('shift-plot reset control (SSP-CTRL-004)', () => {
  it('SSP-CTRL-004: a reset control sits at the foot of the control panel (#136)', () => {
    const instance = build();
    const reset = instance.controls.querySelector('.sv-reset');
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below every section, not tucked inside one.
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('SSP-CTRL-004: reset restores every settings-derived control to its configured default (#136)', () => {
    const instance = build({
      start_value: measure(ALT_TEST),
      axis_type: 'linear',
      filters: [{ value_col: 'SEX', label: 'Sex' }]
    });
    choose(instance, 'Measure', measure(TB_TEST));
    choose(instance, 'Axis Type', 'log');
    choose(instance, 'Sex', 'M');
    expect(instance.state.measure).toBe(measure(TB_TEST));
    expect(instance.state.axisType).toBe('log');
    expect(instance.state.filters.SEX).toBe('M');

    pressReset(instance);

    expect(instance.state.measure).toBe(measure(ALT_TEST));
    expect(instance.state.axisType).toBe('linear');
    expect(instance.state.filters.SEX).toBe(null);
    // The rebuilt controls show the restored state, not the stale selections.
    expect(control(instance, 'Measure').querySelector('select').value).toBe(measure(ALT_TEST));
    expect(control(instance, 'Axis Type').querySelector('select').value).toBe('linear');
  });

  it('SSP-CTRL-004: reset re-derives the data-driven measure rather than blanking the chart (#136)', () => {
    // No start_value: the shipped default is null and the opening measure is
    // resolved from the data. A literal-only re-seed puts it back to null.
    const instance = build();
    const opening = instance.state.measure;
    expect(opening).toBeTruthy();
    choose(instance, 'Measure', measure(TB_TEST));
    expect(instance.state.measure).toBe(measure(TB_TEST));

    pressReset(instance);

    expect(instance.state.measure).toBe(opening);
    expect(instance.chartPairs.length).toBeGreaterThan(0);
  });

  it('SSP-CTRL-004: reset re-runs the baseline/comparison visit resolution (#136)', () => {
    // baseline_visits/comparison_visits default to null and are resolved from
    // the data by resolveVisits (SSP-CFG-004/005); the reseed must re-run it
    // or both visit controls come back empty and no pair survives.
    const instance = build({ start_value: measure(ALT_TEST) });
    const openingBaseline = [...instance.state.baselineVisits];
    const openingComparison = [...instance.state.comparisonVisits];
    expect(openingBaseline.length).toBeGreaterThan(0);
    expect(openingComparison.length).toBeGreaterThan(0);

    chooseVisits(instance, 'Baseline visit(s)', [openingComparison[0]]);
    chooseVisits(instance, 'Comparison visit(s)', [openingBaseline[0]]);
    expect(instance.state.baselineVisits).toEqual([openingComparison[0]]);

    pressReset(instance);

    expect(instance.state.baselineVisits).toEqual(openingBaseline);
    expect(instance.state.comparisonVisits).toEqual(openingComparison);
    expect(instance.chartPairs.length).toBeGreaterThan(0);
  });

  it('SSP-CTRL-004: reset clears the brush selection, the linked listing, and the live chart (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });
    brush(instance, ['P1']);
    expect(instance.currentTableData.length).toBe(1);
    expect(instance.listingWrap.innerHTML).not.toBe('');
    const before = Chart.built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);

    pressReset(instance);

    expect(instance.currentTableData).toEqual([]);
    expect(instance.listingWrap.innerHTML).toBe('');
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    // The railed profile empties in the same render preamble (PPRF-SSP-003).
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });
});
