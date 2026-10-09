import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDemoAppDir, LOCAL_LINKS, LOCAL_SITE } from '../../../scripts/demo-app.mjs';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';
import {
  APP_LIBRARIES,
  RBQM_CHARTS,
  chartLinks,
  rbqmTabOptions
} from '../../../scripts/app-libraries.mjs';
import { pipelineFiles } from '../../../scripts/rbqm-lib.mjs';
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
    await buildDemoAppDir(local, { links: LOCAL_LINKS, site: LOCAL_SITE });
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
    // gsm.viz's bundle for the RBQM tab, with its licence (#232, APP-RBQM-004).
    expect(files).toEqual(expect.arrayContaining([RBQM_CHARTS.file, RBQM_CHARTS.license.file]));
    expect(readFileSync(path.join(hosted, RBQM_CHARTS.file), 'utf8')).not.toMatch(
      /sourceMappingURL/
    );
    // Every file the page names beside itself is there.
    const page = readFileSync(path.join(hosted, 'index.html'), 'utf8');
    for (const [, href] of page.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
      expect(files, href).toContain(href);
    }
  });

  it('APP-RBQM-027: the directory serves what R is given for the RBQM tab, the pipeline’s R and each of gsm’s workflow files, under the path R keeps it at and byte for byte as the repository has it; the page hands the tab exactly those addresses, gsm’s packages beside the app and gsm.viz’s bundle, which no script tag loads (#235)', () => {
    const files = filesOf(hosted);
    const given = pipelineFiles();
    expect(given.length).toBeGreaterThan(20);
    expect(given[0]).toEqual({ file: 'site/rbqm/pipeline.R', path: '/rbqm/pipeline.R' });
    for (const { file, path: inR } of given) {
      expect(files, inR).toContain(inR.slice(1));
      expect(
        readFileSync(path.join(hosted, inR)).equals(readFileSync(file)),
        `${inR} is ${file}`
      ).toBe(true);
    }
    const options = rbqmTabOptions();
    expect(options.r.files).toEqual(given.map(({ path: inR }) => ({ path: inR, url: `.${inR}` })));
    expect(options.r.source).toEqual(['/rbqm/pipeline.R']);
    expect(options.r.repos).toEqual(['./r-wasm', 'https://repo.r-wasm.org']);
    expect(files.some((file) => file.startsWith('r-wasm/bin/emscripten/contrib/'))).toBe(true);
    expect(options.charts.url).toBe(`./${RBQM_CHARTS.file}`);
    // The page is mounted with those options, and asks for none of it as it loads.
    const page = readFileSync(path.join(hosted, 'index.html'), 'utf8');
    expect(page).toContain(
      `SafetyVizApp.rbqmTab({ createConnection: SafetyVizApp.createRConnection, ...${JSON.stringify(options)} })`
    );
    expect(page).not.toContain(`<script src="./${RBQM_CHARTS.file}">`);
    expect(page).not.toMatch(/<script[^>]*pipeline\.R/);
    // The single file beside it says the tab cannot start R, and carries none of it.
    const single = readFileSync(path.join(hosted, 'safety.viz-app.html'), 'utf8');
    expect(single).toContain(
      'SafetyVizApp.rbqmTab({"unavailable":"The RBQM tab needs R, and this file loads nothing, so it cannot start R. The hosted demo app can start R in your browser.","badge":{"text":"Experimental"'
    );
    expect(single).not.toContain('createRConnection, ...');
    expect(single).not.toContain('repo.r-wasm.org');
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
    const withoutLinks = (html) => html.replace(/^\s*(docs|domains|chartLinks): .*\n/gm, '');
    expect(withoutLinks(localPage)).toBe(withoutLinks(hostedPage));
  });

  it('APP-PAGE-031: the site’s page gives each safety chart’s pages as addresses in the site beside it; the local page and the single file, which have no site beside them, give the published site’s (#246)', () => {
    const written = (html) => JSON.parse(html.match(/^ {2}chartLinks: (.*),$/m)[1]);
    expect(written(readFileSync(path.join(hosted, 'index.html'), 'utf8'))).toEqual(
      chartLinks({ site: '../' })
    );
    expect(written(readFileSync(path.join(local, 'index.html'), 'utf8'))).toEqual(chartLinks());
    expect(LOCAL_SITE).toBe('https://jwildfire.github.io/safety.viz/');
    // The single file is the same file in both, and its addresses are the published site's.
    for (const dir of [hosted, local]) {
      const single = readFileSync(path.join(dir, 'safety.viz-app.html'), 'utf8');
      const [, inFile] = single.match(/chartLinks: (\{.*\}), tiers: \{.*\} \}\);<\/script>/);
      expect(JSON.parse(inFile)).toEqual(chartLinks());
    }
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
