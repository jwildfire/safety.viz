// @vitest-environment jsdom
// The shared shell's slot contract (#17), extended by the participant-profile
// rail slot (obot.roadmap#75, decisions D1/D2/D4): renderShell exposes a
// `railWrap` element as a sibling of the main column, on the OPPOSITE side from
// the control sidebar, and the shared stylesheet hides it while empty so a
// renderer with no profile pays no layout cost.
//
// This replaces the dock-slot contract (#98, PPRF-1). The dock below the chart
// is removed outright by decision D4; under the shell's 900px breakpoint the
// root stacks and the rail lands below the main column, which is where the dock
// used to be.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderShell } from '../../../src/shell.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

describe('renderShell rail slot (PPRF-RAIL-001)', () => {
  it('exposes a railWrap slot with the sv-rail class', () => {
    const slots = renderShell(document.querySelector('#host'));
    expect(slots.railWrap).toBeInstanceOf(HTMLElement);
    expect(slots.railWrap.className).toBe('sv-rail');
    expect(slots.railWrap.tagName).toBe('ASIDE');
  });

  it('puts the rail opposite the control sidebar, with the chart between them (D2)', () => {
    const slots = renderShell(document.querySelector('#host'));
    expect([...slots.root.children]).toEqual([slots.sidebar, slots.main, slots.railWrap]);
    expect(slots.main.contains(slots.railWrap)).toBe(false);
  });

  it('no longer carries the dock slot inside the main column (D4)', () => {
    const slots = renderShell(document.querySelector('#host'));
    expect(slots.profileWrap).toBeUndefined();
    expect(slots.main.querySelector('.sv-profile')).toBeNull();
    expect(slots.multiplesWrap.nextElementSibling).toBe(slots.listingWrap);
  });

  it('hides the rail while it is empty via the shared stylesheet', () => {
    renderShell(document.querySelector('#host'));
    const style = document.getElementById('safety-viz-shell-styles');
    expect(style.textContent).toContain('.sv-rail:empty{display:none}');
  });

  it('honours [hidden] on the rail, which the module sets while it is idle', () => {
    renderShell(document.querySelector('#host'));
    const style = document.getElementById('safety-viz-shell-styles');
    // .sv-rail sets display:flex, which beats the user-agent [hidden] rule.
    expect(style.textContent).toContain('.sv-rail[hidden]{display:none}');
  });

  it('gives the rail a settable width and the root a positioning context for expand', () => {
    renderShell(document.querySelector('#host'));
    const style = document.getElementById('safety-viz-shell-styles');
    expect(style.textContent).toContain('--sv-rail-width:520px');
    expect(style.textContent).toContain('.sv-rail-expanded .sv-rail{position:absolute;inset:0');
  });

  it('stacks the rail below the main column under the shell breakpoint (D4)', () => {
    renderShell(document.querySelector('#host'));
    const style = document.getElementById('safety-viz-shell-styles');
    const responsive = style.textContent.slice(
      style.textContent.indexOf('@media (max-width:900px)')
    );
    expect(responsive).toContain(
      '.sv-rail{position:static;flex:1 1 auto;width:100%;max-height:none}'
    );
  });
});
