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

describe('standalone chrome (PPRF-1)', () => {
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

describe('participantsSelected listener (PPRF-6)', () => {
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

describe('programmatic selection and callbacks (PPRF-5/6)', () => {
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
