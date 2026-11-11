// @vitest-environment jsdom
// outlier-explorer adopts the participant-profile dock (#99, PPRF-10/11): the
// chart's existing point-click selection path — selectParticipant →
// dispatchSelection on the shell root (SOE-API-003) — feeds the railed module
// with no new gesture, SUPPLEMENTING the linked listing rather than replacing
// it (records vs story). These tests prove the wiring at the orchestrator
// level: config-on mount + one-ingest feed rows, click → full profile beside
// the retained listing, clear/background → empty dock, control-driven render →
// dock reset, dock Clear → the host clear path, and the `profile` escape
// hatch.
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

const { default: outlierExplorer } = await import('../../../src/outlier-explorer.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

// The fixture carries a visit and a study day; the chart plots by visit
// (#371: with no time axis configured it would show a message, not a chart).
const X_AXIS = {
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
    { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
  ]
};

function build(settings = {}) {
  const instance = outlierExplorer(document.querySelector('#host'), {
    x_axis: X_AXIS,
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

describe('outlier-explorer participant-profile adoption (PPRF-OE-001)', () => {
  it('PPRF-OE-001: mounts the rail by default (config-on) into the shell profile slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull(); // idle until a selection
  });

  it('PPRF-OE-001: profile: false leaves the slot empty and mounts no dock', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });

  it('PPRF-OE-001: derives the rail feed rows ONCE per setData through the hep-core cleaners', () => {
    const rows = makeRows();
    // A row without a usable ULN never reaches the rail (the ×ULN denominator).
    rows.push({ USUBJID: 'P9', TEST: ALT_TEST, STRESN: 50, STNRHI: '' });
    const instance = outlierExplorer(document.querySelector('#host'), {});
    instance.init(rows);
    expect(instance.profileRows.length).toBe(rows.length - 1);
    expect(instance.profileRows.every((row) => Number.isFinite(row.__hep_relative_uln))).toBe(true);
  });

  it('PPRF-OE-001: passes the host lab mappings and profile_details through to the rail', () => {
    const instance = build({
      studyday_col: 'DY',
      visit_col: 'VISIT',
      visitn_col: 'VISITNUM',
      profile_details: [{ value_col: 'SEX', label: 'Sex' }],
      participantProfileURL: 'https://x.test/{id}'
    });
    expect(instance.profile.settings.id_col).toBe('USUBJID');
    expect(instance.profile.settings.normal_col_high).toBe('STNRHI');
    expect(instance.profile.settings.studyday_col).toBe('DY');
    expect(instance.profile.settings.visit_col).toBe('VISIT');
    expect(instance.profile.settings.details).toEqual([{ value_col: 'SEX', label: 'Sex' }]);
    expect(instance.profile.settings.participantProfileURL).toBe('https://x.test/{id}');
  });

  it('PPRF-OE-001: host listing columns are NOT the rail header details (profile_details defaults empty)', () => {
    const instance = build();
    // The host `details` default to listing columns (time/result/limits) —
    // per-row fields, not demographics — so the rail header shows none.
    expect(instance.profile.settings.details).toEqual([]);
  });
});

describe('outlier-explorer dock gesture contract (PPRF-OE-002, PPRF-11)', () => {
  it('PPRF-OE-002: a point click feeds the rail the full profile AND keeps the linked listing', () => {
    const instance = build({ studyday_col: 'DY' });
    instance.selectParticipant('P1');
    // Full profile, no stepper (single-select gesture).
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(instance.railWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The linked listing stays — records vs story (PPRF-11 linked-listings-stay).
    expect(instance.listingWrap.querySelector('table')).not.toBeNull();
    // And the chart overlay still highlights the participant.
    expect(instance.chart.data.datasets[1].data.length).toBeGreaterThan(0);
  });

  it('PPRF-OE-002: the dispatch travels via the shell root (the house participantsSelected contract)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    instance.selectParticipant('P1');
    expect(heard).toEqual([['P1']]);
  });

  it('PPRF-OE-002: stepping an externally-fed cohort emphasizes the stepped participant without touching the host selection or re-dispatching', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    // A root-level dispatch the host did not originate (the shared-selector
    // shape, #87) — the rail collapses to the worst-first stepper.
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P3', 'P1'] }, bubbles: true })
    );
    expect(instance.railWrap.querySelector('.sv-profile-step-count').textContent).toContain(
      '1 of 2'
    );
    const heardBefore = heard.length;
    instance.railWrap.querySelector('.sv-profile-step-next').click();
    // The step re-rendered the profile for the next participant…
    const steppedId = instance.railWrap
      .querySelector('.sv-profile-id')
      .textContent.replace('Participant ', '');
    // …emphasized ONLY that participant's series on the chart…
    expect(instance.overlayMeta.length).toBeGreaterThan(0);
    expect(instance.overlayMeta.every((meta) => String(meta.id) === steppedId)).toBe(true);
    // …without converting the cohort into a host single-selection…
    expect(instance.state.selectedId).toBeNull();
    // …and dispatched nothing (the selection still belongs to the feeder).
    expect(heard).toHaveLength(heardBefore);
  });

  it('PPRF-OE-002: is idempotent under repeated identical dispatches', () => {
    const instance = build();
    instance.selectParticipant('P1');
    const rootBefore = instance.railWrap.querySelector('.sv-profile-root');
    instance.dispatchSelection(['P1']);
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBe(rootBefore);
  });
});

