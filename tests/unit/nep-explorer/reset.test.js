// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The "Reset chart" control at the foot of the nep-explorer sidebar (#136,
// obot.roadmap#33): NEP-CTRL-001. Chart.js is replaced with a recording stub so
// the mount + control + teardown orchestration can be asserted in jsdom, which
// has no canvas.
//
// The zone-labels checkbox is the trap this suite exists to guard. Its handler
// writes BOTH this.state.zoneLabels AND this.settings.zone_labels (the
// setSettings contract carries the choice), so a re-seed that reads
// this.settings.zone_labels back would return the value the user just chose and
// Reset would be a silent no-op for that one control. The assertions below read
// the state AND the settings after the reset, so that no-op cannot ship.

const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.destroyed = false;
      built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
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
    CategoryScale: stub(),
    Legend: stub(),
    LineController: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    Title: stub(),
    Tooltip: stub()
  };
});

const { default: nepExplorer } = await import('../../../src/nep-explorer.js');
const { UMOL_PER_MGDL } = await import('../../../src/nep-explorer/configure.js');

/** One creatinine record, reported in µmol/L. */
const record = (id, visitn, mgdl, arm) => ({
  USUBJID: id,
  TEST: 'Creatinine',
  STRESN: Math.round(mgdl * UMOL_PER_MGDL * 100) / 100,
  STRESU: 'umol/L',
  VISIT: visitn === 0 ? 'Baseline' : `Week ${visitn}`,
  VISITNUM: visitn,
  ARM: arm
});

/** A participant's whole series, baseline first. */
const series = (id, values, arm) =>
  values.map((mgdl, index) => record(id, index === 0 ? 0 : index * 2, mgdl, arm));

const rows = [
  ...series('S1', [0.8, 0.9, 1.0], 'Placebo'),
  ...series('S2', [0.9, 1.6, 2.1], 'Study Drug'),
  ...series('S3', [1.0, 3.4, 4.5], 'Study Drug'),
  ...series('S4', [1.1, 1.2, 1.15], 'Placebo')
];

let element;

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const mount = (settings = {}) => nepExplorer(element, { filters: ['ARM'], ...settings }).init(rows);

const labelled = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (control) => control.querySelector('label')?.textContent === label
  );

describe('nep-explorer reset', () => {
  it('NEP-CTRL-001: a reset control sits last in the control panel (#136)', () => {
    const instance = mount();
    const reset = instance.controls.querySelector('.sv-reset');
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below the Filters and Display sections, not inside either of them.
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('NEP-CTRL-001: reset restores the stage zone labels in state AND in settings, so the display toggle is not a silent no-op (#136)', () => {
    const instance = mount();
    expect(instance.state.zoneLabels).toBe('shown');
    expect(instance.settings.zone_labels).toBe('shown');

    const zoneLabels = labelled(instance, 'Stage zone labels').querySelector(
      'input[type=checkbox]'
    );
    zoneLabels.checked = false;
    zoneLabels.onchange();
    // The handler writes both, which is exactly why a naive re-seed reading
    // this.settings back would make the reset below do nothing.
    expect(instance.state.zoneLabels).toBe('hidden');
    expect(instance.settings.zone_labels).toBe('hidden');

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.zoneLabels).toBe('shown');
    expect(instance.settings.zone_labels).toBe('shown');
    // The control is rebuilt, so the rendered sidebar agrees with the state.
    expect(
      labelled(instance, 'Stage zone labels').querySelector('input[type=checkbox]').checked
    ).toBe(true);
  });

  it('NEP-CTRL-001: reset clears the filters and brings every participant back into the picture (#136)', () => {
    const instance = mount();
    expect(instance.state.filters.ARM).toBe(null);
    const all = instance.points.length;
    expect(all).toBe(4);

    const arm = instance.controls.querySelector('select[data-filter="ARM"]');
    arm.value = 'Placebo';
    arm.onchange();
    expect(instance.state.filters.ARM).toBe('Placebo');
    expect(instance.points).toHaveLength(2);

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.filters).toEqual({ ARM: null });
    expect(instance.points).toHaveLength(all);
    expect(instance.controls.querySelector('select[data-filter="ARM"]').value).toBe('__all__');
  });

  it('NEP-CTRL-001: reset clears the selection and rebuilds the chart from a clean teardown (#136)', () => {
    const instance = mount();
    instance.state.selectedId = 'S3';
    instance.participantsSelected = ['S3'];
    const before = built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.selectedId).toBe(null);
    expect(instance.participantsSelected).toEqual([]);
    // listingWrap carries this module's stage summary rather than a record
    // listing; it is rebuilt for the whole unfiltered cohort.
    expect(instance.listingWrap.textContent).toContain('KDIGO stage summary (n = 4)');
    expect(instance.mainAnnotation.textContent).toBe('Click a point to see details.');
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(built.filter((chart) => !chart.destroyed).length).toBeGreaterThan(0);
  });
});
