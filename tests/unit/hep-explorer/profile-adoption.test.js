// @vitest-environment jsdom
// hep-explorer adopts the participant-profile dock (#98, PPRF-7): the bespoke
// drawDetail/buildSummaryTable drill-down is DELETED and every selection path
// feeds the docked module through the ONE choke point — selection.dispatch()'s
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

describe('hep-explorer participant-profile adoption (PPRF-7)', () => {
  it('deletes the bespoke drill-down: no drawDetail/buildSummaryTable, no .hep-detail DOM', () => {
    const instance = build();
    expect(instance.drawDetail).toBeUndefined();
    expect(instance.buildSummaryTable).toBeUndefined();
    expect(instance.detailWrap).toBeUndefined();
    expect(document.querySelector('.hep-detail')).toBeNull();
  });

  it('mounts the dock by default and a scatter click renders the full profile in the shell slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    instance.selectParticipant('P1');
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(instance.profileWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    // Single selection: full profile, no stepper.
    expect(instance.profileWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The on-chart visit trace is retained alongside the dock (PPRF-7).
    expect(instance.chart.data.datasets[1].data.length).toBeGreaterThan(0);
  });

  it('a multi-participant dispatch collapses the dock to the worst-first stepper (PPRF-5)', () => {
    const instance = build();
    // The shared Participants control path: selection.set → the bound scatter
    // view's onParticipantsChanged → dispatch(N ids) → the dock.
    instance.selection.set(['P1', 'P6']);
    // Worst-first: P6 (Hy's Law, peak ALT 6.0×ULN) ahead of P1 (4.0×ULN).
    expect(instance.profileWrap.querySelector('.sv-profile-step-count').textContent).toBe(
      '1 of 2 · P6'
    );
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P6');
  });

  it('stepping reports through on_step: transient chart emphasis via the view highlight contract', () => {
    const instance = build();
    instance.selection.set(['P1', 'P6']);
    instance.profileWrap.querySelector('.sv-profile-step-next').click();
    expect(instance.state.hoverId).toBe('P1');
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('an empty dispatch hides the dock; the dock Clear routes through the host clear path (PPRF-2/6)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data.map(String))
    );
    instance.selectParticipant('P1');
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    // The dock's Clear affordance → on_clear → selection.clear() → the bound
    // view's full-clear path → dispatch([]) → the dock empties.
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(instance.state.selectedId).toBeNull();
    expect(heard.at(-1)).toEqual([]);
  });

  it('is idempotent under repeated identical dispatches: the profile DOM is not rebuilt', () => {
    const instance = build();
    instance.selectParticipant('P1');
    const rootBefore = instance.profileWrap.querySelector('.sv-profile-root');
    instance.selection.dispatch(['P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-root')).toBe(rootBefore);
  });

  it('a control-driven redraw re-feeds the dock with fresh rows (the guard resets per render)', () => {
    const instance = build();
    instance.selectParticipant('P1');
    const rootBefore = instance.profileWrap.querySelector('.sv-profile-root');
    // render() re-dispatches the carried selection; the dock must rebuild from
    // the (possibly re-cleaned, re-united) rows rather than no-op.
    instance.render();
    const rootAfter = instance.profileWrap.querySelector('.sv-profile-root');
    expect(rootAfter).not.toBeNull();
    expect(rootAfter).not.toBe(rootBefore);
  });

  it('profile: false restores the pre-#98 behaviour — no dock, slot stays empty', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    instance.selectParticipant('P1');
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('destroy tears the dock down with the rest of the instance', () => {
    const instance = build();
    instance.selectParticipant('P1');
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
  });
});
