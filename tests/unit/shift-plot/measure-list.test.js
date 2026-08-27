// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The `measures` setting on shift-plot (SSP-MEAS-001/002, #136): an ordered
// whitelist for the Measure control, answering two requests the original
// renderers' users filed and never got — subset the dropdown (2016) and order
// it by something other than the alphabet (2021). Chart.js is stubbed the way
// the other jsdom module tests stub it, so the control above the canvas can be
// asserted without a real context.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.config = config;
      this.data = config.data;
      this.options = config.options;
    }
    update() {}
    resize() {}
    destroy() {}
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    BoxPlotController: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    CategoryScale: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    TimeScale: stub(),
    Title: stub(),
    Tooltip: stub(),
    Legend: stub(),
    Filler: stub()
  };
});

const { default: factory } =
  await import('/Users/jwildfire/Documents/obot2/safety.viz/.claude/worktrees/legacy33/src/shift-plot.js');

const BASE = {};

const ROWS = [
  {
    USUBJID: 'P1',
    TEST: 'Sodium',
    STRESN: 140,
    STRESU: 'mmol/L',
    VISIT: 'Week 1',
    VISITNUM: 1,
    ARM: 'Drug'
  },
  {
    USUBJID: 'P1',
    TEST: 'Albumin',
    STRESN: 4.1,
    STRESU: 'g/dL',
    VISIT: 'Week 1',
    VISITNUM: 1,
    ARM: 'Drug'
  },
  {
    USUBJID: 'P1',
    TEST: 'Creatinine',
    STRESN: 0.9,
    STRESU: 'mg/dL',
    VISIT: 'Week 1',
    VISITNUM: 1,
    ARM: 'Drug'
  },
  {
    USUBJID: 'P2',
    TEST: 'Sodium',
    STRESN: 138,
    STRESU: 'mmol/L',
    VISIT: 'Week 2',
    VISITNUM: 2,
    ARM: 'Placebo'
  },
  {
    USUBJID: 'P2',
    TEST: 'Albumin',
    STRESN: 3.8,
    STRESU: 'g/dL',
    VISIT: 'Week 2',
    VISITNUM: 2,
    ARM: 'Placebo'
  },
  {
    USUBJID: 'P2',
    TEST: 'Creatinine',
    STRESN: 1.1,
    STRESU: 'mg/dL',
    VISIT: 'Week 2',
    VISITNUM: 2,
    ARM: 'Placebo'
  }
];

let element;

beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const mount = (settings = {}) => factory(element, { ...BASE, ...settings }).init(ROWS);

const measureOptions = (instance) => {
  const control = [...instance.controls.querySelectorAll('.sv-control')].find(
    (node) => node.querySelector('label')?.textContent === 'Measure'
  );
  return [...control.querySelectorAll('option')]
    .map((node) => node.textContent)
    .filter((text) => true);
};

describe('shift-plot: the measures whitelist', () => {
  it('SSP-MEAS-001: no whitelist offers every measure in the data, alphabetically (#136)', () => {
    expect(measureOptions(mount())).toEqual(['Albumin', 'Creatinine', 'Sodium']);
  });

  it('SSP-MEAS-001: a whitelist offers exactly the listed measures, in the listed order (#136)', () => {
    const instance = mount({ measures: ['Sodium', 'Albumin'] });
    expect(measureOptions(instance)).toEqual(['Sodium', 'Albumin']);
    expect(instance.measures()).toEqual(['Sodium', 'Albumin']);
  });

  it('SSP-MEAS-002: a configured measure absent from the data is dropped with a warning (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const instance = mount({ measures: ['Sodium', 'Bilirubin'] });
    expect(measureOptions(instance)).toEqual(['Sodium']);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('Bilirubin'))).toBe(true);
    warn.mockRestore();
  });

  it('SSP-MEAS-002: a whitelist matching nothing falls back to every measure (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(measureOptions(mount({ measures: ['Bilirubin'] }))).toEqual([
      'Albumin',
      'Creatinine',
      'Sodium'
    ]);
    warn.mockRestore();
  });

  it('SSP-MEAS-001: setSettings re-resolves the control against the new whitelist (#136)', () => {
    const instance = mount();
    instance.setSettings({ measures: ['Creatinine'] });
    expect(measureOptions(instance)).toEqual(['Creatinine']);
  });
});
