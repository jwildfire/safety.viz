// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The shared filter contract, proven where a reader meets it: in all twelve
// charts that build filter controls, through the real renderer (#166).
//
// tests/unit/shared/filters.test.js pins what the helpers in src/filters.js
// return. That is not the same claim as "a filter means the same thing in
// every chart": a chart can normalize its specs with something else (the shift
// plot did), filter rows with its own predicate (the adverse event explorer
// did), or re-seed its state differently on Reset (the hepatic explorer did),
// and every helper test still passes. So the same cases run here against each
// chart, and each case ends on the one assertion the contract is really about:
// the selection the control SHOWS is the selection the chart FILTERS BY.
//
// Every chart gets the same four participants, one per row of this table, and
// the same filter column:
//
//   P1 S1    P2 S1    P3 S2    P4 S3
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

const { ALL_VALUE } = await import('../../../src/filters.js');
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

const PARTICIPANTS = [
  { USUBJID: 'P1', SITE: 'S1', ARM: 'Placebo' },
  { USUBJID: 'P2', SITE: 'S1', ARM: 'Drug' },
  { USUBJID: 'P3', SITE: 'S2', ARM: 'Placebo' },
  { USUBJID: 'P4', SITE: 'S3', ARM: 'Drug' }
];
const EVERYONE = ['P1', 'P2', 'P3', 'P4'];
const AT = { S1: ['P1', 'P2'], S2: ['P3'], S3: ['P4'] };

// Three lab measures at three visits: enough for the liver charts (ALT and
// total bilirubin against their upper limits), the kidney chart (creatinine
// rising from baseline) and the two-measure, two-visit charts.
const ALT = 'Aminotransferase, alanine (ALT)';
const TB = 'Total Bilirubin';
const CREAT = 'Creatinine';
const LAB_VISITS = [
  { VISIT: 'Baseline', VISITNUM: 1, DY: 0 },
  { VISIT: 'Week 4', VISITNUM: 2, DY: 28 },
  { VISIT: 'Week 8', VISITNUM: 3, DY: 56 }
];
const LAB_MEASURES = [
  { TEST: ALT, STRESU: 'U/L', STNRLO: 5, STNRHI: 40, base: 30, step: 9 },
  { TEST: TB, STRESU: 'mg/dL', STNRLO: 0.2, STNRHI: 1.2, base: 0.6, step: 0.1 },
  { TEST: CREAT, STRESU: 'mg/dL', STNRLO: 0.6, STNRHI: 1.2, base: 0.9, step: 0.2 }
];
const LAB_ROWS = PARTICIPANTS.flatMap((participant, p) =>
  LAB_MEASURES.flatMap(({ base, step, ...measure }) =>
    LAB_VISITS.map((visit, v) => ({
      ...participant,
      ...measure,
      ...visit,
      STRESN: Number((base + step * v * (p + 1)).toFixed(2))
    }))
  )
);

const ECG_VISITS = [
  { VISIT: 'Baseline', VISITNUM: 0, ABLFL: 'Y' },
  { VISIT: 'Week 2', VISITNUM: 2, ABLFL: '' },
  { VISIT: 'Week 4', VISITNUM: 4, ABLFL: '' }
];
const ECG_ROWS = PARTICIPANTS.flatMap((participant, p) =>
  ECG_VISITS.map((visit, v) => ({
    ...participant,
    ...visit,
    TEST: 'QTcF',
    STRESU: 'msec',
    BASE: 400 + p * 5,
    CHG: v * (p + 2),
    STRESN: 400 + p * 5 + v * (p + 2)
  }))
);

const AE_ROWS = PARTICIPANTS.flatMap((participant, p) => [
  {
    ...participant,
    AESEQ: '1',
    ASTDY: String(3 + p),
    AENDY: String(9 + p),
    AETERM: 'Headache',
    AEDECOD: 'Headache',
    AEBODSYS: 'Nervous system disorders',
    AESEV: p % 2 ? 'MODERATE' : 'MILD',
    AESER: 'N'
  },
  {
    ...participant,
    AESEQ: '2',
    ASTDY: String(14 + p),
    AENDY: String(20 + p),
    AETERM: 'Nausea',
    AEDECOD: 'Nausea',
    AEBODSYS: 'Gastrointestinal disorders',
    AESEV: 'MILD',
    AESER: p === 0 ? 'Y' : 'N'
  }
]);

