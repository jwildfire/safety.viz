// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderViewSelector, controlBuilders, createElement } from '../../../src/shell.js';

// VIEW-1 (#76): the shared view-selector builder factored out of hep-explorer
// and qt-explorer. These unit tests pin the a11y + interaction contract both
// consumers rely on. This file lives under tests/unit/shell/ (not a registered
// renderer module), so its VIEW-SEL-* records route to shared-scaffold evidence
// and are duplicated into every module's evidence.json.

function mountControls() {
  const host = createElement('div');
  document.body.append(host);
  return controlBuilders(host);
}

const VIEWS = [
  { value: 'scatter', label: 'eDISH / mDISH scatter' },
  { value: 'composite', label: 'Composite plot' }
];

describe('shared view selector', () => {
  it('VIEW-SEL-001: renders one option button per view under a titled View section (#76)', () => {
    const { addSection } = mountControls();
    const section = renderViewSelector(addSection, {
      options: VIEWS,
      active: 'scatter',
      onChange: () => {}
    });
    expect(section.querySelector('.sv-section-title').textContent).toBe('View');
    const options = section.querySelectorAll('.sv-view-option');
    expect([...options].map((b) => b.textContent)).toEqual([
      'eDISH / mDISH scatter',
      'Composite plot'
    ]);
    // The section title is overridable for consumers that name the axis differently.
    const custom = renderViewSelector(addSection, {
      options: VIEWS,
      active: 'scatter',
      onChange: () => {},
      title: 'Mode'
    });
    expect(custom.querySelector('.sv-section-title').textContent).toBe('Mode');
  });

  it('VIEW-SEL-002: highlights only the active option via is-active + aria-pressed (#76)', () => {
    const { addSection } = mountControls();
    const section = renderViewSelector(addSection, {
      options: VIEWS,
      active: 'composite',
      onChange: () => {}
    });
    const [scatter, composite] = section.querySelectorAll('.sv-view-option');
    expect(composite.classList.contains('is-active')).toBe(true);
    expect(composite.getAttribute('aria-pressed')).toBe('true');
    expect(scatter.classList.contains('is-active')).toBe(false);
    expect(scatter.getAttribute('aria-pressed')).toBe('false');
  });

  it('VIEW-SEL-003: renders real, keyboard-operable button elements (#76)', () => {
    const { addSection } = mountControls();
    const section = renderViewSelector(addSection, {
      options: VIEWS,
      active: 'scatter',
      onChange: () => {}
    });
    const options = [...section.querySelectorAll('.sv-view-option')];
    expect(options).toHaveLength(2);
    options.forEach((button) => {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    });
  });

  it('VIEW-SEL-004: clicking a non-active option fires onChange with its value; the active option is a no-op (#76)', () => {
    const { addSection } = mountControls();
    const onChange = vi.fn();
    const section = renderViewSelector(addSection, {
      options: VIEWS,
      active: 'scatter',
      onChange
    });
    const [scatter, composite] = section.querySelectorAll('.sv-view-option');
    composite.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('composite');
    onChange.mockClear();
    scatter.click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
