// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRows } from './fixture.js';

// The renderer's lifecycle, controls, notes and selection (#93). Chart.js is
// replaced with a recording stub so the orchestration — how many charts are
// built, what data and scales they are handed, what is torn down — can be
// asserted in jsdom, which has no canvas. The MARKS those charts draw are the
// browser suite's job; everything above the canvas is pinned here.
// Requirement groups HWF-API-002/003, HWF-CTRL-*, HWF-SELECT-002/003,
// HWF-BOX-001 and the HWF-DATA-* notes.

const built = [];

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
      built.push(this);
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

let element;

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const mount = (settings = {}, rows = makeRows()) =>
  hepWaterfall(element, { ...ARMS, ...settings }).init(rows);

const labelled = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (control) => control.querySelector('label')?.textContent === label
  );

const noteText = (instance) => instance.notes.textContent;

const chartOption = (chart, path) =>
  path.split('.').reduce((node, key) => (node == null ? node : node[key]), chart.options);

describe('hep-waterfall lifecycle', () => {
  it('HWF-API-002: init, setData and setSettings re-render and return the instance (#93)', () => {
    const instance = hepWaterfall(element, ARMS);
    expect(instance.init(makeRows())).toBe(instance);
    expect(instance.waterfall.ordered).toHaveLength(5);
    const first = built.length;
    expect(first).toBeGreaterThan(0);

    // setData replaces the bound data: dropping the Drug arm leaves the two
    // placebo-side participants plus the fallback-baseline one.
    expect(instance.setData(makeRows().filter((row) => row.ARM !== 'Drug'))).toBe(instance);
    expect(instance.waterfall.ordered.map((subject) => subject.id)).toEqual(['P1', 'P7', 'P2']);
    expect(built.length).toBeGreaterThan(first);

    // setSettings merges and re-renders; the previous charts are destroyed.
    const before = [...built];
    expect(instance.setSettings({ apply_tb_cohort: false })).toBe(instance);
    expect(instance.settings.apply_tb_cohort).toBe(false);
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
  });

  it('HWF-API-003: resize re-measures every chart and destroy tears them all down (#93)', () => {
    const instance = mount();
    expect(instance.charts).toHaveLength(3);
    instance.resize();
    instance.charts.forEach((chart) => expect(chart.resizes).toBe(1));
    const live = [...instance.charts];
    instance.destroy();
    live.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(instance.charts).toHaveLength(0);
    expect(element.innerHTML).toBe('');
  });
});

describe('hep-waterfall layout and panels', () => {
  it('HWF-BOX-001: a summary panel flanks each side, placebo left and active right (#93)', () => {
    const instance = mount();
    const canvases = [...element.querySelectorAll('canvas')];
    expect(canvases).toHaveLength(3);
    expect(canvases[0].classList.contains('hwf-box-left')).toBe(true);
    expect(canvases[2].classList.contains('hwf-box-right')).toBe(true);
    expect(instance.boxSpecs.left.every((spec) => spec.color === '#1f78b4')).toBe(true);
    expect(instance.boxSpecs.right.every((spec) => spec.color === '#b5651d')).toBe(true);
    // Both panels are pinned to the main chart's vertical domain (HWF-BOX-002).
    const domain = instance.chart.options.scales.y;
    instance.flankCharts.forEach((chart) => {
      expect(chart.options.scales.y.min).toBe(domain.min);
      expect(chart.options.scales.y.max).toBe(domain.max);
    });
  });

  it('HWF-DATA-007: mixed units for the plotted measure suppress the chart with a warning (#93)', () => {
    const instance = mount({}, makeRows({ altUnit: (id) => (id === 'P4' ? 'IU/L' : 'U/L') }));
    expect(instance.chart).toBeNull();
    expect(instance.notes.querySelector('.sv-warning')).not.toBeNull();
    expect(noteText(instance)).toMatch(/unit/i);
    expect(instance.chartWrap.style.display).toBe('none');
  });

  it('HWF-DATA-003/005/008: both exclusions and the dropped records are reported in the notes (#93)', () => {
    const rows = makeRows();
    rows[0] = { ...rows[0], STNRHI: '' };
    const instance = mount({}, rows);
    const text = noteText(instance);
    expect(text).toMatch(/1 participant.*baseline bilirubin/i);
    expect(text).toMatch(/1 participant.*not designated/i);
    expect(text).toMatch(/1 record.*reference range/i);
    expect(text).toMatch(/participants plotted/i);
  });
});