const TTE_DATA = {
  events: AE_ROWS,
  population: PARTICIPANTS.map((participant) => ({
    ...participant,
    EOSDY: 90,
    EOSSTT: 'COMPLETED'
  }))
};

const ids = (rows, key = 'USUBJID') => [...new Set(rows.map((row) => String(row[key])))].sort();

// One entry per chart: its matrix prefix, how it is mounted on the shared
// cohort, and — read off what render() left behind, never recomputed here —
// which participants it drew.
const CHARTS = [
  {
    name: 'histogram',
    prefix: 'SH',
    mount: (element, settings) =>
      histogram(element, { start_value: `${ALT} (U/L)`, ...settings }).init(LAB_ROWS),
    drawn: (instance) => ids(instance.filteredData)
  },
  {
    name: 'results-over-time',
    prefix: 'SROT',
    mount: (element, settings) => resultsOverTime(element, settings).init(LAB_ROWS),
    drawn: (instance) => ids(instance.filteredData)
  },
  {
    name: 'hep-waterfall',
    prefix: 'HWF',
    mount: (element, settings) =>
      hepWaterfall(element, { placebo_arm: 'Placebo', ...settings }).init(LAB_ROWS),
    drawn: (instance) => ids(instance.waterfall.ordered, 'id')
  },
  {
    name: 'qt-explorer',
    prefix: 'QT',
    mount: (element, settings) => qtExplorer(element, settings).init(ECG_ROWS),
    drawn: (instance) => ids(instance.filteredRows)
  },
  {
    name: 'ae-explorer',
    prefix: 'AE',
    mount: (element, settings) => aeExplorer(element, settings).init(AE_ROWS),
    drawn: (instance) => ids(instance.currentEvents),
    // The adverse event explorer ships no Reset control.
    reset: null
  },
  {
    name: 'nep-explorer',
    prefix: 'NEP',
    mount: (element, settings) => nepExplorer(element, settings).init(LAB_ROWS),
    drawn: (instance) => ids(instance.points, 'id')
  },
  {
    name: 'ae-timelines',
    prefix: 'AET',
    mount: (element, settings) => aeTimelines(element, settings).init(AE_ROWS),
    drawn: (instance) => ids(instance.filteredData)
  },
  {
    name: 'outlier-explorer',
    prefix: 'SOE',
    mount: (element, settings) =>
      outlierExplorer(element, { start_value: `${ALT} (U/L)`, ...settings }).init(LAB_ROWS),
    drawn: (instance) => ids(instance.filteredData)
  },
  {
    name: 'hep-explorer',
    prefix: 'HEP',
    mount: (element, settings) => hepExplorer(element, settings).init(LAB_ROWS),
    drawn: (instance) => ids(instance.points, 'id'),
    reset: (instance) => instance.resetChart()
  },
  {
    name: 'shift-plot',
    prefix: 'SSP',
    mount: (element, settings) => shiftPlot(element, settings).init(LAB_ROWS),
    drawn: (instance) => ids(instance.chartPairs)
  },
  {
    name: 'delta-delta',
    prefix: 'SDD',
    mount: (element, settings) => deltaDelta(element, settings).init(LAB_ROWS),
    drawn: (instance) => ids(instance.points, 'id')
  },
  {
    name: 'time-to-event',
    prefix: 'TTE',
    mount: (element, settings) => timeToEvent(element, settings).init(TTE_DATA),
    drawn: (instance) =>
      ids(
        instance.structured.groups.flatMap((group) => group.observations),
        'id'
      )
  }
];

let element;
let warn;

beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/** The Site filter's control, or undefined when the chart drew none. */
const siteControl = (instance) =>
  [...instance.controls.querySelectorAll('.sv-control')].find((node) =>
    node.querySelector('label')?.textContent.startsWith('Site')
  )?.lastElementChild;

const boxes = (control) => [...control.querySelectorAll('.sv-ms-option:not(.sv-ms-all) input')];

/** What the control shows: null for "All", a value, or the checked values. */
const shown = (control) => {
  if (control.tagName === 'SELECT') return control.value === ALL_VALUE ? null : control.value;
  const checked = boxes(control)
    .filter((box) => box.checked)
    .map((box) => box.value);
  return checked.length === boxes(control).length ? null : checked;
};

/** What the chart filters by, with "no restriction" spelled one way. */
const held = (instance) => instance.state.filters.SITE ?? null;

const optionLabels = (control) => [...control.options].map((node) => node.textContent);

/** Choose a value in a single-value filter the way a reader does. */
const choose = (instance, value) => {
  const control = siteControl(instance);
  control.value = value;
  control.onchange();
};

describe.each(CHARTS)('$name: the shared filter contract', (chart) => {
  const id = (n) => `${chart.prefix}-FILT-00${n}`;
  const mount = (spec, extra = {}) =>
    chart.mount(element, { filters: [{ value_col: 'SITE', label: 'Site', ...spec }], ...extra });

  it(`${id(1)}: a plain filter offers All, opens unfiltered and draws every participant (#166)`, () => {
    const instance = mount({});
    const control = siteControl(instance);
    expect(control.tagName).toBe('SELECT');
    expect(optionLabels(control)).toEqual(['All', 'S1', 'S2', 'S3']);
    expect(shown(control)).toBe(null);
    expect(held(instance)).toBe(null);
    expect(chart.drawn(instance)).toEqual(EVERYONE);
  });

  it(`${id(1)}: choosing a value filters the chart, and choosing All brings everyone back (#166)`, () => {
    const instance = mount({});
    choose(instance, 'S2');
    expect(held(instance)).toBe('S2');
    expect(chart.drawn(instance)).toEqual(AT.S2);
    choose(instance, ALL_VALUE);
    expect(held(instance)).toBe(null);
    expect(chart.drawn(instance)).toEqual(EVERYONE);
  });

  it(`${id(2)}: a start value opens the chart filtered, with All still on offer (#166)`, () => {
    const instance = mount({ start: 'S2' });
    const control = siteControl(instance);
    expect(optionLabels(control)).toEqual(['All', 'S1', 'S2', 'S3']);
    expect(shown(control)).toBe('S2');
    expect(held(instance)).toBe('S2');
    expect(chart.drawn(instance)).toEqual(AT.S2);
  });

  it(`${id(2)}: a start value the data lacks warns by name and opens on All (#166)`, () => {
    const instance = mount({ start: 'S9' });
    const control = siteControl(instance);
    expect(shown(control)).toBe(null);
    expect(held(instance)).toBe(null);
    expect(chart.drawn(instance)).toEqual(EVERYONE);
    const message = warn.mock.calls.map((call) => String(call[0])).find((m) => m.includes('S9'));
    expect(message).toContain('Site');
  });

  it(`${id(3)}: all:false offers no All, selects the first value and filters to it (#166)`, () => {
    const instance = mount({ all: false });
    const control = siteControl(instance);
    expect(optionLabels(control)).toEqual(['S1', 'S2', 'S3']);
    expect(shown(control)).toBe('S1');
    expect(held(instance)).toBe('S1');
    expect(chart.drawn(instance)).toEqual(AT.S1);
  });

  it(`${id(3)}: all:false with a start the data lacks falls back to the first value (#166)`, () => {
    const instance = mount({ all: false, start: 'S9' });
    const control = siteControl(instance);
    expect(shown(control)).toBe('S1');
    expect(held(instance)).toBe('S1');
    expect(chart.drawn(instance)).toEqual(AT.S1);
  });

  it(`${id(4)}: multiple opens on its start list and draws every checked value (#166)`, () => {
    const instance = mount({ multiple: true, start: ['S2', 'S3'] });
    const control = siteControl(instance);
    expect(control.classList.contains('sv-multiselect')).toBe(true);
    expect(shown(control)).toEqual(['S2', 'S3']);
    expect(held(instance)).toEqual(['S2', 'S3']);
    expect(chart.drawn(instance)).toEqual([...AT.S2, ...AT.S3]);
  });

  it(`${id(4)}: multiple drops start values the data lacks, and keeps the rest (#166)`, () => {
    const instance = mount({ multiple: true, start: ['S2', 'S9'] });
    expect(shown(siteControl(instance))).toEqual(['S2']);
    expect(held(instance)).toEqual(['S2']);
    expect(chart.drawn(instance)).toEqual(AT.S2);
  });

  it(`${id(4)}: multiple with no start value left in the data places no restriction (#166)`, () => {
    const instance = mount({ multiple: true, start: ['S8', 'S9'] });
    expect(shown(siteControl(instance))).toBe(null);
    expect(held(instance)).toBe(null);
    expect(chart.drawn(instance)).toEqual(EVERYONE);
  });

  it(`${id(4)}: a multiple filter emptied by hand keeps meaning nothing is selected (#166)`, () => {
    const instance = mount({ multiple: true, start: ['S2'] });
    const box = boxes(siteControl(instance)).find((node) => node.value === 'S2');
    box.checked = false;
    box.onchange();
    expect(held(instance)).toEqual([]);
    expect(chart.drawn(instance)).toEqual([]);
    // A rebuild of the controls must not read the empty list as "no start".
    instance.buildControls();
    expect(shown(siteControl(instance))).toEqual([]);
    expect(held(instance)).toEqual([]);
  });

  it(`${id(1)}: a filter whose column the data lacks draws no control and leaves no restriction behind (#166)`, () => {
    const instance = chart.mount(element, {
      filters: [{ value_col: 'NOPE', label: 'Site', start: 'S2' }]
    });
    expect(siteControl(instance)).toBeUndefined();
    expect(instance.state.filters.NOPE ?? null).toBe(null);
    expect(chart.drawn(instance)).toEqual(EVERYONE);
  });

  it.skipIf(chart.reset === null)(
    `${id(2)}: Reset returns the filter to its opening selection (#166)`,
    () => {
      const instance = mount({ start: 'S2' });
      choose(instance, 'S1');
      expect(chart.drawn(instance)).toEqual(AT.S1);
      if (chart.reset) chart.reset(instance);
      else instance.controls.querySelector('.sv-reset, .hwf-reset').click();
      expect(shown(siteControl(instance))).toBe('S2');
      expect(held(instance)).toBe('S2');
      expect(chart.drawn(instance)).toEqual(AT.S2);
    }
  );

  it.skipIf(chart.reset === null)(
    `${id(2)}: Reset squares a start value the data lacks with the data, exactly as load does (#166)`,
    () => {
      const instance = mount({ start: 'S9' });
      choose(instance, 'S1');
      if (chart.reset) chart.reset(instance);
      else instance.controls.querySelector('.sv-reset, .hwf-reset').click();
      expect(shown(siteControl(instance))).toBe(null);
      expect(held(instance)).toBe(null);
      expect(chart.drawn(instance)).toEqual(EVERYONE);
    }
  );

  it(`${id(2)}: setSettings leaves the chart on its opening selection (#166)`, () => {
    const instance = mount({ start: 'S2' });
    instance.setSettings({});
    expect(shown(siteControl(instance))).toBe('S2');
    expect(held(instance)).toBe('S2');
    expect(chart.drawn(instance)).toEqual(AT.S2);
  });

  it(`${id(2)}: after a reader's own choice, setSettings still leaves the control and the chart agreeing (#166)`, () => {
    const instance = mount({ start: 'S2' });
    choose(instance, 'S1');
    instance.setSettings({});
    expect(shown(siteControl(instance))).toBe(held(instance));
    expect(chart.drawn(instance)).toEqual(AT[held(instance)]);
  });
});
