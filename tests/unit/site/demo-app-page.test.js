import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_APP_FONTS,
  publishDemoAppFonts,
  renderDemoAppPage,
  renderShell
} from '../../../scripts/site-lib.mjs';
import { STYLES } from '../../../src/app/styles.js';

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));

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

  it('APP-PAGE-017: declares the site’s three type families from files beside the page, loads every one as it opens, and carries the hex mark as its icon (#150, #165)', () => {
    // Nothing is asked of a font service: the files are the site's own.
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).not.toContain('rel="preconnect"');
    const faces = [...html.matchAll(/@font-face\{([^}]*)\}/g)].map(([, body]) => body);
    expect(faces).toHaveLength(DEMO_APP_FONTS.length);
    const family = (face) => face.match(/font-family:"([^"]+)"/)[1];
    expect([...new Set(faces.map(family))]).toEqual([
      'Instrument Sans',
      'Instrument Serif',
      'IBM Plex Mono'
    ]);
    // One file per face, with no unicode-range: a subset would be fetched only
    // when a character in it first appeared, which is after a file is chosen.
    const declared = faces.map((face) => {
      expect(face).not.toContain('unicode-range');
      const sources = [...face.matchAll(/url\(([^)]+)\)/g)].map(([, url]) => url);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatch(/^\.\/fonts\/[a-z0-9-]+\.woff2$/);
      return sources[0];
    });
    expect(new Set(declared).size).toBe(declared.length);
    // Every declared file is preloaded, and every face is loaded as the page
    // opens rather than when a weight is first used.
    const preloaded = [
      ...html.matchAll(
        /<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g
      )
    ].map(([, href]) => href);
    expect(preloaded).toEqual(declared);
    expect(html).toContain('document.fonts.forEach');
    // The repository link is the only address on another host.
    expect([...html.matchAll(/https?:\/\/[^\s"')]+/g)].map(([url]) => url)).toEqual([
      'https://github.com/jwildfire/safety.viz'
    ]);
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  });

  it('APP-PAGE-017: every weight the app’s stylesheet sets in a web typeface is one the page declares (#165)', () => {
    // A weight with no face of its own is drawn from the nearest one, so this
    // is about looks, not requests; it keeps the two lists from drifting.
    const covers = (name, weight) =>
      DEMO_APP_FONTS.filter((font) => font.family === name).some((font) => {
        const [low, high = low] = font.weight.split(' ').map(Number);
        return weight >= low && weight <= high;
      });
    for (const weight of [400, 500, 600]) {
      expect(covers('Instrument Sans', weight), `Instrument Sans ${weight}`).toBe(true);
      expect(covers('IBM Plex Mono', weight), `IBM Plex Mono ${weight}`).toBe(true);
    }
    expect(covers('Instrument Serif', 400)).toBe(true);
    const weights = new Set(
      [...STYLES.matchAll(/font(?:-weight)?:\s*(\d{3})\b/g)].map(([, weight]) => Number(weight))
    );
    expect([...weights].sort()).toEqual([500, 600]);
    expect(STYLES).not.toMatch(/font-style:\s*italic/);
  });

  it('APP-PAGE-028: the site build copies every font file the page declares, and each family’s licence, beside the app (#165)', () => {
    const demoDir = mkdtempSync(path.join(tmpdir(), 'site-demo-'));
    const published = publishDemoAppFonts(rootDir, demoDir);
    const files = readdirSync(path.join(demoDir, 'fonts')).sort();
    expect(files).toEqual(
      [
        ...DEMO_APP_FONTS.map((font) => font.file),
        'LICENSE-ibm-plex-mono.txt',
        'LICENSE-instrument-sans.txt',
        'LICENSE-instrument-serif.txt'
      ].sort()
    );
    expect(published.map((file) => path.basename(file)).sort()).toEqual(files);
    for (const font of DEMO_APP_FONTS) {
      // Byte for byte the file the npm package carries, and the page names it.
      const source = path.join(rootDir, 'node_modules', font.package, 'files', font.file);
      expect(existsSync(source), `${font.file} is not in ${font.package}`).toBe(true);
      expect(
        readFileSync(path.join(demoDir, 'fonts', font.file)).equals(readFileSync(source))
      ).toBe(true);
      expect(html).toContain(`url(./fonts/${font.file})`);
      // Latin only: other scripts fall back to the system's fonts.
      expect(font.file).toMatch(/-latin-(wght|\d{3})-normal\.woff2$/);
    }
    for (const licence of files.filter((file) => file.startsWith('LICENSE-'))) {
      expect(readFileSync(path.join(demoDir, 'fonts', licence), 'utf8')).toContain(
        'SIL OPEN FONT LICENSE Version 1.1'
      );
    }
    // Small enough to load with the page: the five files are under 120 kB together.
    const bytes = DEMO_APP_FONTS.reduce(
      (sum, font) => sum + statSync(path.join(demoDir, 'fonts', font.file)).size,
      0
    );
    expect(bytes).toBeLessThan(120 * 1024);
  });

  it('APP-FILE-008: tells the app where the single file is, for its download link (#152)', () => {
    expect(html).toContain("download: './safety.viz-app.html'");
  });
});

// The docs site's header sets the app's link apart (#172): it is the one entry
// that leaves the docs pages for a page of its own.
describe('site shell: the Demo app nav entry', () => {
  const shell = readFileSync(
    fileURLToPath(new URL('../../../site/shell.html', import.meta.url)),
    'utf8'
  );
  const css = readFileSync(
    fileURLToPath(new URL('../../../site/site.css', import.meta.url)),
    'utf8'
  );

  it('APP-PAGE-029: the shell marks the Demo app link as the app link at every mount depth, and its text stays "Demo app" (#172)', () => {
    for (const root of ['', '../']) {
      const page = renderShell({ shell, title: 'T', content: 'C', root, renderers: [] });
      expect(page).toContain(`<a class="nav-app" href="${root}demo/index.html">Demo app</a>`);
    }
    // One such link, and no other entry carries the mark.
    expect(shell.match(/class="nav-app"/g)).toHaveLength(1);
  });

  it('APP-PAGE-029: the stylesheet gives the app link a border and draws its arrow as decoration, not as text (#172)', () => {
    const rule = css.match(/\.site-nav a\.nav-app \{([^}]*)\}/);
    expect(rule, 'no .site-nav a.nav-app rule').not.toBeNull();
    expect(rule[1]).toMatch(/border: 1px solid/);
    const arrow = css.match(/\.site-nav a\.nav-app::after \{([^}]*)\}/);
    expect(arrow, 'no ::after arrow').not.toBeNull();
    expect(arrow[1]).toMatch(/mask:/);
  });
});
