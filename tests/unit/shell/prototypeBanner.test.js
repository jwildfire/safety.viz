// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { experimentalBanner, prototypeBanner } from '../../../src/shell.js';

// Status marking (#97, #165): the shared banners a chart that is not stable
// prepends to its own output, so the status travels with the chart wherever it
// renders. Two tiers: Experimental (ships while still being worked on) and
// Prototype (not ready for production). Shared-scaffold test, so its records
// route to shared-scaffold evidence.

describe('shell: status banners', () => {
  it('experimentalBanner renders a labelled note saying the chart may change (#97, #165)', () => {
    const banner = experimentalBanner();
    expect(banner.classList.contains('sv-experimental')).toBe(true);
    expect(banner.getAttribute('role')).toBe('note');
    expect(banner.querySelector('.sv-prototype-tag').textContent).toBe('Experimental');
    const text = banner.querySelector('.sv-prototype-text').textContent;
    expect(text).toContain('experimental');
    expect(text).toContain('may change');
  });

  it('prototypeBanner renders a labelled note saying the chart is not ready for production (#97, #165)', () => {
    const banner = prototypeBanner();
    expect(banner.classList.contains('sv-prototype')).toBe(true);
    expect(banner.getAttribute('role')).toBe('note');
    expect(banner.querySelector('.sv-prototype-tag').textContent).toBe('Prototype');
    expect(banner.querySelector('.sv-prototype-text').textContent).toContain(
      'not ready for production'
    );
  });

  it('each banner uses a caller-supplied note verbatim when given (#97)', () => {
    const experimental = experimentalBanner('The Migration (Sankey) view is experimental.');
    expect(experimental.querySelector('.sv-prototype-tag').textContent).toBe('Experimental');
    expect(experimental.querySelector('.sv-prototype-text').textContent).toBe(
      'The Migration (Sankey) view is experimental.'
    );
    const prototype = prototypeBanner('This view is a prototype.');
    expect(prototype.querySelector('.sv-prototype-text').textContent).toBe(
      'This view is a prototype.'
    );
  });
});
