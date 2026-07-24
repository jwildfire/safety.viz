// @vitest-environment jsdom
// Axis-limit prefill for the histogram's X-axis Limits inputs (#85): the boxes
// load with the domain the chart actually drew instead of blank, an untouched
// limit keeps following the data, an edited one is respected until Reset, and
// the invert guard still holds now that the other box is never empty.
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
const { formatLimit, limitDigits } = await import('../../../src/axis-limits.js');
const { makeRows, ALT_TEST, AST_TEST } = await import('../participant-profile/fixture.js');

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

/** The [lower, upper] the inputs are showing, as numbers. */
function shown(instance) {
  return [Number(instance.lowerInput.value), Number(instance.upperInput.value)];
}

/** Type a value into a limit input and fire the change handler. */
function type(input, value) {
  input.value = value;
  input.onchange();
}

/** The measure control's select element. */
function measureSelect(instance) {
  return instance.controls.querySelector('select');
}

function selectMeasure(instance, measure) {
  const select = measureSelect(instance);
  select.value = measure;
  select.onchange();
}

describe('histogram axis-limit prefill (SH-AXIS-001)', () => {
  it('SH-AXIS-001: the X-axis limit inputs load pre-filled with the domain the chart drew (#85)', () => {
    const instance = build();
    const domain = instance.binInputs.domain;
    const values = instance.currentMeasureData().map((row) => row.__sh_value);

    // The domain is the measure's data extent — a real, data-driven default.
    expect(domain).toEqual([Math.min(...values), Math.max(...values)]);
    expect(instance.lowerInput.value).not.toBe('');
    expect(instance.upperInput.value).not.toBe('');
    const digits = limitDigits(domain);
    expect(instance.lowerInput.value).toBe(formatLimit(domain[0], digits));
    expect(instance.upperInput.value).toBe(formatLimit(domain[1], digits));
  });

  it('SH-AXIS-001: displaying a limit does not pin it — the overrides stay null until edited (#85)', () => {
    const instance = build();
    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(instance.state.axisDomain).toEqual(instance.binInputs.domain);
  });
});

describe('histogram unedited limits stay automatic (SH-AXIS-002)', () => {
  it('SH-AXIS-002: an unedited limit re-derives on a measure change and the input follows (#85)', () => {
    const instance = build();
    const before = shown(instance);

    selectMeasure(instance, measure(AST_TEST));
    const after = shown(instance);
    const values = instance.currentMeasureData().map((row) => row.__sh_value);

    expect(after).not.toEqual(before);
    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(after).toEqual([Math.min(...values), Math.max(...values)]);
  });

  it('SH-AXIS-002: an edited limit survives a filter change and stays an override (#85)', () => {
    const instance = build();
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    const sex = instance.controls.querySelectorAll('select')[1];
    sex.value = 'F';
    sex.onchange();

    expect(instance.state.lower).toBe(50);
    expect(Number(instance.lowerInput.value)).toBe(50);
    expect(instance.binInputs.domain[0]).toBe(50);
  });
});

describe('histogram Reset Limits (SH-AXIS-003, SH-FUNC-006)', () => {
  it('SH-AXIS-003: Reset Limits clears the overrides and repopulates both inputs with the derived domain (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    type(instance.upperInput, '120');
    expect(shown(instance)).toEqual([50, 120]);

    const reset = instance.controls.querySelector('.sv-reset-limits');
    expect(reset).toBeTruthy();
    reset.onclick();

    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(shown(instance)).toEqual(derived);
  });
});

describe('histogram limit guardrails with prefilled inputs (SH-AXIS-004)', () => {
  it('SH-AXIS-004: a lower limit typed above the prefilled upper limit is swapped, never inverted (#85)', () => {
    const instance = build();
    const derivedUpper = shown(instance)[1];
    type(instance.lowerInput, String(derivedUpper + 25));

    const [lower, upper] = instance.binInputs.domain;
    expect(lower).toBeLessThan(upper);
    expect(instance.state.upper).toBe(derivedUpper + 25);
    expect(instance.state.lower).toBe(derivedUpper);
  });

  it('SH-AXIS-004: clearing a prefilled input returns that limit to auto and the box refills (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    type(instance.lowerInput, '');
    expect(instance.state.lower).toBeNull();
    expect(shown(instance)[0]).toBe(derived[0]);
  });

  it('SH-AXIS-004: a non-numeric entry returns that limit to auto rather than reaching the chart (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, 'abc');
    expect(instance.state.lower).toBeNull();
    expect(instance.binInputs.domain[0]).toBe(derived[0]);
  });
});
