// @vitest-environment jsdom
// Axis-limit prefill for the outlier-explorer Y-axis Limits inputs (#85): the
// boxes load with the padded domain the chart drew instead of blank, an
// untouched limit keeps tracking the data across measure and filter changes,
// an edited one is respected until Reset Limits, and the crossed-pair guard
// still holds now that the other box is never empty.
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

const { default: outlierExplorer } = await import('../../../src/outlier-explorer.js');
const { formatLimit, limitDigits } = await import('../../../src/axis-limits.js');
const { defaultYDomain } = await import('../../../src/outlier-explorer/getScales.js');
const { makeRows, ALT_TEST, TB_TEST } = await import('../participant-profile/fixture.js');

// Every fixture row carries the same unit, and the measure controls label
// measures as `TEST (unit)`.
const measure = (test) => `${test} (U/L)`;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = outlierExplorer(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** The [lower, upper] the inputs are showing, as numbers. */
function shown(instance) {
  return [Number(instance.lowerInput.value), Number(instance.upperInput.value)];
}

/** Type a value into a limit input and fire the change handler. */
function type(input, value) {
  input.value = value;
  input.onchange();
}

/** The select of the labeled control, e.g. 'Measure' or 'Sex'. */
function control(instance, label) {
  return [...instance.controls.querySelectorAll('.sv-control')].find(
    (wrap) => wrap.querySelector('label').textContent === label
  );
}

function choose(instance, label, value) {
  const select = control(instance, label).querySelector('select');
  select.value = value;
  select.onchange();
}

describe('outlier-explorer axis-limit prefill (SOE-AXIS-001)', () => {
  it('SOE-AXIS-001: the Y-axis limit inputs load pre-filled with the padded domain the chart drew (#85)', () => {
    const instance = build();
    const values = instance.filteredData.map((row) => row.__oe_value);
    const domain = instance.state.axisDomain;

    // The padded default domain (SOE-REG-034), not a blank box and not the
    // bare data extent.
    expect(domain).toEqual(defaultYDomain(values));
    expect(instance.lowerInput.value).not.toBe('');
    expect(instance.upperInput.value).not.toBe('');
    const digits = limitDigits(domain);
    expect(instance.lowerInput.value).toBe(formatLimit(domain[0], digits));
    expect(instance.upperInput.value).toBe(formatLimit(domain[1], digits));
  });

  it('SOE-AXIS-001: displaying a limit does not pin it — the overrides stay null until edited (#85)', () => {
    const instance = build();
    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
  });
});

describe('outlier-explorer unedited limits stay automatic (SOE-AXIS-002)', () => {
  it('SOE-AXIS-002: an unedited limit re-derives on a measure change and the input follows (#85)', () => {
    const instance = build();
    const before = shown(instance);

    choose(instance, 'Measure', measure(TB_TEST));
    const values = instance.filteredData.map((row) => row.__oe_value);

    expect(shown(instance)).not.toEqual(before);
    expect(instance.state.lower).toBeNull();
    expect(instance.state.axisDomain).toEqual(defaultYDomain(values));
  });

  it('SOE-AXIS-002: an unedited limit re-derives when a filter narrows the cohort (#85)', () => {
    const instance = build({ start_value: measure(ALT_TEST) });
    const before = shown(instance);

    choose(instance, 'Sex', 'F');
    const values = instance.filteredData.map((row) => row.__oe_value);

    expect(instance.state.axisDomain).toEqual(defaultYDomain(values));
    expect(shown(instance)).not.toEqual(before);
  });

  it('SOE-AXIS-002: an edited limit survives a filter change and stays an override (#85)', () => {
    const instance = build();
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    choose(instance, 'Sex', 'F');

    expect(instance.state.lower).toBe(50);
    expect(instance.state.axisDomain[0]).toBe(50);
    expect(Number(instance.lowerInput.value)).toBe(50);
  });
});

describe('outlier-explorer Reset Limits (SOE-AXIS-003)', () => {
  it('SOE-AXIS-003: Reset Limits clears the overrides and repopulates both inputs with the derived domain (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    type(instance.upperInput, '120');
    expect(shown(instance)).toEqual([50, 120]);

    instance.controls.querySelector('.oe-reset').onclick();

    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(shown(instance)).toEqual(derived);
  });
});

describe('outlier-explorer limit guardrails with prefilled inputs (SOE-AXIS-004)', () => {
  it('SOE-AXIS-004: a lower limit typed above the prefilled upper limit is swapped, never inverted (#85)', () => {
    const instance = build();
    const derivedUpper = instance.state.axisDomain[1];
    type(instance.lowerInput, String(derivedUpper + 40));

    expect(instance.state.axisDomain[0]).toBeLessThan(instance.state.axisDomain[1]);
    expect(instance.state.lower).toBe(derivedUpper);
    expect(instance.state.upper).toBe(derivedUpper + 40);
  });

  it('SOE-AXIS-004: clearing a prefilled input returns that limit to auto and the box refills (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    type(instance.lowerInput, '');
    expect(instance.state.lower).toBeNull();
    expect(shown(instance)[0]).toBe(derived[0]);
  });
});
