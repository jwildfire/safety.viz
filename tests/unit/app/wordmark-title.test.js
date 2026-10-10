// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { DEFAULT_LINKS } from '../../../src/app/main.js';

// The header leads back to the docs, and the browser tab says where the reader
// is (#270, obot.roadmap#402).

const charts = Object.fromEntries(
  Object.values(manifest.modules).map((entry) => [
    entry.export,
    (element) => ({
      init() {
        element.innerHTML = '<canvas></canvas>';
      },
      destroy() {}
    })
  ])
);
const view = { id: 'rbqm', title: 'RBQM', tag: () => 'not run', render: () => null };

describe('the wordmark and the browser tab’s title', () => {
  let root;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
    document.title = 'safety.viz demo';
  });

  it('APP-PAGE-037: the wordmark is a link to the docs home, with the mark and the words "Demo app" inside it; a page given no docs address has no link (#270)', () => {
    const app = mountApp(root, { charts, manifest, links: { docs: '../index.html' } });
    const brand = root.querySelector('.sva-brand');
    expect(brand.tagName).toBe('A');
    expect(brand.getAttribute('href')).toBe('../index.html');
    expect(brand.title).toBe('safety.viz: docs and chart gallery');
    expect(brand.querySelector('.sva-logo svg')).not.toBeNull();
    expect(brand.querySelector('.sva-wordmark').textContent).toBe('safety.viz');
    expect(brand.querySelector('.sva-kicker').textContent).toBe('Demo app');
    // The footer's link is as before.
    expect(root.querySelector('.sva-links a[data-link="docs"]').getAttribute('href')).toBe(
      '../index.html'
    );
    app.destroy();
    // The app's own default is the published site, which the single file keeps.
    expect(DEFAULT_LINKS.docs).toBe('https://jwildfire.github.io/safety.viz/');
    const plain = mountApp(root, { charts, manifest });
    expect(root.querySelector('.sva-brand').tagName).toBe('DIV');
    expect(root.querySelector('a.sva-brand')).toBeNull();
    plain.destroy();
  });

  it('APP-PAGE-038: the browser tab’s title names the open view before the app’s name: the Data tab, a chart by the name on its chip, and a library’s tab by its own (#270)', () => {
    const app = mountApp(root, {
      charts,
      manifest,
      libraries: [{ name: 'gsm.viz', view }]
    });
    expect(document.title).toBe('Data · safety.viz demo');
    app.select('histogram');
    expect(document.title).toBe('Histogram · safety.viz demo');
    app.select('ae-explorer');
    expect(document.title).toBe('Adverse Event Explorer · safety.viz demo');
    app.select('rbqm');
    expect(document.title).toBe('RBQM · safety.viz demo');
    // An address that names no view opens the Data tab, and the title says so.
    app.select('constructor');
    expect(document.title).toBe('Data · safety.viz demo');
    // A page may name the app itself; a destroyed app leaves the tab its name.
    app.destroy();
    expect(document.title).toBe('safety.viz demo');
    const named = mountApp(root, { charts, manifest, title: 'My study review' });
    named.select('histogram');
    expect(document.title).toBe('Histogram · My study review');
    named.destroy();
    expect(document.title).toBe('My study review');
  });
});
