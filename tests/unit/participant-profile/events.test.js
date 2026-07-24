// @vitest-environment jsdom
// Standalone event wiring for the participant-profile module (#98, PPRF-6):
// the module listens for `participantsSelected` on a configurable target
// (default document), renders on a non-empty selection, clears to idle on an
// empty one, removes its listener on destroy, and NEVER dispatches a selection
// event itself — outbound coordination is callbacks only (on_clear, on_step).
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const { default: participantProfile } = await import('../../../src/participant-profile.js');
const { makeRows } = await import('./fixture.js');

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div><div id="bus"></div>';
});

function mount(settings = {}) {
  return participantProfile('#host', makeRows(), settings);
}

function fire(target, ids) {
  target.dispatchEvent(new CustomEvent('participantsSelected', { detail: { data: ids } }));
}

function profileSlot() {
  return document.querySelector('#host .sv-profile');
}

function headerId() {
  const el = document.querySelector('#host .sv-profile-id');
  return el ? el.textContent : null;
}

describe('standalone chrome (PPRF-1, PPRF-CORE-004)', () => {
  it('mounts the shell with the chart card hidden and an idle note', () => {
    mount();
    expect(document.querySelector('#host .safety-participant-profile')).not.toBeNull();
    expect(document.querySelector('#host .sv-chart-wrap').style.display).toBe('none');
    expect(document.querySelector('#host .sv-notes').textContent).toContain(
      'Waiting for selection'
    );
    expect(document.querySelector('#host .sv-notes').textContent).toContain('document');
    expect(profileSlot().children).toHaveLength(0);
  });
});

describe('participantsSelected listener (PPRF-6, PPRF-EVT-001)', () => {
  it('listens on document by default and renders the selection', () => {
    mount();
    fire(document, ['P1']);
    expect(headerId()).toBe('Participant P1');
    expect(built.length).toBeGreaterThan(0);
  });

  it('listens on a custom listen_to element instead of document', () => {
    mount({ listen_to: document.querySelector('#bus') });
    fire(document, ['P1']);
    expect(headerId()).toBeNull();
    fire(document.querySelector('#bus'), ['P1']);
    expect(headerId()).toBe('Participant P1');
  });

  it('resolves a listen_to selector string', () => {
    mount({ listen_to: '#bus' });
    fire(document.querySelector('#bus'), ['P2']);
    expect(headerId()).toBe('Participant P2');
  });

  it('clears to idle on an empty selection payload', () => {
    mount();
    fire(document, ['P1']);
    expect(profileSlot().children.length).toBeGreaterThan(0);
    fire(document, []);
    expect(profileSlot().children).toHaveLength(0);
    expect(document.querySelector('#host .sv-notes').textContent).toContain(
      'Waiting for selection'
    );
  });

  it('destroy removes the listener', () => {
    const instance = mount();
    const show = vi.spyOn(instance, 'show');
    instance.destroy();
    fire(document, ['P1']);
    expect(show).not.toHaveBeenCalled();
  });
});

describe('programmatic selection and callbacks (PPRF-5/6, PPRF-EVT-002)', () => {
  it('setSelected takes the same path as the event listener', () => {
    const instance = mount();
    instance.setSelected(['P1', 'P6']);
    // Worst-first ranking: P6 (Hy's Law, higher peak ALT) leads the cohort.
    expect(document.querySelector('.sv-profile-step-count').textContent).toBe('1 of 2 · P6');
    expect(headerId()).toBe('Participant P6');
    instance.setSelected([]);
    expect(profileSlot().children).toHaveLength(0);
  });

  it('stepping renders the next participant and calls on_step (PPRF-5)', () => {
    const onStep = vi.fn();
    const instance = mount({ on_step: onStep });
    instance.setSelected(['P1', 'P6']);
    const next = document.querySelector('.sv-profile-step-next');
    next.click();
    expect(onStep).toHaveBeenCalledWith('P1');
    expect(headerId()).toBe('Participant P1');
    expect(document.querySelector('.sv-profile-step-count').textContent).toBe('2 of 2 · P1');
  });

  it('standalone Clear clears the block locally and invokes on_clear', () => {
    const onClear = vi.fn();
    const instance = mount({ on_clear: onClear });
    instance.setSelected(['P1']);
    document.querySelector('.sv-profile-clear').click();
    expect(profileSlot().children).toHaveLength(0);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(instance.state.ids).toEqual([]);
  });

  it('never dispatches participantsSelected (or any selection event)', () => {
    const instance = mount({ on_step: vi.fn(), on_clear: vi.fn() });
    const documentDispatch = vi.spyOn(document, 'dispatchEvent');
    const rootDispatch = vi.spyOn(document.querySelector('#host .sv-root'), 'dispatchEvent');
    instance.setSelected(['P1', 'P6']);
    document.querySelector('.sv-profile-step-next').click();
    document.querySelector('.sv-profile-clear').click();
    const selectionEvents = [...documentDispatch.mock.calls, ...rootDispatch.mock.calls].filter(
      ([event]) => event && event.type === 'participantsSelected'
    );
    expect(selectionEvents).toHaveLength(0);
  });
});

