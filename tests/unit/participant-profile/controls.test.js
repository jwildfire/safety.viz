// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  displayControl,
  labControl,
  extrasControl
} from '../../../src/participant-profile/controls.js';
import { DEFAULT_SETTINGS } from '../../../src/participant-profile/configure.js';

describe('displayControl (PPRF-3)', () => {
  it('offers the display_options and reports the chosen value', () => {
    const onChange = vi.fn();
    const select = displayControl(DEFAULT_SETTINGS, { display: 'relative_uln' }, onChange);
    expect([...select.options].map((opt) => opt.value)).toEqual([
      'relative_uln',
      'relative_baseline'
    ]);
    expect([...select.options].map((opt) => opt.textContent)).toEqual([
      'ULN adjusted',
      'Baseline adjusted'
    ]);
    expect(select.value).toBe('relative_uln');
    select.value = 'relative_baseline';
    select.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('relative_baseline');
  });
});

describe('labControl (PPRF-3)', () => {
  it('selects every lab when the state carries no subset', () => {
    const select = labControl(['ALT', 'AST', 'TB'], { labs: null }, () => {});
    expect(select.multiple).toBe(true);
    expect([...select.selectedOptions].map((opt) => opt.value)).toEqual(['ALT', 'AST', 'TB']);
  });

  it('reflects a subset and reports selection changes', () => {
    const onChange = vi.fn();
    const select = labControl(['ALT', 'AST', 'TB'], { labs: ['TB'] }, onChange);
    expect([...select.selectedOptions].map((opt) => opt.value)).toEqual(['TB']);
    select.options[0].selected = true;
    select.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(['ALT', 'TB']);
  });
});

describe('extrasControl (PPRF-3/4)', () => {
  it("uses the original's copy, singular and plural", () => {
    expect(extrasControl(1, {}, () => {}).textContent).toContain('Show 1 additional measure:');
    expect(extrasControl(3, {}, () => {}).textContent).toContain('Show 3 additional measures:');
  });

  it('reports toggle changes and reflects the current state', () => {
    const onChange = vi.fn();
    const wrap = extrasControl(2, { showExtras: true }, onChange);
    const checkbox = wrap.querySelector('input[type=checkbox]');
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
