// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  displayControl,
  labControl,
  extrasControl
} from '../../../src/participant-profile/controls.js';
import { DEFAULT_SETTINGS } from '../../../src/participant-profile/configure.js';

describe('displayControl (PPRF-3, PPRF-SPAG-002)', () => {
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

describe('labControl (PPRF-3, PPRF-SPAG-002)', () => {
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

describe('control accessible names + focus keys (PPRF-8, PPRF-ACC-001)', () => {
  it('names both selects for assistive tech — the visual labels are unassociated siblings', () => {
    const display = displayControl(DEFAULT_SETTINGS, { display: 'relative_uln' }, () => {});
    expect(display.getAttribute('aria-label')).toBe('Standardization');
    const labs = labControl(['ALT'], { labs: null }, () => {});
    expect(labs.getAttribute('aria-label')).toBe('Measures');
  });

  it('carries data-sv-focus keys so re-renders can restore keyboard focus', () => {
    expect(
      displayControl(DEFAULT_SETTINGS, { display: 'relative_uln' }, () => {}).getAttribute(
        'data-sv-focus'
      )
    ).toBe('display');
    expect(labControl(['ALT'], { labs: null }, () => {}).getAttribute('data-sv-focus')).toBe(
      'labs'
    );
    expect(
      extrasControl(1, {}, () => {})
        .querySelector('input')
        .getAttribute('data-sv-focus')
    ).toBe('extras');
  });
});

describe('extrasControl (PPRF-3/4, PPRF-TBL-004)', () => {
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
