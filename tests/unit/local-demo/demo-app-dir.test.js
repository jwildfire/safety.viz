import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDemoAppDir, LOCAL_LINKS } from '../../../scripts/demo-app.mjs';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';
import { APP_LIBRARIES } from '../../../scripts/app-libraries.mjs';
import { DEMO_STUDIES } from '../../../src/app/studies.js';

// One recipe for the demo app's directory (#214): the site build writes it to
// _site/demo/ and `npm run demo` to build/demo/. These tests build it both ways
// and hold the two to each other.

const filesOf = (dir, base = dir) =>
  readdirSync(dir)
    .flatMap((name) => {
      const file = path.join(dir, name);
      return statSync(file).isDirectory() ? filesOf(file, base) : [path.relative(base, file)];
    })
    .map((file) => file.split(path.sep).join('/'))
    .sort();

describe('buildDemoAppDir', () => {
  let hosted;
  let local;

  beforeAll(async () => {
    hosted = mkdtempSync(path.join(tmpdir(), 'sv-demo-hosted-'));
    local = mkdtempSync(path.join(tmpdir(), 'sv-demo-local-'));
    await buildDemoAppDir(hosted);
    await buildDemoAppDir(local, { links: LOCAL_LINKS });
  });

  it('APP-LOCAL-001: writes the page, the app, the single file, every demo study, the typefaces and each library with its statistics file (#214)', () => {
    const files = filesOf(hosted);
    expect(files).toEqual(
      expect.arrayContaining([
        'index.html',
        'safety.viz-app.js',
        'safety.viz-app.js.map',
        'safety.viz-app.html'
      ])
    );
    for (const study of DEMO_STUDIES) {
      for (const file of study.files) expect(files).toContain(`${study.dir}${file}`);
    }
    for (const library of APP_LIBRARIES) {
      expect(files).toContain(library.file);
      if (library.r) expect(files).toContain(library.r.statistics.file);
    }
    expect(
      files.filter((file) => file.startsWith('fonts/') && file.endsWith('.woff2'))
    ).toHaveLength(5);
    // Every file the page names beside itself is there.
    const page = readFileSync(path.join(hosted, 'index.html'), 'utf8');
    for (const [, href] of page.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
      expect(files, href).toContain(href);
    }
  });

  it('APP-LOCAL-001: the directory built for a reader’s machine holds the same files as the site’s, byte for byte but for the page (#214)', () => {
    expect(filesOf(local)).toEqual(filesOf(hosted));
    for (const file of filesOf(hosted).filter((name) => name !== 'index.html')) {
      expect(
        readFileSync(path.join(local, file)).equals(readFileSync(path.join(hosted, file))),
        file
      ).toBe(true);
    }
  });

  it('APP-LOCAL-002: the site’s page links into the site beside it; the local page, which has no site beside it, leaves those links to the published site (#214)', () => {
    const hostedPage = readFileSync(path.join(hosted, 'index.html'), 'utf8');
    expect(hostedPage).toContain("docs: '../index.html'");
    expect(hostedPage).toContain("domains: '../domains/index.html'");

    const localPage = readFileSync(path.join(local, 'index.html'), 'utf8');
    expect(localPage).not.toContain('../index.html');
    expect(localPage).not.toContain('../domains/');
    expect(localPage).not.toMatch(/\bdocs:/);
    expect(localPage).not.toMatch(/\bdomains:/);
    // The single file is still beside it, and the repository link is unchanged.
    expect(localPage).toContain("download: './safety.viz-app.html'");
    expect(localPage).toContain("github: 'https://github.com/jwildfire/safety.viz'");
    // Nothing else of the page differs.
    const withoutLinks = (html) => html.replace(/^\s*(docs|domains): .*\n/gm, '');
    expect(withoutLinks(localPage)).toBe(withoutLinks(hostedPage));
  });
});

describe('renderDemoAppPage links', () => {
  const options = {
    bundle: 'safety.viz-app.js',
    download: 'safety.viz-app.html',
    repoUrl: 'https://github.com/jwildfire/safety.viz'
  };

  it('APP-LOCAL-002: a link given no address is left out, so the app’s own default stands; one given an address is written (#214)', () => {
    const page = renderDemoAppPage({
      ...options,
      links: { docs: null, domains: 'https://x.test/d/' }
    });
    expect(page).not.toMatch(/\bdocs:/);
    expect(page).toContain("domains: 'https://x.test/d/'");
    // Unchanged when nothing is said (APP-PAGE-016).
    expect(renderDemoAppPage({ ...options, links: {} })).toBe(renderDemoAppPage(options));
  });
});
