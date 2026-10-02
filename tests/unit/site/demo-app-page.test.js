import { describe, it, expect } from 'vitest';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';

// The demo app's page on the site (#150) is a full-page web app with its own
// header, not a page of the docs site: the generator writes a small standalone
// document and the app bundle draws everything inside it. These tests pin what
// the generator itself is responsible for.

describe('renderDemoAppPage', () => {
  const html = renderDemoAppPage({
    bundle: 'safety.viz-app.js',
    download: 'safety.viz-app.html',
    repoUrl: 'https://github.com/jwildfire/safety.viz'
  });

  it('APP-PAGE-014: is a standalone document with its own title and description, not the docs shell (#150)', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>safety.viz demo</title>');
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}">/);
    // None of the docs site's chrome: the app draws its own header.
    expect(html).not.toContain('site-header');
    expect(html).not.toContain('site.css');
    expect(html).not.toContain('{{');
  });

  it('APP-PAGE-015: loads the app bundle from beside the page and mounts it on the demo study there (#150)', () => {
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script src="./safety.viz-app.js"></script>');
    expect(html).toContain("demo: { base: './' }");
    expect(html.indexOf('safety.viz-app.js')).toBeLessThan(html.indexOf('SafetyVizApp.mount'));
  });

  it('APP-PAGE-016: points the app’s links at the docs site, the Domains page and the repository (#150)', () => {
    expect(html).toContain("docs: '../index.html'");
    expect(html).toContain("domains: '../domains/index.html'");
    expect(html).toContain("github: 'https://github.com/jwildfire/safety.viz'");
  });

  it('APP-PAGE-017: loads the site’s three type families and carries the hex mark as its icon (#150)', () => {
    const fonts = html.match(
      /<link href="(https:\/\/fonts\.googleapis\.com\/[^"]+)" rel="stylesheet">/
    );
    expect(fonts).not.toBeNull();
    for (const family of ['Instrument+Sans', 'Instrument+Serif', 'IBM+Plex+Mono']) {
      expect(fonts[1]).toContain(family);
    }
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  });

  it('APP-FILE-008: tells the app where the single file is, for its download link (#152)', () => {
    expect(html).toContain("download: './safety.viz-app.html'");
  });
});
