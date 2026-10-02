// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { controlBuilders } from '../../../src/shell.js';

// The shared reset control (#136, obot.roadmap#33 QW3). Nine issues across
// seven legacy trackers asked for a way back to the starting view, most of
// them filed on one day in December 2017. The library already had five
// hand-rolled reset buttons in four different shapes; this is the builder they
// should all have used, so the tenth is not a tenth style.

describe('shell: addReset', () => {
  it('RESET-001: the reset control is a full-width button at the foot of the sidebar (#136)', () => {
    const controls = document.createElement('div');
    const { addSection, addReset } = controlBuilders(controls);
    addSection('Display');
    const button = addReset(() => {});
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.className).toBe('sv-reset');
    expect(button.textContent).toBe('Reset chart');
    // Appended to the controls container itself, not inside a section, so it
    // sits below every section however many there are.
    expect(controls.lastElementChild).toBe(button);
    expect(button.parentElement).toBe(controls);
  });

  it('RESET-001: activating it calls the handler once (#136)', () => {
    const controls = document.createElement('div');
    const onReset = vi.fn();
    const button = controlBuilders(controls).addReset(onReset);
    button.onclick();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('RESET-001: the label can be overridden without changing the class (#136)', () => {
    const controls = document.createElement('div');
    const button = controlBuilders(controls).addReset(() => {}, 'Reset view');
    expect(button.textContent).toBe('Reset view');
    expect(button.className).toBe('sv-reset');
  });
});
