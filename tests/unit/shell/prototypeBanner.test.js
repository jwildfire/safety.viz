// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { prototypeBanner } from '../../../src/shell.js';

// Prototype marking (#97): the shared banner a not-yet-stable chart prepends to
// its own output so the status travels with the widget everywhere it renders.
// This file lives under tests/unit/shell/ (not a registered renderer module),
// so its records route to shared-scaffold evidence.

describe('shell: prototypeBanner', () => {
  it('renders a labelled note element with the default v1.5 copy (#97)', () => {
    const banner = prototypeBanner();
    expect(banner.classList.contains('sv-prototype')).toBe(true);
    expect(banner.getAttribute('role')).toBe('note');
    expect(banner.querySelector('.sv-prototype-tag').textContent).toBe('Prototype');
    const text = banner.querySelector('.sv-prototype-text').textContent;
    expect(text).toContain('prototype');
    expect(text).toContain('v1.5');
  });

  it('uses a caller-supplied note verbatim when given (#97)', () => {
    const banner = prototypeBanner('The Migration (Sankey) view is a prototype.');
    expect(banner.querySelector('.sv-prototype-tag').textContent).toBe('Prototype');
    expect(banner.querySelector('.sv-prototype-text').textContent).toBe(
      'The Migration (Sankey) view is a prototype.'
    );
  });
});
