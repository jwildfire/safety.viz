// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRows } from './fixture.js';

// hep-waterfall's participant listing shows a Visit and a Study day column
// (#377, obot.roadmap#437), each only when its column is configured and in the
// data, instead of one "Study Day" column that could hold visit numbers.
// Chart.js is replaced with the same recording stub render.test.js uses.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.updates = 0;
      this.resizes = 0;
      this.destroyed = false;
    }
    update() {
      this.updates += 1;
    }
    resize() {
      this.resizes += 1;
    }
    destroy() {
      this.destroyed = true;
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
    CategoryScale: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    Title: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: hepWaterfall } = await import('../../../src/hep-waterfall.js');

const ARMS = { placebo_arm: 'Placebo', active_arms: ['Drug'] };
// The fixture names its visits after their days; give them visit names, so a
// Visit cell cannot be mistaken for a Study day cell.
const NAMES = { 0: 'Baseline', 30: 'Week 4', 60: 'Week 8' };
const rows = () => makeRows().map((row) => ({ ...row, VISIT: NAMES[row.DY] }));

let element;
beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const listing = (settings = {}, data = rows()) => {
  const instance = hepWaterfall(element, { ...ARMS, ...settings }).init(data);
  const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'P3');
  instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
  const table = instance.listingWrap.querySelector('table');
  const headers = [...table.querySelectorAll('th')].map((th) => th.textContent.trim());
  const cells = [...table.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
  );
  const column = (name) => cells.map((row) => row[headers.findIndex((h) => h.startsWith(name))]);
  return { headers, column };
};

describe('hep-waterfall participant listing (HWF-SELECT-004)', () => {
  it('HWF-SELECT-004: the listing shows a Visit and a Study day column, each holding its own column (#377)', () => {
    const { headers, column } = listing();
    expect(headers.some((h) => h.startsWith('Visit'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Study day'))).toBe(true);
    expect(headers.some((h) => h.startsWith('Study Day'))).toBe(false);
    expect(new Set(column('Visit'))).toEqual(new Set(['Baseline', 'Week 4', 'Week 8']));
    expect(new Set(column('Study day'))).toEqual(new Set(['0', '30', '60']));
  });

  it('HWF-SELECT-004: a column that is not configured is left out (#377)', () => {
    expect(listing({ visit_col: null }).headers.some((h) => h.startsWith('Visit'))).toBe(false);
  });
});
