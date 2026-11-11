// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// hep-explorer's participant listing shows a Visit and a Study day column
// (#377, obot.roadmap#437), each only when its column is configured and in the
// data, instead of one "Study Day" column that could hold visit numbers.
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

const { default: hepExplorer } = await import('../../../src/hep-explorer.js');

const BASE = {
  id_col: 'ID',
  measure_col: 'TEST',
  value_col: 'VALUE',
  normal_col_high: 'ULN',
  studyday_col: 'DAY',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  measure_values: { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' },
  profile: false
};
const rec = (test, value, uln, day, visit, visitnum) => ({
  ID: 'P1',
  TEST: test,
  VALUE: value,
  ULN: uln,
  DAY: day,
  VISIT: visit,
  VISITNUM: visitnum
});
const RAW = [
  rec('ALT', 40, 40, 1, 'Baseline', 0),
  rec('ALT', 160, 40, 57, 'Week 8', 8),
  rec('TB', 1, 1, 1, 'Baseline', 0),
  rec('TB', 3, 1, 57, 'Week 8', 8)
];

let element;
beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
});

const listing = (settings = {}, data = RAW) => {
  const instance = hepExplorer(element, { ...BASE, ...settings }).init(data);
  instance.selectParticipant('P1');
  const table = instance.listingWrap.querySelector('table');
  const headers = [...table.querySelectorAll('th')].map((th) => th.textContent.trim());
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
  );
  const column = (name) => rows.map((cells) => cells[headers.findIndex((h) => h.startsWith(name))]);
  return { headers, column };
};

describe('hep-explorer participant listing (HEP-XAX-008)', () => {
  it('HEP-XAX-008: the listing shows a Visit and a Study day column, each holding its own column (#377)', () => {
    const { headers, column } = listing();
    expect(headers.some((h) => h.startsWith('Visit'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Study day'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Study Day'))).toBe(false);
    expect(new Set(column('Visit'))).toEqual(new Set(['Baseline', 'Week 8']));
    expect(new Set(column('Study day'))).toEqual(new Set(['1', '57']));
  });

  it('HEP-XAX-008: a column that is not configured, or not in the data, is left out (#377)', () => {
    expect(listing({ visit_col: null }).headers.some((h) => h.startsWith('Visit'))).toBe(false);
    const noDay = RAW.map(({ DAY, ...rest }) => rest);
    const { headers } = listing({}, noDay);
    expect(headers.some((h) => h.startsWith('Study day'))).toBe(false);
    expect(headers.some((h) => h.startsWith('Visit'))).toBe(true);
  });

  it("HEP-XAX-008: the Study day column reads the x_axis day option's column (#377)", () => {
    const data = RAW.map((row) => ({ ...row, ADY: row.DAY, DAY: row.VISITNUM }));
    const { column } = listing(
      {
        x_axis: {
          options: [
            { key: 'visit', col: 'VISITNUM', label_col: 'VISIT' },
            { key: 'day', col: 'ADY' }
          ]
        }
      },
      data
    );
    expect(new Set(column('Study day'))).toEqual(new Set(['1', '57']));
  });
});
