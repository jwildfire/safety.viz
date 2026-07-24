// @vitest-environment jsdom
// The shared shell's slot contract (#17), extended by the participant-profile
// dock slot (#98, PPRF-1): renderShell exposes a `profileWrap` element between
// the small-multiples grid and the shared listing — below the chart card, above
// the listing per the PPRF-7 placement mandate — and the shared stylesheet
// hides the slot while it is empty so undocked renderers pay no layout cost.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderShell } from '../../../src/shell.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

describe('renderShell profile slot (PPRF-1)', () => {
  it('exposes a profileWrap slot with the sv-profile class inside the main column', () => {
    const slots = renderShell(document.querySelector('#host'));
    expect(slots.profileWrap).toBeInstanceOf(HTMLElement);
    expect(slots.profileWrap.className).toBe('sv-profile');
    expect(slots.main.contains(slots.profileWrap)).toBe(true);
  });

  it('places the slot between the small-multiples grid and the listing', () => {
    const slots = renderShell(document.querySelector('#host'));
    expect(slots.multiplesWrap.nextElementSibling).toBe(slots.profileWrap);
    expect(slots.profileWrap.nextElementSibling).toBe(slots.listingWrap);
  });

  it('hides the slot while it is empty via the shared stylesheet', () => {
    renderShell(document.querySelector('#host'));
    const style = document.getElementById('safety-viz-shell-styles');
    expect(style.textContent).toContain('.sv-profile:empty{display:none}');
  });
});
