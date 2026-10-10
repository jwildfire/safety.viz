import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LOGO_HREF, LOGO_SVG } from '../../../src/app/styles.js';
import { renderDemoAppPage, renderShell } from '../../../scripts/site-lib.mjs';

// One favicon for the docs site and the demo app (#270, obot.roadmap#402): the
// seven-hex mark the app's header carries.

const shell = readFileSync(new URL('../../../site/shell.html', import.meta.url), 'utf8');
const iconOf = (html) => /<link\s+rel="icon"\s+href="([^"]+)"/.exec(html)?.[1];

describe('the favicon', () => {
  it('APP-PAGE-039: every docs page and the demo app’s page serve the same favicon, the hex mark, as a data address that asks nothing of another file (#270)', () => {
    const docs = renderShell({ shell, title: 'Gallery', content: '<p>x</p>' });
    const deep = renderShell({ shell, title: 'Guide', content: '<p>x</p>', root: '../' });
    const app = renderDemoAppPage({
      bundle: 'safety.viz-app.js',
      download: 'safety.viz-app.html',
      repoUrl: 'https://github.com/jwildfire/safety.viz'
    });
    expect(iconOf(docs)).toBe(LOGO_HREF);
    expect(iconOf(deep)).toBe(LOGO_HREF);
    expect(iconOf(app)).toBe(LOGO_HREF);
    // It is the mark itself: the seven hexes of the header's logo.
    expect(LOGO_HREF.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(LOGO_HREF.slice('data:image/svg+xml,'.length))).toBe(LOGO_SVG);
    expect(LOGO_SVG.match(/<polygon/g)).toHaveLength(7);
    // The shell names no icon of its own, and no placeholder is left unfilled.
    expect(shell).toContain('href="{{icon}}"');
    expect(docs).not.toContain('{{icon}}');
    expect(docs.match(/rel="icon"/g)).toHaveLength(1);
    expect(docs).not.toContain('f97316');
  });
});
