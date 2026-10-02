// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The "Reset chart" control at the foot of the time-to-event sidebar (#136,
// obot.roadmap#33): TTE-CTRL-001. Chart.js is replaced with a recording stub so
// the mount + control + teardown orchestration can be asserted in jsdom, which
// has no canvas. The module's controls are built once and persist across
// renders, so the reset handler's buildControls() call is load-bearing — the
// assertions below read the state AND the rebuilt control elements.

const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.destroyed = false;
      built.push(this);
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
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    CategoryScale: stub(),
    Legend: stub(),
    LineController: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    Title: stub(),
    Tooltip: stub()
  };
});

const { default: timeToEvent } = await import('../../../src/time-to-event.js');

const event = ({ id, day = '10', soc = 'SKIN', pt = 'RASH', ser = 'N', sev = 'MILD' } = {}) => ({
  USUBJID: id,
  ASTDY: day,
  AEBODSYS: soc,
  AEDECOD: pt,
  AESER: ser,
  AESEV: sev
});

const participant = ({ id, arm = 'Placebo', eosdy = '30', eosstt = 'COMPLETED' } = {}) => ({
  USUBJID: id,
  ARM: arm,
  EOSDY: eosdy,
  EOSSTT: eosstt
});

const events = [
  event({ id: 'S1', day: '5' }),
  event({ id: 'S2', day: '12', sev: 'SEVERE', ser: 'Y' }),
  event({ id: 'S3', day: '20', soc: 'GI', pt: 'NAUSEA' }),
  event({ id: 'S4', day: '8', soc: 'GI', pt: 'NAUSEA', sev: 'MODERATE' })
];

const population = [
  participant({ id: 'S1', arm: 'Placebo' }),
  participant({ id: 'S2', arm: 'Drug' }),
  participant({ id: 'S3', arm: 'Drug' }),
  participant({ id: 'S4', arm: 'Placebo' }),
  participant({ id: 'S5', arm: 'Placebo' }),
  participant({ id: 'S6', arm: 'Drug' })
];

let element;

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const mount = (settings = {}) =>
  timeToEvent(element, { filters: ['ARM'], ...settings }).init({ events, population });

const labelled = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (control) => control.querySelector('label')?.textContent === label
  );

const control = (instance, label, selector) => labelled(instance, label).querySelector(selector);

describe('time-to-event reset', () => {
  it('TTE-CTRL-001: a reset control sits last in the control panel (#136)', () => {
    const instance = mount();
    const reset = instance.controls.querySelector('.sv-reset');
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below every section, not buried inside one.
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('TTE-CTRL-001: reset restores the orientation, the confidence band, the population filters and the event definition (#136)', () => {
    const instance = mount();
    expect(instance.state.direction).toBe('incidence');
    expect(instance.state.ci).toBe(true);
    expect(instance.state.filters.ARM).toBe(null);

    // Orientation: a select driven through its real handler.
    const direction = control(instance, 'Orientation', 'select');
    direction.value = 'survival';
    direction.onchange();
    expect(instance.state.direction).toBe('survival');

    // The confidence band: a checkbox.
    const ci = control(instance, 'Pointwise 95% CI band', 'input[type=checkbox]');
    ci.checked = false;
    ci.onchange();
    expect(instance.state.ci).toBe(false);

    // A population filter: a single select keyed on its column.
    const arm = instance.controls.querySelector('select[data-filter="ARM"]');
    arm.value = 'Drug';
    arm.onchange();
    expect(instance.state.filters.ARM).toBe('Drug');

    // The endpoint composer: one checkbox inside a multiselect.
    // Index 0 is the multiselect's own "All" master row; index 1 is the first
    // value in sorted order, 'N'.
    const nonSerious = labelled(instance, 'AESER').querySelectorAll('.sv-ms-option input')[1];
    nonSerious.checked = false;
    nonSerious.onchange();
    expect(instance.state.eventFilters.AESER).toEqual(['Y']);

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.direction).toBe('incidence');
    expect(instance.state.ci).toBe(true);
    expect(instance.state.filters).toEqual({ ARM: null });
    expect(instance.state.eventFilters).toEqual({});

    // The controls are rebuilt, so the rendered sidebar agrees with the state.
    expect(control(instance, 'Orientation', 'select').value).toBe('incidence');
    expect(control(instance, 'Pointwise 95% CI band', 'input[type=checkbox]').checked).toBe(true);
    expect(instance.controls.querySelector('select[data-filter="ARM"]').value).toBe('__all__');
  });

  it('TTE-CTRL-001: reset clears the selection and rebuilds the chart from a clean teardown (#136)', () => {
    const instance = mount();
    instance.state.selected = 'S2';
    instance.participantsSelected = ['S2'];
    const before = built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.selected).toBeFalsy();
    expect(instance.participantsSelected).toEqual([]);
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(built.filter((chart) => !chart.destroyed).length).toBeGreaterThan(0);
  });
});
