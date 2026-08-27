// @vitest-environment jsdom
// The whole-chart reset control (#136, SOE-CTRL-002). The module already
// shipped "Reset Limits", which clears the y-axis overrides and nothing else;
// this is the way back to the opening view the legacy tracker asked for.
//
// The crux is that outlier-explorer's opening state is NOT the constructor's
// object literal. `start_value` defaults to null (src/outlier-explorer/
// configure.js), so the opening measure is resolved FROM THE DATA in
// validateAndCleanData, and a filter's `start` is seeded by initFilterState.
// A reset that re-seeds from the literal alone blanks the chart (measure back
// to null) and drops a start filter back to "All" — the two tests below that
// carry the "re-derives" wording are the guards for exactly that.
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
const { default: outlierExplorer } = await import('../../../src/outlier-explorer.js');
const { makeRows, ALT_TEST, TB_TEST } = await import('../participant-profile/fixture.js');

// Every fixture row carries the same unit, and the measure controls label
// measures as `TEST (unit)`.
const measure = (test) => `${test} (U/L)`;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

function build(settings = {}) {
  const instance = outlierExplorer(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** The labeled control wrapper, e.g. 'Measure' or 'Sex'. */
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

/** Press the shared reset button through its real handler. */
function pressReset(instance) {
  instance.controls.querySelector('.sv-reset').onclick();
}

describe('outlier-explorer reset control (SOE-CTRL-002)', () => {
  it('SOE-CTRL-002: a reset control sits at the foot of the control panel (#136)', () => {
    const instance = build();
    const reset = instance.controls.querySelector('.sv-reset');
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below every section, not tucked inside one.
    expect(instance.controls.lastElementChild).toBe(reset);
    // The per-axis Reset Limits control is a different control and stays.
    expect(instance.controls.querySelector('.oe-reset')).toBeTruthy();
  });

  it('SOE-CTRL-002: reset restores every settings-derived control to its configured default (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST), normal_range_method: 'LLN-ULN' });
    choose(instance, 'Measure', measure(TB_TEST));
    choose(instance, 'Method', 'Standard Deviation');
    choose(instance, 'Sex', 'M');
    instance.lowerInput.value = '1';
    instance.lowerInput.onchange();
    expect(instance.state.measure).toBe(measure(TB_TEST));
    expect(instance.state.normalMethod).toBe('Standard Deviation');
    expect(instance.state.filters.SEX).toBe('M');
    expect(instance.state.lower).toBe(1);

    pressReset(instance);

    expect(instance.state.measure).toBe(measure(ALT_TEST));
    expect(instance.state.normalMethod).toBe('LLN-ULN');
    expect(instance.state.filters.SEX).toBe(null);
    expect(instance.state.lower).toBe(null);
    expect(instance.state.upper).toBe(null);
    // The rebuilt controls show the restored state, not the stale selections.
    expect(control(instance, 'Measure').querySelector('select').value).toBe(measure(ALT_TEST));
    expect(control(instance, 'Method').querySelector('select').value).toBe('LLN-ULN');
  });

  it('SOE-CTRL-002: reset re-derives the data-driven measure rather than blanking the chart (#136)', () => {
    // No start_value: the shipped default is null and the opening measure is
    // resolved from the data. A literal-only re-seed puts it back to null.
    const instance = build();
    const opening = instance.state.measure;
    expect(opening).toBeTruthy();
    choose(instance, 'Measure', measure(TB_TEST));
    expect(instance.state.measure).toBe(measure(TB_TEST));

    pressReset(instance);

    expect(instance.state.measure).toBe(opening);
    expect(instance.filteredData.length).toBeGreaterThan(0);
    expect(instance.notes.textContent).not.toContain('No records match the current filters.');
  });

  it('SOE-CTRL-002: reset re-derives a filter start value rather than dropping it to All (#136)', () => {
    // initFilterState seeds `start` (SOE-REG-051/053) AFTER the state literal,
    // so the reseed has to run it too or the filter comes back unset.
    const instance = build({ filters: [{ value_col: 'SEX', label: 'Sex', start: 'F' }] });
    expect(instance.state.filters.SEX).toBe('F');
    choose(instance, 'Sex', 'M');
    expect(instance.state.filters.SEX).toBe('M');

    pressReset(instance);

    expect(instance.state.filters.SEX).toBe('F');
    expect(control(instance, 'Sex').querySelector('select').value).toBe('F');
  });

  it('SOE-CTRL-002: reset clears the selection, the linked listing, and the live chart (#136)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });
    instance.selectParticipant('P1');
    expect(instance.state.selectedId).toBe('P1');
    expect(instance.listingWrap.innerHTML).not.toBe('');
    const before = Chart.built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);

    pressReset(instance);

    expect(instance.state.selectedId).toBe(null);
    expect(instance.participantsSelected).toEqual([]);
    expect(instance.listingWrap.innerHTML).toBe('');
    expect(instance.currentTableData).toEqual([]);
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    // The railed profile empties in the same render preamble (PPRF-OE-003).
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });
});
