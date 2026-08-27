// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The shared filter contract, exercised through a real renderer rather than
// through the helper (SH-FILT-001/002/003, #136). The point of QW1 is that a
// filter spec means the same thing everywhere, so it has to be proven where a
// user meets it: the control the sidebar builds, and the rows the chart draws.
// Chart.js is stubbed the way the other jsdom module tests stub it.

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

const ROWS = [
  { USUBJID: 'P1', TEST: 'Albumin', STRESN: 4.1, STRESU: 'g/dL', ARM: 'Drug', SEX: 'F' },
  { USUBJID: 'P2', TEST: 'Albumin', STRESN: 3.8, STRESU: 'g/dL', ARM: 'Placebo', SEX: 'M' },
  { USUBJID: 'P3', TEST: 'Albumin', STRESN: 4.4, STRESU: 'g/dL', ARM: 'Comparator', SEX: 'F' },
  { USUBJID: 'P4', TEST: 'Albumin', STRESN: 3.5, STRESU: 'g/dL', ARM: 'Drug', SEX: 'M' }
];

let element;

beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const mount = (settings) =>
  histogram(element, { start_value: 'Albumin (g/dL)', ...settings }).init(ROWS);

const control = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (node) => node.querySelector('label')?.textContent === label
  ).lastElementChild;

const arms = (instance) =>
  instance
    .currentFilteredData()
    .map((row) => row.ARM)
    .sort();

describe('histogram: the shared filter contract', () => {
  it('SH-FILT-001: a plain filter still offers All and starts unfiltered (#136)', () => {
    const instance = mount({ filters: [{ value_col: 'ARM', label: 'Treatment' }] });
    const select = control(instance, 'Treatment');
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((node) => node.textContent)).toEqual([
      'All',
      'Comparator',
      'Drug',
      'Placebo'
    ]);
    expect(arms(instance)).toEqual(['Comparator', 'Drug', 'Drug', 'Placebo']);
  });

  it('SH-FILT-002: a start value opens the chart filtered and drops the All option (#136)', () => {
    const instance = mount({
      filters: [{ value_col: 'ARM', label: 'Treatment', start: 'Placebo' }]
    });
    const select = control(instance, 'Treatment');
    expect([...select.options].map((node) => node.textContent)).not.toContain('All');
    expect(select.value).toBe('Placebo');
    expect(arms(instance)).toEqual(['Placebo']);
  });

  it('SH-FILT-002: a start value with all:true keeps the All option and still opens filtered (#136)', () => {
    const instance = mount({
      filters: [{ value_col: 'ARM', label: 'Treatment', start: 'Placebo', all: true }]
    });
    const select = control(instance, 'Treatment');
    expect([...select.options].map((node) => node.textContent)).toContain('All');
    expect(select.value).toBe('Placebo');
    expect(arms(instance)).toEqual(['Placebo']);
  });

  it('SH-FILT-003: all:false removes the All option without needing a start value (#136)', () => {
    const instance = mount({ filters: [{ value_col: 'ARM', label: 'Treatment', all: false }] });
    const select = control(instance, 'Treatment');
    expect([...select.options].map((node) => node.textContent)).toEqual([
      'Comparator',
      'Drug',
      'Placebo'
    ]);
  });

  it('SH-FILT-004: multiple renders the shared multiselect and filters on every checked value (#136)', () => {
    const instance = mount({
      filters: [
        { value_col: 'ARM', label: 'Treatment', multiple: true, start: ['Drug', 'Placebo'] }
      ]
    });
    const multi = control(instance, 'Treatment');
    expect(multi.classList.contains('sv-multiselect')).toBe(true);
    const boxes = [...multi.querySelectorAll('.sv-ms-option:not(.sv-ms-all) input')];
    expect(boxes.map((box) => box.value)).toEqual(['Comparator', 'Drug', 'Placebo']);
    expect(boxes.map((box) => box.checked)).toEqual([false, true, true]);
    // Two arms selected: three of the four participants are drawn.
    expect(arms(instance)).toEqual(['Drug', 'Drug', 'Placebo']);

    // Unchecking Placebo narrows the chart to the Drug arm alone — the thing a
    // single-value filter could never express.
    boxes[2].checked = false;
    boxes[2].onchange();
    expect(arms(instance)).toEqual(['Drug', 'Drug']);
  });

  it('SH-FILT-004: checking every value in a multiselect is the same as no restriction (#136)', () => {
    const instance = mount({
      filters: [{ value_col: 'ARM', label: 'Treatment', multiple: true, start: ['Drug'] }]
    });
    const multi = control(instance, 'Treatment');
    const all = multi.querySelector('.sv-ms-all input');
    all.checked = true;
    all.onchange();
    expect(instance.state.filters.ARM).toBe(null);
    expect(arms(instance)).toEqual(['Comparator', 'Drug', 'Drug', 'Placebo']);
  });
});