describe('outlier-explorer rail clear paths (PPRF-OE-003, PPRF-11)', () => {
  it('PPRF-OE-003: a background click (clearSelection) empties the rail', () => {
    const instance = build();
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    instance.clearSelection();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });

  it('PPRF-OE-003: the rail Clear affordance routes through the host clear path', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    instance.selectParticipant('P1');
    instance.railWrap.querySelector('.sv-profile-clear').click();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.listingWrap.innerHTML).toBe('');
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-OE-003: dock Clear empties an externally-fed cohort the host never selected (PPRF-11)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    // External root dispatch: state.selectedId stays null, but the rail fills.
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P1', 'P2'] }, bubbles: true })
    );
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    expect(instance.state.selectedId).toBeNull();
    // Clear must still clear — the empty dispatch travels even with nothing
    // host-side selected (the F1 regression: clearSelection's early return).
    instance.railWrap.querySelector('.sv-profile-clear').click();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    expect(heard.at(-1)).toEqual([]);
    // And any transient stepper emphasis is gone.
    expect(instance.overlayMeta).toHaveLength(0);
  });

  it('PPRF-OE-003: a control-driven render resets the selection AND the rail (render preamble)', () => {
    const instance = build();
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    // Controls reset selection silently on render — the rail must not go stale.
    instance.render();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    // And the guard reset means the next identical selection re-feeds the rail.
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('PPRF-OE-003: destroy tears the rail down with the instance', () => {
    const instance = build();
    instance.selectParticipant('P1');
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
    expect(instance.profile).toBeNull();
  });

  it('PPRF-OE-001: setSettings({profile: false}) unmounts a live dock; re-enabling remounts it', () => {
    const instance = build();
    instance.selectParticipant('P1');
    instance.setSettings({ profile: false });
    expect(instance.profile).toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    instance.setSettings({ profile: true });
    expect(instance.profile).toBeTruthy();
  });
});

describe('outlier-explorer side panel X-axis (PPRF-XAX-009, PPRF-XAX-010, PPRF-XAX-011)', () => {
  function openPanel(instance, id = 'P1') {
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: [id] } })
    );
  }
  const panelView = (instance) =>
    instance.railWrap.querySelector('.sv-xaxis-option.is-active').textContent;
  const hostButton = (instance, title) =>
    [...instance.controls.querySelectorAll('.sv-xaxis-option')].find(
      (candidate) => candidate.textContent === title
    );
  const panelButton = (instance, title) =>
    [...instance.railWrap.querySelectorAll('.sv-xaxis-option')].find(
      (candidate) => candidate.textContent === title
    );

  it("PPRF-XAX-009: the side panel opens on the outlier explorer's current view (#370)", () => {
    const byDay = build({ x_axis: { ...X_AXIS, default: 'day' } });
    expect(byDay.profile.settings.x_axis.default).toBe('day');
    openPanel(byDay);
    expect(panelView(byDay)).toBe('Study day');

    const instance = build();
    openPanel(instance);
    expect(panelView(instance)).toBe('Visit');
    // The host switches its own view: the next participant opens on it.
    hostButton(instance, 'Study day').click();
    openPanel(instance);
    expect(panelView(instance)).toBe('Study day');
    expect(instance.profile.spaghettiChart.options.scales.x.title.text).toBe('Study day');
  });

  it('PPRF-XAX-010: switching the side panel does not change the host, and a host re-sync keeps the panel choice (#370)', () => {
    const instance = build();
    openPanel(instance);
    const hostChart = instance.charts[0];
    panelButton(instance, 'Study day').click();
    expect(panelView(instance)).toBe('Study day');
    // The host is untouched: its view, its control and its chart.
    expect(instance.state.xView).toBeNull();
    expect(instance.resolveXAxis().active).toBe('visit');
    expect(hostButton(instance, 'Visit').getAttribute('aria-pressed')).toBe('true');
    expect(instance.charts[0]).toBe(hostChart);
    expect(hostChart.destroyed).toBe(false);
    // A re-sync that leaves the host's view alone keeps the panel's choice.
    instance.setSettings({ profile_details: [{ value_col: 'SEX', label: 'Sex' }] });
    openPanel(instance);
    expect(panelView(instance)).toBe('Study day');
  });

  it("PPRF-XAX-011: the outlier explorer's studyday_col defaults to DY (#370)", () => {
    const instance = build();
    expect(instance.settings.studyday_col).toBe('DY');
    expect(instance.profile.settings.studyday_col).toBe('DY');
  });

  it('PPRF-XAX-009: a main axis with no day option still hands the panel a Study day option from studyday_col (#384)', () => {
    const instance = build({
      x_axis: undefined,
      time_cols: [{ value_col: 'VISIT', type: 'ordinal', order_col: 'VISITNUM', label: 'Visit' }]
    });
    expect(instance.profile.settings.x_axis.options.map((o) => [o.key, o.col])).toEqual([
      ['visit', 'VISITNUM'],
      ['day', 'DY']
    ]);
  });
});
