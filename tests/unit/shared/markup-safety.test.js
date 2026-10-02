// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Data and settings reach the page as text, never as markup (#166).
//
// A unit is a column in somebody's dataset and a column name is a setting a
// host fills from a file header, so either can carry anything — including
// `<img src=x onerror=...>`. Written with innerHTML that string runs script the
// moment the chart draws. Every case here hands a chart such a value by the
// route it would really arrive, and asserts two things: no element was
// created from it, and the reader still sees it, verbatim, as text.
//
// Chart.js is stubbed the way the other jsdom module tests stub it.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
    stop() {}
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

const { default: histogram } = await import('../../../src/histogram.js');
const { default: resultsOverTime } = await import('../../../src/results-over-time.js');
const { default: hepWaterfall } = await import('../../../src/hep-waterfall.js');
const { default: qtExplorer } = await import('../../../src/qt-explorer.js');
const { default: aeExplorer } = await import('../../../src/ae-explorer.js');
const { default: nepExplorer } = await import('../../../src/nep-explorer.js');
const { default: aeTimelines } = await import('../../../src/ae-timelines.js');
const { default: outlierExplorer } = await import('../../../src/outlier-explorer.js');
const { default: hepExplorer } = await import('../../../src/hep-explorer.js');
const { default: shiftPlot } = await import('../../../src/shift-plot.js');
const { default: deltaDelta } = await import('../../../src/delta-delta.js');
const { default: timeToEvent } = await import('../../../src/time-to-event.js');
const { default: participantProfile } = await import('../../../src/participant-profile.js');

const MARKUP = '<img src=x onerror="window.__svInjected = true">';

let element;
let warn;

beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  delete window.__svInjected;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/** No element came out of the value, and the reader can still read it. */
function expectWrittenAsText(container) {
  expect(element.querySelectorAll('img')).toHaveLength(0);
  expect(window.__svInjected).toBeUndefined();
  expect(container.textContent).toContain(MARKUP);
}

// One entry per module that reports a missing required variable: the row that
// states the error, the factory, a required column setting to rename, and data
// that lacks the renamed column.
const EMPTY_TTE = { events: [{ USUBJID: 'P1' }], population: [{ USUBJID: 'P1' }] };
const MODULES = [
  ['SH-DATA-001', 'histogram', histogram, 'measure_col', []],
  ['SROT-DATA-001', 'results-over-time', resultsOverTime, 'measure_col', []],
  ['HWF-DATA-001', 'hep-waterfall', hepWaterfall, 'measure_col', []],
  ['QT-DATA-005', 'qt-explorer', qtExplorer, 'measure_col', []],
  ['AE-DATA-001', 'ae-explorer', aeExplorer, 'major_col', []],
  ['NEP-DATA-006', 'nep-explorer', nepExplorer, 'measure_col', []],
  ['AET-DATA-001', 'ae-timelines', aeTimelines, 'term_col', []],
  ['SOE-DATA-001', 'outlier-explorer', outlierExplorer, 'measure_col', []],
  ['HEP-DATA-005', 'hep-explorer', hepExplorer, 'measure_col', []],
  ['SSP-DATA-001', 'shift-plot', shiftPlot, 'measure_col', []],
  ['SDD-REG-010', 'delta-delta', deltaDelta, 'measure_col', []],
  ['TTE-DATA-001', 'time-to-event', timeToEvent, 'fu_day_col', EMPTY_TTE],
  ['PPRF-CORE-002', 'participant-profile', participantProfile, 'measure_col', []]
];

describe('markup safety: the missing-variable message', () => {
  it.each(MODULES)(
    '%s: %s writes a missing column name as text, never as markup (#166)',
    (_id, _name, factory, key, data) => {
      // The standalone profile takes (element, data, settings); the charts
      // take (element, settings).
      const instance =
        factory === participantProfile
          ? factory(element, null, { [key]: MARKUP })
          : factory(element, { [key]: MARKUP });
      expect(() => instance.init(data)).toThrow(/Required variable/);
      expectWrittenAsText(element.querySelector('.sv-warning'));
    }
  );
});

