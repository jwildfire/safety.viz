// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { multiSelect } from '../../../src/shell.js';

// The shared multiselect control (#128): a collapsible checkbox list with an
// "All" master row and a live selection summary, expressing state as null
// (everything — no restriction) or an array of selected values. Built for the
// time-to-event endpoint composer (TTE-FILT-001) and shared via the shell so
// later multiselect filters reuse one control. This file lives under
// tests/unit/shell/ (not a registered renderer module), so its records route to
// shared-scaffold evidence.

const VALUES = ['CARDIAC', 'SKIN', 'VASCULAR'];

function boxes(control) {
  return [...control.querySelectorAll('.sv-ms-option:not(.sv-ms-all) input')];
}

describe('shell: multiSelect', () => {
  it('renders one checkbox per value plus the All master row, all checked when selected is null (#128)', () => {
    const control = multiSelect({ values: VALUES, selected: null, onChange: () => {} });
    expect(control.classList.contains('sv-multiselect')).toBe(true);
    expect(boxes(control).map((box) => box.value)).toEqual(VALUES);
    expect(boxes(control).every((box) => box.checked)).toBe(true);
    expect(control.querySelector('.sv-ms-all input').checked).toBe(true);
    expect(control.querySelector('summary').textContent).toBe('All (3)');
  });

  it('reflects a partial selection: matching boxes checked, master indeterminate, summary counted (#128)', () => {
    const control = multiSelect({ values: VALUES, selected: ['SKIN'], onChange: () => {} });
    expect(boxes(control).map((box) => box.checked)).toEqual([false, true, false]);
    const all = control.querySelector('.sv-ms-all input');
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
    expect(control.querySelector('summary').textContent).toBe('1 of 3');
  });

  it('emits the selected values on change, and null when every value is selected (#128)', () => {
    const onChange = vi.fn();
    const control = multiSelect({ values: VALUES, selected: null, onChange });
    const [cardiac] = boxes(control);
    cardiac.checked = false;
    cardiac.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith(['SKIN', 'VASCULAR']);
    cardiac.checked = true;
    cardiac.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('the All master row selects everything (null) or nothing (empty array) (#128)', () => {
    const onChange = vi.fn();
    const control = multiSelect({ values: VALUES, selected: ['SKIN'], onChange });
    const all = control.querySelector('.sv-ms-all input');
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(control.querySelector('summary').textContent).toBe('All (3)');
    all.checked = false;
    all.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(control.querySelector('summary').textContent).toBe('0 of 3');
  });
});
