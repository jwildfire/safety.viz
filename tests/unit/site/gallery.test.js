import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderGallery, experimentalBadge, homeDescription } from '../../../scripts/site-lib.mjs';

// Gallery generator (#7): the homepage lists every renderer from
// site/config.json as a card with a status badge; available renderers link to
// their live pages with the hero screenshot from the committed evidence set.

const config = JSON.parse(readFileSync(new URL('./fixtures/config.json', import.meta.url), 'utf8'));

describe('site generator: gallery', () => {
  const html = renderGallery(config);

  it('gallery lists every renderer: available as cards, queued in the status strip (#7) (#29)', () => {
    for (const renderer of config.renderers) {
      expect(html).toContain(renderer.title);
    }
    // Card blurbs are an available-renderer feature; queued blurbs live on About.
    for (const renderer of config.renderers.filter((r) => r.status === 'available')) {
      expect(html).toContain(renderer.blurb);
    }
    expect(html).toContain('status-available');
  });

  it('gallery links available renderers to demo, evidence, and API pages with a hero thumbnail (#7)', () => {
    expect(html).toContain('href="histogram/index.html"');
    expect(html).toContain('href="histogram/evidence.html"');
    expect(html).toContain('href="histogram/api.html"');
    expect(html).toContain('src="histogram/evidence/SH-CTRL-001-control-panel.png"');
  });

  it('queued renderers link their requirement matrices, not site pages (#7) (#29)', () => {
    expect(html).not.toContain('href="outlier-explorer/index.html"');
    expect(html).not.toContain('href="ae-explorer/index.html"');
    for (const renderer of config.renderers.filter((r) => r.status !== 'available')) {
      expect(html).toContain(`/${renderer.matrix}"`);
    }
  });

  it('gallery marks a prototype renderer with a Prototype badge on its card (#97)', () => {
    const withPrototype = JSON.parse(JSON.stringify(config));
    withPrototype.renderers[0].prototype = true;
    const protoHtml = renderGallery(withPrototype);
    expect(protoHtml).toContain('site-badge-prototype');
    expect(protoHtml).toContain('>Prototype<');
  });

  it('experimentalBadge renders Prototype for a prototype, Experimental for experimental, nothing otherwise (#97)', () => {
    expect(experimentalBadge({ prototype: true })).toContain('>Prototype<');
    expect(experimentalBadge({ prototype: true })).toContain('site-badge-prototype');
    expect(experimentalBadge({ experimental: true })).toContain('>Experimental<');
    // Each pill says what its tier means (#165).
    expect(experimentalBadge({ prototype: true })).toContain(
      'title="Not ready for production: on the docs site only, and not in the demo app."'
    );
    expect(experimentalBadge({ experimental: true })).toContain(
      'title="Still being worked on, and fine to use: its behaviour and settings may change."'
    );
    // Prototype wins when both are set; a plain renderer gets no badge.
    expect(experimentalBadge({ prototype: true, experimental: true })).toContain('>Prototype<');
    expect(experimentalBadge({})).toBe('');
    expect(experimentalBadge(null)).toBe('');
  });

  it('gallery prefers a dedicated hero asset over the evidence baseline when configured (#21)', () => {
    const withAsset = JSON.parse(JSON.stringify(config));
    withAsset.renderers[0].heroAsset = 'histogram-hero.png';
    const assetHtml = renderGallery(withAsset);
    expect(assetHtml).toContain('src="assets/histogram-hero.png"');
    expect(assetHtml).not.toContain('src="histogram/evidence/SH-CTRL-001-control-panel.png"');
  });

  it('gallery compresses the migration queue to a one-line strip after the cards (#29)', () => {
    expect(html).toContain('class="queue-strip"');
    expect(html).not.toContain('gallery-planned');
    expect(html).not.toContain('Migration queue');
    expect(html.indexOf('status-available')).toBeGreaterThan(-1);
    expect(html.indexOf('status-available')).toBeLessThan(html.indexOf('queue-strip'));
  });

  it('gallery leads with the two-sentence intro linking the keynote and safetyGraphics (#29)', () => {
    expect(html).toContain('charting library for monitoring clinical trial safety');
    expect(html).toContain('href="https://jwildfire.github.io/keynote/"');
    expect(html).toContain('https://github.com/SafetyGraphics');
    expect(html).not.toContain('class="home-ctas"');
    expect(html).toContain('href="histogram/index.html"');
    // The long story block moved to the About page (#29).
    expect(html).not.toContain('class="lead"');
    expect(html).not.toContain('gsm.kri');
  });

  it('the home page description counts the charts the configuration lists as available and not Prototype, so a change to the list changes the sentence (#286)', () => {
    // The fixture lists one available chart and two that are queued.
    expect(homeDescription(config)).toMatch(/^One classic clinical-safety graphic from /);
    const chart = (module, more = {}) => ({ module, title: module, status: 'available', ...more });
    const longer = {
      ...config,
      renderers: [...config.renderers, chart('second'), chart('third', { prototype: true })]
    };
    // A second available chart is counted; a Prototype is not, and nor is a queued one.
    expect(homeDescription(longer)).toMatch(/^Two classic clinical-safety graphics from /);
    // Past the words the generator knows, the count is still the configuration's.
    const many = {
      ...config,
      renderers: Array.from({ length: 23 }, (_, index) => chart(`chart-${index}`))
    };
    expect(homeDescription(many)).toMatch(/^23 classic clinical-safety graphics from /);
    // The site's own configuration: the sentence names the number it lists.
    const site = JSON.parse(
      readFileSync(new URL('../../../site/config.json', import.meta.url), 'utf8')
    );
    const listed = site.renderers.filter(
      (renderer) => renderer.status === 'available' && !renderer.prototype
    ).length;
    expect(listed).toBeGreaterThan(9);
    const words = { 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen' };
    expect(homeDescription(site).split(' ')[0]).toBe(words[listed] || String(listed));
    expect(homeDescription(site)).not.toMatch(/^Nine /);
  });
});
