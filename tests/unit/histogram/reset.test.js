// @vitest-environment jsdom
// Whole-chart reset for the histogram (SH-CTRL-009, #136): the shared "Reset
// chart" button at the foot of the sidebar returns every settings-derived
// control to its configured default, re-runs the measure resolution that
// falls an absent start_value back to the all-measures overview, and clears
// the selection and the linked listing. The per-axis "Reset Limits" control
// stays where it is, inside the X-axis section (SH-AXIS-003).
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

const { default: histogram } = await import('../../../src/histogram.js');
const { ALL_VALUE } = await import('../../../src/filters.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

// Every fixture row carries the same unit, and the measure controls label
// measures as `TEST (unit)`.
const measure = (test) => `${test} (U/L)`;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = histogram(document.querySelector('#host'), {
    start_value: measure(ALT_TEST),
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

describe('histogram reset control', () => {
  it('SH-CTRL-009: the reset control is the last thing in the control panel (#136)', () => {
    const instance = build();

    const reset = resetButton(instance);
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('SH-CTRL-009: reset returns every settings-derived control to its configured default (#136)', () => {
    const instance = build();

    pick(control(instance, 'Algorithm').querySelector('select'), "Sturges' formula");
    pick(control(instance, 'X-axis Ticks').querySelector('select'), 'boundaries');
    pick(control(instance, 'Sex').querySelector('select'), 'F');

    expect(instance.state.algorithm).toBe("Sturges' formula");
    expect(instance.state.annotateBoundaries).toBe(true);
    expect(instance.state.filters.SEX).toBe('F');

    resetButton(instance).onclick();

    expect(instance.state.algorithm).toBe(instance.settings.bin_algorithm);
    expect(instance.state.annotateBoundaries).toBe(instance.settings.annotate_bin_boundaries);
    expect(instance.state.displayNormalRange).toBe(instance.settings.display_normal_range);
    expect(instance.state.groupBy).toBe(instance.settings.group_by);
    expect(instance.state.filters).toEqual({ SEX: null });
    // The rebuilt controls show the defaults too, not just the state.
    expect(control(instance, 'Algorithm').querySelector('select').value).toBe(
      instance.settings.bin_algorithm
    );
    expect(control(instance, 'Sex').querySelector('select').value).toBe(ALL_VALUE);
  });

  it('SH-CTRL-009: reset re-runs the measure fallback instead of restoring an absent start_value (#136)', () => {
    // An absent start_value falls back to the all-measures overview
    // (SH-OVW-001). A re-seed that skips that resolution puts the missing
    // measure back and the chart empties.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const instance = build({ start_value: 'Nonexistent measure (U/L)' });
    expect(instance.state.measure).toBeNull();
    expect(instance.isOverview()).toBe(true);

    instance.selectMeasure(measure(ALT_TEST));
    expect(instance.isOverview()).toBe(false);

    resetButton(instance).onclick();

    expect(instance.state.measure).toBeNull();
    expect(instance.isOverview()).toBe(true);
    vi.restoreAllMocks();
  });

  it('SH-CTRL-009: reset clears the selection, the listing, the axis overrides, and the live charts (#136)', () => {
    const instance = build();

    instance.lowerInput.value = '12';
    instance.lowerInput.onchange();
    expect(instance.state.lower).toBe(12);
    instance.selectParticipant('P1');
    expect(instance.state.selectedId).toBe('P1');

    const before = instance.charts.slice();
    expect(before.length).toBeGreaterThan(0);
    resetButton(instance).onclick();

    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.listingSelectedId).toBeNull();
    expect(instance.listingWrap.innerHTML).toBe('');
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(instance.charts.length).toBeGreaterThan(0);
    instance.charts.forEach((chart) => expect(chart.destroyed).toBe(false));
  });

  it('SH-CTRL-009: Reset Limits stays in the X-axis section and still resets only the axis (#136)', () => {
    const instance = build();

    const limitsReset = instance.controls.querySelector('.sv-reset-limits');
    expect(limitsReset).toBeTruthy();
    // Both controls coexist, and they are not the same button.
    expect(resetButton(instance)).toBeTruthy();
    expect(limitsReset).not.toBe(resetButton(instance));
    expect(instance.xAxisSection.contains(limitsReset)).toBe(true);
    expect(instance.xAxisSection.contains(resetButton(instance))).toBe(false);

    pick(control(instance, 'Algorithm').querySelector('select'), "Sturges' formula");
    instance.lowerInput.value = '12';
    instance.lowerInput.onchange();

    limitsReset.onclick();

    expect(instance.state.lower).toBeNull();
    // Reset Limits is an axis control: the binning choice survives it.
    expect(instance.state.algorithm).toBe("Sturges' formula");
  });
});
