import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderGallery } from '../../../scripts/site-lib.mjs';

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
});
