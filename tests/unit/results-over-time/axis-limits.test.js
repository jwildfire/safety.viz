// @vitest-environment jsdom
// Axis-limit prefill for the results-over-time Y-axis Limits inputs (#85): the
// boxes load with the domain the chart drew instead of blank, an untouched
// limit keeps tracking the data across a measure change and a log-scale
// toggle, an edited one is respected until Reset Limits, and the crossed-pair
// guard still holds now that the other box is never empty.
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
const { formatLimit, limitDigits } = await import('../../../src/axis-limits.js');
const { makeRows, ALT_TEST, TB_TEST } = await import('../participant-profile/fixture.js');

// Every fixture row carries the same unit, and the measure controls label
// measures as `TEST (unit)`.
const measure = (test) => `${test} (U/L)`;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

/**
 * The shared cohort plus one non-positive ALT result, so the log-scale toggle
 * moves the derived lower limit (the log path drops values <= 0).
 */
function rowsWithNonPositive() {
  const rows = makeRows();
  rows.push({
    USUBJID: 'P1',
    TEST: ALT_TEST,
    STRESN: -5,
    STRESU: 'U/L',
    STNRLO: 5,
    STNRHI: 40,
    DY: 90,
    VISIT: 'Day 90',
    VISITNUM: 4
  });
  return rows;
}

function build(settings = {}, rows = makeRows()) {
  const instance = resultsOverTime(document.querySelector('#host'), {
    start_value: measure(ALT_TEST),
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(rows);
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

function select(instance, index) {
  return instance.controls.querySelectorAll('select')[index];
}

function choose(element, value) {
  element.value = value;
  element.onchange();
}

describe('results-over-time axis-limit prefill (SROT-AXIS-001)', () => {
  it('SROT-AXIS-001: the Y-axis limit inputs load pre-filled with the domain the chart drew (#85)', () => {
    const instance = build();
    const values = instance.currentMeasureData().map((row) => row.__srot_value);
    const domain = instance.state.axisDomain;

    expect(domain).toEqual([Math.min(...values), Math.max(...values)]);
    expect(instance.lowerInput.value).not.toBe('');
    expect(instance.upperInput.value).not.toBe('');
    const digits = limitDigits(domain);
    expect(instance.lowerInput.value).toBe(formatLimit(domain[0], digits));
    expect(instance.upperInput.value).toBe(formatLimit(domain[1], digits));
  });

  it('SROT-AXIS-001: displaying a limit does not pin it — the overrides stay null until edited (#85)', () => {
    const instance = build();
    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
  });
});

describe('results-over-time unedited limits stay automatic (SROT-AXIS-002)', () => {
  it('SROT-AXIS-002: an unedited limit re-derives on a measure change and the input follows (#85)', () => {
    const instance = build();
    const before = shown(instance);

    choose(select(instance, 0), measure(TB_TEST));
    const values = instance.currentMeasureData().map((row) => row.__srot_value);

    expect(shown(instance)).not.toEqual(before);
    expect(instance.state.lower).toBeNull();
    expect(instance.state.axisDomain).toEqual([Math.min(...values), Math.max(...values)]);
  });

  it('SROT-AXIS-002: an unedited lower limit re-derives when the scale switches to log (#85)', () => {
    const instance = build({}, rowsWithNonPositive());
    expect(instance.state.axisDomain[0]).toBe(-5);

    const scale = [...instance.controls.querySelectorAll('select')].at(-1);
    choose(scale, 'log');

    expect(instance.state.yScale).toBe('log');
    expect(instance.state.axisDomain[0]).toBeGreaterThan(0);
    expect(Number(instance.lowerInput.value)).toBeGreaterThan(0);
  });

  it('SROT-AXIS-002: an edited limit survives a filter change and stays an override (#85)', () => {
    const instance = build();
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    choose(select(instance, 2), 'F');

    expect(instance.state.lower).toBe(50);
    expect(instance.state.axisDomain[0]).toBe(50);
    expect(Number(instance.lowerInput.value)).toBe(50);
  });
});

describe('results-over-time Reset Limits (SROT-AXIS-003)', () => {
  it('SROT-AXIS-003: Reset Limits clears the overrides and repopulates both inputs with the derived domain (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    type(instance.upperInput, '120');
    expect(shown(instance)).toEqual([50, 120]);

    instance.controls.querySelector('.sv-reset-limits').onclick();

    expect(instance.state.lower).toBeNull();
    expect(instance.state.upper).toBeNull();
    expect(shown(instance)).toEqual(derived);
  });
});

describe('results-over-time limit guardrails with prefilled inputs (SROT-AXIS-004)', () => {
  it('SROT-AXIS-004: a lower limit typed above the prefilled upper limit is swapped, never inverted (#85)', () => {
    const instance = build();
    const derivedUpper = instance.state.axisDomain[1];
    type(instance.lowerInput, String(derivedUpper + 40));

    expect(instance.state.axisDomain[0]).toBeLessThan(instance.state.axisDomain[1]);
    expect(instance.state.lower).toBe(derivedUpper);
    expect(instance.state.upper).toBe(derivedUpper + 40);
  });

  it('SROT-AXIS-004: clearing a prefilled input returns that limit to auto and the box refills (#85)', () => {
    const instance = build();
    const derived = shown(instance);
    type(instance.lowerInput, '50');
    expect(instance.state.lower).toBe(50);

    type(instance.lowerInput, '');
    expect(instance.state.lower).toBeNull();
    expect(shown(instance)[0]).toBe(derived[0]);
  });
});
