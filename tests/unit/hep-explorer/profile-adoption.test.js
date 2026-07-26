// @vitest-environment jsdom
// hep-explorer adopts the participant-profile dock (#98, PPRF-7): the bespoke
// drawDetail/buildSummaryTable drill-down is DELETED and every selection path
// feeds the railed module through the ONE choke point — selection.dispatch()'s
// participantsSelected event on the shell root. These tests prove the wiring at
// the orchestrator level: single select → full profile, multi select → the
// worst-first stepper, empty dispatch → dock hidden, dock Clear → the host's
// own clear path, stepper → chart highlight sync via the view contract, the
// idempotency guard under repeated identical dispatches, and the `profile`
// setting escape hatch.
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
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: hepExplorer } = await import('../../../src/hep-explorer.js');
const { makeRows } = await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = hepExplorer(document.querySelector('#host'), settings);
  instance.init(makeRows());
  return instance;
}

describe('hep-explorer participant-profile adoption (PPRF-7, PPRF-HEP-001)', () => {
  it('deletes the bespoke drill-down: no drawDetail/buildSummaryTable, no .hep-detail DOM', () => {
    const instance = build();
    expect(instance.drawDetail).toBeUndefined();
    expect(instance.buildSummaryTable).toBeUndefined();
    expect(instance.detailWrap).toBeUndefined();
    expect(document.querySelector('.hep-detail')).toBeNull();
  });

  it('mounts the rail by default and a scatter click renders the full profile in the shell slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(instance.railWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    // Single selection: full profile, no stepper.
    expect(instance.railWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The on-chart visit trace is retained alongside the rail (PPRF-7).
    expect(instance.chart.data.datasets[1].data.length).toBeGreaterThan(0);
  });

  it('a multi-participant dispatch collapses the rail to the worst-first stepper (PPRF-5)', () => {
    const instance = build();
    // The shared Participants control path: selection.set → the bound scatter
    // view's onParticipantsChanged → dispatch(N ids) → the rail.
    instance.selection.set(['P1', 'P6']);
    // Worst-first: P6 (Hy's Law, peak ALT 6.0×ULN) ahead of P1 (4.0×ULN).
    expect(instance.railWrap.querySelector('.sv-profile-step-count').textContent).toBe(
      '1 of 2 · P6'
    );
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P6');
  });

  it('stepping reports through on_step: transient chart emphasis via the view highlight contract', () => {
    const instance = build();
    instance.selection.set(['P1', 'P6']);
    instance.railWrap.querySelector('.sv-profile-step-next').click();
    expect(instance.state.hoverId).toBe('P1');
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('an empty dispatch hides the rail; the rail Clear routes through the host clear path (PPRF-2/6)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data.map(String))
    );
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    // The rail's Clear affordance → on_clear → selection.clear() → the bound
    // view's full-clear path → dispatch([]) → the rail empties.
    instance.railWrap.querySelector('.sv-profile-clear').click();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    expect(instance.state.selectedId).toBeNull();
    expect(heard.at(-1)).toEqual([]);
  });

  it('is idempotent under repeated identical dispatches: the profile DOM is not rebuilt', () => {
    const instance = build();
    instance.selectParticipant('P1');
    const rootBefore = instance.railWrap.querySelector('.sv-profile-root');
    instance.selection.dispatch(['P1']);
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBe(rootBefore);
  });

  it('a control-driven redraw re-feeds the rail with fresh rows (the guard resets per render)', () => {
    const instance = build();
    instance.selectParticipant('P1');
    const rootBefore = instance.railWrap.querySelector('.sv-profile-root');
    // render() re-dispatches the carried selection; the rail must rebuild from
    // the (possibly re-cleaned, re-united) rows rather than no-op.
    instance.render();
    const rootAfter = instance.railWrap.querySelector('.sv-profile-root');
    expect(rootAfter).not.toBeNull();
    expect(rootAfter).not.toBe(rootBefore);
  });

  it('profile: false restores the pre-#98 behaviour — no dock, slot stays empty', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    instance.selectParticipant('P1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });

  it('destroy tears the rail down with the rest of the instance', () => {
    const instance = build();
    instance.selectParticipant('P1');
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
  });
});

describe('dock coordination follows live control state (PPRF-7, PPRF-HEP-001)', () => {
  it('user-edited reference cuts reach the rail on the control-driven redraw', () => {
    const instance = build();
    instance.selectParticipant('P1');
    // The scatter cut inputs write state.cuts and call render() — the rail's
    // spaghetti must draw/fill against the SAME edited cut, not the
    // construction-time settings value.
    instance.state.cuts.ALT = { ...(instance.state.cuts.ALT || {}), relative_uln: 5 };
    instance.render();
    expect(instance.profile.settings.cuts.ALT.relative_uln).toBe(5);
    const altSeries = instance.profile.model.spaghetti.series.find((entry) => entry.key === 'ALT');
    expect(altSeries.cut).toBe(5);
  });

  it('the Axis-type control reaches the rail spaghetti (drawDetail log-axis parity)', () => {
    const instance = build();
    instance.selectParticipant('P1');
    expect(instance.profile.model.spaghetti.axisType).toBe('linear');
    instance.state.axisType = 'log';
    instance.render();
    expect(instance.profile.settings.axis_type).toBe('log');
    expect(instance.profile.model.spaghetti.axisType).toBe('log');
  });

  it('passes the caller measureBounds, p_alt_col and participantProfileURL knobs through', () => {
    const instance = build({
      measureBounds: [0.05, 0.95],
      p_alt_col: 'P_ALT',
      participantProfileURL: 'https://x.test/{id}'
    });
    instance.selectParticipant('P1');
    expect(instance.profile.settings.measureBounds).toEqual([0.05, 0.95]);
    expect(instance.profile.settings.p_alt_col).toBe('P_ALT');
    expect(instance.profile.settings.participantProfileURL).toBe('https://x.test/{id}');
  });

  it('profile_details overrides the shared details knob for the rail header (PPRF-2)', () => {
    const instance = build({
      details: ['VISIT'],
      profile_details: [{ value_col: 'SEX', label: 'Sex' }]
    });
    instance.selectParticipant('P1');
    expect(instance.profile.settings.details).toEqual([{ value_col: 'SEX', label: 'Sex' }]);
  });
});