describe('markup safety: values from the data', () => {
  it('NEP-TBL-001: a unit from the data is written into the stage summary as text (#166)', () => {
    const unit = `${MARKUP}U/L`;
    const rows = ['P1', 'P2'].flatMap((id, p) =>
      [
        ['Baseline', 1, 0, 0.9],
        ['Week 4', 2, 28, 1.4 + p]
      ].map(([VISIT, VISITNUM, DY, STRESN]) => ({
        USUBJID: id,
        TEST: 'Creatinine',
        STRESU: unit,
        ARM: 'Drug',
        VISIT,
        VISITNUM,
        DY,
        STRESN
      }))
    );
    const instance = nepExplorer(element, {}).init(rows);
    expect(instance.points).toHaveLength(2);
    expect(instance.nativeUnit).toBe(unit);
    // The table is still there, with its columns and its four stage rows.
    expect(instance.listingWrap.querySelectorAll('table.nep-summary tbody tr')).toHaveLength(4);
    expect(instance.listingWrap.querySelectorAll('table.nep-summary thead th')).toHaveLength(10);
    expectWrittenAsText(instance.listingWrap);
  });

  it('NEP-TBL-001: a target unit from the settings is written into the stage summary as text (#166)', () => {
    const rows = ['P1', 'P2'].flatMap((id, p) =>
      [0.9, 1.4 + p].map((STRESN, v) => ({
        USUBJID: id,
        TEST: 'Creatinine',
        STRESU: 'mg/dL',
        VISIT: v ? 'Week 4' : 'Baseline',
        VISITNUM: v + 1,
        DY: v * 28,
        STRESN
      }))
    );
    const instance = nepExplorer(element, {
      units: { target: MARKUP, factors: { 'mg/dl': 1 } }
    }).init(rows);
    expectWrittenAsText(instance.listingWrap);
  });

  it('AET-DATA-001: a column name from the settings is written into the removed-record note as text (#166)', () => {
    const rows = [
      { USUBJID: 'P1', AESEQ: '1', ASTDY: '3', AENDY: '5', [MARKUP]: 'Headache', AESEV: 'MILD' },
      { USUBJID: 'P2', AESEQ: '1', ASTDY: '4', AENDY: '6', [MARKUP]: '', AESEV: 'MILD' }
    ];
    const instance = aeTimelines(element, { term_col: MARKUP }).init(rows);
    expect(instance.removedTerm).toBe(1);
    expect(instance.notes.querySelector('em').textContent).toContain('participant ID(s) shown');
    expectWrittenAsText(instance.notes.querySelector('.sv-warning'));
  });

  it('HEP-ARM-008: arm names from the data are written into the pooled-arms note as text (#166)', () => {
    const ALT = 'Aminotransferase, alanine (ALT)';
    const TB = 'Total Bilirubin';
    const arms = ['Placebo', `${MARKUP}Low`, 'High'];
    const rows = arms.flatMap((ARM, a) =>
      [
        [ALT, 40, 30, 90 + a * 60],
        [TB, 1.2, 0.6, 0.8 + a]
      ].flatMap(([TEST, STNRHI, base, peak]) =>
        [base, peak].map((STRESN, v) => ({
          USUBJID: `P${a + 1}`,
          ARM,
          TEST,
          STRESU: 'U/L',
          STNRLO: 0,
          STNRHI,
          VISIT: v ? 'Week 4' : 'Baseline',
          VISITNUM: v + 1,
          DY: v * 28,
          STRESN
        }))
      )
    );
    const instance = hepExplorer(element, { view: 'migration' }).init(rows);
    expect(instance.state.view).toBe('migration');
    expect(instance.notes.textContent).toContain('Active side pools');
    expectWrittenAsText(instance.notes);
  });
});
