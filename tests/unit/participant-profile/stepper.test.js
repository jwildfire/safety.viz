// @vitest-environment jsdom
// The cohort stepper (#98, PPRF-5/8): a header-adjacent strip `◀ k of N · id ▶`
// with real buttons, an aria-live count, arrow-key support, and clamping at the
// cohort ends. Pure DOM — no Chart.js involved.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderStepper } from '../../../src/participant-profile/stepper.js';

const IDS = ['P6', 'P1', 'P3'];

beforeEach(() => {
  document.body.innerHTML = '';
});

function mount(index, onStep = vi.fn()) {
  const strip = renderStepper(IDS, index, { onStep });
  document.body.append(strip);
  return { strip, onStep };
}

function buttons(strip) {
  const [prev, next] = strip.querySelectorAll('button');
  return { prev, next };
}

describe('renderStepper (PPRF-5, PPRF-STEP-001)', () => {
  it('shows the k-of-N count with the current id, aria-live polite', () => {
    const { strip } = mount(1);
    const count = strip.querySelector('.sv-profile-step-count');
    expect(count.textContent).toBe('2 of 3 · P1');
    expect(count.getAttribute('aria-live')).toBe('polite');
  });

  it('renders real labelled buttons in a labelled group', () => {
    const { strip } = mount(0);
    const { prev, next } = buttons(strip);
    expect(prev.type).toBe('button');
    expect(next.type).toBe('button');
    expect(prev.getAttribute('aria-label')).toBe('Previous participant');
    expect(next.getAttribute('aria-label')).toBe('Next participant');
    expect(strip.getAttribute('role')).toBe('group');
    expect(strip.getAttribute('aria-label')).toBeTruthy();
  });

  it('steps forward and back through onStep with the target index', () => {
    const { strip, onStep } = mount(1);
    const { prev, next } = buttons(strip);
    next.click();
    expect(onStep).toHaveBeenLastCalledWith(2);
    prev.click();
    expect(onStep).toHaveBeenLastCalledWith(0);
  });

  it('clamps at the ends: buttons disabled, no onStep past the cohort', () => {
    const first = mount(0);
    expect(buttons(first.strip).prev.disabled).toBe(true);
    expect(buttons(first.strip).next.disabled).toBe(false);
    first.strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(first.onStep).not.toHaveBeenCalled();

    const last = mount(2);
    expect(buttons(last.strip).next.disabled).toBe(true);
    last.strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(last.onStep).not.toHaveBeenCalled();
  });

  it('supports ArrowLeft / ArrowRight on the focusable strip (PPRF-8)', () => {
    const { strip, onStep } = mount(1);
    expect(strip.tabIndex).toBe(0);
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onStep).toHaveBeenLastCalledWith(2);
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(onStep).toHaveBeenLastCalledWith(0);
  });
});