describe('keyboard operation survives re-renders (PPRF-8, PPRF-ACC-001)', () => {
  it('keeps focus on the stepper control across a step so arrows keep working', () => {
    const instance = mount();
    instance.setSelected(['P1', 'P3', 'P6']);
    const strip = document.querySelector('.sv-profile-stepper');
    strip.focus();
    expect(document.activeElement).toBe(strip);
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    // The block re-rendered (new strip node) but keyboard control stays on it.
    const nextStrip = document.querySelector('.sv-profile-stepper');
    expect(nextStrip).not.toBe(strip);
    expect(document.activeElement).toBe(nextStrip);
    // A second arrow press works with no re-tabbing — the PPRF-8 promise.
    nextStrip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.querySelector('.sv-profile-step-count').textContent).toMatch(/^3 of 3/);
    expect(document.activeElement).toBe(document.querySelector('.sv-profile-stepper'));
  });

  it('keeps focus on the ▶ button across activations, falling back to the strip at the cohort end', () => {
    const instance = mount();
    instance.setSelected(['P1', 'P6']);
    const next = document.querySelector('.sv-profile-step-next');
    next.focus();
    next.click();
    // The recreated ▶ is disabled at 2 of 2, so focus lands on the strip —
    // never on <body>.
    expect(document.activeElement).toBe(document.querySelector('.sv-profile-stepper'));
  });

  it('keeps focus on the Standardization select across the display re-render', () => {
    const instance = mount();
    instance.setSelected(['P1']);
    const select = document.querySelector('.sv-profile-display');
    select.focus();
    select.value = 'relative_baseline';
    select.dispatchEvent(new Event('change'));
    const recreated = document.querySelector('.sv-profile-display');
    expect(recreated).not.toBe(select);
    expect(recreated.value).toBe('relative_baseline');
    expect(document.activeElement).toBe(recreated);
  });

  it('announces steps through ONE persistent aria-live region, not a recreated one', () => {
    const instance = mount();
    instance.setSelected(['P1', 'P6']);
    const live = document.querySelector('#host .sv-profile .sv-profile-live');
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Participant P6, 1 of 2');
    document.querySelector('.sv-profile-step-next').click();
    // Same node across the rebuild — screen readers track it reliably.
    expect(document.querySelector('#host .sv-profile .sv-profile-live')).toBe(live);
    expect(live.textContent).toBe('Participant P1, 2 of 2');
  });

  it('labels the profile block as a named region', () => {
    const instance = mount();
    instance.setSelected(['P1']);
    const root = document.querySelector('.sv-profile-root');
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-label')).toBe('Participant P1 profile');
  });

  it('re-shows of the same cohort keep the stepper position (PPRF-5)', () => {
    const instance = mount();
    instance.setSelected(['P1', 'P6']);
    document.querySelector('.sv-profile-step-next').click();
    expect(document.querySelector('.sv-profile-step-count').textContent).toBe('2 of 2 · P1');
    // A host control redraw re-dispatches the identical cohort.
    instance.setSelected(['P1', 'P6']);
    expect(document.querySelector('.sv-profile-step-count').textContent).toBe('2 of 2 · P1');
    // A DIFFERENT cohort resets to the worst participant.
    instance.setSelected(['P1', 'P3', 'P6']);
    expect(document.querySelector('.sv-profile-step-count').textContent).toMatch(/^1 of 3/);
  });
});
