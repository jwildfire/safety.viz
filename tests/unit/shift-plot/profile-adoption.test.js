// @vitest-environment jsdom
// shift-plot adopts the participant-profile dock (#99, PPRF-10/11): the brush
// selection path — showSelection → dispatchSelected — feeds the docked module,
// SUPPLEMENTING the linked listing rather than replacing it (records vs
// story). shift-plot is the rollout's stepper renderer: a brush routinely
// catches several participants, so the dock collapses to the worst-first
// cohort stepper (PPRF-SSP-001) while a single-point brush shows the full
// profile directly (PPRF-SSP-002). The adoption also moves the
// participantsSelected dispatch target from the host element to the shell
// root (PPRF-SSP-004, SSP-API-003 alignment) — backward-compatible because
// the event bubbles.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
      this.destroyed = false;
      Chart.built.push(this);
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

const { default: shiftPlot } = await import('../../../src/shift-plot.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = shiftPlot(document.querySelector('#host'), settings);
  instance.init(makeRows());
  return instance;
}

/** Brush a set of participants through the same path the mouse handlers use. */
function brush(instance, ids) {
  const indices = new Set(
    ids.map((id) =>
      instance.chartPairs.findIndex((pair) => String(pair[instance.settings.id_col]) === id)
    )
  );
  expect([...indices].every((index) => index >= 0)).toBe(true);
  instance.showSelection(indices, { left: 0, right: 10, top: 0, bottom: 10 });
}

