// @vitest-environment jsdom
// delta-delta adopts the participant-profile dock (#99, PPRF-10/11/12): the
// renderer FIRST gains the house participantsSelected dispatch on the shell
// root — including an empty-click clear gesture — closing its #88/SELN-4 gap
// (PPRF-DD-001/003), and its bespoke per-measure detail table is DELETED in
// the same change because the docked profile supersedes it (PPRF-12,
// PPRF-DD-004). The spaghetti + per-measure sparklines show the participant's
// full series; the baseline-vs-comparison delta encoding stays on the chart.
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
    LineController: stub(),
    PointElement: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: deltaDelta } = await import('../../../src/delta-delta.js');
const { makeRows, ALT_TEST, TB_TEST } = await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = deltaDelta(document.querySelector('#host'), {
    measure_x: ALT_TEST,
    measure_y: TB_TEST,
    baseline_visits: ['Baseline'],
    comparison_visits: ['Day 30'],
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

function clickPoint(instance, id) {
  const index = instance.points.findIndex((point) => String(point.id) === String(id));
  instance.chart.options.onClick({}, [{ index }]);
  return index;
}

describe('delta-delta participantsSelected dispatch (PPRF-DD-001)', () => {
  it('PPRF-DD-001: a point click dispatches the house payload on the shell root', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    clickPoint(instance, 'P1');
    expect(heard).toEqual([['P1']]);
    expect(instance.participantsSelected).toEqual(['P1']);
  });

  it('PPRF-DD-001: the event bubbles (element-level listeners still hear it)', () => {
    const instance = build();
    const heard = [];
    instance.element.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    clickPoint(instance, 'P1');
    expect(heard).toEqual([['P1']]);
  });

  it('PPRF-DD-003: an empty-canvas click is a clear gesture — state, borders, annotation, dispatch', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    const index = clickPoint(instance, 'P1');
    expect(instance.chart.data.datasets[0].pointBorderWidth[index]).toBe(3);
    instance.chart.options.onClick({}, []);
    expect(instance.state.selectedId).toBeNull();
    expect(instance.chart.$ddSelectedIndex).toBeNull();
    expect(instance.chart.data.datasets[0].pointBorderWidth[index]).toBe(0.5);
    expect(instance.mainAnnotation.textContent).toBe('Click a point to see details.');
    expect(heard).toEqual([['P1'], []]);
  });
});

describe('delta-delta dock adoption (PPRF-DD-002, PPRF-11)', () => {
  it('PPRF-DD-002: a point click opens the docked full profile with the point highlighted', () => {
    const instance = build();
    const index = clickPoint(instance, 'P1');
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    // Key liver measures resolve through the module defaults — the profile is
    // the participant's full story, not a re-encoding of the delta pair.
    expect(instance.profileWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.profileWrap.querySelector('.sv-profile-step-count')).toBeNull();
    expect(instance.chart.data.datasets[0].pointBorderWidth[index]).toBe(3);
    expect(instance.mainAnnotation.textContent).toBe('Participant P1 selected.');
  });

  it('PPRF-DD-002: clicking a different point re-renders the dock for the new participant (SDD-REG-013 retargeted)', () => {
    const instance = build();
    clickPoint(instance, 'P1');
    clickPoint(instance, 'P2');
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P2');
  });

  it('PPRF-DD-002: dock header details default to the host details minus the participant id', () => {
    const instance = build({ filters: [{ value_col: 'SEX', label: 'Sex' }] });
    // Host details default = id + filter columns; the profile header already
    // shows the id, so only the genuinely demographic columns pass through.
    expect(instance.profile.settings.details).toEqual([{ value_col: 'SEX', label: 'Sex' }]);
  });

  it('PPRF-DD-003: the dock Clear affordance routes through the host clear path', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    clickPoint(instance, 'P1');
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-DD-003: a background click with nothing selected dispatches nothing', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    // No selection yet: an empty-canvas click must not spam external
    // listeners with empty participantsSelected dispatches (matching
    // hep-explorer and outlier-explorer).
    instance.chart.options.onClick({}, []);
    expect(heard).toEqual([]);
  });

  it('PPRF-DD-003: dock Clear empties an externally-fed cohort the host never selected (PPRF-11)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    // A root-level dispatch the host did not originate (the shared-selector
    // shape, #87) — the dock fills while state.selectedId stays null.
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P1', 'P2'] }, bubbles: true })
    );
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    expect(instance.state.selectedId).toBeNull();
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-DD-003: a control-driven render resets the dock (render preamble)', () => {
    const instance = build();
    clickPoint(instance, 'P1');
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.render();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('PPRF-DD-001: profile: false still dispatches (the event contract is independent of the dock)', () => {
    const instance = build({ profile: false });
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    clickPoint(instance, 'P1');
    expect(instance.profile).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard).toEqual([['P1']]);
  });
});

describe('delta-delta bespoke measure table removal (PPRF-DD-004, PPRF-12)', () => {
  it('PPRF-DD-004: the bespoke measure table is gone — the docked profile is the sole detail', () => {
    const instance = build();
    clickPoint(instance, 'P1');
    expect(document.querySelector('.sdd-measure-table')).toBeNull();
    expect(document.querySelector('.sdd-detail-header')).toBeNull();
    expect(document.querySelector('.sdd-sparkline')).toBeNull();
    expect(instance.listingWrap.innerHTML).toBe('');
  });

  it('PPRF-DD-004: the listing module no longer ships', async () => {
    const modules = import.meta.glob('../../../src/delta-delta/*.js');
    expect(Object.keys(modules).some((path) => path.endsWith('listing.js'))).toBe(false);
  });
});
