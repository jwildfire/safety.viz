// @vitest-environment jsdom
// The dock mount (#98, PPRF-1/5/6): profileDock consumes a host chart's
// pre-cleaned rows verbatim — no checkInputs, no cleanData (the "no second
// ingest" clause) — installs no event listener, and is driven imperatively via
// show/clear. Clear delegates to the host's on_clear; the stepper appears for
// N > 1 and reports steps through on_step.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const counters = vi.hoisted(() => ({ checkInputs: 0, cleanData: 0 }));
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
      this.resized = 0;
      built.push(this);
    }
    update() {}
    resize() {
      this.resized += 1;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

vi.mock('../../../src/participant-profile/checkInputs.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkInputs: (...args) => {
      counters.checkInputs += 1;
      return actual.checkInputs(...args);
    }
  };
});

vi.mock('../../../src/hep-core/rows.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cleanData: (...args) => {
      counters.cleanData += 1;
      return actual.cleanData(...args);
    }
  };
});

const { profileDock } = await import('../../../src/participant-profile.js');
const { syncSettings } = await import('../../../src/participant-profile/configure.js');
const { makeRows } = await import('./fixture.js');
const rowsActual = await vi.importActual('../../../src/hep-core/rows.js');

/** Pre-cleaned rows carrying the __hep_* columns, built outside the module. */
function cleanFixture() {
  const settings = syncSettings({});
  const { rows } = rowsActual.cleanData(makeRows(), settings);
  return rowsActual.deriveBaseline(rows, settings);
}

beforeEach(() => {
  built.length = 0;
  counters.checkInputs = 0;
  counters.cleanData = 0;
  document.body.innerHTML = '<div class="sv-profile" id="dockhost"></div>';
});

function container() {
  return document.querySelector('#dockhost');
}

describe('profileDock (PPRF-1, PPRF-CORE-005)', () => {
  it('show renders the profile from pre-cleaned rows without re-ingesting', () => {
    const dock = profileDock(container(), {});
    dock.show(['P1'], cleanFixture());
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(container().querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(counters.checkInputs).toBe(0);
    expect(counters.cleanData).toBe(0);
  });

  it('clear empties the container so the :empty slot hides', () => {
    const dock = profileDock(container(), {});
    dock.show(['P1'], cleanFixture());
    dock.clear();
    expect(container().children).toHaveLength(0);
  });

  it('installs no event listener — participantsSelected on document is ignored', () => {
    profileDock(container(), {});
    document.dispatchEvent(new CustomEvent('participantsSelected', { detail: { data: ['P1'] } }));
    expect(container().children).toHaveLength(0);
  });

  it('shows the worst-first stepper for N > 1 (PPRF-5)', () => {
    const dock = profileDock(container(), {});
    dock.show(['P3', 'P1', 'P6'], cleanFixture());
    // Hy's Law first, tie-break peak ALT ×ULN: P6 (6.0) > P1 (4.0), then P3.
    expect(container().querySelector('.sv-profile-step-count').textContent).toBe('1 of 3 · P6');
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P6');
  });

  it('stepping re-renders the profile and calls on_step with the id', () => {
    const onStep = vi.fn();
    const dock = profileDock(container(), { on_step: onStep });
    dock.show(['P1', 'P6'], cleanFixture());
    container().querySelector('.sv-profile-step-next').click();
    expect(onStep).toHaveBeenCalledWith('P1');
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(container().querySelector('.sv-profile-step-count').textContent).toBe('2 of 2 · P1');
  });

  it('docked Clear invokes on_clear and leaves clearing to the host (PPRF-6)', () => {
    const onClear = vi.fn();
    const dock = profileDock(container(), { on_clear: onClear });
    dock.show(['P1'], cleanFixture());
    container().querySelector('.sv-profile-clear').click();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(container().children.length).toBeGreaterThan(0);
  });

  it('resize reaches the live charts; destroy tears them down and empties the container', () => {
    const dock = profileDock(container(), {});
    dock.show(['P1'], cleanFixture());
    dock.resize();
    expect(built.some((chart) => chart.resized > 0)).toBe(true);
    dock.destroy();
    expect(built.every((chart) => chart.destroyed)).toBe(true);
    expect(container().children).toHaveLength(0);
  });
});