describe('shift-plot participant-profile adoption (PPRF-SSP-002)', () => {
  it('PPRF-SSP-002: mounts the dock by default (config-on) into the shell profile slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    expect(instance.profileWrap.children).toHaveLength(0); // idle until a selection
  });

  it('PPRF-SSP-002: profile: false leaves the slot empty and mounts no dock', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    brush(instance, ['P1']);
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('PPRF-SSP-002: derives the dock feed rows ONCE per setData from rawData through the hep-core cleaners', () => {
    const rows = makeRows();
    // A row without a usable ULN never reaches the dock (the ×ULN denominator)
    // — but it needs a visit so the shift-plot's own cleaner keeps the rest.
    rows.push({
      USUBJID: 'P9',
      TEST: ALT_TEST,
      STRESN: 50,
      STNRHI: '',
      VISIT: 'Baseline',
      VISITNUM: 1
    });
    const instance = shiftPlot(document.querySelector('#host'), {});
    instance.init(rows);
    expect(instance.profileRows.length).toBe(rows.length - 1);
    expect(instance.profileRows.every((row) => Number.isFinite(row.__hep_relative_uln))).toBe(true);
    // Feed rows come from rawData, not the pair-per-participant chartPairs.
    expect(instance.profileRows.length).toBeGreaterThan(instance.chartPairs.length);
  });

  it('PPRF-SSP-002: passes the host lab mappings through, mapping visitn_col from visit_order_col', () => {
    const instance = build({
      studyday_col: 'DY',
      profile_details: [{ value_col: 'SEX', label: 'Sex' }],
      participantProfileURL: 'https://x.test/{id}'
    });
    expect(instance.profile.settings.id_col).toBe('USUBJID');
    expect(instance.profile.settings.normal_col_high).toBe('STNRHI');
    expect(instance.profile.settings.normal_col_low).toBe('STNRLO');
    expect(instance.profile.settings.studyday_col).toBe('DY');
    expect(instance.profile.settings.visit_col).toBe('VISIT');
    expect(instance.profile.settings.visitn_col).toBe('VISITNUM');
    expect(instance.profile.settings.details).toEqual([{ value_col: 'SEX', label: 'Sex' }]);
    expect(instance.profile.settings.participantProfileURL).toBe('https://x.test/{id}');
  });

  it('PPRF-SSP-002: host listing columns are NOT the dock header details (profile_details defaults empty)', () => {
    const instance = build();
    // The host `details` default to the pair columns (baseline/comparison/
    // change) — per-pair fields, not demographics — so the dock header shows
    // none.
    expect(instance.profile.settings.details).toEqual([]);
  });

  it('PPRF-SSP-002: a single-point brush shows the full profile with no stepper AND keeps the listing', () => {
    const instance = build();
    brush(instance, ['P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(instance.profileWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.profileWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The linked listing stays — records vs story (PPRF-11 linked-listings-stay).
    expect(instance.listingWrap.querySelector('table')).not.toBeNull();
  });
});

describe('shift-plot cohort stepper (PPRF-SSP-001, PPRF-11)', () => {
  it('PPRF-SSP-001: a multi-participant brush collapses the dock to a worst-first stepper', () => {
    const instance = build();
    // P1 is Hy's Law, P3 is Normal — worst-first puts P1 up front.
    brush(instance, ['P3', 'P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-step-count').textContent).toContain(
      '1 of 2'
    );
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('PPRF-SSP-001: stepping emphasizes the stepped point on the chart without re-dispatching', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    brush(instance, ['P3', 'P1']);
    expect(heard).toHaveLength(1);
    instance.profileWrap.querySelector('.sv-profile-step-next').click();
    // The step re-rendered the profile for P3…
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P3');
    // …border-emphasized P3's point on the chart…
    const p3 = instance.chartPairs.findIndex((pair) => pair.USUBJID === 'P3');
    const widths = instance.chart.data.datasets[0].borderWidth;
    expect(Array.isArray(widths)).toBe(true);
    expect(widths[p3]).toBeGreaterThan(1);
    expect(widths.filter((width) => width > 1)).toHaveLength(1);
    // …and dispatched nothing (the selection still belongs to the brush).
    expect(heard).toHaveLength(1);
  });
});

describe('shift-plot dispatch target (PPRF-SSP-004, SSP-API-003)', () => {
  it('PPRF-SSP-004: the dispatch travels via the shell root (the house participantsSelected contract)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    brush(instance, ['P1']);
    expect(heard).toEqual([['P1']]);
  });

  it('PPRF-SSP-004: the dispatch still bubbles to element-level listeners (backward compatibility)', () => {
    const instance = build();
    const heard = [];
    instance.element.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    brush(instance, ['P1']);
    instance.clearSelection();
    expect(heard).toEqual([['P1'], []]);
  });

  it('PPRF-SSP-004: is idempotent under repeated identical dispatches', () => {
    const instance = build();
    brush(instance, ['P1']);
    const rootBefore = instance.profileWrap.querySelector('.sv-profile-root');
    instance.dispatchSelected(['P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-root')).toBe(rootBefore);
  });
});

describe('shift-plot dock clear paths (PPRF-SSP-003, PPRF-11)', () => {
  it('PPRF-SSP-003: clearing the selection (the tiny-click path) empties the dock and the emphasis', () => {
    const instance = build();
    brush(instance, ['P3', 'P1']);
    instance.profileWrap.querySelector('.sv-profile-step-next').click();
    instance.clearSelection();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(instance.chart.data.datasets[0].borderWidth).toBe(1);
  });

  it('PPRF-SSP-003: the dock Clear affordance routes through the host clear path', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    brush(instance, ['P1']);
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.currentTableData).toHaveLength(0);
    expect(instance.listingWrap.innerHTML).toBe('');
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-SSP-003: dock Clear empties an externally-fed cohort the host never selected (PPRF-11)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    // A root-level dispatch the host did not originate (the shared-selector
    // shape, #87): no brush, no $sspSelected, but the dock fills.
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P3', 'P1'] }, bubbles: true })
    );
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-SSP-003: a control-driven render resets the selection AND the dock (render preamble)', () => {
    const instance = build();
    brush(instance, ['P1']);
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    // Controls reset selection silently on render — the dock must not go stale.
    instance.render();
    expect(instance.currentTableData).toHaveLength(0);
    expect(instance.profileWrap.children).toHaveLength(0);
    // And the guard reset means the next identical selection re-feeds the dock.
    brush(instance, ['P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('PPRF-SSP-003: destroy tears the dock down with the instance', () => {
    const instance = build();
    brush(instance, ['P1']);
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
    expect(instance.profile).toBeNull();
  });

  it('PPRF-SSP-002: setSettings({profile: false}) unmounts a live dock; re-enabling remounts it', () => {
    const instance = build();
    brush(instance, ['P1']);
    instance.setSettings({ profile: false });
    expect(instance.profile).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    instance.setSettings({ profile: true });
    expect(instance.profile).toBeTruthy();
  });
});
