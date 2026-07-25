// @vitest-environment jsdom
// The rail mount (#98 PPRF-1/5/6; v2 obot.roadmap#75 decisions D1/D3/D4/D8):
// profileRail consumes a host chart's pre-cleaned rows verbatim — no
// checkInputs, no cleanData (the "no second ingest" clause) — installs no event
// listener, and is driven imperatively via show/clear. Clear delegates to the
// host's on_clear; the stepper is pinned in the rail head for N > 1 and reports
// steps through on_step; Expand fills the host container and Escape leaves it.
//
// This suite replaces dock.test.js: the dock below the chart is removed
// outright by decision D4, and the rail is the only host mount.
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
    draw() {}
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
    LogarithmicScale: stub(),
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

const { profileRail } = await import('../../../src/participant-profile.js');
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
  // The rail lives inside the host shell's root — the expanded state is a class
  // on that root, so the suite mounts the real ancestry.
  document.body.innerHTML =
    '<div class="sv-root"><div class="sv-main"></div><aside class="sv-rail" id="railhost"></aside></div>';
});

function container() {
  return document.querySelector('#railhost');
}

function shellRoot() {
  return document.querySelector('.sv-root');
}

describe('profileRail (PPRF-1, PPRF-CORE-005, PPRF-RAIL-001)', () => {
  it('show renders the profile from pre-cleaned rows without re-ingesting', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(container().querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(counters.checkInputs).toBe(0);
    expect(counters.cleanData).toBe(0);
  });

  it('clear empties the profile block and returns the rail to its idle head', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    rail.clear();
    expect(container().querySelector('.sv-profile-root')).toBeNull();
    expect(container().querySelector('.sv-profile-rail-title').textContent).toBe(
      'Participant profile'
    );
  });

  it('installs no event listener — participantsSelected on document is ignored', () => {
    profileRail(container(), {});
    document.dispatchEvent(new CustomEvent('participantsSelected', { detail: { data: ['P1'] } }));
    expect(container().querySelector('.sv-profile-root')).toBeNull();
  });

  it('pins the worst-first stepper in the rail head, not in the scrolling block (D8)', () => {
    const rail = profileRail(container(), {});
    rail.show(['P3', 'P1', 'P6'], cleanFixture());
    // Hy's Law first, tie-break peak ALT ×ULN: P6 (6.0) > P1 (4.0), then P3.
    const head = container().querySelector('.sv-profile-rail-stepper');
    expect(head.querySelector('.sv-profile-step-count').textContent).toBe('1 of 3 · P6');
    expect(container().querySelector('.sv-profile-rail-body .sv-profile-stepper')).toBeNull();
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P6');
  });

  it('stepping re-renders the profile and calls on_step with the id', () => {
    const onStep = vi.fn();
    const rail = profileRail(container(), { on_step: onStep });
    rail.show(['P1', 'P6'], cleanFixture());
    container().querySelector('.sv-profile-step-next').click();
    expect(onStep).toHaveBeenCalledWith('P1');
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(container().querySelector('.sv-profile-step-count').textContent).toBe('2 of 2 · P1');
  });

  it('railed Clear invokes on_clear and leaves clearing to the host (PPRF-6)', () => {
    const onClear = vi.fn();
    const rail = profileRail(container(), { on_clear: onClear });
    rail.show(['P1'], cleanFixture());
    container().querySelector('.sv-profile-clear').click();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(container().children.length).toBeGreaterThan(0);
  });

  it('resize reaches the live charts; destroy tears them down and empties the container', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    rail.resize();
    expect(built.some((chart) => chart.resized > 0)).toBe(true);
    rail.destroy();
    expect(built.every((chart) => chart.destroyed)).toBe(true);
    expect(container().children).toHaveLength(0);
  });
});

