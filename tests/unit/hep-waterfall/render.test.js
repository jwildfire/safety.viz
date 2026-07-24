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