describe('hep-waterfall controls', () => {
  it('HWF-CTRL-001: the panel exposes measure, jaundice threshold, cohort toggle, ULN display and summary (#93)', () => {
    const instance = mount();
    ['Measure', 'Jaundice threshold (×ULN)', 'Reference range', 'Arm summary'].forEach((label) =>
      expect(labelled(instance, label), `missing ${label} control`).toBeTruthy()
    );
    const cohort = instance.controls.querySelector('input[type=checkbox]');
    expect(cohort).toBeTruthy();
    expect(cohort.checked).toBe(true);

    // The measure control drives the plotted analyte.
    const measure = labelled(instance, 'Measure').querySelector('select');
    expect([...measure.options].map((o) => o.value)).toContain('AST');
    // The reference-range and summary controls offer exactly their enums.
    expect(
      [...labelled(instance, 'Reference range').querySelector('select').options].map((o) => o.value)
    ).toEqual(['band', 'per_subject', 'none']);
    expect(
      [...labelled(instance, 'Arm summary').querySelector('select').options].map((o) => o.value)
    ).toEqual(['baseline_peak', 'peak']);

    // Turning the cohort rule off re-renders with the excluded participant in.
    cohort.checked = false;
    cohort.onchange();
    expect(instance.waterfall.ordered.some((subject) => subject.id === 'P5')).toBe(true);
  });

  it('HWF-CTRL-002: the arm mapping control lists every arm value present in the data (#93)', () => {
    const instance = mount();
    const placebo = labelled(instance, 'Placebo arm').querySelector('select');
    const values = [...placebo.options].map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['Placebo', 'Drug', 'Other']));
    expect(placebo.value).toBe('Placebo');
    const active = labelled(instance, 'Active arm').querySelector('select');
    expect([...active.options].map((option) => option.value)).toEqual(
      expect.arrayContaining(['', 'Drug', 'Other'])
    );
    // Re-designating swaps the sides.
    placebo.value = 'Drug';
    placebo.onchange();
    expect(instance.waterfall.placebo.every((subject) => subject.arm === 'Drug')).toBe(true);
  });

  it('HWF-CTRL-003: configured filters restrict the cohort and update the counts (#93)', () => {
    const instance = mount({ filters: ['SEX'] });
    const before = instance.waterfall.ordered.length;
    const select = labelled(instance, 'SEX').querySelector('select');
    select.value = 'F';
    select.onchange();
    expect(instance.waterfall.ordered.map((subject) => subject.id)).toEqual(['P1', 'P3']);
    expect(instance.waterfall.ordered.length).toBeLessThan(before);
    expect(noteText(instance)).toMatch(/2 participants plotted/i);
  });

  it('HWF-CTRL-004: reset restores every setting-derived control and re-renders (#93)', () => {
    const instance = mount();
    const cohort = instance.controls.querySelector('input[type=checkbox]');
    cohort.checked = false;
    cohort.onchange();
    const uln = labelled(instance, 'Reference range').querySelector('select');
    uln.value = 'none';
    uln.onchange();
    expect(instance.state.ulnDisplay).toBe('none');
    expect(instance.state.applyTbCohort).toBe(false);

    instance.controls.querySelector('.hwf-reset').click();
    expect(instance.state.ulnDisplay).toBe('band');
    expect(instance.state.applyTbCohort).toBe(true);
    expect(instance.state.measure).toBe('ALT');
    expect(instance.waterfall.ordered.some((subject) => subject.id === 'P5')).toBe(false);
  });
});

