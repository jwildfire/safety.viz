// @vitest-environment jsdom
// The whole-chart reset control on delta-delta (#136, SDD-CTRL-001). Nine
// issues across seven of the retired renderer trackers asked for a way back to
// the starting view; the library shipped "Reset Limits", which resets an axis
// and nothing else. delta-delta is one of the modules where the constructor's
// state literal is only HALF the seed — resolveStateDefaults fills the measure
// and visit selections FROM THE DATA afterwards — so a reset that re-seeds
// without re-running it strands the chart on the unset (null) measures the
// settings actually carry.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
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
const { default: deltaDelta } = await import('../../../src/delta-delta.js');
const { ALL_VALUE } = await import('../../../src/filters.js');
const { makeRows, ALT_TEST, TB_TEST, CREAT_TEST } =
  await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

function build(settings = {}) {
  const instance = deltaDelta(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** The `.sv-control` wrapper whose label reads `label`. */
const control = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (wrap) => wrap.querySelector('label')?.textContent === label
  );

const resetButton = (instance) => instance.controls.querySelector('.sv-reset');

/** Set a select's value and fire its handler — jsdom fires nothing for us. */
function choose(select, value) {
  select.value = value;
  select.onchange();
}

/** Set a multi-select's selection and fire its handler. */
function chooseMany(select, values) {
  [...select.options].forEach((opt) => {
    opt.selected = values.includes(opt.value);
  });
  select.onchange();
}

describe('delta-delta reset control (SDD-CTRL-001)', () => {
  it('SDD-CTRL-001: a full-width reset control sits at the foot of the control panel (#136)', () => {
    const instance = build();
    const reset = resetButton(instance);
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below every section, not tucked inside one.
    expect(instance.controls.lastElementChild).toBe(reset);
    expect(reset.parentElement).toBe(instance.controls);
  });

  it('SDD-CTRL-001: reset restores every settings-derived control to its configured default (#136)', () => {
    const instance = build({
      measure_x: ALT_TEST,
      measure_y: TB_TEST,
      baseline_visits: ['Baseline'],
      comparison_visits: ['Day 30'],
      add_regression_line: true
    });

    const regression = control(instance, 'Regression Line').querySelector('input[type=checkbox]');
    regression.checked = false;
    regression.onchange();
    const sex = control(instance, 'Sex').querySelector('select');
    choose(sex, 'M');
    chooseMany(control(instance, 'Comparison visit(s)').querySelector('select'), ['Day 60']);
    expect(instance.state.addRegressionLine).toBe(false);
    expect(instance.state.filters.SEX).toBe('M');
    expect(instance.state.comparison).toEqual(['Day 60']);

    resetButton(instance).onclick();

    expect(instance.state.addRegressionLine).toBe(true);
    expect(instance.state.filters).toEqual({ SEX: null });
    expect(instance.state.comparison).toEqual(['Day 30']);
    expect(instance.state.measureX).toBe(ALT_TEST);
    expect(instance.state.measureY).toBe(TB_TEST);
    // The controls are rebuilt, so the rendered checkbox agrees with the state.
    expect(control(instance, 'Regression Line').querySelector('input[type=checkbox]').checked).toBe(
      true
    );
    expect(control(instance, 'Sex').querySelector('select').value).toBe(ALL_VALUE);
  });

  it('SDD-CTRL-001: reset re-derives the data-driven measure and visit defaults rather than the unset settings (#136)', () => {
    // measure_x/measure_y default to null and the visit lists to [] — the
    // opening selection comes from resolveStateDefaults, not the settings. The
    // measures whitelist only narrows the pool it chooses from (both of these
    // are collected at every visit in the fixture, so the plot is non-empty).
    const instance = build({ measures: [ALT_TEST, CREAT_TEST] });
    const opening = {
      measureX: instance.state.measureX,
      measureY: instance.state.measureY,
      baseline: [...instance.state.baseline],
      comparison: [...instance.state.comparison]
    };
    expect(opening.measureX).toBeTruthy();
    expect(opening.measureY).toBeTruthy();
    expect(opening.baseline.length).toBeGreaterThan(0);
    expect(opening.comparison.length).toBeGreaterThan(0);
    const pointsAtMount = instance.points.length;
    expect(pointsAtMount).toBeGreaterThan(0);

    choose(control(instance, 'X Measure').querySelector('select'), CREAT_TEST);
    chooseMany(control(instance, 'Baseline visit(s)').querySelector('select'), ['Day 30']);

    resetButton(instance).onclick();

    expect(instance.state.measureX).toBe(opening.measureX);
    expect(instance.state.measureY).toBe(opening.measureY);
    expect(instance.state.baseline).toEqual(opening.baseline);
    expect(instance.state.comparison).toEqual(opening.comparison);
    // The chart is not blank: the re-seed did not leave the measures null.
    expect(instance.points.length).toBe(pointsAtMount);
  });

  it('SDD-CTRL-001: resetting twice leaves the settings arrays uncorrupted (#136)', () => {
    const instance = build({
      measure_x: ALT_TEST,
      measure_y: TB_TEST,
      baseline_visits: ['Baseline'],
      comparison_visits: ['Day 30']
    });
    chooseMany(control(instance, 'Baseline visit(s)').querySelector('select'), ['Day 60']);
    resetButton(instance).onclick();
    chooseMany(control(instance, 'Comparison visit(s)').querySelector('select'), ['Baseline']);
    resetButton(instance).onclick();

    expect(instance.settings.baseline_visits).toEqual(['Baseline']);
    expect(instance.settings.comparison_visits).toEqual(['Day 30']);
    expect(instance.state.baseline).toEqual(['Baseline']);
    expect(instance.state.comparison).toEqual(['Day 30']);
    // The state must never alias the settings arrays — that aliasing is what
    // the constructor's spreads exist to prevent, and a re-seed must keep it.
    expect(instance.state.baseline).not.toBe(instance.settings.baseline_visits);
    expect(instance.state.comparison).not.toBe(instance.settings.comparison_visits);
  });

  it('SDD-CTRL-001: reset clears the point selection, the docked profile, and the live charts (#136)', () => {
    const instance = build({
      measure_x: ALT_TEST,
      measure_y: TB_TEST,
      baseline_visits: ['Baseline'],
      comparison_visits: ['Day 30']
    });
    const index = instance.points.findIndex((point) => String(point.id) === 'P1');
    instance.chart.options.onClick({}, [{ index }]);
    expect(instance.state.selectedId).toBe('P1');
    expect(instance.railWrap.querySelector('.sv-profile-id')).not.toBeNull();

    const before = Chart.built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);
    resetButton(instance).onclick();

    expect(instance.state.selectedId).toBeNull();
    expect(instance.participantsSelected).toEqual([]);
    expect(instance.railWrap.querySelector('.sv-profile-id')).toBeNull();
    expect(instance.listingWrap.innerHTML).toBe('');
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
  });
});
