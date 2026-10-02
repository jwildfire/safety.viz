import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderPortfolioPage } from '../../../scripts/site-lib.mjs';

// The portfolio page (#150) is a mount point: its content is the app bundle's
// to draw. These tests pin what the generator itself is responsible for.

const manifest = JSON.parse(
  readFileSync(new URL('../../../src/data/portfolio.json', import.meta.url), 'utf8')
);

describe('renderPortfolioPage', () => {
  const html = renderPortfolioPage({ manifest, bundle: 'safety.viz-app.js' });

  it('APP-PAGE-014: loads the app bundle from beside the page and mounts it on the demo study there (#150)', () => {
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script src="./safety.viz-app.js"></script>');
    expect(html).toContain("SafetyVizApp.mount('#app', { demo: { base: './' } })");
    // The bundle comes before the mount call.
    expect(html.indexOf('safety.viz-app.js')).toBeLessThan(html.indexOf('SafetyVizApp.mount'));
  });

  it('APP-PAGE-015: says how many charts the manifest lists and names each demo extract (#150)', () => {
    expect(html).toContain(`all ${Object.keys(manifest.modules).length} charts`);
    for (const domain of Object.values(manifest.domains)) {
      expect(html).toContain(`<code>${domain.demo}</code>`);
    }
  });

  it('APP-PAGE-016: takes the site’s wide demo layout (#150)', () => {
    expect(html.startsWith('<div class="demo-page portfolio-page">')).toBe(true);
  });
});