describe('the rail head (PPRF-RAIL-002, PPRF-EXP-001)', () => {
  it('names the selected participant and how many are selected', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1', 'P6'], cleanFixture());
    expect(container().querySelector('.sv-profile-rail-title').textContent).toBe('P6');
    expect(container().querySelector('.sv-profile-rail-sub').textContent).toContain('2 selected');
  });

  it('Expand fills the host container rather than the viewport (decision D3)', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    const button = container().querySelector('[data-sv-focus="rail-expand"]');
    expect(button.textContent).toBe('Expand');
    button.click();
    expect(shellRoot().classList.contains('sv-rail-expanded')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('Collapse');
  });

  it('Escape leaves the expanded state', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    rail.setExpanded(true);
    container()
      .querySelector('.sv-profile-rail')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shellRoot().classList.contains('sv-rail-expanded')).toBe(false);
  });

  it('closing the rail collapses it, so it never reopens expanded', () => {
    const onClear = vi.fn();
    const rail = profileRail(container(), { on_clear: onClear });
    rail.show(['P1'], cleanFixture());
    rail.setExpanded(true);
    rail.clear();
    expect(shellRoot().classList.contains('sv-rail-expanded')).toBe(false);
  });

  it('the head Close delegates to the host, like the block Clear', () => {
    const onClear = vi.fn();
    const rail = profileRail(container(), { on_clear: onClear });
    rail.show(['P1'], cleanFixture());
    container().querySelector('[data-sv-focus="rail-close"]').click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('the cohort list (PPRF-STEP-003, decision D8)', () => {
  it('expands the stepper to the ranked cohort and marks the current participant', () => {
    const rail = profileRail(container(), {});
    rail.show(['P3', 'P1', 'P6'], cleanFixture());
    container().querySelector('.sv-profile-step-toggle').click();
    const items = [...container().querySelectorAll('.sv-profile-cohort-item')].map(
      (n) => n.textContent
    );
    expect(items).toEqual(['P6', 'P1', 'P3']);
    expect(container().querySelector('.sv-profile-cohort-item.is-current').textContent).toBe('P6');
  });

  it('picking a participant from the list steps to it', () => {
    const onStep = vi.fn();
    const rail = profileRail(container(), { on_step: onStep });
    rail.show(['P3', 'P1', 'P6'], cleanFixture());
    container().querySelector('.sv-profile-step-toggle').click();
    [...container().querySelectorAll('.sv-profile-cohort-item')][2].click();
    expect(onStep).toHaveBeenCalledWith('P3');
    expect(container().querySelector('.sv-profile-id').textContent).toBe('Participant P3');
  });
});

describe('the adverse-event tracks in the rail (PPRF-AE-004)', () => {
  const AE = [
    {
      USUBJID: 'P1',
      AEDECOD: 'nausea',
      AETERM: 'NAUSEA',
      AEBODSYS: 'Gastrointestinal disorders',
      AESEV: 'MODERATE',
      AESER: 'N',
      ASTDY: 10,
      AENDY: 20
    }
  ];

  it('renders no AE block at all when the host configures no AE domain', () => {
    const rail = profileRail(container(), {});
    rail.show(['P1'], cleanFixture());
    expect(container().querySelector('.sv-profile-ae')).toBeNull();
  });

  it('renders the AE block directly after the labs chart when one is configured (D5)', () => {
    const rail = profileRail(container(), { ae: { data: AE } });
    rail.show(['P1'], cleanFixture());
    const root = container().querySelector('.sv-profile-root');
    const children = [...root.children].map((n) => n.className);
    const labs = children.findIndex((c) => c.includes('sv-profile-spaghetti'));
    const ae = children.findIndex((c) => c.includes('sv-profile-ae'));
    const table = children.findIndex((c) => c.includes('sv-profile-measure-wrap'));
    expect(ae).toBe(labs + 1);
    expect(table).toBeGreaterThan(ae);
  });

  it('says so when the participant has no events of their own', () => {
    const rail = profileRail(container(), { ae: { data: AE } });
    rail.show(['P6'], cleanFixture());
    expect(container().querySelector('.sv-profile-ae-empty').textContent).toContain(
      'No adverse events'
    );
  });
});
