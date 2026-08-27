// @vitest-environment jsdom
// Whole-chart reset for results-over-time (SROT-CTRL-001, #136): the shared
// "Reset chart" button at the foot of the sidebar returns every
// settings-derived control to its configured default, re-derives the
// data-driven measure default (start_value defaults to null, so a naive
// re-seed would blank the chart), and clears the y-limit overrides — while
// the per-axis "Reset Limits" control keeps working on its own.
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
    PointElement: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: resultsOverTime } = await import('../../../src/results-over-time.js');
const { ALL_VALUE } = await import('../../../src/filters.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

// Every fixture row carries the same unit, and the measure controls label
// measures as `TEST (unit)`.
const measure = (test) => `${test} (U/L)`;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = resultsOverTime(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** The `.sv-control` wrapper carrying a given label. */
function control(instance, label) {
  return [...instance.controls.querySelectorAll('.sv-control')].find(
    (wrap) => wrap.querySelector('label')?.textContent === label
  );
}

const resetButton = (instance) => instance.controls.querySelector('.sv-reset');

/** Set a control's value and fire the handler jsdom will not fire for us. */
function pick(node, value) {
  node.value = value;
  node.onchange();
}

describe('results-over-time reset control', () => {
  it('SROT-CTRL-001: the reset control is the last thing in the control panel (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });

    const reset = resetButton(instance);
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('SROT-CTRL-001: reset returns every settings-derived control to its configured default (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });

    pick(control(instance, 'Scale').querySelector('select'), 'log');
    const boxplots = control(instance, 'Box plots').querySelector('input');
    boxplots.checked = false;
    boxplots.onchange();
    pick(control(instance, 'Sex').querySelector('select'), 'F');

    expect(instance.state.yScale).toBe('log');
    expect(instance.state.boxplots).toBe(false);
    expect(instance.state.filters.SEX).toBe('F');

    resetButton(instance).onclick();

    expect(instance.state.yScale).toBe(instance.settings.y_scale);
    expect(instance.state.boxplots).toBe(instance.settings.boxplots);
    expect(instance.state.outliers).toBe(instance.settings.outliers);
    expect(instance.state.visitsWithoutData).toBe(instance.settings.visits_without_data);
    expect(instance.state.unscheduledVisits).toBe(instance.settings.unscheduled_visits);
    expect(instance.state.filters).toEqual({ SEX: null });
    // The rebuilt controls show the defaults too, not just the state.
    expect(control(instance, 'Scale').querySelector('select').value).toBe(
      instance.settings.y_scale
    );
    expect(control(instance, 'Sex').querySelector('select').value).toBe(ALL_VALUE);
  });

  it('SROT-CTRL-001: reset re-derives the measure default instead of restoring a null start_value (#136)', () => {
    // start_value defaults to null, so the opening measure comes FROM THE DATA
    // (SROT-FUNC-001). A re-seed that skips that resolution sets measure back
    // to null and the chart empties.
    const instance = build();
    const opening = instance.state.measure;
    expect(opening).toBeTruthy();

    pick(control(instance, 'Measure').querySelector('select'), measure(ALT_TEST));
    expect(instance.state.measure).toBe(measure(ALT_TEST));

    resetButton(instance).onclick();

    expect(instance.state.measure).toBe(opening);
    expect(instance.filteredData.length).toBeGreaterThan(0);
  });

  it('SROT-CTRL-001: reset clears the y-limit overrides and destroys the previous charts (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });

    instance.lowerInput.value = '12';
    instance.lowerInput.onchange();
    instance.upperInput.value = '99';
    instance.upperInput.onchange();
    expect(instance.state.lower).toBe(12);
    expect(instance.state.upper).toBe(99);

    const before = instance.charts.slice();
    expect(before.length).toBeGreaterThan(0);
    resetButton(instance).onclick();

    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(instance.charts.length).toBeGreaterThan(0);
    instance.charts.forEach((chart) => expect(chart.destroyed).toBe(false));
  });

  it('SROT-CTRL-001: the per-axis Reset Limits control still resets only the axis (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });

    pick(control(instance, 'Scale').querySelector('select'), 'log');
    instance.lowerInput.value = '12';
    instance.lowerInput.onchange();

    const limitsReset = instance.controls.querySelector('.sv-reset-limits');
    expect(limitsReset).toBeTruthy();
    // Both controls coexist, and they are not the same button.
    expect(resetButton(instance)).toBeTruthy();
    expect(limitsReset).not.toBe(resetButton(instance));
    limitsReset.onclick();

    expect(instance.state.lower).toBeNull();
    // Reset Limits is an axis control: the scale choice survives it.
    expect(instance.state.yScale).toBe('log');
  });
});
