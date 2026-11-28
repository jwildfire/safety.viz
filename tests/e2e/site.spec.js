import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';
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

  test('APP-PAGE-044: on the built demo page at 1,280 pixels there is no line on first open, the chart starts under the header, and the header is one row with every tab on it (#321)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.sva-welcome')).toHaveCount(0);
    await expect(page.locator('.sva-main')).not.toContainText('You are looking at');
    const header = await page.locator('.sva-header').boundingBox();
    const chart = await page.locator('.sva-chart').boundingBox();
    expect(chart.y - (header.y + header.height)).toBeLessThan(30);
    // The header's first row holds the wordmark and all six tabs on one line.
    const tops = await page
      .locator('.sva-tabs > *')
      .evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().top))
      );
    expect(tops).toHaveLength(6);
    expect(new Set(tops).size).toBe(1);
    await expect(page.locator('.sva-chip-name')).toHaveText('Pilot study');
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
    // The click scrolls the tab into view itself, and waits out a header that is
    // drawn again as the study chip's list arrives: scrolling first could be
    // handed a tab that had just been replaced (#402).
    const biomarkers = page.locator('.sva-tab[data-domain="biomarkers"]');
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

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-031: the built demo page carries the RBQM tab, which says it is Experimental on the corner of its view, and serves everything the tab asks for from beside the app: the pipeline’s R and each workflow file as the repository has it, and gsm.viz’s bundle. Nothing of it is asked for before the press. On the RBQM study, Start R starts real R from the page as built, with gsm’s packages from beside the app, and the overview, the scatter plot and the bar chart are drawn (#235)', { tag: '@real-r' }, async ({
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
    // The demo page's data view opens on the viewer; the files one by one are its other face.
    await page.locator('.sva-face[data-action="files"]').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await tab.click();
    await expect(page.locator('.sva-corner .sv-status-word')).toHaveText('Experimental');
    await expect(page.locator('.sva-corner .sv-status-tip')).toHaveText(
      'Experimental: new in 1.10. R runs in the browser, and what the tab shows may still change.',
      { useInnerText: false }
    );
    await expect(page.locator('.sva-rbqm-status')).toHaveText(
      'The site metrics cannot be worked out without R. Start R to run them: about 55 MB, downloaded once. The study’s data stays in this browser.'
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
    await page.locator('.sva-item[data-view="data"]').click();
    // The demo page's data view opens on the viewer; the files one by one are its other face.
    await page.locator('.sva-face[data-action="files"]').click();
    page.on('request', record(after));
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

  // The snapshot of a simulated study the page draws (#406). READY-P1 and
  // PILOT-PROTOCOL are two of study.builder's ready-made studies that kept
  // their monthly snapshots: six and seven, the first six on the same dates.
  const snapshotPicker = (page) => page.locator('.sva-explore-body .sb-snapshot select');
  const openReadyMade = async (page, id, name) => {
    await page.locator('[data-action="study-chip"]').click();
    await page.locator(`.sva-chip-item[data-study="preset:${id}"]`).click();
    await expect(page.locator('.sva-chip-name')).toHaveText(name);
  };
  // What the app holds: the participants file the charts read, and gsm's raw
  // participants file, which is what the RBQM tab hands R.
  const held = (page) =>
    page.evaluate(() => {
      const { state } = window.__safetyVizApp;
      return {
        participants: state.files.subject.rows.length,
        adverseEvents: state.files.ae.rows.length,
        rawParticipants: state.raw.find((file) => file.name === 'Raw_SUBJ.csv').rows
      };
    });

  test('APP-STUDY-001: on the built demo page an earlier snapshot of a ready-made study chosen on the Overview tab is the one the charts draw and the RBQM tab holds, and the study chip says which on every tab: READY-P1 at snapshot 1 of 6 has 2 participants in the charts where the last has 29; choosing the last brings its 29 back (#406)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await openReadyMade(page, 'phase1-small', 'READY-P1');
    const said = page.locator('.sva-chip-snap');
    const shownIn = page.locator('.sva-chart').getByText(/participants shown/);
    // It opens on its last snapshot: the chart the reader is on draws all of it.
    await expect(shownIn).toHaveText('29 of 29 participants shown (100.0%).');
    expect(await held(page)).toEqual({ participants: 29, adverseEvents: 83, rawParticipants: 40 });
    // The first snapshot, chosen where study.builder's study view offers them.
    await page.locator('.sva-item[data-view="data"]').click();
    await expect(snapshotPicker(page).locator('option:checked')).toHaveText('2012-06-30 · 6 of 6');
    await snapshotPicker(page).selectOption('2012-01-31');
    await expect(snapshotPicker(page).locator('option:checked')).toHaveText('2012-01-31 · 1 of 6');
    // The charts draw that snapshot: the histogram counts its participants, and
    // the adverse event explorer's one arm has them.
    await page.locator('.sva-tab[data-domain="bds"]').click();
    await expect(shownIn).toHaveText('2 of 2 participants shown (100.0%).');
    expect(await held(page)).toEqual({ participants: 2, adverseEvents: 3, rawParticipants: 3 });
    await expect(said).toHaveText('Snapshot 1 of 6');
    await page.locator('.sva-tab[data-domain="ae"]').click();
    await expect(page.locator('.sva-chart')).toContainText('Placebo (n=2)');
    // The RBQM tab holds the same snapshot's raw files, and the chip says it there too.
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    await expect(said).toHaveText('Snapshot 1 of 6');
    await expect(page.locator('[data-action="study-chip"]')).toHaveAttribute(
      'aria-label',
      'READY-P1, snapshot 1 of 6, 2012-01-31'
    );
    expect((await held(page)).rawParticipants).toBe(3);
    // Back on the Overview the choice stands; the last snapshot brings the whole study back.
    await page.locator('.sva-item[data-view="data"]').click();
    await expect(snapshotPicker(page).locator('option:checked')).toHaveText('2012-01-31 · 1 of 6');
    await snapshotPicker(page).selectOption('2012-06-30');
    await expect(said).toHaveText('Snapshot 6 of 6');
    expect(await held(page)).toEqual({ participants: 29, adverseEvents: 83, rawParticipants: 40 });
    await page.locator('.sva-tab[data-domain="bds"]').click();
    await expect(shownIn).toHaveText('29 of 29 participants shown (100.0%).');
    expect(errors).toEqual([]);
  });

  test('APP-STUDY-002: on the built demo page a second study opens on its own last snapshot: PILOT-PROTOCOL opened after READY-P1 at snapshot 3 of 6 reads 7 of 7, with its own 81 participants in the charts (#406)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html#data');
    await page.evaluate('window.__safetyVizApp.ready');
    await openReadyMade(page, 'phase1-small', 'READY-P1');
    await snapshotPicker(page).selectOption('2012-03-31');
    await expect(snapshotPicker(page).locator('option:checked')).toHaveText('2012-03-31 · 3 of 6');
    // The second study has a snapshot of the same date, its third of seven.
    await openReadyMade(page, 'cdisc-pilot-protocol', 'PILOT-PROTOCOL');
    await expect(snapshotPicker(page).locator('option:checked')).toHaveText('2012-07-31 · 7 of 7');
    await expect(page.locator('.sva-chip-snap')).toHaveText('Snapshot 7 of 7');
    expect(await held(page)).toEqual({
      participants: 81,
      adverseEvents: 253,
      rawParticipants: 120
    });
    // A study that kept only its last snapshot says nothing of one.
    await openReadyMade(page, 'phase2-oncology', 'READY-P2');
    await expect(page.locator('.sva-chip-snap')).toHaveCount(0);
    await expect(snapshotPicker(page)).toHaveCount(0);
  });

  test('APP-STUDY-003: on the built demo page at 1,280 pixels the snapshot’s words sit under the study’s name in the chip, and the header keeps the row it had for READY-P1 (#406)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await openReadyMade(page, 'phase1-small', 'READY-P1');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.sva-chip-snap')).toHaveText('Snapshot 6 of 6');
    const boxes = await page.evaluate(() => {
      const box = (selector) => {
        const { top, bottom, left, right } = document
          .querySelector(selector)
          .getBoundingClientRect();
        return { top, bottom, left, right };
      };
      return {
        chip: box('.sva-studychip'),
        name: box('.sva-chip-name'),
        snapshot: box('.sva-chip-snap')
      };
    });
    // Under the name, inside the chip.
    expect(boxes.snapshot.top).toBeGreaterThanOrEqual(boxes.name.bottom - 1);
    expect(boxes.snapshot.bottom).toBeLessThanOrEqual(boxes.chip.bottom);
    expect(boxes.snapshot.right).toBeLessThanOrEqual(boxes.chip.right);
    // The words do not cost the header a row (#416): the status label and every
    // tab are on the wordmark's row, and the header is as tall as it is with
    // room to spare. The words are wider than the name READY-P1, and before
    // #416 that width put the label on a row of its own on the Linux runner.
    // Now the chip gives the room (APP-PAGE-049; `headerAt` is defined with it).
    const roomy = await headerAt(page, 1900);
    const now = await headerAt(page, 1280);
    expect(now.oneRow).toBe(true);
    expect(now.height).toBe(roomy.height);
    expect(now.labelInside).toBe(true);
    // Where the chip has room for them the words are whole.
    if (now.spareWhole > 2) expect(now.cut).toBe(0);
  });

  test('APP-TIER-029: on the built demo page the app’s status panel says, after its disclaimer, where study.builder’s parts stand: Build a study and the view of a simulated study are study.builder’s, experimental by its own account, and every row it makes is synthetic (#424)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const label = page.locator('.sva-appstatus .sv-status-label');
    const panel = page.locator('.sva-appstatus .sv-status-panel');
    await expect(label).toHaveText(/Exploratory/);
    await label.click();
    await expect(panel).toBeVisible();
    // The disclaimer first, then study.builder's parts, then the count of charts.
    await expect(panel.locator('.sv-status-text:not(.sv-status-foot)')).toHaveText([
      /^Nothing here is qualified\./,
      'Build a study and the view of a simulated study are study.builder’s. It calls itself experimental, and every row it makes is synthetic.',
      /^13 charts are Exploratory\./
    ]);
    // The panel is inside the window with the paragraph in it.
    const box = await panel.boundingBox();
    const view = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('APP-LOAD-031: on the built demo page the footer and the page’s description name Build a study beside the RBQM tab as what downloads R’s packages from repo.r-wasm.org (#424)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(
      'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org and, for the RBQM tab and Build a study, its packages from repo.r-wasm.org; your data stays in the browser, and R runs here.'
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /starting R downloads R from webr\.r-wasm\.org and, for the RBQM tab and Build a study, its packages from repo\.r-wasm\.org, and your data stays in your browser\./
    );
    // The page does offer what the sentence names: Build a study, on the Files face.
    await page.locator('.sva-item[data-view="data"]').click();
    await page.locator('.sva-face', { hasText: 'Files' }).click();
    await expect(page.locator('.sva-main button', { hasText: 'Build a study' })).toHaveCount(1);
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
    // The demo page's data view opens on the viewer; the files one by one are its other face.
    await page.locator('.sva-face[data-action="files"]').click();
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

  // What the built demo page fetches of study.builder, and when (#408). The
  // page of the app's own browser tests asks for no study chip; this one does.
  test('APP-LIB-040: as the built demo page opens it fetches study.builder’s script and its list of ready-made studies, for the study chip’s list, and study.viewer’s script, and no study; opening the chip’s list and the Overview tab fetches nothing more, and a ready-made study is fetched when the reader opens it (#408)', async ({
    page
  }) => {
    const fetched = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/_site/demo/study.builder/')) {
        fetched.push(pathname.replace('/_site/demo/study.builder/', ''));
      }
    });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page).toHaveTitle('Histogram · safety.viz demo');
    // The chip's list is whole: the ready-made studies are in it.
    await page.locator('[data-action="study-chip"]').click();
    const ready = page.locator('.sva-chip-item[data-study="preset:phase1-small"]');
    await expect(ready).toBeVisible();
    const asOpened = ['presets/index.json', 'study.builder.js', 'study.viewer.js'];
    expect([...fetched].sort()).toEqual(asOpened);
    await page.keyboard.press('Escape');
    await expect(ready).toHaveCount(0);
    // The Overview tab, opened twice, asks for nothing.
    for (let visit = 0; visit < 2; visit += 1) {
      await page.locator('.sva-item[data-view="data"]').click();
      await expect(page.locator('.sva-explore-body .sv')).toBeVisible();
      await page.locator('.sva-tab[data-domain="ae"]').click();
    }
    expect([...fetched].sort()).toEqual(asOpened);
    // A ready-made study is fetched when the reader opens it, and not before.
    await page.locator('[data-action="study-chip"]').click();
    await ready.click();
    await expect(page.locator('.sva-chip-name')).toHaveText('READY-P1');
    expect(fetched.slice(asOpened.length)).toEqual(['presets/phase1-small.study.json.gz']);
  });

  test('APP-LIB-039: on the built demo page each visit to the Overview tab releases the viewer of the visit before: six visits leave no more of the viewer’s watchers on the page than one (#408)', async ({
    page
  }) => {
    // Count the watchers the page holds: study.viewer keeps one on the page's
    // theme for as long as it is mounted, and lets it go when it is released.
    await page.addInitScript(() => {
      const Real = window.MutationObserver;
      window.__watchers = new Set();
      window.MutationObserver = class extends Real {
        observe(...args) {
          window.__watchers.add(this);
          return super.observe(...args);
        }
        disconnect() {
          window.__watchers.delete(this);
          return super.disconnect();
        }
      };
    });
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    const visit = async () => {
      await page.locator('.sva-item[data-view="data"]').click();
      await expect(page.locator('.sva-explore-body .sv')).toBeVisible();
      await page.locator('.sva-tab[data-domain="ae"]').click();
      await expect(page.locator('.sva-explore-body')).toHaveCount(0);
      await expect(page.locator('.sva-chart')).toBeVisible();
      return page.evaluate(() => window.__watchers.size);
    };
    const afterOne = await visit();
    let afterSix = afterOne;
    for (let more = 0; more < 5; more += 1) afterSix = await visit();
    expect(afterSix).toBe(afterOne);
  });

  test('APP-LIB-038: on the built demo page, after study.builder’s script did not load, Build a study says so, and opened again it asks for the script again and shows the builder (#408)', async ({
    page
  }) => {
    let failing = true;
    let asked = 0;
    await page.route('**/study.builder/study.builder.js', (route) => {
      asked += 1;
      return failing ? route.abort() : route.continue();
    });
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    // The page asked for the script as it opened, for the list of studies, and it did not load.
    await expect(page.locator('.sva-studies [role="alert"]')).toContainText(
      'studies could not be listed'
    );
    expect(asked).toBe(1);
    // Build a study asks again, and says so when it fails again.
    await page.locator('[data-add="describe"]').click();
    await expect(page.locator('.sva-source [role="alert"]')).toHaveText(
      'The builder cannot be shown: ./study.builder/study.builder.js did not load on this page.'
    );
    expect(asked).toBe(2);
    // The script can be fetched now. Closed and opened again, the builder is shown.
    failing = false;
    await page.locator('[data-action="close-source"]').click();
    await expect(page.locator('.sva-source')).toHaveCount(0);
    await page.locator('[data-action="files"]').click();
    await page.locator('[data-action="source-build"]').click();
    await expect(page.locator('.sva-source .sva-build-widget')).toBeVisible();
    await expect(page.locator('.sva-source [role="alert"]')).toHaveCount(0);
    expect(asked).toBe(3);
  });

  // study.builder v0.5.1 on the built demo page (#423): the simulator named
  // for what it is, CDISC's attribution with the example protocols, and the
  // ready-made studies as they were. From v0.5.2 (#428) the widget says the
  // attribution itself and a study's own notes name the modified copy.
  const CDISC_SAID =
    'Content based on DDF-RA (GitHub), https://github.com/cdisc-org/DDF-RA, used under the CC-BY-4.0 licence.';
  const openFromStudies = async (page, id, name) => {
    await page.locator(`.sva-studies-row[data-study="preset:${id}"] [data-action="open"]`).click();
    await expect(page.locator('.sva-chip-name')).toHaveText(name);
  };
  const studyCard = async (page) => {
    await page.locator('[data-action="study-info"]').click();
    return page.locator('.sva-chip-card');
  };

  test('APP-LIB-041: on the built demo page the app says a study is made by a modified copy of gsm.datasim 2.1.0, on the Build a study button and as Made by on the card of each ready-made study; each of the three opens with no R and with the key it had in study.builder v0.5.0 (#423)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    const keys = {};
    for (const [id, name] of [
      ['phase1-small', 'READY-P1'],
      ['phase2-oncology', 'READY-P2'],
      ['cdisc-pilot-protocol', 'PILOT-PROTOCOL']
    ]) {
      await openFromStudies(page, id, name);
      keys[name] = await page.evaluate('window.__safetyVizApp.state.named.built.manifest.key');
      const card = await studyCard(page);
      await expect(card.locator('.sva-chip-facts dd').nth(4)).toHaveText(
        'a modified copy of gsm.datasim 2.1.0'
      );
      await expect(card.locator('.sva-chip-facts dt').nth(4)).toHaveText('Made by');
      await page.keyboard.press('Escape');
    }
    expect(keys).toEqual({
      'READY-P1': 'sha256:45b7142bb06f5fee9d81a90e1b34668a87653a29ba13eeedc08f1d2af2838dca',
      'READY-P2': 'sha256:001a419ded7a107c6f2ee8b932fb70578550b5830f67a134e0321f4682f488e9',
      'PILOT-PROTOCOL': 'sha256:9e41ba70f50756281cc1d75663231303257bf61c7dcb1eed6bfc0297c5923cd1'
    });
    // No R was started: each came whole from its file.
    await expect(page.locator('.sva-chip.sva-r-ready')).toHaveCount(0);
    // The way in to the builder says what makes a study.
    await page.locator('.sva-item[data-view="data"]').click();
    await page.locator('[data-action="files"]').click();
    await expect(page.locator('[data-action="source-build"]')).toHaveAttribute(
      'title',
      'Simulate a study with a modified copy of gsm.datasim 2.1.0, in this browser.'
    );
  });

  test('APP-LIB-042: on the built demo page the builder offers CDISC’s five example protocols and shows the schedule of the one tried; CDISC’s attribution is on the page once, in the widget’s own words, under the list of protocols and then under the schedule, and the app’s line is not drawn beside it; the studies feed is fetched once, when the builder is opened (#428)', async ({
    page
  }) => {
    const feeds = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/study.builder/studies/index.json'))
        feeds.push(request.url());
    });
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('.sva-studies-row[data-study="preset:phase1-small"]')).toBeVisible();
    expect(feeds).toEqual([]);
    await page.locator('[data-add="protocol"]').click();
    const widget = page.locator('.sva-build-widget');
    await expect(widget.getByRole('button', { name: /^Try the / })).toHaveCount(5);
    // How many times the builder, the app's part of it included, says CDISC's attribution.
    const said = () =>
      page.locator('.sva-build').evaluate((build, sentence) => {
        return build.innerText.split(sentence).length - 1;
      }, CDISC_SAID);
    // Under the list of protocols the widget says whose they are, and that they are changed.
    const listed = widget.locator('[data-attribution="ready-protocols"]');
    await expect(listed).toHaveText(
      `The ready-made protocols are examples, cut down to what is simulated. ${CDISC_SAID}`
    );
    await expect(listed).toBeVisible();
    // The feed has been read, and the app's own line is not on the page beside the widget's.
    await expect.poll(() => feeds.length).toBe(1);
    const credit = page.locator('.sva-build .sva-build-credit');
    await expect(credit).toHaveCount(0);
    expect(await said()).toBe(1);
    await expect(page.locator('.sva-build footer')).toHaveCount(0);
    // A protocol tried: its schedule is on the page, and the attribution is under the grid, once.
    await widget.getByRole('button', { name: 'Try the CDISC pilot protocol', exact: true }).click();
    await expect(widget.locator('.sb-protocol')).toContainText('Xanomeline Low Dose');
    const under = widget.locator('.sb-schedule [data-attribution="protocol"]');
    await expect(under).toHaveText(CDISC_SAID);
    await expect(under).toBeVisible();
    await expect(listed).toHaveCount(0);
    await expect(credit).toHaveCount(0);
    expect(await said()).toBe(1);
    // Closed and opened again, it is still there once, and the feed is not asked for again.
    await page.locator('[data-action="close-source"]').click();
    await page.locator('[data-action="files"]').click();
    await page.locator('[data-action="source-build"]').click();
    await expect(under).toHaveText(CDISC_SAID);
    await expect(credit).toHaveCount(0);
    expect(await said()).toBe(1);
    expect(feeds).toHaveLength(1);
  });

  test('APP-LIB-043: on the built demo page the card of the ready-made study that follows the CDISC pilot protocol names the protocol and carries CDISC’s attribution, as study.builder’s Protocol view does and its Schedule view does under the grid, once; the card of a study with no protocol carries none (#428)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    await openFromStudies(page, 'cdisc-pilot-protocol', 'PILOT-PROTOCOL');
    let card = await studyCard(page);
    await expect(card.locator('.sva-chip-facts')).toContainText('CDISC PILOT - LZZT');
    const credit = await card.locator('.sva-chip-credit').innerText();
    expect(credit.startsWith(`${CDISC_SAID} Changed from CDISC’s file`)).toBe(true);
    expect(credit.endsWith('not endorsed by CDISC or by any sponsor it names.')).toBe(true);
    // The card stays inside the page.
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await page.keyboard.press('Escape');
    // study.builder's own Protocol view, on the Overview tab, says the same.
    await page.locator('.sva-item[data-view="data"]').click();
    const view = page.locator('.sva-explore-body');
    await view.locator('[data-section="design"]').click();
    await view.locator('[data-view="protocol"]').click();
    await expect(view).toContainText(CDISC_SAID);
    await expect(view).toContainText('CC-BY-4.0 · https://creativecommons.org/licenses/by/4.0/');
    // Its Schedule view, beside it, says the attribution under the grid, and once (#428).
    await view.locator('[data-view="schedule"]').click();
    const under = view.locator('.sb-schedule [data-attribution="protocol"]');
    await expect(under).toHaveText(CDISC_SAID);
    await expect(under).toBeVisible();
    expect(
      await view.evaluate((body, sentence) => body.innerText.split(sentence).length - 1, CDISC_SAID)
    ).toBe(1);
    // A study that followed no protocol.
    await openFromChip(page, 'preset:phase1-small', 'READY-P1');
    card = await studyCard(page);
    await expect(card.locator('.sva-chip-facts')).toContainText('Made by');
    await expect(card.locator('.sva-chip-facts')).not.toContainText('Protocol');
    await expect(card.locator('.sva-chip-credit')).toHaveCount(0);
  });

  // A sentence names the simulator plainly when it names gsm.datasim and does
  // not say "modified copy of gsm.datasim", or names it again as anything but
  // that or Gilead's own (#428).
  const namedPlainly = (sentence) => {
    const named = sentence.match(/gsm\.datasim/g) || [];
    const copy = sentence.match(/modified copy of gsm\.datasim/g) || [];
    const gileads = sentence.match(/Gilead[’']s gsm\.datasim/g) || [];
    return named.length > 0 && (copy.length === 0 || copy.length + gileads.length < named.length);
  };

  test('APP-LIB-044: on the built demo page each of the three ready-made studies, opened with no R, lists on its Overview under “What a study built here is, and is not” no sentence that names gsm.datasim without saying it is the modified copy, and its own notes are among them (#428)', async ({
    page
  }) => {
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    for (const [id, name] of [
      ['phase1-small', 'READY-P1'],
      ['phase2-oncology', 'READY-P2'],
      ['cdisc-pilot-protocol', 'PILOT-PROTOCOL']
    ]) {
      await page.locator('[data-action="study-chip"]').click();
      await page.locator(`.sva-chip-item[data-study="preset:${id}"]`).click();
      await expect(page.locator('.sva-chip-name')).toHaveText(name);
      await page.locator('.sva-item[data-view="data"]').click();
      const caveats = page.locator('.sva-explore-body details.sb-caveats');
      await expect(caveats.locator('summary')).toHaveText('What a study built here is, and is not');
      await caveats.evaluate((details) => {
        details.open = true;
      });
      const sentences = await caveats.locator('li').allInnerTexts();
      const naming = sentences.filter((sentence) => /gsm\.datasim/.test(sentence));
      // The widget's own two and at least the four every study's notes carry.
      expect(naming.length, name).toBeGreaterThanOrEqual(6);
      expect(sentences.filter(namedPlainly), name).toEqual([]);
      // The study's own notes are on the page, each as the study holds it.
      const notes = await page.evaluate('window.__safetyVizApp.state.named.built.notes');
      expect(notes.length, name).toBeGreaterThanOrEqual(4);
      for (const note of notes) expect(sentences, name).toContain(note);
      expect(notes.filter(namedPlainly), name).toEqual([]);
    }
    // No R was started: each came whole from its file.
    await expect(page.locator('.sva-chip.sva-r-ready')).toHaveCount(0);
  });

  test('on the built demo page a ready-made simulated study opens from the Studies view with no R, and the Overview tab draws it with study.builder’s study view in sections: Overview, Design, Data, One participant and Reporting, with no RBQM view and no Safety view, since the app has tabs of its own for both; a view is reached through its section; at 1,400 pixels nothing of the overview runs past the page', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/_site/demo/index.html#studies');
    await page.evaluate('window.__safetyVizApp.ready');
    // The study built on the CDISC pilot protocol: it has a protocol, snapshots
    // and an efficacy score, so every section study.builder has is there.
    const row = page.locator('.sva-studies-row[data-study="preset:cdisc-pilot-protocol"]');
    await row.locator('[data-action="open"]').click();
    await expect(row).toHaveAttribute('data-current', 'true');
    await expect(page.locator('.sva-chip-name')).toHaveText('PILOT-PROTOCOL');
    // No R was started: the study came whole from its file.
    await expect(page.locator('.sva-chip.sva-r-ready')).toHaveCount(0);
    await page.locator('.sva-item[data-view="data"]').click();
    const view = page.locator('.sva-explore-body');
    const sections = view.locator('.sv-views [data-section]');
    const within = view.locator('.sv-subviews [data-view]');
    // Operations is One participant alone: RBQM and Safety are the app's own tabs.
    await expect(sections).toHaveText([
      'Overview',
      'Design',
      'Data',
      'One participant',
      'Reporting'
    ]);
    await expect(view.locator('[data-section="overview"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // On the overview at 1,400 pixels, the table of how the study grew is
    // inside the page with the rest.
    const grew = view.getByText('How the study grew, snapshot by snapshot');
    await expect(grew).toBeVisible();
    expect(
      await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return {
          wider: document.documentElement.scrollWidth - width,
          past: [...document.querySelectorAll('.sva-explore-body *')].filter(
            (element) =>
              element.getClientRects().length > 0 &&
              element.getBoundingClientRect().right > width + 0.5
          ).length
        };
      })
    ).toEqual({ wider: 0, past: 0 });
    // A view's tab is on the page only while its section is open.
    await expect(view.locator('[data-view]')).toHaveCount(0);
    const inside = {};
    for (const section of ['design', 'data', 'operations', 'reporting']) {
      await view.locator(`[data-section="${section}"]`).click();
      await expect(view.locator(`[data-section="${section}"]`)).toHaveAttribute(
        'aria-selected',
        'true'
      );
      inside[section] = await within.allTextContents();
    }
    expect(inside).toEqual({
      design: ['Protocol', 'Schedule'],
      data: ['Pipeline', 'Tables', 'Columns'],
      operations: [],
      reporting: ['Efficacy', 'Adverse events']
    });
    await view.locator('[data-section="data"]').click();
    await view.locator('[data-view="tables"]').click();
    await expect(view.locator('[data-view="tables"]')).toHaveAttribute('aria-selected', 'true');
    // Where the reader was is kept when the page draws the tab again.
    await page.locator('.sva-tab[data-domain="ae"]').click();
    await page.locator('.sva-item[data-view="data"]').click();
    await expect(view.locator('[data-view="tables"]')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });

  // A study in place of the one before it (#405). What is loaded is read from
  // the app itself: the study the chip names, and every file with its count of
  // rows, whether it is placed in a domain, set aside or kept as a gsm raw file.
  const loadedNow = (page) =>
    page.evaluate(() => {
      const { state } = window.__safetyVizApp;
      return {
        chip: document.querySelector('.sva-chip-name').textContent,
        placed: Object.fromEntries(
          Object.entries(state.files).map(([domain, file]) => [
            domain,
            `${file.name}: ${file.rows.length}`
          ])
        ),
        setAside: state.unplaced.map((item) => `${item.file.name}: ${item.file.rows.length}`),
        raw: state.raw.map((file) => `${file.name}: ${file.rows}`)
      };
    });
  const chipName = (page) => page.locator('.sva-chip-name');
  const openDemoApp = async (page) => {
    await page.goto('/_site/demo/index.html#data');
    await page.evaluate('window.__safetyVizApp.ready');
  };
  /** Open a study from the list under the chip, and wait for the chip to name it. */
  const openFromChip = async (page, id, name) => {
    await page.locator('[data-action="study-chip"]').click();
    await page.locator(`.sva-chip-item[data-study="${id}"]`).click();
    await expect(chipName(page)).toHaveText(name);
  };
  const allStudies = async (page) => {
    await page.locator('[data-action="study-chip"]').click();
    await page.locator('[data-action="all-studies"]').click();
  };
  const READY_P1 = ['preset:phase1-small', 'READY-P1'];
  const READY_P2 = ['preset:phase2-oncology', 'READY-P2'];
  // Two files of a reader's own: one is placed, and one matches no domain.
  const OWN_FILES = ['dm.csv', 'site_notes.csv'].map((name) =>
    fileURLToPath(new URL(`./fixtures/app/${name}`, import.meta.url))
  );
  const OWN_LOADED = {
    chip: 'Your files',
    placed: { subject: 'dm.csv: 24' },
    setAside: ['site_notes.csv: 3'],
    raw: []
  };

  test('APP-LOAD-029: on the built demo page a study replaces the one before it, whatever kind either is: after each switch between the demo studies, a reader’s own files and two ready-made simulated studies, the files and rows loaded are those the study has when it is opened on an empty page (#405)', async ({
    page
  }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDemoApp(page);
    const pilot = await loadedNow(page);
    expect(pilot).toMatchObject({ chip: 'Pilot study', setAside: [], raw: [] });
    expect(Object.keys(pilot.placed)).toHaveLength(4);
    // Each simulated study as it is on an empty page: the page is opened anew
    // and Reset, which the demo study it opens on has in reach, before it.
    const alone = {};
    for (const [id, name] of [READY_P1, READY_P2]) {
      await page.reload();
      await page.evaluate('window.__safetyVizApp.ready');
      await page.locator('.sva-face[data-action="files"]').click();
      await page.locator('.sva-side [data-action="reset"]').click();
      await expect(chipName(page)).toHaveText('No study');
      await openFromChip(page, id, name);
      alone[name] = await loadedNow(page);
      expect(alone[name].setAside, name).toEqual([]);
      expect(Object.keys(alone[name].placed).length, name).toBeGreaterThan(0);
      expect(alone[name].raw.length, name).toBeGreaterThan(0);
    }
    expect(alone['READY-P2']).not.toEqual({ ...alone['READY-P1'], chip: 'READY-P2' });

    await page.reload();
    await page.evaluate('window.__safetyVizApp.ready');
    expect(await loadedNow(page)).toEqual(pilot);
    // A reader's own files, in place of the demo study.
    await page.locator('.sva-face[data-action="files"]').click();
    await page.locator('.sva-file-input').setInputFiles(OWN_FILES);
    await expect(chipName(page)).toHaveText('Your files');
    expect(await loadedNow(page)).toEqual(OWN_LOADED);
    // A ready-made study, in place of the reader's files.
    await openFromChip(page, ...READY_P1);
    expect(await loadedNow(page)).toEqual(alone['READY-P1']);
    // Another ready-made study, in place of the first.
    await openFromChip(page, ...READY_P2);
    expect(await loadedNow(page)).toEqual(alone['READY-P2']);
    // The reader's own files, chosen from the Studies view, in place of a
    // simulated study: the page says the study was cleared.
    await allStudies(page);
    const chosen = page.waitForEvent('filechooser');
    await page.locator('[data-add="files"]').click();
    await (await chosen).setFiles(OWN_FILES);
    await expect(chipName(page)).toHaveText('Your files');
    expect(await loadedNow(page)).toEqual(OWN_LOADED);
    await expect(page.locator('.sva-content > .sva-notes .sva-note').first()).toHaveText(
      'READY-P2 was cleared to load your files.'
    );
    // A demo study of gsm's raw files, in place of the reader's files.
    await openFromChip(page, 'demo:rbqm', 'RBQM study');
    const rbqm = await loadedNow(page);
    expect(rbqm).toMatchObject({ placed: {}, setAside: [] });
    expect(rbqm.raw).toHaveLength(9);
    // A ready-made study in place of a demo study, and a demo study in place of it.
    await openFromChip(page, ...READY_P1);
    expect(await loadedNow(page)).toEqual(alone['READY-P1']);
    await openFromChip(page, 'demo:pilot', 'Pilot study');
    expect(await loadedNow(page)).toEqual(pilot);
    expect(errors).toEqual([]);
  });

  test('APP-LOAD-030: on the built demo page, with a ready-made simulated study in use, the Overview tab has both faces, the study view first; the Files face lists the study’s files and has the file picker and Reset; Choose files on the Studies view opens the file chooser; and Reset clears the study to the empty drop zone and leaves it in the list, to open again as it was (#405)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDemoApp(page);
    await openFromChip(page, ...READY_P1);
    const study = await loadedNow(page);
    await expect(page.locator('.sva-face')).toHaveText(['Explore the data', 'Files']);
    await expect(page.locator('.sva-face[data-action="explore"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator('.sva-explore-body .sv-views')).toBeVisible();
    // The files one by one: every file the study loaded, placed or kept raw.
    await page.locator('.sva-face[data-action="files"]').click();
    await expect(page.locator('.sva-explore-body')).toHaveCount(0);
    await expect(page.locator('.sva-loaded-name')).toHaveCount(
      Object.keys(study.placed).length + study.raw.length
    );
    await expect(page.locator('.sva-side [data-action="reset"]')).toBeVisible();
    // The file picker opens from the sidebar.
    let chooser = page.waitForEvent('filechooser');
    await page.locator('.sva-side [data-action="choose-files"]').click();
    expect((await chooser).isMultiple()).toBe(true);
    // From the study view's face, Choose files on the Studies view opens it too.
    await page.locator('.sva-face[data-action="explore"]').click();
    await allStudies(page);
    chooser = page.waitForEvent('filechooser');
    await page.locator('[data-add="files"]').click();
    expect((await chooser).isMultiple()).toBe(true);
    await expect(page).toHaveURL(/#data$/);
    await expect(page.locator('.sva-face[data-action="files"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // Nothing was chosen: the study is as it was.
    expect(await loadedNow(page)).toEqual(study);
    // Reset, as with a demo study in use: nothing is loaded and no study is named.
    await page.locator('.sva-side [data-action="reset"]').click();
    await expect(chipName(page)).toHaveText('No study');
    await expect(page.locator('.sva-drop')).toBeVisible();
    await expect(page.locator('.sva-faces')).toHaveCount(0);
    expect(await loadedNow(page)).toEqual({ chip: 'No study', placed: {}, setAside: [], raw: [] });
    // The study is still in the list, and opens again as it was.
    await openFromChip(page, ...READY_P1);
    expect(await loadedNow(page)).toEqual(study);
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-LOAD-029: on the built demo page a study built in real R with Labs, Vital signs and ECGs turned off, and loaded into the demo over a ready-made study, leaves none of that study’s files: no labs, vital signs or ECG file is placed, set aside or kept raw, and every loaded file is one the built study has (#405)', { tag: '@real-r' }, async ({
    page
  }) => {
    // It downloads R, its packages and the modified copy of gsm.datasim, then simulates the study.
    test.setTimeout(420000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDemoApp(page);
    await openFromChip(page, ...READY_P1);
    // The ready-made study has all three: a labs and vitals file, an ECG file and their raw files.
    const before = await loadedNow(page);
    expect(Object.keys(before.placed).sort()).toEqual(['ae', 'bds', 'eg', 'subject']);
    const measured = /^Raw_(LB|VS|EG)\.csv: /;
    expect(before.raw.filter((file) => measured.test(file))).toHaveLength(3);
    // The builder, from the Studies view: a small study with the three domains turned off.
    await allStudies(page);
    await page.locator('[data-add="describe"]').click();
    const widget = page.locator('.sva-build-widget');
    for (const [name, value] of [['name', 'NO-LABS'], ['participants', '20'], ['sites', '2'], ['months', '3']]) {
      await widget.locator(`input[name="${name}"]`).fill(value);
      await widget.locator(`input[name="${name}"]`).blur();
    }
    for (const domain of ['LB', 'VS', 'EG']) {
      const chip = widget.locator(`.sb-chip[data-domain="${domain}"]`);
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
    }
    await widget.locator('[data-action="build"]').click();
    const use = widget.getByRole('button', { name: 'Load into the demo' });
    await expect(use).toBeVisible({ timeout: 360000 });
    await use.click();
    await expect(chipName(page)).toHaveText('NO-LABS');
    // A study just built says what made it, in the app's own words (#423).
    expect(await page.evaluate('window.__safetyVizApp.state.named.facts')).toContainEqual({
      label: 'Made by',
      value: 'a modified copy of gsm.datasim 2.1.0'
    });
    // And in its own notes, which the builder's R wrote just now, no sentence names gsm.datasim without saying it is the modified copy (#428).
    const notes = await page.evaluate('window.__safetyVizApp.state.named.built.notes');
    expect(notes.filter((note) => /gsm\.datasim/.test(note)).length).toBeGreaterThanOrEqual(4);
    expect(notes.filter(namedPlainly)).toEqual([]);
    const after = await loadedNow(page);
    // The ECG charts and the labs and vitals charts have no file, and nothing is set aside.
    expect(Object.keys(after.placed).sort()).toEqual(['ae', 'subject']);
    expect(after.setAside).toEqual([]);
    expect(after.raw.filter((file) => measured.test(file))).toEqual([]);
    expect(after.raw.length).toBeGreaterThan(0);
    // Every loaded file is one the built study handed over.
    const own = await page.evaluate(() => {
      const { raw, standard } = window.__safetyVizApp.state.named.built.files();
      return [...raw, ...standard].map((file) => file.name);
    });
    const names = (list) => list.map((file) => file.replace(/: \d+$/, ''));
    expect(own).toEqual(expect.arrayContaining([...names(Object.values(after.placed)), ...names(after.raw)]));
    expect(errors).toEqual([]);
  });

  // The study chip on the built demo page (#407). The page of the app's own
  // browser tests asks for no chip; the built demo does.
  const chipItem = (page, id) => page.locator(`.sva-chip-item[data-study="${id}"]`);
  const openDemo = async (page) => {
    await page.goto('/_site/demo/index.html');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('.sva-chip-name')).toHaveText('Pilot study');
  };

  test('APP-PAGE-045: on the built demo page a ready-made study whose file cannot be fetched says so under the chip, on the chart the reader is on, and the study in use stays (#407)', async ({
    page
  }) => {
    await page.route('**/phase2-oncology.study.json.gz', (route) => route.abort());
    await openDemo(page);
    await page.locator('[data-action="study-chip"]').click();
    await chipItem(page, 'preset:phase2-oncology').click();
    const said = page.locator('.sva-chip-slot .sva-chip-said[role="alert"]');
    await expect(said).toContainText('could not be fetched');
    await expect(said).toBeInViewport({ ratio: 1 });
    // The reader is where they were, on the study they had.
    await expect(page).toHaveTitle('Histogram · safety.viz demo');
    await expect(page.locator('.sva-chip-name')).toHaveText('Pilot study');
    // A click elsewhere closes the sentence.
    await page.locator('.sva-main').click({ position: { x: 5, y: 5 } });
    await expect(said).toHaveCount(0);
  });

  test('APP-PAGE-046: on the built demo page a slow study opened first does not replace the one chosen after it (#407)', async ({
    page
  }) => {
    let release = () => {};
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/phase2-oncology.study.json.gz', async (route) => {
      await held;
      await route.continue();
    });
    await openDemo(page);
    await page.locator('[data-action="study-chip"]').click();
    const asked = page.waitForRequest('**/phase2-oncology.study.json.gz');
    await chipItem(page, 'preset:phase2-oncology').click();
    await asked;
    await page.locator('[data-action="study-chip"]').click();
    await chipItem(page, 'preset:phase1-small').click();
    await expect(page.locator('.sva-chip-name')).toHaveText('READY-P1');
    // The first study arrives now, and is dropped.
    const arrived = page.waitForResponse('**/phase2-oncology.study.json.gz');
    release();
    await (await arrived).finished();
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    await expect(page.locator('.sva-chip-name')).toHaveText('READY-P1');
    expect(await page.evaluate('window.__safetyVizApp.state.named.id')).toBe('preset:phase1-small');
  });

  test('APP-PAGE-047: on the built demo page the chip’s list closes on a click elsewhere, on Escape with the keyboard elsewhere, and on a change of tab, and so does the i’s card (#407)', async ({
    page
  }) => {
    await openDemo(page);
    const pop = page.locator('.sva-chip-pop');
    for (const action of ['study-chip', 'study-info']) {
      const opener = page.locator(`[data-action="${action}"]`);
      await opener.click();
      await expect(pop).toBeVisible();
      await page.locator('.sva-chart').click({ position: { x: 5, y: 5 } });
      await expect(pop).toHaveCount(0);
      await opener.click();
      await expect(pop).toBeVisible();
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
      await opener.click();
      await expect(pop).toBeVisible();
      await page.locator('.sva-tab[data-domain="ae"]').click();
      await expect(pop).toHaveCount(0);
      await expect(page.locator('[data-action="study-chip"]')).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await page.locator('.sva-tab[data-domain="bds"]').click();
    }
  });

  test('APP-PAGE-048: on the built demo page at 390 pixels the chip’s list and the i’s card open inside the page, and the page does not scroll sideways (#407)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page);
    const placed = () =>
      page.evaluate(() => {
        const box = document.querySelector('.sva-chip-pop').getBoundingClientRect();
        const page = document.documentElement;
        return {
          inside: box.left >= 0 && box.right <= page.clientWidth,
          sideways: page.scrollWidth - page.clientWidth
        };
      });
    await page.locator('[data-action="study-chip"]').click();
    await expect(chipItem(page, 'preset:phase2-oncology')).toBeVisible();
    expect(await placed()).toEqual({ inside: true, sideways: 0 });
    // Every study's name and kind is on the screen, not past its right edge.
    await expect(chipItem(page, 'preset:phase2-oncology').locator('.sva-kind')).toBeInViewport({
      ratio: 1
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-action="study-info"]').click();
    await expect(page.locator('.sva-chip-card')).toBeVisible();
    expect(await placed()).toEqual({ inside: true, sideways: 0 });
  });

  // The header's one row (#416). From 1,200 pixels the study chip gives room
  // before the status label or a tab drops to a second row. The page loads its
  // own typefaces, which the Linux runner draws a few pixels wider across the
  // row than a Mac does; a reader whose browser does not get the files sees
  // system typefaces, which can be wider still. So each study is checked in both.
  // In the wide ones only what the layout promises in any typeface is
  // asserted: one row wherever the parts fit across the page with the chip at
  // its narrowest, which is read from the page itself.
  const WIDE_TYPEFACES =
    '.sva-app.sva-app{--sans:Verdana,"DejaVu Sans",sans-serif;' +
    '--mono:Menlo,"DejaVu Sans Mono",monospace;--serif:Georgia,"DejaVu Serif",serif}';
  const headerNow = (page) =>
    page.evaluate(() => {
      const one = (selector) => document.querySelector(selector);
      const box = (element) => element.getBoundingClientRect();
      const px = (value) => parseFloat(value) || 0;
      const bar = one('.sva-bar');
      const brand = one('.sva-brand');
      const slot = one('.sva-chip-slot');
      const chip = one('.sva-studychip');
      const name = one('.sva-chip-name');
      const status = one('.sva-appstatus');
      const tabs = [...document.querySelectorAll('.sva-tabs > *')];
      const spacing = getComputedStyle(bar);
      // One row: the wordmark's middle line runs through every part.
      const middle = (box(brand).top + box(brand).bottom) / 2;
      const parts = [brand, chip, one('.sva-chip-info'), ...tabs, status];
      // How much of its widest line the chip does not show.
      const cut = Math.max(
        0,
        ...[name, one('.sva-chip-snap')]
          .filter(Boolean)
          .map((line) => line.scrollWidth - line.clientWidth)
      );
      // The room the bar has, and what the parts that never shrink take of it.
      const room = bar.clientWidth - px(spacing.paddingLeft) - px(spacing.paddingRight);
      const fixed =
        box(brand).width +
        px(getComputedStyle(brand).marginRight) +
        tabs.reduce((sum, tab) => sum + box(tab).width, 0) +
        (tabs.length - 1) * px(getComputedStyle(one('.sva-tabs')).columnGap) +
        box(status).width +
        3 * px(spacing.columnGap);
      const whole = box(slot).width + cut;
      const narrowest = Math.min(whole, px(getComputedStyle(slot).flexBasis));
      return {
        oneRow: parts.every((part) => box(part).top < middle && box(part).bottom > middle),
        height: Math.round(box(one('.sva-header')).height),
        cut,
        name: name.textContent,
        hover: chip.title,
        tabs: tabs.length,
        labelInside: box(status).right <= box(bar).right - px(spacing.paddingRight) + 1,
        spareWhole: room - fixed - whole,
        spareNarrowest: room - fixed - narrowest
      };
    });
  /** The header at one width, once what a study brings has been drawn. */
  const headerAt = async (page, width) => {
    await page.setViewportSize({ width, height: 720 });
    let before = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await headerNow(page));
        const same = now === before;
        before = now;
        return same;
      })
      .toBe(true);
    return headerNow(page);
  };
  const oneRowHeader = async (page, study, own, roomyTabs = true) => {
    const typefaces = own ? 'the page’s own typefaces' : 'wide typefaces';
    // With room to spare: one row, the name whole. Its height is the measure.
    const roomy = await headerAt(page, 1900);
    expect(roomy, `${study}, ${typefaces}, 1,900 pixels`).toMatchObject({ oneRow: true, cut: 0 });
    for (const width of [1280, 1440]) {
      const where = `${study}, ${typefaces}, ${width} pixels`;
      const now = await headerAt(page, width);
      // Nothing a reader uses is lost, whatever fits: every tab and the label
      // are there, the name is whole in the page and on hover.
      expect(now.tabs, where).toBe(roomy.tabs);
      expect(now.labelInside, where).toBe(true);
      expect(now.name, where).toBe(study);
      expect(now.hover.startsWith(study), where).toBe(true);
      // In the page's own typefaces the parts fit with the chip at its narrowest,
      // by 60 pixels or more on a Mac. Two demo studies' tabs are wider ("6 of 9"),
      // and at 1,280 pixels they fit by half that: held where they fit, as below.
      if (own && (roomyTabs || width > 1280)) expect(now.spareNarrowest, where).toBeGreaterThan(2);
      // Wherever they do, the header is one row and no taller than with room to spare.
      if (now.spareNarrowest > 2) {
        expect(now.oneRow, where).toBe(true);
        expect(now.height, where).toBe(roomy.height);
      }
      // The chip is whole where there is room for it, and cut only where there is not.
      if (now.spareWhole > 2) expect(now.cut, where).toBe(0);
      if (now.spareWhole < -2 && now.spareNarrowest > 2) expect(now.cut, where).toBeGreaterThan(0);
    }
  };

  test('APP-PAGE-049: on the built demo page the header is one row at 1,280 and at 1,440 pixels, no taller than with room to spare, for each demo study, a reader’s own files and each ready-made study, in the page’s own typefaces, and in wide ones wherever its parts fit with the chip at its narrowest; the chip’s name is cut before the label or a tab drops, with the whole name on hover; the words Demo app are drawn below 1,200 pixels, from 1,440, and in a header with no chip (#416)', async ({
    page
  }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const own of [true, false]) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/_site/demo/index.html#data');
      await page.evaluate('window.__safetyVizApp.ready');
      if (!own) await page.addStyleTag({ content: WIDE_TYPEFACES });
      await page.evaluate(() => document.fonts.ready);
      // Each demo study the Files face offers, by the name its chip gives it.
      await page.locator('.sva-face[data-action="files"]').click();
      const menu = page.locator('.sva-side select.sva-study');
      for (const [study, name] of [
        ['pilot', 'Pilot study'],
        ['renamed', 'Renamed columns'],
        ['liver', 'Liver cohort, labs only'],
        ['rbqm', 'RBQM study']
      ]) {
        await menu.selectOption(study);
        await expect(page.locator('.sva-chip-name')).toHaveText(name);
        await oneRowHeader(page, name, own, study === 'pilot' || study === 'rbqm');
      }
      // A reader's own files.
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.locator('.sva-file-input').setInputFiles(OWN_FILES);
      await expect(page.locator('.sva-chip-name')).toHaveText('Your files');
      await oneRowHeader(page, 'Your files', own);
      // The three ready-made studies: two say a snapshot under their name.
      for (const [id, name, words] of [
        ['phase1-small', 'READY-P1', 'Snapshot 6 of 6'],
        ['phase2-oncology', 'READY-P2', null],
        ['cdisc-pilot-protocol', 'PILOT-PROTOCOL', 'Snapshot 7 of 7']
      ]) {
        await page.setViewportSize({ width: 1280, height: 720 });
        await openReadyMade(page, id, name);
        if (words) await expect(page.locator('.sva-chip-snap')).toHaveText(words);
        else await expect(page.locator('.sva-chip-snap')).toHaveCount(0);
        await oneRowHeader(page, name, own);
      }
      if (!own) continue;
      // PILOT-PROTOCOL, the longest of the three names, at 1,224 pixels: too
      // narrow for the whole name and wide enough for the row. The name is cut,
      // the row holds, and the i beside the chip still opens the card that says it.
      const tight = await headerAt(page, 1224);
      expect(tight.spareWhole).toBeLessThan(-2);
      expect(tight).toMatchObject({ oneRow: true, name: 'PILOT-PROTOCOL', labelInside: true });
      expect(tight.cut).toBeGreaterThan(0);
      expect(tight.hover.startsWith('PILOT-PROTOCOL as it stood on ')).toBe(true);
      await page.locator('[data-action="study-info"]').click();
      await expect(page.locator('.sva-chip-cardhead strong')).toHaveText('PILOT-PROTOCOL');
      await page.keyboard.press('Escape');
      // The words beside the wordmark, and where the chip's place flexes.
      const flexes = () =>
        page.evaluate(() => getComputedStyle(document.querySelector('.sva-chip-slot')).flexGrow);
      for (const [width, kicker, grow] of [
        [1199, true, '0'],
        [1200, false, '1'],
        [1439, false, '1'],
        [1440, true, '1']
      ]) {
        await page.setViewportSize({ width, height: 720 });
        await expect(page.locator('.sva-kicker')).toBeVisible({ visible: kicker });
        expect(await flexes(), `${width} pixels`).toBe(grow);
      }
    }
    // A header with no chip draws the words at 1,280 pixels, as it did: the
    // chip's place is taken out of this one, as a page that asks for no chip
    // has none (the test page is one, in basic-app.spec.js).
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('.sva-kicker')).toBeHidden();
    await page.evaluate(() => document.querySelector('.sva-chip-slot').remove());
    await expect(page.locator('.sva-kicker')).toBeVisible();
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

  test('APP-TIER-028: on a phone’s screen, where the window grows with what overflows it, a label’s panel and its hover line are inside the screen on a gallery card and on a page title, and the page is no wider than the screen (#309)', async ({
    browser,
    baseURL
  }) => {
    // A phone as the browser emulates one: touch, and a window whose inner
    // width is not the screen's once something runs past the edge.
    const context = await browser.newContext({ ...devices['Pixel 5'], baseURL });
    const page = await context.newPage();
    const screen = () => page.evaluate(() => document.documentElement.clientWidth);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    const inside = async (part, where) => {
      await expect(part, where).toBeVisible();
      const box = await part.boundingBox();
      expect(box.x, where).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, where).toBeLessThanOrEqual(await screen());
      expect(await overflow(), where).toBeLessThanOrEqual(0);
    };
    for (const [where, scope] of [
      ['index.html', '.card:has(a[href="time-to-event/index.html"])'],
      ['index.html', '.card:has(a[href="histogram/index.html"])'],
      ['time-to-event/index.html', 'h1'],
      ['hep-explorer/guide.html', 'h1']
    ]) {
      await page.goto(`/_site/${where}`);
      const label = statusOf(page.locator(scope));
      const pill = label.locator('.sv-status-label');
      await pill.scrollIntoViewIfNeeded();
      await pill.tap();
      await inside(label.locator('.sv-status-panel'), `${where} ${scope}: the panel`);
      // Tapped closed, the line shows: the tap's hover stays on the label.
      await pill.tap();
      await expect(label.locator('.sv-status-panel')).toBeHidden();
      await inside(pill.locator('.sv-status-tip'), `${where} ${scope}: the hover line`);
    }
    await context.close();
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
