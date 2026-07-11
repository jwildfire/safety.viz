import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderGallery } from '../../../scripts/site-lib.mjs';

// Gallery generator (#7): the homepage lists every renderer from
// site/config.json as a card with a status badge; available renderers link to
// their live pages with the hero screenshot from the committed evidence set.

const config = JSON.parse(readFileSync(new URL('./fixtures/config.json', import.meta.url), 'utf8'));

describe('site generator: gallery', () => {
  const html = renderGallery(config);

  it('gallery lists every renderer from config with its status badge (#7)', () => {
    for (const renderer of config.renderers) {
      expect(html).toContain(renderer.title);
      expect(html).toContain(renderer.blurb);
    }
    expect(html).toContain('available');
    expect(html).toContain('in-migration');
    expect(html).toContain('planned');
  });

  it('gallery links available renderers to demo, evidence, and API pages with a hero thumbnail (#7)', () => {
    expect(html).toContain('href="histogram/index.html"');
    expect(html).toContain('href="histogram/evidence.html"');
    expect(html).toContain('href="histogram/api.html"');
    expect(html).toContain('src="histogram/evidence/SH-CTRL-001-control-panel.png"');
  });

  it('gallery renders unmigrated renderers as placeholders without page links (#7)', () => {
    expect(html).not.toContain('href="outlier-explorer/index.html"');
    expect(html).not.toContain('href="ae-explorer/index.html"');
  });
});