describe('hep-waterfall selection', () => {
  it('HWF-SELECT-002: clicking a bar highlights the participant and opens the listing (#93)', () => {
    const instance = mount();
    const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'P3');
    instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    expect(instance.state.selectedIds).toEqual(['P3']);
    expect(instance.listingWrap.querySelector('table')).not.toBeNull();
    expect(instance.listingWrap.textContent).toContain('P3');
    // The selected bar keeps a highlight border while the others do not.
    const widths = instance.chart.data.datasets[0].borderWidth;
    expect(widths[index]).toBeGreaterThan(0);
    expect(widths.filter((width) => width > 0)).toHaveLength(1);
    // Clicking the same bar again clears the selection.
    instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    expect(instance.state.selectedIds).toEqual([]);
    expect(instance.listingWrap.innerHTML).toBe('');
  });

  it('HWF-SELECT-003: selection dispatches participantsSelected with the ids (#93)', () => {
    const instance = mount();
    const seen = [];
    instance.root.addEventListener('participantsSelected', (event) => seen.push(event.detail.data));
    const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'P1');
    instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    expect(seen).toEqual([['P1'], []]);
  });
});

// The flanking panels' hover, labelling and accessible description
// (obot.roadmap#83). Requirement groups HWF-BOX-005/006/007.

// Give the stubbed flank charts the geometry the hit test reads: two slots
// across 90px, a 0-500 value axis over 300px.
const geometry = (instance) => {
  instance.flankCharts.forEach((chart) => {
    chart.chartArea = { left: 10, right: 100, top: 5, bottom: 305 };
    chart.scales = {
      x: { getPixelForValue: (value) => 10 + ((value + 0.5) / 2) * 90 },
      y: { getPixelForValue: (value) => 305 - (value / 500) * 300 }
    };
  });
  return instance;
};

const pointer = (canvas, type, x, y) =>
  canvas.dispatchEvent(
    new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
  );

