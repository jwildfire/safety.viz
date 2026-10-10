import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { CANONICAL } from './evidence.js';
import {
  APP_LIBRARIES,
  HOSTED_PITCH,
  RBQM_CHARTS,
  chartLinks,
  libraryManifest,
  rbqmTabOptions
} from '../../scripts/app-libraries.mjs';
import { pipelineFiles } from '../../scripts/rbqm-lib.mjs';

// Docs-site smoke (#7): every available renderer's built demo page must mount
// from the committed dist/ bundle with no console errors, served straight out
// of _site/ — proving the emitted relative URLs work at any mount path. The
// build runs here so every context that runs the browser suite (CI, the
// evidence-update workflow, local runs) exercises the current tree.
//
// The shared-shell assertions are the layout contract (#17): a renderer is
// not "available" unless its demo renders the shared control sidebar chrome
// from src/shell.js.

const config = JSON.parse(readFileSync(new URL('../../site/config.json', import.meta.url), 'utf8'));
const available = config.renderers.filter((renderer) => renderer.status === 'available');
const manifestFile = new URL('../../src/data/portfolio.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
// bio.viz's chart list, from its vendored bundle: the demo app carries its
// charts and the Domains page lists them (#182).
const bioManifest = libraryManifest(APP_LIBRARIES[0]);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// What a page's main content lays out past the viewport, and whether a box
// that scrolls sideways holds it. The docs site clips sideways overflow on the
// page, so on a phone whatever runs past the viewport with no such box round it
// is cut off where it cannot be reached (#285, #162).
const phoneLayout = (page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrolls = (element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX);
    const boxOf = (element) => {
      for (let box = element.parentElement; box; box = box.parentElement) {
        if (box.matches('main')) return null;
        if (scrolls(box)) return box;
      }
      return null;
    };
    const past = [...document.querySelectorAll('main *')].filter(
      (element) =>
        element.getClientRects().length > 0 && element.getBoundingClientRect().right > width + 0.5
    );
    const boxes = [...new Set(past.map(boxOf).filter(Boolean))];
    return {
      width,
      page: document.documentElement.scrollWidth,
      past: past.length,
      cutOff: past
        .filter((element) => !boxOf(element))
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
      boxes: boxes.map((box) => {
        const { left, right } = box.getBoundingClientRect();
        return { left, right, scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
      })
    };
  });

test.describe('docs site', () => {
  test.beforeAll(() => {
    execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-PAGE-013: the built demo app is its own page at demo/, mounted on the demo study with every chart of both libraries and no console errors (#150, #182)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    // The title names the chart the app opens on (#270).
    await expect(page).toHaveTitle('Histogram · safety.viz demo');
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await expect(page.locator('.sva-tab[data-domain="biomarkers"] .sva-tab-count')).toHaveText('5');
    // Its description counts the charts it carries (#212).
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /thirteen clinical safety charts and five biomarker charts/
    );
    // Its own header, not the docs site's.
    await expect(page.locator('.sva-header .sva-wordmark')).toHaveText('safety.viz');
    await expect(page.locator('.site-header')).toHaveCount(0);
    // Its links lead back into the site, and to the single file as a download (#152).
    await expect(page.locator('.sva-links a[data-link="docs"]')).toHaveAttribute(
      'href',
      '../index.html'
    );
    const download = page.locator('.sva-links a[data-link="download"]');
    await expect(download).toHaveAttribute('href', './safety.viz-app.html');
    await expect(download).toHaveAttribute('download', '');
    const response = await page.request.get('/_site/demo/safety.viz-app.html');
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('<title>safety.viz demo</title>');
    await page.locator('.sva-links a[data-link="domains"]').click();
    await expect(page).toHaveURL(/\/_site\/domains\/index\.html$/);
    // The docs site's nav reaches the app from anywhere.
    await page.goto('/_site/index.html');
    await expect(page.locator('.site-nav a[href="demo/index.html"]')).toHaveText('Demo app');
    expect(errors).toEqual([]);
  });

  test('APP-PAGE-039: the docs pages and the demo app serve the same favicon, the hex mark, and the app’s wordmark leads to the docs home (#270)', async ({
    page
  }) => {
    const icon = () => page.locator('link[rel="icon"]');
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(icon()).toHaveCount(1);
    const app = await icon().getAttribute('href');
    expect(app.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(app).match(/<polygon/g)).toHaveLength(7);
    // The wordmark is the way back to the docs: one click, to the docs home.
    await expect(page.locator('a.sva-brand')).toHaveAttribute('href', '../index.html');
    await page.locator('a.sva-brand').click();
    await expect(page).toHaveURL(/\/_site\/index\.html$/);
    await expect(icon()).toHaveCount(1);
    expect(await icon().getAttribute('href')).toBe(app);
    // A chart's own pages and the Domains page carry it too.
    for (const address of [
      '/_site/histogram/index.html',
      '/_site/histogram/evidence.html',
      '/_site/domains/index.html'
    ]) {
      await page.goto(address);
      expect(await icon().getAttribute('href'), address).toBe(app);
    }
  });

  test('APP-PAGE-034: on the built demo page at 1,280 pixels, in the app’s own typeface, the welcome is one line above the chart and the header is one row with every tab on it (#269)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await page.evaluate(() => document.fonts.ready);
    const welcome = page.locator('.sva-welcome');
    await expect(welcome.locator('p')).toHaveText(
      'You are looking at the CDISC pilot study, a public demo: 254 participants, 18 charts on five tabs. ' +
        'To use your own files, open Data. They are read in this browser and never leave it.'
    );
    // One line of text: the paragraph is no taller than a line and a half of it.
    const lines = await welcome.locator('p').evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height / parseFloat(style.lineHeight);
    });
    expect(lines).toBeLessThan(1.5);
    // The header's first row holds the wordmark and all six tabs on one line.
    const tops = await page
      .locator('.sva-tabs > *')
      .evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().top))
      );
    expect(tops).toHaveLength(6);
    expect(new Set(tops).size).toBe(1);
    await expect(page.locator('.sva-item[data-view="data"] .sva-tag')).toHaveText('Pilot study');
  });
  test('APP-PAGE-031: on the built demo page every chart’s footnote leads where its pages are: each safety chart’s test evidence, and the clinical guide of the six that have one, are pages the site serves; a biomarker chart’s test evidence is on bio.viz’s site (#246)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const expected = chartLinks({ site: '../' });
    const guided = [];
    for (const [module, entry] of Object.entries({ ...manifest.modules, ...bioManifest.modules })) {
      await page.evaluate((id) => window.__safetyVizApp.select(id), module);
      const footnote = page.locator('.sva-chart-links');
      await expect(footnote, module).toHaveCount(1);
      await expect(footnote.locator('.sva-chart-links-title')).toHaveText(`${entry.title}:`);
      const links = await footnote
        .locator('a')
        .evaluateAll((anchors) =>
          anchors.map((a) => [a.dataset.link, a.getAttribute('href'), a.href, a.textContent])
        );
      expect(Object.fromEntries(links.map(([key, href]) => [key, href])), module).toEqual(
        expected[module]
      );
      if (has(bioManifest.modules, module)) {
        // Another site: the address is held to bio.viz's, and not asked for here.
        expect(links).toEqual([
          [
            'evidence',
            `${APP_LIBRARIES[0].site}${module}/evidence.html`,
            `${APP_LIBRARIES[0].site}${module}/evidence.html`,
            'Test evidence'
          ]
        ]);
        continue;
      }
      // The address as the browser resolves it from the app's page is a page the site serves.
      const titles = { guide: 'clinical guide', evidence: 'test evidence' };
      for (const [key, , resolved, words] of links) {
        expect(new URL(resolved).pathname, module).toBe(`/_site/${module}/${key}.html`);
        const response = await page.request.get(resolved);
        expect(response.ok(), resolved).toBe(true);
        expect(await response.text(), resolved).toContain(
          `<title>${entry.title} ${titles[key]} · safety.viz</title>`
        );
        expect(words).toBe(key === 'guide' ? 'Clinical guide' : 'Test evidence');
      }
      if (links.some(([key]) => key === 'guide')) guided.push(module);
    }
    expect(guided).toEqual(
      available
        .filter((renderer) => renderer.guide && has(manifest.modules, renderer.module))
        .map((renderer) => renderer.module)
        .sort(
          (a, b) =>
            Object.keys(manifest.modules).indexOf(a) - Object.keys(manifest.modules).indexOf(b)
        )
    );
    expect(guided).toHaveLength(6);
    expect(errors).toEqual([]);
  });

  test('APP-PAGE-030: on the built demo page a chart’s footnote sits under the chart, its link opens in a new tab and the app keeps its study and its chart; at a 390px viewport the footnote wraps and the page does not scroll sideways (#246)', async ({
    page,
    context
  }) => {
    await page.goto('/_site/demo/index.html#hep-explorer');
    await page.evaluate('window.__safetyVizApp.ready');
    const chart = page.locator('.sva-chart');
    const footnote = page.locator('.sva-chart-links');
    await expect(chart.locator('canvas:visible').first()).toBeVisible();
    await expect(footnote).toHaveText('Hepatic Safety Explorer: Clinical guide · Test evidence');
    const box = async (locator) => locator.boundingBox();
    expect((await box(footnote)).y).toBeGreaterThanOrEqual(
      (await box(chart)).y + (await box(chart)).height
    );
    const [guide] = await Promise.all([
      context.waitForEvent('page'),
      footnote.locator('a[data-link="guide"]').click()
    ]);
    await guide.waitForLoadState();
    await expect(guide).toHaveURL(/\/_site\/hep-explorer\/guide\.html$/);
    await expect(guide).toHaveTitle('Hepatic Safety Explorer clinical guide · safety.viz');
    // The new tab was handed nothing of the app's page.
    expect(await guide.evaluate(() => window.opener)).toBeNull();
    await guide.close();
    // The app's page did not move: the same address, study and chart.
    await expect(page).toHaveURL(/\/_site\/demo\/index\.html#hep-explorer$/);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    await expect(chart.locator('canvas:visible').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(footnote).toBeVisible();
    await footnote.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(0);
    const narrow = await box(footnote);
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(390);
  });

  test('APP-BIO-012: the built demo page serves bio.viz’s vendored bundle beside the app, whole but for its source-map comment, lists the biomarker charts in their own tab and holds at a 390px viewport (#182)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const [bioViz] = APP_LIBRARIES;
    const response = await page.request.get(`/_site/demo/${bioViz.file}`);
    expect(response.ok()).toBe(true);
    // Served whole, less only the source-map comment line: no map is served.
    const served = await response.text();
    const vendored = readFileSync(new URL(`../../${bioViz.path}`, import.meta.url), 'utf8');
    expect(vendored).toContain('//# sourceMappingURL=');
    expect(served).not.toContain('sourceMappingURL');
    expect(served).toBe(vendored.replace(/^\/\/# sourceMappingURL=.*$\n?/gm, ''));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const biomarkers = page.locator('.sva-tab[data-domain="biomarkers"]');
    await biomarkers.scrollIntoViewIfNeeded();
    await biomarkers.click();
    await expect(page.locator('.sva-group[data-group="biomarkers"] .sva-item-title')).toHaveText(
      Object.values(bioManifest.modules).map((entry) => entry.title)
    );
    await expect(page.locator('.sva-chart .sv-root')).toBeVisible();
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // As built, the group comparison opens on its trend tiles, a tile opens its
    // biomarker over time, and the cross-tabulation draws its table (#212).
    await expect(page.locator('.sva-chart .bv-tile').first()).toBeVisible();
    await page.locator('.sva-chart .bv-tile').first().click();
    await expect(page.locator('.sva-chart .bv-trail')).toHaveAttribute('data-level', 'over-time');
    await expect(page.locator('.sva-chart .bv-time-table')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const crossTab = page.locator('.sva-item[data-view="cross-tab"]');
    await crossTab.scrollIntoViewIfNeeded();
    await crossTab.click();
    await expect(page.locator('.sva-chart table.bv-crosstab')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('APP-R-014: the built demo page shows the control that starts R with the biomarker charts, serves the statistics file beside the app as it was vendored, says what the app promises, and starts R when pressed (#183)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    const [bioViz] = APP_LIBRARIES;
    const response = await page.request.get(`/_site/demo/${bioViz.r.statistics.file}`);
    expect(response.ok()).toBe(true);
    expect(
      (await response.body()).equals(
        readFileSync(new URL(`../../${bioViz.r.statistics.path}`, import.meta.url))
      )
    ).toBe(true);
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /Files you load are read in your browser and never uploaded; starting R downloads R from webr\.r-wasm\.org/
    );
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(HOSTED_PITCH);
    await page.locator('.sva-tab[data-domain="biomarkers"]').click();
    await expect(page.locator('.sva-charts > .sva-r .sva-action')).toHaveText('Start R');
    // Shown, not pressed: nothing is asked of R's hosts.
    expect(requests.filter((url) => /webr\.r-wasm\.org|statistics\.R/.test(url))).toEqual([]);
    // Pressed on the page as built: its own factory and its own `./statistics.R`
    // start R, and a chart prints R's answer.
    await page.evaluate(() => window.__safetyVizApp.select('association-scatter'));
    await page.locator('.sva-charts > .sva-r .sva-action').click();
    await expect(page.locator('.sva-chart .bv-statistic').first()).toContainText(
      "Pearson's product-moment correlation",
      { timeout: 150000 }
    );
    await expect(page.locator('.sva-charts > .sva-r .sva-chip')).toHaveText('R ready▾');
    expect(requests).toContain(new URL('/_site/demo/statistics.R', page.url()).href);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-031: the built demo page carries the RBQM tab, which says it is Experimental on the corner of its view, and serves everything the tab asks for from beside the app: the pipeline’s R and each workflow file as the repository has it, and gsm.viz’s bundle. Nothing of it is asked for before the press. On the RBQM study, Start R starts real R from the page as built, with gsm’s packages from beside the app, and the overview, the scatter plot and the bar chart are drawn (#235)', async ({
    page
  }) => {
    // It downloads R and some forty packages, then runs every workflow.
    test.setTimeout(420000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    // What the page hands the tab, each answered from beside the app.
    const options = rbqmTabOptions();
    const given = pipelineFiles();
    expect(options.r.files).toHaveLength(given.length);
    for (const [index, { url }] of options.r.files.entries()) {
      const response = await page.request.get(new URL(url, 'http://x/_site/demo/').pathname);
      expect(response.ok(), url).toBe(true);
      expect(
        (await response.body()).equals(
          readFileSync(new URL(`../../${given[index].file}`, import.meta.url))
        ),
        url
      ).toBe(true);
    }
    expect((await page.request.get(`/_site/demo/${RBQM_CHARTS.file}`)).ok()).toBe(true);
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const tab = page.locator('.sva-tab[data-tab="rbqm"]');
    await expect(tab.locator('.sva-tab-title')).toHaveText('RBQM');
    await expect(tab.locator('.sva-badge')).toHaveCount(0);
    await page.locator('.sva-item[data-view="data"]').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await tab.click();
    await expect(page.locator('.sva-corner .sv-status-word')).toHaveText('Experimental');
    await expect(page.locator('.sva-corner .sv-status-tip')).toHaveText(
      'Experimental: new in 1.10. R runs in the browser, and what the tab shows may still change.',
      { useInnerText: false }
    );
    await expect(page.locator('.sva-rbqm-status')).toHaveText(
      'Site metrics need R. Start R, at the top right.'
    );
    // What starting R downloads, and from where, is on the control (#280).
    await expect(page.locator('.sva-charts > .sva-r .sva-r-row')).toHaveAttribute(
      'title',
      'Site metrics need R. Start R to run them: about 55 MB, downloaded once from webr.r-wasm.org, repo.r-wasm.org and this page. The study’s data stays in this browser.'
    );
    // Shown, not pressed: nothing is asked of R's hosts, nor of the page for R's files or the charts.
    expect(requests.filter((url) => /r-wasm|pipeline\.R|\.yaml$|gsm\.viz\.js/.test(url))).toEqual(
      []
    );
    await page.locator('.sva-rbqm-start').click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360000
    });
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    // A metric's page, from its item in the tab's row (#279).
    await page.locator('.sva-view-item[data-item="kri0001"]').click();
    await expect(page).toHaveURL(/#rbqm\/kri0001$/);
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await expect(tab.locator('.sva-tab-count')).toHaveText('8 of 8');
    // Each came from where the page as built serves it.
    const own = (path) => new URL(`/_site/demo/${path}`, page.url()).href;
    expect(requests).toContain(own('rbqm/pipeline.R'));
    expect(requests).toContain(own(RBQM_CHARTS.file));
    expect(requests.some((url) => url.startsWith(own('r-wasm/bin/emscripten/contrib/')))).toBe(
      true
    );
    expect(errors).toEqual([]);
  });

  test('APP-LIB-026: on the built demo page, when bio.viz’s script does not load, the safety charts mount as before and the page says the biomarker charts are not shown and why, in every view (#193)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/\/bio\.viz\.js$/, (route) =>
      route.fulfill({ status: 404, body: 'not here' })
    );
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const said =
      'The bio.viz charts are not shown: bio.viz.js did not load on this page, or failed as it loaded.';
    await expect(page.locator('.sva-library-notes')).toHaveText(said);
    // The three domains' tabs and the RBQM tab, which is no chart of bio.viz's (#235).
    await expect(page.locator('.sva-tab')).toHaveCount(4);
    await expect(page.locator('.sva-tab[data-domain]')).toHaveCount(3);
    await expect(page.locator('.sva-count')).toHaveText(
      `${Object.keys(manifest.modules).length} of ${Object.keys(manifest.modules).length} charts supported by the loaded data`
    );
    await page.evaluate(() => window.__safetyVizApp.select('data'));
    await expect(page.locator('.sva-library-notes')).toHaveText(said);
    await page.evaluate(() => window.__safetyVizApp.select('histogram'));
    await expect(page.locator('.sva-library-notes')).toHaveText(said);
    await expect(page.locator('.sva-chart .sv-root')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('APP-PAGE-028: the hosted app fetches its typefaces from beside it as it opens, and nothing once a file is chosen, whatever script its names are in (#165)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const opening = [];
    const record = (list) => (request) => {
      if (!/^(blob|data):/.test(request.url())) list.push(request.url());
    };
    page.on('request', record(opening));
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // Nothing is asked of another host: the typefaces are the site's own files.
    const site = `${new URL(page.url()).origin}/_site/`;
    expect(opening.filter((url) => !url.startsWith(site))).toEqual([]);
    // Every face the page declares was fetched as the page opened, and is
    // loaded — including the weights the first view does not use.
    const fetched = opening
      .filter((url) => /\.woff2?$/.test(url))
      .map((url) => url.slice(site.length));
    const faces = await page.evaluate(() =>
      [...document.fonts].map((face) => [face.family.replace(/"/g, ''), face.weight, face.status])
    );
    expect(faces).toEqual([
      ['Instrument Sans', '400 700', 'loaded'],
      ['Instrument Serif', '400', 'loaded'],
      ['IBM Plex Mono', '400', 'loaded'],
      ['IBM Plex Mono', '500', 'loaded'],
      ['IBM Plex Mono', '600', 'loaded']
    ]);
    expect([...new Set(fetched)].sort()).toEqual([
      'demo/fonts/ibm-plex-mono-latin-400-normal.woff2',
      'demo/fonts/ibm-plex-mono-latin-500-normal.woff2',
      'demo/fonts/ibm-plex-mono-latin-600-normal.woff2',
      'demo/fonts/instrument-sans-latin-wght-normal.woff2',
      'demo/fonts/instrument-serif-latin-400-normal.woff2'
    ]);
    // Each family's licence is served beside its files.
    for (const family of ['instrument-sans', 'instrument-serif', 'ibm-plex-mono']) {
      const licence = await page.request.get(`/_site/demo/fonts/LICENSE-${family}.txt`);
      expect(licence.ok(), family).toBe(true);
      expect(await licence.text()).toContain('SIL OPEN FONT LICENSE');
    }

    // A file of the user's own, named and filled in Greek, Cyrillic and
    // accented Latin: a subsetted web font would fetch more of itself now.
    const after = [];
    page.on('request', record(after));
    await page.locator('.sva-item[data-view="data"]').click();
    const rows = ['01', '02', '03'].flatMap((id) => [
      `${id},Креатинин,80,μmol/L,60,110,Wizyta Łódź 1,1,1,Ασθενής,01,F,WHITE`,
      `${id},Alanine Aminotransferase,20,U/L,5,40,Wizyta Łódź 1,1,1,Ασθενής,01,F,WHITE`
    ]);
    await page.locator('.sva-file-input').setInputFiles({
      name: 'Λαβ-мои.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `USUBJID,TEST,STRESN,STRESU,STNRLO,STNRHI,VISIT,VISITNUM,DY,ARM,SITEID,SEX,RASĂ\n${rows.join('\n')}\n`
      )
    });
    await expect(page.locator('.sva-file[data-domain="bds"] .sva-file-name')).toHaveText(
      'Λαβ-мои.csv'
    );
    await page.locator('.sva-tab[data-domain="bds"]').click();
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await page.locator('.sva-item[data-view="data"]').click();
    await expect(page.locator('.sva-loaded-file[data-domain="bds"] .sva-loaded-name')).toHaveText(
      'Λαβ-мои.csv'
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(after).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-PAGE-029: the header sets the Demo app link apart with a border and an arrow, and still fits a phone (#172)', async ({
    page
  }) => {
    await page.goto('/_site/index.html');
    const link = page.locator('.site-nav a.nav-app');
    await expect(link).toHaveText('Demo app');
    await expect(link).toHaveAttribute('href', 'demo/index.html');
    // It is the first entry of the header, ahead of Gallery.
    expect(
      await page.evaluate(() => document.querySelector('.site-nav').firstElementChild.className)
    ).toBe('nav-app');
    const look = (locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node);
        const after = getComputedStyle(node, '::after');
        return {
          border: parseFloat(style.borderTopWidth),
          arrow: after.content !== 'none' && parseFloat(after.width) > 0
        };
      });
    // Bordered, with an arrow drawn beside the words.
    expect(await look(link)).toEqual({ border: 1, arrow: true });
    // Its neighbours are plain links.
    expect(await look(page.locator('.site-nav > a', { hasText: 'Domains' }))).toEqual({
      border: 0,
      arrow: false
    });
    // It leads to the app.
    await link.click();
    await expect(page).toHaveURL(/\/_site\/demo\/index\.html/);
    // On a phone the header wraps and the page does not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/_site/index.html');
    await expect(page.locator('.site-nav a.nav-app')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(0);
  });

  test('APP-LOAD-022: the built site serves every demo study beside the app, and the app loads each (#159)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/_site/demo/index.html#data');
    await page.evaluate('window.__safetyVizApp.ready');
    const menu = page.locator('.sva-side select.sva-study');
    await expect(menu).toHaveValue('pilot');
    for (const [study, files] of [
      ['renamed', ['dm.csv', 'ae.csv', 'labs_final.csv', 'ecg.json']],
      ['liver', ['adbds-abnbl.csv']],
      [
        'rbqm',
        'SUBJ AE PD LB STUDCOMP SDRGCOMP SITE STUDY ENROLL'
          .split(' ')
          .map((domain) => `Raw_${domain}.csv`)
      ],
      ['pilot', ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv']]
    ]) {
      await menu.selectOption(study);
      await expect(page.locator('.sva-loaded-name')).toHaveText(files);
    }
    expect((await page.request.get('/_site/demo/renamed/dm.csv')).ok()).toBe(true);
    expect((await page.request.get('/_site/demo/rbqm/Raw_LB.csv')).ok()).toBe(true);
    expect(errors).toEqual([]);
  });

  // The status label on the docs site (#275, obot.roadmap#403): one chart of each
  // rung in use.
  const RUNGS = [
    ['histogram', 'Exploratory', 'solid', 'Safety Histogram is exploratory', null],
    [
      'time-to-event',
      'Experimental',
      'dashed',
      'Time-to-Event Explorer is experimental',
      'Experimental until an external clinical review confirms its Kaplan–Meier estimates.'
    ],
    [
      'patient-journey-explorer',
      'Prototype',
      'dotted',
      'Patient Journey Explorer is a prototype',
      null
    ]
  ];
  const statusOf = (scope) => scope.locator('.sv-status');
  const outline = (label) =>
    label
      .locator('.sv-status-label')
      .evaluate((element) => getComputedStyle(element).borderTopStyle);

  test('APP-TIER-024: every gallery card shows its chart’s rung with the status label, and a click opens its panel over the cards beside it: the four rungs, the chart’s own marked and, below Exploratory, its reason; no pill remains (#275)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/_site/index.html');
    const available = config.renderers.filter((renderer) => renderer.status === 'available');
    await expect(page.locator('.card .sv-status')).toHaveCount(available.length);
    await expect(page.locator('.site-badge')).toHaveCount(0);
    await expect(page.locator('.sv-status-label[data-tier="qualified"]')).toHaveCount(0);
    for (const [module, word, border, heading, reason] of RUNGS) {
      const card = page.locator('.card', { has: page.locator(`a[href="${module}/index.html"]`) });
      const label = statusOf(card);
      await expect(label.locator('.sv-status-word'), module).toHaveText(word);
      expect(await outline(label), module).toBe(border);
      const panel = label.locator('.sv-status-panel');
      await expect(panel, module).toBeHidden();
      await label.locator('.sv-status-label').click();
      await expect(panel, module).toBeVisible();
      await expect(panel.getByRole('heading'), module).toHaveText(heading);
      await expect(panel.locator('.sv-status-step'), module).toHaveCount(4);
      await expect(panel.locator('.sv-status-here .sv-status-rung'), module).toHaveText(word);
      await expect(panel.locator('.sv-status-mark'), module).toHaveText(['This chart']);
      if (reason) await expect(panel.locator('.sv-status-text').first(), module).toHaveText(reason);
      // The panel is not clipped by its card: all of it can be clicked, to its last line.
      const [inside, around] = [await panel.boundingBox(), await card.boundingBox()];
      expect(inside.width, module).toBeGreaterThan(300);
      expect(inside.y + inside.height, module).toBeGreaterThan(around.y);
      await panel.getByRole('link', { name: 'What each rung means' }).click({ trial: true });
      if (module === 'time-to-event') {
        await page.screenshot({
          path: 'test-results/evidence-preview/site/APP-TIER-024-gallery-label-panel.png'
        });
      }
      // Opening the next closes this one; Escape closes the last.
    }
    await expect(page.locator('.sv-status-panel:visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sv-status-panel:visible')).toHaveCount(0);
  });

  test('APP-TIER-025: the title of each of a chart’s pages shows its rung with the status label, on the demo, evidence, API and guide pages, and a click opens its panel; the kit page’s note carries the Time-to-Event Explorer’s (#275)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [module, word, border, heading, reason] of RUNGS) {
      const renderer = config.renderers.find((entry) => entry.module === module);
      const pages = [
        'index.html',
        'evidence.html',
        'api.html',
        ...(renderer.guide ? ['guide.html'] : [])
      ];
      for (const file of pages) {
        const where = `${module}/${file}`;
        await page.goto(`/_site/${where}`);
        const label = statusOf(page.locator('h1'));
        await expect(label, where).toHaveCount(1);
        await expect(label.locator('.sv-status-word'), where).toHaveText(word);
        expect(await outline(label), where).toBe(border);
        await expect(page.locator('.site-badge'), where).toHaveCount(0);
        await label.locator('.sv-status-label').click();
        const panel = label.locator('.sv-status-panel');
        await expect(panel, where).toBeVisible();
        await expect(panel.getByRole('heading'), where).toHaveText(heading);
        if (reason)
          await expect(panel.locator('.sv-status-text').first(), where).toHaveText(reason);
        // The panel is set in its own type, not the title's.
        expect(
          await panel
            .locator('.sv-status-meaning')
            .first()
            .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
          where
        ).toBeLessThan(15);
        await page.keyboard.press('Escape');
        await expect(panel, where).toBeHidden();
      }
    }
    // A chart below Exploratory still says so itself on its demo page, where no host shows a label for it.
    await page.goto('/_site/hep-waterfall/index.html');
    await expect(page.locator('.sv-main > .sv-status-row .sv-status-word')).toHaveText(
      'Experimental'
    );
    // The kit page's one conditional member carries the chart's label.
    await page.goto('/_site/kit/index.html');
    const followed = statusOf(page.locator('.kit-status'));
    await expect(followed.locator('.sv-status-word')).toHaveText('Experimental');
    await followed.locator('.sv-status-label').click();
    await expect(followed.getByRole('heading')).toHaveText(
      'Time-to-Event Explorer is experimental'
    );
    await expect(page.locator('.site-badge')).toHaveCount(0);
  });

  test('APP-TIER-026: at 390 pixels a gallery card’s label and a page title’s label are on screen, and each panel opens inside the window with nothing running off the page (#275)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    for (const [where, scope] of [
      ['index.html', '.card:has(a[href="time-to-event/index.html"])'],
      ['time-to-event/index.html', 'h1'],
      ['patient-journey-explorer/evidence.html', 'h1']
    ]) {
      await page.goto(`/_site/${where}`);
      const label = statusOf(page.locator(scope));
      await label.locator('.sv-status-label').scrollIntoViewIfNeeded();
      const pillBox = await label.locator('.sv-status-label').boundingBox();
      expect(pillBox.x, where).toBeGreaterThanOrEqual(0);
      expect(pillBox.x + pillBox.width, where).toBeLessThanOrEqual(390);
      expect(await overflow(), where).toBeLessThanOrEqual(0);
      await label.locator('.sv-status-label').click();
      const panel = label.locator('.sv-status-panel');
      await expect(panel, where).toBeVisible();
      const box = await panel.boundingBox();
      expect(box.x, where).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, where).toBeLessThanOrEqual(390);
      expect(await overflow(), where).toBeLessThanOrEqual(0);
      if (where === 'time-to-event/index.html') {
        await page.screenshot({
          path: 'test-results/evidence-preview/site/APP-TIER-026-phone-title-label-panel.png'
        });
      }
      await panel.getByRole('button', { name: 'Close' }).click();
      await expect(panel, where).toBeHidden();
    }
  });

  test('APP-TIER-028: a status label’s hover line stays inside the window and never widens the page: on every gallery card at 1,280, 1,024 and 390 pixels, and on a page title’s label at 390 pixels after its panel is closed under the pointer or with Escape (#309)', async ({
    page
  }) => {
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const inside = async (pill, width, where) => {
      const tip = pill.locator('.sv-status-tip');
      await expect(tip, where).toBeVisible();
      const box = await tip.boundingBox();
      expect(box.x, where).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, where).toBeLessThanOrEqual(width);
      expect(await overflow(), where).toBeLessThanOrEqual(0);
    };
    for (const width of [1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/_site/index.html');
      const pills = page.locator('.card .sv-status-label');
      const count = await pills.count();
      expect(count).toBe(available.length);
      for (let index = 0; index < count; index += 1) {
        const pill = pills.nth(index);
        await pill.scrollIntoViewIfNeeded();
        await pill.hover();
        await inside(pill, width, `card ${index + 1} at ${width}`);
        // The last card of the first row is the one nearest the right edge.
        if (width === 1280 && index === 2) {
          await page.screenshot({
            path: 'test-results/evidence-preview/site/APP-TIER-028-hover-line-inside.png'
          });
        }
      }
    }
    // A page title's label at 390 pixels: its panel opened and closed with the
    // pointer still on it, and then closed with Escape, which leaves the
    // keyboard on it. Either way the line shows again.
    await page.goto('/_site/time-to-event/index.html');
    const pill = statusOf(page.locator('h1')).locator('.sv-status-label');
    await pill.click();
    await pill.click();
    await inside(pill, 390, 'title, closed under the pointer');
    await pill.click();
    await page.mouse.move(0, 800);
    await page.keyboard.press('Escape');
    await expect(pill).toBeFocused();
    await inside(pill, 390, 'title, closed with Escape');
  });

  test('gallery shows one card per available renderer (#7)', async ({ page }) => {
    await page.goto('/_site/index.html');
    await expect(page.locator('.card.status-available')).toHaveCount(available.length);
  });

  test('the built home page describes itself with the number of charts the configuration lists as available and not Prototype (#286)', async ({
    page
  }) => {
    // A Prototype is named by the status ladder's one field, `tier` (#272).
    const listed = available.filter((renderer) => renderer.tier !== 'prototype').length;
    const words = { 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen' };
    await page.goto('/_site/index.html');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description.split(' ')[0]).toBe(words[listed] || String(listed));
    expect(description).toMatch(/^\S+ classic clinical-safety graphics from the safetyGraphics /);
  });

  for (const renderer of available) {
    test(`built ${renderer.module} demo mounts the shared shell with no console errors (#7) (#17)`, async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`/_site/${renderer.module}/index.html`);
      // .first(): a linked-charts demo (participant-profile, #98) mounts two
      // shells on one page — the host chart's sidebar is the first.
      await expect(page.locator('#container .sv-sidebar .sv-controls').first()).toBeVisible();
      // Any visible chart canvas counts: the histogram opens on the
      // all-measures overview (#39), which hides the main-chart canvas in
      // favor of the per-measure panels. Table-first renderers (ae-explorer,
      // #60) satisfy the contract with a visible table in the main column
      // instead of a canvas.
      await expect(
        page
          .locator('#container .sv-main canvas:visible, #container .sv-main table:visible')
          .first()
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  // Gallery nav dropdown (#71): the top-nav "Gallery" item still navigates to
  // the gallery index, and its disclosure button reveals one link per available
  // renderer straight to that chart's demo. The list is data-driven, so its
  // count tracks the config; interaction is hover + click + full keyboard.
  // The docs site clips sideways overflow on the page, so on a phone whatever
  // runs past the viewport cannot be reached unless a box of its own scrolls
  // it. The Hepatic Explorer's demo page opens on the composite view, whose
  // two tables are wider than a phone (#285).
  test('the Hepatic Explorer demo page holds at a 390px viewport: in each of its views nothing in the main content runs past the viewport without a scrolling box of its own around it, and the composite view’s tables scroll to their last column (#285)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/_site/hep-explorer/index.html');
    await expect(page.locator('.safety-hep-explorer .hep-composite-panels canvas')).toHaveCount(4);

    const layout = () => phoneLayout(page);

    const views = await page.locator('.safety-hep-explorer .sv-view-option').allTextContents();
    expect(views).toHaveLength(3);
    for (const view of views) {
      await page.locator('.safety-hep-explorer .sv-view-option', { hasText: view }).click();
      await expect(page.locator('.safety-hep-explorer .sv-view-option.is-active')).toHaveText(view);
      const held = await layout();
      expect(held.width).toBe(390);
      expect(held.page, view).toBe(390);
      expect(held.cutOff, view).toEqual([]);
      // Every box that scrolls is itself inside the viewport.
      held.boxes.forEach((box) => {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(390);
      });
    }

    // The check is not vacuous: the composite view, the last of the three and
    // the one the page opens on, has two tables wider than their boxes.
    await expect(page.locator('.safety-hep-explorer .sv-view-option.is-active')).toHaveText(
      /Composite/
    );
    const composite = await layout();
    expect(composite.past).toBeGreaterThan(0);
    expect(composite.boxes).toHaveLength(2);
    composite.boxes.forEach((box) => expect(box.scrollWidth).toBeGreaterThan(box.clientWidth));
    // Each scrolls to its table's last column.
    const reached = await page.evaluate(() =>
      [...document.querySelectorAll('.safety-hep-explorer .hep-composite .hep-migration')].map(
        (box) => {
          box.scrollLeft = box.scrollWidth;
          const last = box.querySelector('thead tr:first-child th:last-child');
          return {
            scrolled: box.scrollLeft > 0,
            lastRight: last.getBoundingClientRect().right,
            boxRight: box.getBoundingClientRect().right
          };
        }
      )
    );
    expect(reached).toHaveLength(2);
    reached.forEach((table) => {
      expect(table.scrolled).toBe(true);
      expect(table.lastRight).toBeLessThanOrEqual(table.boxRight + 0.5);
    });
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    expect(errors).toEqual([]);
  });

  // Every chart's API reference (#162): stacked under its contents list on a
  // phone, the body is held to the viewport, and each table wider than it
  // scrolls in a box of its own.
  test('every chart’s API reference page holds at a 390px viewport: the page is no wider than the viewport, and nothing in its main content runs past it without a scrolling box of its own around it (#162)', async ({
    page
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(available.length).toBeGreaterThan(9);
    for (const renderer of available) {
      await page.goto(`/_site/${renderer.module}/api.html`);
      await expect(page.locator('.api-layout .api-body h2').first()).toBeVisible();
      const held = await phoneLayout(page);
      expect(held.width).toBe(390);
      expect(held.page, renderer.module).toBe(390);
      expect(held.cutOff, renderer.module).toEqual([]);
      held.boxes.forEach((box) => {
        expect(box.left, renderer.module).toBeGreaterThanOrEqual(0);
        expect(box.right, renderer.module).toBeLessThanOrEqual(390);
      });
      // Not vacuous: the page has tables wider than a phone, in boxes that scroll.
      expect(held.boxes.length, renderer.module).toBeGreaterThan(0);
      expect(
        held.boxes.some((box) => box.scrollWidth > box.clientWidth),
        renderer.module
      ).toBe(true);
      // The contents list and the body are stacked, each as wide as the column.
      const columns = await page.evaluate(() =>
        ['.api-toc', '.api-body'].map(
          (selector) => document.querySelector(selector).getBoundingClientRect().width
        )
      );
      columns.forEach((width) => expect(width, renderer.module).toBeLessThanOrEqual(390));
    }
  });

  test.describe('gallery nav dropdown (#71)', () => {
    test('lists one chart link per available renderer, closed by default (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const menu = page.locator('.nav-group .nav-menu');
      await expect(menu.locator('a')).toHaveCount(available.length);
      await expect(menu).toBeHidden();
      await expect(page.locator('.nav-disclosure')).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens on hover and the top link still points at the gallery index (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await expect(page.locator('.nav-group .nav-menu')).toBeVisible();
      await expect(page.locator('.nav-group > a').first()).toHaveAttribute('href', 'index.html');
    });

    test('is keyboard operable: ArrowDown opens and focuses, Escape closes (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const button = page.locator('.nav-disclosure');
      const menu = page.locator('.nav-group .nav-menu');
      await button.focus();
      await page.keyboard.press('ArrowDown');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(menu).toBeVisible();
      // Focus lands on the first chart link, then arrows move down the list.
      await expect(menu.locator('a').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.locator('a').nth(1)).toBeFocused();
      // Escape closes and returns focus to the disclosure button.
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();
    });

    test('a chart link navigates straight to that renderer demo (#71)', async ({ page }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await page.locator('.nav-menu a', { hasText: 'Safety Shift Plot' }).click();
      await expect(page).toHaveURL(/\/_site\/shift-plot\/index\.html$/);
      await expect(page.locator('#container .sv-sidebar .sv-controls')).toBeVisible();
    });

    test('marks the current chart inside the dropdown on a renderer sub-page (#71)', async ({
      page
    }) => {
      await page.goto('/_site/histogram/index.html');
      const current = page.locator('.nav-menu a.current');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText('Safety Histogram');
    });
  });

  // Domains page (#139): the standard domain set and every chart's column
  // needs, generated from the portfolio manifest, which the build also serves
  // from the site root. The unit suite (tests/unit/site/domains-page.test.js)
  // holds the content to the manifest; these two hold what only a built site
  // and a real layout can show — that the nav reaches the page, that its wide
  // tables scroll inside their own container on a phone instead of pushing the
  // page sideways, and that the file at the root is the manifest itself.
  test.describe('domains page (#139)', () => {
    test('PF-SITE-019: the Domains page opens from the nav, lists every chart in the manifest and fits a 390px phone with no sideways page scroll (#139)', async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/_site/index.html');
      await page.locator('.site-nav > a', { hasText: 'Domains' }).click();
      await expect(page).toHaveURL(/\/_site\/domains\/index\.html$/);
      await expect(page.locator('.site-nav a.current')).toHaveText('Domains');
      await expect(page.locator('h1')).toHaveText('Standard domain set');

      const modules = Object.values(manifest.modules);
      expect(modules).toHaveLength(13);
      await expect(page.locator('section.domain')).toHaveCount(
        Object.keys(manifest.domains).length
      );
      // Every chart reads the standard set, so there is no section for charts
      // outside it, and the experimental Patient Journey Explorer is not listed (#165).
      // The biomarker charts the demo app carries follow safety.viz's (#182).
      await expect(page.locator('section.chart-needs h3')).toHaveText([
        ...modules.map((entry) => entry.title),
        ...Object.values(bioManifest.modules).map((entry) => entry.title)
      ]);
      await expect(page.locator('#outside')).toHaveCount(0);
      await expect(page.locator('.domains-page')).not.toContainText('Patient Journey');

      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const scrollers = [...document.querySelectorAll('.table-scroll')];
        return {
          width,
          scrollWidth: document.documentElement.scrollWidth,
          // Anything not inside a scrolling table container must end within
          // the viewport; the containers themselves are held to it too.
          escaping: [...document.querySelectorAll('body *')]
            .filter((el) => !el.parentElement.closest('.table-scroll'))
            .filter((el) => el.getBoundingClientRect().right > width + 0.5).length,
          tables: scrollers.length,
          scrollingInside: scrollers.filter((el) => el.scrollWidth > el.clientWidth).length
        };
      });
      expect(layout.width).toBe(390);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.escaping).toBe(0);
      // The check above is not vacuous: tables wider than the phone exist, and
      // their own container is what scrolls.
      expect(layout.tables).toBeGreaterThan(0);
      expect(layout.scrollingInside).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('PF-SITE-020: the Domains page links portfolio.json at the site root, and it is the manifest byte for byte (#139)', async ({
      page
    }) => {
      await page.goto('/_site/domains/index.html');
      const link = page.locator('.facts a', { hasText: 'portfolio.json' });
      await expect(link).toHaveAttribute('href', '../portfolio.json');
      const response = await page.request.get('/_site/portfolio.json');
      expect(response.ok()).toBe(true);
      expect((await response.body()).equals(readFileSync(manifestFile))).toBe(true);
    });
  });

  // Kit page (#154): the API reference for the shared parts the bundle exports
  // as `kit`. The unit suite (tests/unit/kit/reference.test.js) holds its
  // content to the kit itself; this holds what only a built site and a real
  // layout can show — that the page exists where the other pages link to it,
  // lists every member the committed bundle carries, and reads on a phone
  // without the page scrolling sideways.
  test.describe('kit page (#154)', () => {
    test('KIT-DOC-009: the kit page opens from the architecture page and a chart’s API reference, lists every member the bundle carries and fits a 390px phone with no sideways page scroll (#154)', async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/_site/architecture.html');
      await page.locator('.site-main a', { hasText: /^kit$/ }).click();
      await expect(page).toHaveURL(/\/_site\/kit\/index\.html$/);
      await expect(page.locator('h1')).toHaveText('Kit API reference');

      // The members on the page are the members on the bundle the site serves.
      const { version } = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
      );
      await page.addScriptTag({ url: `../dist/safety.viz-${version}/safety.viz.js` });
      const onBundle = await page.evaluate(() => Object.keys(window.SafetyViz.kit));
      expect(onBundle.length).toBeGreaterThan(0);
      const onPage = await page
        .locator('.kit-group tbody tr')
        .evaluateAll((rows) => rows.map((row) => row.id));
      expect(onPage).toEqual(onBundle);
      await expect(page.locator('.facts .fact').first()).toContainText(String(onBundle.length));

      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return {
          width,
          scrollWidth: document.documentElement.scrollWidth,
          // Anything not inside a container that scrolls by itself — a member
          // table or a code sample — must end within the viewport.
          escaping: [...document.querySelectorAll('body *')]
            .filter((el) => !el.parentElement.closest('.table-scroll, pre'))
            .filter((el) => el.getBoundingClientRect().right > width + 0.5).length,
          samples: document.querySelectorAll('.kit-page pre').length
        };
      });
      expect(layout.width).toBe(390);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.escaping).toBe(0);
      expect(layout.samples).toBe(2);

      // A chart's API reference links to it too.
      await page.goto(`/_site/${available[0].module}/api.html`);
      await page.locator('#overview a', { hasText: 'kit reference' }).click();
      await expect(page).toHaveURL(/\/_site\/kit\/index\.html$/);
      expect(errors).toEqual([]);
    });
  });

  // Patient Journey Explorer against the real demo data (#142, PJE-DEMO-003):
  // the module's own spec runs against a hand-computed fixture and reads
  // every expected number from it, so nothing there proves the Definition of
  // Done sentence — that the seeded CDISC Pilot 01 participant's day-30
  // anchor lists the con-meds, abnormal labs and dose changes documented in
  // docs/guides/patient-journey-explorer.md. This block runs against the
  // built demo page (after this file's `npm run site`), and the counts below
  // are the pilot numbers verified against the source extracts by the demo
  // data build (docs/DATA_SOURCES.md, "Patient Journey Explorer extracts").
  test.describe('patient journey explorer demo (#142)', () => {
    const SUBJECT = '01-716-1447';
    const ANCHOR = { label: 'ERYTHEMA', day: 30 };
    const COUNTS = { conMeds: 7, conMedsLater: 2, abnormalLabs: 1, doseChanges: 1, priorEvents: 0 };

    test("PJE-DEMO-003: the seeded CDISC Pilot 01 participant's day-30 anchor produces the documented context (#142)", async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto('/_site/patient-journey-explorer/index.html');
      await page.waitForFunction(() => window.__safetyPatientJourneyInstance?.laneCharts?.size);
      expect(await page.evaluate(() => window.__safetyPatientJourneyInstance.subject)).toBe(
        SUBJECT
      );

      // The anchor is found by what it is, not by a row index that would move
      // if the extract were rebuilt.
      const anchorId = await page.evaluate(
        ({ label, day }) =>
          window.__safetyPatientJourneyInstance.structured.byLane.adverseEvents.find(
            (event) => event.label === label && event.day === day
          )?.id,
        ANCHOR
      );
      expect(anchorId).toBeTruthy();
      await page.locator(`.sv-pje-mark[data-event-id="${anchorId}"]`).click();
      await page.waitForFunction(
        (id) => window.__safetyPatientJourneyInstance.anchoredEvent?.id === id,
        anchorId
      );

      const context = await page.evaluate(() => {
        const bundle = window.__safetyPatientJourneyInstance.getContext();
        return {
          anchor: { label: bundle.anchor.label, day: bundle.anchor.day },
          counts: bundle.counts,
          notEvaluated: bundle.notEvaluated,
          conMeds: bundle.conMeds.map((event) => event.label)
        };
      });
      expect(context.anchor).toEqual(ANCHOR);
      expect(context.counts).toMatchObject(COUNTS);
      expect(context.notEvaluated.conMedsEndUnrecorded).toBe(COUNTS.conMeds);
      expect(context.conMeds).toEqual(
        expect.arrayContaining([
          'MAALOX',
          'GELATIN',
          'ALEVE',
          'CALCIUM',
          'B COMPLEX',
          'MULTIVITAMIN',
          'VITAMIN E'
        ])
      );

      // The panel prints what the bundle holds: the marginal AST flag with
      // its ratio beside it (1.06 × ULN, so a flag cannot read as a signal),
      // the dose step, and the end-not-recorded sentence for all seven.
      const rail = page.locator('.sv-rail');
      await expect(rail.locator('[data-section="conMeds"] h3')).toHaveText(
        `Con-meds active at the anchor (${COUNTS.conMeds})`
      );
      await expect(rail.locator('[data-section="conMeds"]')).toContainText(
        `None of these ${COUNTS.conMeds} has a recorded end date`
      );
      await expect(rail.locator('[data-section="conMedsLater"] h4')).toHaveText(
        `Started later in the window (${COUNTS.conMedsLater})`
      );
      await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText(
        'Aspartate Aminotransferase'
      );
      await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText('1.06 × ULN');
      await expect(rail.locator('[data-section="doseChanges"]')).toContainText('54 → 81');
      await expect(rail.locator('[data-section="priorEvents"] h3')).toHaveText(
        `Earlier or same-day adverse events with the same preferred term (${COUNTS.priorEvents})`
      );
      await expect(rail.locator('[data-section="priorEvents"] .sv-pje-empty')).toHaveCount(1);

      // A con-med row jumps to its source record in the drawer.
      const item = rail.locator('[data-section="conMeds"] .sv-pje-item').first();
      const target = await item.getAttribute('data-source-anchor');
      expect(target).toMatch(/^pje-src-CM-\d+$/);
      await item.click();
      await page.waitForFunction((id) => document.activeElement?.id === id, target);
      await expect(page.locator(`#${target}`)).toBeFocused();

      // Evidence lands in the module's set, not this shared spec's: the
      // record routes to patient-journey-explorer by its PJE- id and the
      // screenshot attaches by the same prefix (scripts/evidence-lib.mjs).
      const name = 'PJE-DEMO-003-pilot-anchor.png';
      if (CANONICAL) {
        await expect(page).toHaveScreenshot(['patient-journey-explorer', name]);
      } else {
        await page.screenshot({
          path: `test-results/evidence-preview/patient-journey-explorer/${name}`
        });
      }
      expect(errors).toEqual([]);
    });

    test("PJE-KEY-001: the seeded participant's eight same-day history records share one mark whose pointer target names the others, and the journey fits the default height (#142)", async ({
      page
    }) => {
      await page.goto('/_site/patient-journey-explorer/index.html');
      await page.waitForFunction(() => window.__safetyPatientJourneyInstance?.laneCharts?.size);
      // The pointer lands on the same (first, chronological) record the
      // keyboard tab stop starts on, and that button enumerates the rest.
      await page
        .locator('.sv-pje-lane[data-lane="medicalHistory"] .sv-pje-mark')
        .first()
        .scrollIntoViewIfNeeded();
      const stacked = await page.evaluate(() => {
        const buttons = [
          ...document.querySelectorAll('.sv-pje-lane[data-lane="medicalHistory"] .sv-pje-mark')
        ];
        const boxes = buttons.map((b) => b.getBoundingClientRect());
        const hits = boxes.map((box) => {
          const el = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return el && el.closest('.sv-pje-mark') ? el.closest('.sv-pje-mark') : null;
        });
        const winner = hits[0];
        return {
          count: buttons.length,
          allSame: hits.every((hit) => hit === winner),
          winnerIsTabStop: winner ? winner.getAttribute('tabindex') === '0' : false,
          winnerLabel: winner ? winner.getAttribute('aria-label') : '',
          winnerCount: winner ? Number(winner.dataset.sameDayCount) : 0,
          badge: [
            ...window.__safetyPatientJourneyInstance.laneCharts.get('medicalHistory').$pjeLabels
          ].map((label) => label.text)
        };
      });
      expect(stacked.count).toBe(8);
      expect(stacked.allSame).toBe(true);
      expect(stacked.winnerIsTabStop).toBe(true);
      expect(stacked.winnerCount).toBe(7);
      expect(stacked.winnerLabel).toContain('7 more records at this mark');
      expect(stacked.badge).toContain('×8');
      // The Definition-of-Done participant fits the DEFAULT height (D21/D32):
      // the demo passes none.
      const fit = await page.evaluate(() => {
        const lanes = document.querySelector('.sv-pje-lanes');
        const instance = window.__safetyPatientJourneyInstance;
        return {
          scrollHeight: lanes.scrollHeight,
          clientHeight: lanes.clientHeight,
          stackHeight: instance.stackHeight,
          height: instance.settings.height
        };
      });
      expect(fit.height).toBe(760);
      expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
      expect(fit.stackHeight).toBeLessThanOrEqual(fit.height);
    });
  });
});
