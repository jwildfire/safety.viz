import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  homeDescription,
  renderDemoPage,
  renderGallery,
  statusBadge
} from '../../../scripts/site-lib.mjs';

// Gallery generator (#7): the homepage lists every renderer from
// site/config.json as a card with a status badge; available renderers link to
// their live pages with the hero screenshot from the committed evidence set.

const config = JSON.parse(readFileSync(new URL('./fixtures/config.json', import.meta.url), 'utf8'));

// The site's own configuration, for the status labels (#275): the fixture has no
// chart below Exploratory.
const siteConfig = JSON.parse(
  readFileSync(new URL('../../../site/config.json', import.meta.url), 'utf8')
);

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

  it('APP-TIER-023: every available chart’s gallery card carries its status label, Exploratory, Experimental or Prototype, each with a panel id of its own; a chart that is only planned carries none (#275)', () => {
    const html = renderGallery(siteConfig);
    const available = siteConfig.renderers.filter((renderer) => renderer.status === 'available');
    expect(html.match(/class="sv-status sv-status-left"/g)).toHaveLength(available.length);
    for (const renderer of available) {
      const tier = renderer.tier || 'exploratory';
      const card = html.match(
        new RegExp(
          `<li class="card status-available">(?:(?!</li>).)*id="sv-status-${renderer.module}"(?:(?!</li>).)*</li>`
        )
      );
      expect(card, renderer.module).not.toBeNull();
      expect(card[0], renderer.module).toContain(`class="sv-status-label" data-tier="${tier}"`);
    }
    const ids = html.match(/id="sv-status-[a-z-]+"/g);
    expect(new Set(ids).size).toBe(ids.length);
    // The three rungs in use, and never the fourth.
    expect(html).toContain('data-tier="exploratory"');
    expect(html).toContain('data-tier="experimental"');
    expect(html).toContain('data-tier="prototype"');
    expect(html).not.toContain('class="sv-status-label" data-tier="qualified"');
    // The pills the label replaced are gone.
    expect(html).not.toContain('site-badge');
    // A planned chart does not exist yet, so there is nothing to say how far to
    // trust: the labels are the available charts' and no more.
    expect(siteConfig.renderers.length).toBeGreaterThan(available.length);
  });

  it('APP-TIER-023: the label a docs page writes is the one the app draws: the rung’s word, the chart’s reason on hover and in the panel, its name in the heading and its rung marked (#275)', () => {
    const tte = siteConfig.renderers.find((renderer) => renderer.module === 'time-to-event');
    const label = statusBadge(tte);
    expect(label.startsWith(' <span class="sv-status sv-status-left">')).toBe(true);
    expect(label).toContain(`aria-label="Status: Experimental. ${tte.tierNote}"`);
    expect(label).toContain('<span class="sv-status-word">Experimental</span>');
    expect(label).toContain(
      'role="heading" aria-level="3">Time-to-Event Explorer is experimental</span>'
    );
    expect(label).toContain(`<span class="sv-status-text" role="paragraph">${tte.tierNote}</span>`);
    expect(label).toContain('<span class="sv-status-mark">This chart</span>');
    expect(label).toContain(' hidden>');
    // An Exploratory chart is labelled too, with what the rung means on hover.
    const plain = statusBadge({ title: 'Safety Histogram' });
    expect(plain).toContain('data-tier="exploratory"');
    expect(plain).toContain(
      'aria-label="Status: Exploratory. Tested and documented. Confirm every result."'
    );
    expect(plain).toContain('>Safety Histogram is exploratory</span>');
    // A prototype reads as a noun, and on the docs site "this app" is the demo app.
    const prototype = statusBadge({ title: 'Patient Journey Explorer', tier: 'prototype' });
    expect(prototype).toContain('>Patient Journey Explorer is a prototype</span>');
    expect(prototype).toContain('An early look, on the docs site only. Not in the demo app.');
    expect(prototype).not.toContain('Not in this app.');
    // A panel id may be named, for a page with several labels; no chart, no label.
    expect(statusBadge(tte, { id: 'one' })).toContain('aria-controls="one"');
    expect(statusBadge(null)).toBe('');
  });

  it('APP-TIER-023: a chart’s demo page carries its status label in its title (#275)', () => {
    const tte = siteConfig.renderers.find((renderer) => renderer.module === 'time-to-event');
    const [h1] = renderDemoPage({ renderer: tte, version: '0.0.0' }).match(/<h1>[\s\S]*?<\/h1>/);
    expect(h1).toContain(statusBadge(tte).trim());
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
      renderers: [...config.renderers, chart('second'), chart('third', { tier: 'prototype' })]
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
    // A Prototype is named by the status ladder's one field, `tier` (#272).
    const listed = site.renderers.filter(
      (renderer) => renderer.status === 'available' && renderer.tier !== 'prototype'
    ).length;
    expect(listed).toBeGreaterThan(9);
    const words = { 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen' };
    expect(homeDescription(site).split(' ')[0]).toBe(words[listed] || String(listed));
    expect(homeDescription(site)).not.toMatch(/^Nine /);
  });
});