describe('hep-waterfall flanking-panel hover and labelling', () => {
  it('HWF-BOX-006: the legend carries the box anatomy key and names both boxes (#83)', () => {
    const instance = mount();
    const legend = instance.legendEl.textContent;
    expect(legend).toMatch(/interquartile/i);
    expect(legend).toMatch(/median/i);
    expect(legend).toMatch(/5th–95th percentiles/);
    expect(legend).toMatch(/mean/i);
    expect(legend).toMatch(/maximum on-treatment/i);
    // A drawn key, not only prose: the anatomy chip carries a glyph.
    expect(instance.legendEl.querySelector('.hwf-legend-box')).not.toBeNull();
  });

  it('HWF-BOX-006: each flank labels its slots and titles itself with the arm and n (#83)', () => {
    const instance = mount();
    const [left, right] = instance.flankCharts;
    const ticks = (chart) => chart.options.scales.x.ticks;
    expect(chartOption(left, 'scales.x.display')).toBe(true);
    expect(ticks(left).callback(0)).toBe('Baseline');
    expect(ticks(left).callback(1)).toBe('Max on-tx');
    expect(ticks(left).callback(0.5)).toBe('');
    expect(chartOption(left, 'plugins.title.text')).toMatch(/n=3/);
    expect(chartOption(right, 'plugins.title.text')).toMatch(/n=2/);

    // The single-box reading labels its one slot as the peak.
    const summary = labelled(instance, 'Arm summary').querySelector('select');
    summary.value = 'peak';
    summary.onchange();
    expect(instance.flankCharts[0].options.scales.x.ticks.callback(0)).toBe('Max on-tx');
  });

  it('HWF-BOX-007: each flank canvas carries an accessible summary of its boxes (#83)', () => {
    const instance = mount();
    const label = instance.boxCanvasLeft.getAttribute('aria-label');
    expect(instance.boxCanvasLeft.getAttribute('role')).toBe('img');
    expect(label).toMatch(/box-and-whisker summary/i);
    expect(label).toMatch(/baseline/i);
    expect(label).toMatch(/maximum on-treatment/i);
    expect(label).toMatch(/median/i);
  });

  it('HWF-BOX-005: hovering a box opens the tooltip and closes it on leave (#83)', () => {
    const instance = geometry(mount());
    const tip = instance.boxTips.left;
    expect(tip).not.toBeNull();
    expect(tip.classList.contains('is-visible')).toBe(false);

    // The baseline slot's median, in the stub geometry above.
    const box = instance.boxSpecs.left[0];
    const chart = instance.flankCharts[0];
    pointer(
      instance.boxCanvasLeft,
      'pointermove',
      chart.scales.x.getPixelForValue(box.x),
      chart.scales.y.getPixelForValue(box.stats.median)
    );
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(tip.textContent).toMatch(/median/i);
    expect(tip.textContent).toContain(String(box.stats.n));
    expect(instance.boxHover).toEqual({ side: 'left', index: 0 });

    // Off the boxes, the tooltip closes without needing to leave the canvas.
    pointer(instance.boxCanvasLeft, 'pointermove', 5, 5);
    expect(tip.classList.contains('is-visible')).toBe(false);
    expect(instance.boxHover.index).toBe(-1);

    pointer(
      instance.boxCanvasLeft,
      'pointermove',
      chart.scales.x.getPixelForValue(box.x),
      chart.scales.y.getPixelForValue(box.stats.median)
    );
    expect(tip.classList.contains('is-visible')).toBe(true);
    pointer(instance.boxCanvasLeft, 'pointerleave', 0, 0);
    expect(tip.classList.contains('is-visible')).toBe(false);
  });

  it('HWF-BOX-005: the panels are reachable and steppable from the keyboard (#83)', () => {
    const instance = geometry(mount());
    expect(instance.boxCanvasLeft.getAttribute('tabindex')).toBe('0');

    instance.boxCanvasLeft.dispatchEvent(new window.FocusEvent('focus'));
    expect(instance.boxHover).toEqual({ side: 'left', index: 0 });
    expect(instance.boxTips.left.classList.contains('is-visible')).toBe(true);

    const key = (name) =>
      instance.boxCanvasLeft.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
      );
    key('ArrowRight');
    expect(instance.boxHover.index).toBe(1);
    expect(instance.boxTips.left.textContent).toMatch(/maximum on-treatment/i);
    key('ArrowRight');
    expect(instance.boxHover.index).toBe(0);
    key('ArrowLeft');
    expect(instance.boxHover.index).toBe(1);
    key('Escape');
    expect(instance.boxHover.index).toBe(-1);
    expect(instance.boxTips.left.classList.contains('is-visible')).toBe(false);
  });

  it('HWF-BOX-005: the hover survives a re-render and never doubles its listeners (#83)', () => {
    const instance = geometry(mount());
    const before = instance.flankCharts.map((chart) => chart.updates);
    const box = instance.boxSpecs.right[0];
    const chart = instance.flankCharts[1];
    pointer(
      instance.boxCanvasRight,
      'pointermove',
      chart.scales.x.getPixelForValue(box.x),
      chart.scales.y.getPixelForValue(box.stats.median)
    );
    // One redraw per hover change, on the hovered panel only.
    expect(instance.flankCharts[1].updates).toBe(before[1] + 1);
    expect(instance.flankCharts[0].updates).toBe(before[0]);

    // Re-rendering drops the stale hover rather than pointing at a destroyed
    // chart, and the freshly built panels still answer the pointer.
    instance.render();
    expect(instance.boxHover.index).toBe(-1);
    expect(instance.boxTips.right.classList.contains('is-visible')).toBe(false);
    geometry(instance);
    const fresh = instance.flankCharts[1];
    pointer(
      instance.boxCanvasRight,
      'pointermove',
      fresh.scales.x.getPixelForValue(box.x),
      fresh.scales.y.getPixelForValue(instance.boxSpecs.right[0].stats.median)
    );
    expect(instance.boxHover).toEqual({ side: 'right', index: 0 });
    expect(fresh.updates).toBe(1);
  });
});
