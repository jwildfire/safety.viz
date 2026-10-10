import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { CANONICAL, captureEvidence } from './evidence.js';
import {
  APP_LIBRARIES,
  FILE_NO_R,
  FILE_PITCH,
  FILE_NO_RBQM,
  HOSTED_PITCH,
  RBQM_CHARTS,
  RBQM_DOWNLOADS,
  libraryManifest
} from '../../scripts/app-libraries.mjs';
import { SCENARIO, openAndStartR, playScenario } from '../../scripts/app-statistics-lib.mjs';
import {
  RBQM_GATE,
  RBQM_PILOT,
  RBQM_TAB,
  RESULT_KEYS,
  RESULT_NUMBERS,
  pipelineArgs,
  pipelineFiles,
  scenarioFiles,
  studyFiles,
  tabStudyFiles
} from '../../scripts/rbqm-lib.mjs';

// Browser evidence for the demo app (#150, obot.roadmap#352): a full-page app
// that lists every chart in the portfolio manifest by domain, says which the
// loaded data supports, and draws one at a time. Test names are keyed to the
// APP-* rows in requirements/demo-app.md.
//
// The harness page (fixtures/basic-app.html) mounts the real app bundle on the
// vendored demo extracts, with bio.viz's vendored bundle beside it as the demo
// page has it (#182). The app bundle is a build product, so it is built here.

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/portfolio.json', import.meta.url), 'utf8')
);
const modules = Object.entries(manifest.modules);
// Drawn in the main pane: everything but the participant profile, which is a
// rail inside its host charts.
const destinations = modules.filter(([module]) => module !== 'participant-profile');
// bio.viz's charts, from the chart list in its vendored bundle (#182): listed in
// their own Biomarkers tab after safety.viz's three domains.
const bioManifest = libraryManifest(APP_LIBRARIES[0]);
const bioCharts = Object.entries(bioManifest.modules);

// What a drawn chart puts on the page: a canvas, or a table for the table-led
// adverse-event explorer; bio.viz's correlation matrix and biomarker screen
// draw grids and lists of their own.
const DRAWN = 'canvas:visible, table:visible, .bv-matrix-grid:visible, .bv-screen:visible';

// A test that opens every chart in turn is given longer than the default: on
// CI's runner, beside a test starting R, opening seventeen charts has come
// close to 30 s (the slowest so far, 22.6 s). 60 s leaves room without hiding
// a hang (#193). There are eighteen since the cross-tabulation (#212).
const MANY_CHARTS = 60000;

const APP = 'window.__safetyVizApp';
const item = (page, id) => page.locator(`.sva-item[data-view="${id}"]`);
const tab = (page, domain) => page.locator(`.sva-tab[data-domain="${domain}"]`);

// A chart sits under its group's tab: open the tab, then choose the chart. A
// safety chart's group is the first domain it reads; a biomarker chart's is the
// group its entry names.
const domainOf = (module) =>
  manifest.modules[module]
    ? manifest.modules[module].domains[0]
    : bioManifest.modules[module].group;
async function openChart(page, module) {
  await tab(page, domainOf(module)).click();
  await item(page, module).click();
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function openOnDemo(page) {
  await page.goto('/tests/e2e/fixtures/basic-app.html');
  await page.evaluate(`${APP}.ready`);
}

test.describe('demo app on the demo study', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-PAGE-001: every chart is listed under its group with a status: thirteen safety charts under three domains, and five biomarker charts in their own tab (#150, #165, #182, #212)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(page.locator('.sva-group-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Biomarkers'
    ]);
    // A safety chart's chip drops the word every safety chart shares.
    await expect(page.locator('.sva-group .sva-item-title')).toHaveText([
      ...modules.map(([, entry]) => entry.title.replace('Safety ', '')),
      ...bioCharts.map(([, entry]) => entry.title)
    ]);
    await expect(page.locator('.sva-group .sva-tag')).toHaveCount(18);
    // The experimental Patient Journey Explorer is not offered.
    await expect(page.locator('.sva-app')).not.toContainText('Patient Journey');
  });

  test('APP-PAGE-002: the demo study reads 18 of 18 supported and opens on the first chart (#150, #165, #182, #212)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-tag.sva-ready')).toHaveCount(18);
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('Pilot study');
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-chart .sv-root')).toBeVisible();
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    expect(errors).toEqual([]);
    // The evidence shot is of one chart drawn whole. The histogram the demo
    // opens on draws 28 small charts, and how many are painted when the frame
    // settles varies from run to run.
    await openChart(page, 'hep-explorer');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await captureEvidence(page, 'APP-PAGE-002', 'demo-study');
  });

  for (const [module, entry] of destinations) {
    test(`APP-PAGE-003: ${entry.title} draws from the demo study with no console error (#150)`, async ({
      page
    }) => {
      const errors = watchErrors(page);
      await openOnDemo(page);
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      // The chart's own output is on the page — a canvas, or a table for the
      // table-led adverse-event explorer — and it did not throw on load, which
      // the page would have recorded as "did not draw".
      const chart = page.locator('.sva-chart');
      await expect(chart.locator('canvas:visible, table:visible').first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      expect(errors).toEqual([]);
    });
  }

  test('APP-PAGE-004: only one chart is mounted at a time (#150)', async ({ page }) => {
    await openOnDemo(page);
    for (const module of ['histogram', 'qt-explorer', 'ae-explorer', 'hep-explorer']) {
      await openChart(page, module);
      await expect(item(page, module)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.sva-chart')).toHaveCount(1);
      await expect(page.locator('.sva-chart > *')).not.toHaveCount(0);
    }
    // The previous chart's Chart.js instances are gone, not hidden.
    await item(page, 'data').click();
    await expect(page.locator('.sva-chart')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('APP-PAGE-005: a chart that was ready but throws reads "did not draw" with its own message (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    // Break the shift plot's data after the mapping was built: its required
    // visit column is gone from every row, which the chart reports on load.
    await page.evaluate(`(() => {
      const app = ${APP};
      app.state.files.bds = {
        ...app.state.files.bds,
        rows: app.state.files.bds.rows.map(({ VISIT, ...row }) => row)
      };
    })()`);
    await openChart(page, 'shift-plot');
    await expect(item(page, 'shift-plot').locator('.sva-tag')).toHaveText('did not draw');
    await expect(page.locator('.sva-message')).toContainText('Required variable(s) missing: VISIT');
    await expect(page.locator('.sva-count')).toHaveText(
      '17 of 18 charts supported by the loaded data'
    );
  });

  test('APP-PAGE-006: a chart the data cannot support is not drawn, and the page says why (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    // The liver cohort is one labs file: the ECG chart has nothing to read.
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('liver');
    await expect(page.locator('.sva-loaded-name')).toHaveText(['adbds-abnbl.csv']);
    await openChart(page, 'qt-explorer');
    await expect(page.locator('.sva-message')).toHaveText('No file loaded for: ECG.');
    await expect(page.locator('.sva-chart')).toHaveCount(0);
  });

  test('APP-PAGE-007: the participant profile is explained, and opens as the rail beside its host chart (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    await openChart(page, 'participant-profile');
    await expect(page.locator('.sva-message')).toContainText(
      'opens beside a chart when you select a participant'
    );
    await expect(page.locator('.sva-chart')).toHaveCount(0);
  });

  test('APP-PAGE-008: with no demo study the page opens on an empty data view and nothing is ready (#150)', async ({
    page
  }) => {
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty');
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 18 charts supported by the loaded data'
    );
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-data')).toContainText('No files are loaded.');
    await expect(page.locator('.sva-study')).toHaveCount(0);
  });

  test('APP-PAGE-012: at phone width the header’s rows scroll within themselves and the page does not scroll sideways (#150)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // The demo opens on a labs chart: nine chips, more than a phone is wide.
    await expect(item(page, 'histogram')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const row = page.locator('.sva-group:not([hidden])');
    expect(await row.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    // A chip off the right edge is reached by scrolling its row, not the page.
    await item(page, 'nep-explorer').scrollIntoViewIfNeeded();
    await item(page, 'nep-explorer').click();
    await expect(page.locator('.sva-title')).toHaveText('Nephrotoxicity Explorer');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await item(page, 'data').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test('APP-PAGE-040: at phone width a direct link to a tab or a chart opens with it in view in its row, and every tab and chart name is at least 44 pixels tall; at 1,280 pixels they are as they were (#271)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const inView = async (locator) => {
      const box = await locator.boundingBox();
      return box.x >= 0 && box.x + box.width <= 390;
    };
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // The RBQM tab is the last of six: off the screen to the right until the row is scrolled to it.
    await page.goto('/tests/e2e/fixtures/basic-app.html#rbqm');
    await page.evaluate(`${APP}.ready`);
    const rbqm = page.locator('.sva-tab[data-tab="rbqm"]');
    await expect(rbqm).toHaveAttribute('aria-pressed', 'true');
    expect(await inView(rbqm)).toBe(true);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await captureEvidence(page.locator('.sva-header'), 'APP-PAGE-040', 'phone-header-rbqm');
    // A chart late in its row: its tab and its own name are both in view.
    await page.goto('/tests/e2e/fixtures/basic-app.html#participant-profile');
    await page.reload();
    await page.evaluate(`${APP}.ready`);
    await expect(item(page, 'participant-profile')).toHaveAttribute('aria-current', 'page');
    expect(await inView(item(page, 'participant-profile'))).toBe(true);
    expect(await inView(tab(page, 'bds'))).toBe(true);
    // Followed without a reload, the row moves to the tab that opens.
    await page.evaluate(() => {
      window.location.hash = '#cross-tab';
    });
    await expect(item(page, 'cross-tab')).toHaveAttribute('aria-current', 'page');
    expect(await inView(tab(page, 'biomarkers'))).toBe(true);
    expect(await inView(item(page, 'cross-tab'))).toBe(true);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Every tab and every chart name shown is tall enough for a thumb.
    const heights = () =>
      page
        .locator('.sva-tabs > *, .sva-group:not([hidden]) .sva-item')
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().height)
        );
    const phone = await heights();
    expect(phone).toHaveLength(6 + bioCharts.length);
    expect(Math.min(...phone)).toBeGreaterThanOrEqual(44);
    // At desktop width nothing changed: a tab is as tall as its words need.
    await page.setViewportSize({ width: 1280, height: 800 });
    const desktop = await heights();
    expect(Math.max(...desktop)).toBeLessThan(36);
  });

  test('APP-PAGE-021: the app’s own parts are a header and a footer, so the chart has the page’s width (#150)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOnDemo(page);
    await openChart(page, 'hep-explorer');
    const box = async (selector) => page.locator(selector).boundingBox();
    const header = await box('.sva-header');
    const chart = await box('.sva-chart');
    // Nothing of the app sits beside the chart: it spans the page but for the gutters.
    expect(header.width).toBe(1440);
    expect(chart.width).toBeGreaterThan(1440 - 80);
    expect(chart.y).toBeGreaterThan(header.y + header.height);
    // The header stays shallow: one line for the bar and one for the charts,
    // even for the nine charts of labs and vitals. The row never wraps; whether
    // all nine fit without scrolling it depends on the typeface, and this page
    // loads none, so that is asserted only where any system font has room.
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await tab(page, 'bds').click();
      const size = await page.evaluate(() => {
        const row = document.querySelector('.sva-group:not([hidden])');
        return {
          header: document.querySelector('.sva-header').getBoundingClientRect().height,
          row: document.querySelector('.sva-charts').getBoundingClientRect().height,
          fits: row.scrollWidth <= row.clientWidth,
          overflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });
      expect(size.header).toBeLessThan(100);
      expect(size.row).toBeLessThan(40);
      expect(size.overflow).toBeLessThanOrEqual(0);
      if (width === 1440) expect(size.fits).toBe(true);
    }
    // The hosted app's promise, as the harness page mounts it (#183).
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(HOSTED_PITCH);
  });

  test('APP-PAGE-024: the open chart’s chip is the view’s visible name: no heading and no count line take up the page (#150)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOnDemo(page);
    await openChart(page, 'ae-timelines');
    // The heading and the overall count are still there for a screen reader...
    await expect(page.locator('h1.sva-title')).toHaveText('Adverse Event Timelines');
    await expect(page.locator('.sva-count')).toHaveAttribute('aria-live', 'polite');
    // ...and take up no room on the page.
    for (const selector of ['h1.sva-title', '.sva-count']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.height).toBeLessThanOrEqual(1);
    }
    // The chart starts straight under the header.
    // On first open the welcome line sits between them (#269); once it is closed
    // the chart starts straight under the header.
    await page.locator('.sva-welcome').getByRole('button', { name: 'Dismiss' }).click();
    const header = await page.locator('.sva-header').boundingBox();
    const chart = await page.locator('.sva-chart').boundingBox();
    expect(chart.y - (header.y + header.height)).toBeLessThan(30);
    // The open chip stands out from its neighbours.
    const weight = (id) =>
      item(page, id).evaluate((node) => Number(getComputedStyle(node).fontWeight));
    expect(await weight('ae-timelines')).toBeGreaterThanOrEqual(600);
    expect(await weight('ae-explorer')).toBeLessThan(600);
    const fill = (id) => item(page, id).evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(await fill('ae-timelines')).not.toBe(await fill('ae-explorer'));
  });

  test('APP-PAGE-022: a tab per domain says how many of its charts are supported and shows that domain’s charts (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    // After the domains' tabs comes the RBQM tab, a view of its own (#235).
    await expect(page.locator('.sva-tab .sva-tab-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Biomarkers',
      'RBQM'
    ]);
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '9',
      '1',
      '3',
      '5',
      'not run'
    ]);
    // The demo opens on the first chart, so its domain is open.
    await expect(tab(page, 'bds')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, 'histogram')).toBeVisible();
    await expect(item(page, 'ae-explorer')).toBeHidden();
    // Opening another domain swaps the row and draws its first chart.
    await tab(page, 'ae').click();
    await expect(item(page, 'ae-explorer')).toBeVisible();
    await expect(item(page, 'histogram')).toBeHidden();
    await expect(page.locator('.sva-title')).toHaveText('Adverse Event Explorer');
    // On the data view no domain is open.
    await item(page, 'data').click();
    await expect(page.locator('.sva-charts')).toBeHidden();
  });

  test('APP-LIB-037: on the demo app as it opens no tab is grey: Biomarkers is pink and RBQM amber, the colours the rule gives them, the biomarker chart names and the chart’s card carry their tab’s colour, and the standard domains’ tabs keep theirs (#268)', async ({
    page
  }) => {
    await openOnDemo(page);
    const colourOf = (locator) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const hexOf = (locator) => colourOf(locator.locator('.sva-hex'));
    // The standard domains' tabs: blue, violet, teal, as before.
    expect(await hexOf(tab(page, 'bds'))).toBe('rgb(81, 159, 221)');
    expect(await hexOf(tab(page, 'eg'))).toBe('rgb(152, 139, 221)');
    expect(await hexOf(tab(page, 'ae'))).toBe('rgb(0, 175, 169)');
    // Neither library names a colour, so the rule gives the first pink, #c67bb6,
    // and the second amber, #c78a3b.
    expect(await hexOf(tab(page, 'biomarkers'))).toBe('rgb(198, 123, 182)');
    expect(await hexOf(page.locator('.sva-tab[data-tab="rbqm"]'))).toBe('rgb(199, 138, 59)');
    // No hex in the header is the graphite a library's tab used to be, #4a525c.
    const hexes = await page
      .locator('.sva-header .sva-hex')
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).backgroundColor)
      );
    expect(hexes.length).toBeGreaterThan(20);
    expect(hexes).not.toContain('rgb(74, 82, 92)');
    // The biomarker chart names carry their tab's colour, and so does the open chart's card.
    await tab(page, 'biomarkers').click();
    const [first] = bioCharts;
    await expect(item(page, first[0])).toHaveAttribute('aria-current', 'page');
    for (const [module] of bioCharts) {
      expect(await hexOf(item(page, module)), module).toBe('rgb(198, 123, 182)');
    }
    expect(
      await item(page, first[0]).evaluate((element) => getComputedStyle(element).boxShadow)
    ).toContain('rgb(198, 123, 182)');
    expect(
      await page
        .locator('.sva-chart')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--hue'))
    ).toBe('#c67bb6');
    // The header as a first-time visitor sees it, with the Biomarkers tab open.
    await captureEvidence(page.locator('.sva-header'), 'APP-LIB-037', 'tab-colours');
    // The RBQM tab's own page carries its colour too.
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    expect(
      await page
        .locator('.sva-view')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--hue'))
    ).toBe('#c78a3b');
  });

  test('APP-PAGE-025: changing the address opens that view without a reload (#163)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    await page.evaluate(() => {
      window.location.hash = '#data';
    });
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-side')).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = '#qt-explorer';
    });
    await expect(page.locator('.sva-title')).toHaveText('QT Safety Explorer');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    // Back and forward move between the views the address named.
    await page.goBack();
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    // A hash that names no view leaves the view as it is.
    await page.evaluate(() => {
      window.location.hash = '#no-such-view';
    });
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
  });

  test('APP-PAGE-027: an address naming something every object has, such as #constructor, opens the first chart and throws nothing (#165)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html#constructor');
    await page.evaluate(`${APP}.ready`);
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = '#toString';
    });
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    expect(errors).toEqual([]);
  });

  test('APP-CHART-003: with every optional row cleared by hand, every chart still draws, reading none of them (#165)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await openOnDemo(page);
    // On the data view, where a mapping edit redraws the table and no chart.
    await item(page, 'data').click();
    // Clear each row in turn; a row some chart cannot draw without is put back.
    const cleared = await page.evaluate(`(() => {
      const app = ${APP};
      const ready = () =>
        Object.values(app.status()).filter((status) => status.state === 'ready').length;
      const all = ready();
      const done = [];
      for (const [domain, mapping] of Object.entries(app.state.mappings)) {
        for (const [column, row] of Object.entries(mapping.columns)) {
          if (!row.value) continue;
          app.setColumn(domain, column, null);
          if (ready() < all) app.setColumn(domain, column, row.value);
          else done.push(domain + '.' + column);
        }
      }
      return done;
    })()`);
    // The demo files carry every one of these under the charts' default names.
    expect(cleared).toEqual(
      expect.arrayContaining(['bds.STRESU', 'bds.STNRLO', 'bds.VISITNUM', 'eg.CHG', 'ae.AESER'])
    );
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    for (const [module, entry] of [...destinations, ...bioCharts]) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    // The histogram names its measures without the unit it was told not to
    // read, although the file still carries it under the default name.
    await openChart(page, 'histogram');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await expect(page.locator('.sva-chart')).toContainText('Alanine Aminotransferase');
    await expect(page.locator('.sva-chart')).not.toContainText('U/L');
    expect(await page.evaluate(`'STRESU' in ${APP}.state.files.bds.rows[0]`)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('APP-CHART-010: on the renamed-column study the participant rail opens with its measures in the Shift Plot and Delta-Delta (#165)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('renamed');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    // The limits of normal are LLN and ULN in this study.
    for (const [key, value] of [
      ['STNRHI', 'ULN'],
      ['STNRLO', 'LLN'],
      ['ARM', 'TREATMENT']
    ]) {
      await mappingRow(page, 'bds', 'column', key).locator('select').selectOption(value);
    }
    await mappingRow(page, 'bds', 'measure', 'TB').locator('select').selectOption('Tot. Bilirubin');
    for (const module of ['shift-plot', 'delta-delta', 'histogram']) {
      await openChart(page, module);
      await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
      // Select the first participant, as a click on their point would.
      await page.evaluate(`(() => {
        const { files, mappings } = ${APP}.state;
        const id = files.bds.rows[0][mappings.bds.columns.USUBJID.value];
        document
          .querySelector('.sva-chart canvas')
          .dispatchEvent(
            new CustomEvent('participantsSelected', { bubbles: true, detail: { data: [id] } })
          );
      })()`);
      await expect(page.locator('.sv-rail .sv-profile-root')).toBeVisible();
      await expect(page.locator('.sv-rail .sv-profile-measure-row').first()).toBeVisible();
      await expect(page.locator('.sv-rail .sv-profile-spaghetti canvas')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

// ---- the data panel (#151) ---------------------------------------------------
//
// The renamed-column study under fixtures/app/ (scripts/build-app-fixture.mjs)
// is loaded through the page's own file input, as a user would choose files.
// The harness opens empty (`?empty`), as the single-file build does.

const STUDY = ['labs_final.csv', 'dm.csv', 'ae.csv', 'ecg.json'].map(
  (name) => `tests/e2e/fixtures/app/${name}`
);
const NO_DOMAIN = 'tests/e2e/fixtures/app/site_notes.csv';

// The six rows the renamed study needs set by hand: [domain, row kind, key, value].
const CORRECTIONS = [
  ['bds', 'column', 'STNRHI', 'ULN'],
  ['bds', 'column', 'ARM', 'TREATMENT'],
  ['bds', 'measure', 'TB', 'Tot. Bilirubin'],
  ['eg', 'column', 'ARM', 'TREATMENT'],
  ['ae', 'column', 'ARM', 'TREATMENT'],
  ['subject', 'column', 'EOSDY', 'LASTDAY']
];

const card = (page, domain) => page.locator(`.sva-file[data-domain="${domain}"]`);
const mappingRow = (page, domain, kind, key) =>
  card(page, domain).locator(`tr[data-${kind}="${key}"]`);

async function openEmpty(page) {
  await page.goto('/tests/e2e/fixtures/basic-app.html?empty');
  await expect(page.locator('.sva-drop')).toBeVisible();
}

async function chooseFiles(page, files) {
  await page.locator('.sva-file-input').setInputFiles(files);
  await expect(page.locator('.sva-file').first()).toBeVisible();
}

async function correct(page) {
  for (const [domain, kind, key, value] of CORRECTIONS) {
    await mappingRow(page, domain, kind, key).locator('select').selectOption(value);
  }
}

// A second chart library (#181, obot.roadmap#366): the harness page hands the
// app the stand-in library (fixtures/stand-in-library.js) beside safety.viz's
// own charts, on the pilot demo study. Its one drawing chart takes named
// tables and refuses a null setting; its other entry names a factory the
// library does not have.
// The first screen says where the reader is (#269, obot.roadmap#402).
test.describe('demo app: the first screen', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });
  const WELCOME =
    'You are looking at the CDISC pilot study, a public demo: 254 participants, 18 charts on five tabs. ' +
    'To use your own files, open Data. They are read in this browser and never leave it.';
  const dataTag = (page) => item(page, 'data').locator('.sva-tag');
  const counts = (page) => page.locator('.sva-tab[data-domain] .sva-tab-count');
  const hexClass = (page, domain) => tab(page, domain).locator('.sva-hex');

  test('APP-PAGE-032: a tab reads one number when every chart of it draws, "8 of 9" when some cannot, and "0" beside a hollow hex when none can, on the pilot study, the liver cohort and the RBQM study (#269)', async ({
    page
  }) => {
    await openOnDemo(page);
    // The pilot study: every chart of every tab draws.
    await expect(counts(page)).toHaveText(['9', '1', '3', '5']);
    await expect(tab(page, 'bds')).toHaveAttribute(
      'title',
      '9 of 9 charts supported by the loaded data'
    );
    // The liver cohort's one labs file: one labs chart cannot draw, and no ECG or adverse events chart can.
    await item(page, 'data').click();
    const menu = page.locator('.sva-side select.sva-study');
    await menu.selectOption('liver');
    await expect(counts(page)).toHaveText(['8 of 9', '0', '0', '5']);
    await expect(hexClass(page, 'eg')).toHaveClass('sva-hex sva-hollow');
    await expect(hexClass(page, 'ae')).toHaveClass('sva-hex sva-hollow');
    await expect(tab(page, 'ae')).toHaveAttribute(
      'title',
      '0 of 3 charts supported by the loaded data'
    );
    // The RBQM study's raw files: no chart reads them.
    await menu.selectOption('rbqm');
    await expect(counts(page)).toHaveText(['0', '0', '0', '0']);
    for (const domain of ['bds', 'eg', 'ae', 'biomarkers']) {
      await expect(hexClass(page, domain)).toHaveClass('sva-hex sva-hollow');
    }
  });

  test('APP-PAGE-033: the Data tab names the loaded study: each demo study by its name, a reader’s own files as "Your 4 files", and nothing as "no files" (#269)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(dataTag(page)).toHaveText('Pilot study');
    await item(page, 'data').click();
    const menu = page.locator('.sva-side select.sva-study');
    await menu.selectOption('rbqm');
    await expect(dataTag(page)).toHaveText('RBQM study');
    await menu.selectOption('renamed');
    await expect(dataTag(page)).toHaveText('Renamed columns');
    // A reader's own files take the demo study's place, and are counted.
    await chooseFiles(page, STUDY);
    await expect(dataTag(page)).toHaveText('Your 4 files');
    await page.locator('[data-action="reset"]').click();
    await expect(dataTag(page)).toHaveText('no files');
  });

  test('APP-PAGE-034: on first open one line above the chart says whose data this is, how much is here and where to load your own, and its link opens the Data tab (#269)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    const welcome = page.locator('.sva-welcome');
    await expect(welcome).toBeVisible();
    await expect(welcome.locator('p')).toHaveText(WELCOME);
    // Above the chart, and as wide as the chart's card. That it is one line at
    // this width in the app's own typeface is held on the built page (site.spec.js).
    const line = await welcome.boundingBox();
    const chart = await page.locator('.sva-chart').boundingBox();
    expect(line.y + line.height).toBeLessThanOrEqual(chart.y);
    expect(Math.abs(line.width - chart.width)).toBeLessThan(1);
    await captureEvidence(page, 'APP-PAGE-034', 'first-screen');
    // It stays while charts are opened, and its link leads to the Data tab, where it is not shown.
    await openChart(page, 'ae-explorer');
    await expect(welcome).toBeVisible();
    await welcome.getByRole('link', { name: 'Data' }).click();
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(welcome).toBeHidden();
    await openChart(page, 'histogram');
    await expect(welcome).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('APP-PAGE-035: the welcome line closes with its cross and does not come back in that visit, and nothing is written to the browser’s storage (#269)', async ({
    page
  }) => {
    await openOnDemo(page);
    const welcome = page.locator('.sva-welcome');
    await expect(welcome).toBeVisible();
    await welcome.getByRole('button', { name: 'Dismiss' }).click();
    await expect(welcome).toBeHidden();
    await openChart(page, 'ae-explorer');
    await expect(welcome).toBeHidden();
    await item(page, 'data').click();
    await openChart(page, 'histogram');
    await expect(welcome).toBeHidden();
    const stored = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookie: document.cookie
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '' });
    // A new visit is a first open again: nothing remembered the cross.
    await page.reload();
    await page.evaluate(`${APP}.ready`);
    await expect(welcome).toBeVisible();
  });

  test('APP-PAGE-037: the wordmark is a link to the docs home, the mark and the words "Demo app" inside it, and nothing else in the header moves (#270)', async ({
    page
  }) => {
    await openOnDemo(page);
    const brand = page.locator('.sva-header a.sva-brand');
    // The harness page gives the app no addresses, so the app's own default stands: the published site.
    await expect(brand).toHaveAttribute('href', 'https://jwildfire.github.io/safety.viz/');
    await expect(brand).toHaveAttribute('title', 'safety.viz: docs and chart gallery');
    await expect(brand.locator('.sva-wordmark')).toHaveText('safety.viz');
    await expect(brand.locator('.sva-kicker')).toHaveText('Demo app');
    // It reads as the wordmark it was: the header's ink, not a link's underline.
    const look = await brand.evaluate((element) => {
      const style = getComputedStyle(element);
      return { line: style.textDecorationLine, colour: style.color };
    });
    expect(look).toEqual({ line: 'none', colour: 'rgb(31, 35, 40)' });
    // The wordmark and every tab are on the header's first row, as before.
    const tops = await page
      .locator('.sva-bar > .sva-brand, .sva-tabs > *')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return Math.round(box.top + box.height / 2);
        })
      );
    expect(tops).toHaveLength(7);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
  });

  test('APP-PAGE-038: the browser tab’s title names the open view: a chart by the name on its chip, the RBQM tab, and the Data tab (#270)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(page).toHaveTitle('Histogram · safety.viz demo');
    await openChart(page, 'hep-explorer');
    await expect(page).toHaveTitle('Hepatic Explorer · safety.viz demo');
    await openChart(page, 'group-comparison');
    await expect(page).toHaveTitle('Group comparison · safety.viz demo');
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    await expect(page).toHaveTitle('RBQM · safety.viz demo');
    await item(page, 'data').click();
    await expect(page).toHaveTitle('Data · safety.viz demo');
    // An address followed without a reload changes it too.
    await page.evaluate(() => {
      window.location.hash = '#qt-explorer';
    });
    await expect(page).toHaveTitle('QT Explorer · safety.viz demo');
  });

  test('APP-PAGE-036: the welcome line is for the study the app opens on: it goes when another study or a reader’s own files are loaded, and a page that opens with no study has none (#269)', async ({
    page
  }) => {
    await openOnDemo(page);
    const welcome = page.locator('.sva-welcome');
    await expect(welcome).toBeVisible();
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('liver');
    await openChart(page, 'hep-explorer');
    await expect(welcome).toBeHidden();
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    await openChart(page, 'ae-explorer');
    await expect(welcome).toBeHidden();
  });
});

test.describe('demo app with a second chart library', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  async function openWithLibrary(page) {
    await page.goto('/tests/e2e/fixtures/basic-app-library.html');
    await page.waitForFunction(() => window.__safetyVizApp);
    await page.evaluate(`${APP}.ready`);
  }
  const standInLog = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__standInLog)));

  test('APP-LIB-015: on the demo study the library’s charts have their own tab with a status each, after the three domains, and the count includes them (#181)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openWithLibrary(page);
    await expect(page.locator('.sva-tab .sva-tab-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Stand-in charts'
    ]);
    await expect(tab(page, 'stand-in').locator('.sva-tab-count')).toHaveText('1 of 2');
    await expect(page.locator('.sva-count')).toHaveText(
      '14 of 15 charts supported by the loaded data'
    );
    await tab(page, 'stand-in').click();
    await expect(item(page, 'stand-in-strip').locator('.sva-tag')).toHaveText('ready');
    await expect(item(page, 'stand-in-absent').locator('.sva-tag')).toHaveText('not loaded');
    // The thirteen safety charts are listed as before, each ready.
    await expect(page.locator('.sva-group:not([data-group="stand-in"]) .sva-item')).toHaveCount(13);
    await expect(
      page.locator('.sva-group:not([data-group="stand-in"]) .sva-tag.sva-ready')
    ).toHaveCount(13);
    expect(errors).toEqual([]);
  });

  test('APP-LIB-016: its chart is mounted with its named tables built from the loaded files, an unmapped optional setting left out, and removed when a safety chart is opened (#181)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openWithLibrary(page);
    await tab(page, 'stand-in').click();
    await expect(item(page, 'stand-in-strip')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-chart .stand-in-strip')).toHaveAttribute(
      'data-tables',
      'results,participants'
    );
    const [init] = await standInLog(page);
    const counts = await page.evaluate(() => ({
      results: window.__safetyVizApp.state.files.bds.rows.length,
      participants: window.__safetyVizApp.state.files.subject.rows.length
    }));
    expect(init).toMatchObject({
      event: 'init',
      tables: ['results', 'participants'],
      rows: counts
    });
    // The demo labs file has no study day: day_col is unmapped, and left out, not null.
    expect(init.settings).toEqual({
      id_col: 'USUBJID',
      measure_col: 'TEST',
      value_col: 'STRESN',
      visit_col: 'VISIT',
      group_col: 'ARM'
    });
    // Back to a safety chart: the stand-in is destroyed and the histogram draws.
    await tab(page, 'bds').click();
    await item(page, 'histogram').click();
    await expect(page.locator('.stand-in-strip')).toHaveCount(0);
    expect((await standInLog(page)).at(-1)).toEqual({ event: 'destroy' });
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('APP-LIB-017: with the labs file alone its chart still draws, handed only the table it needs (#181)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openWithLibrary(page);
    await page.evaluate(async () => {
      const text = await fetch('/site/data/adbds.csv').then((response) => response.text());
      window.__safetyVizApp.loadFiles([{ name: 'adbds.csv', text }]);
      window.__safetyVizApp.select('stand-in-strip');
    });
    await expect(page.locator('.sva-chart .stand-in-strip')).toHaveAttribute(
      'data-tables',
      'results'
    );
    expect((await standInLog(page)).at(-1)).toMatchObject({ event: 'init', tables: ['results'] });
    // Its optional participant table's group setting has no file, so it is not passed either.
    expect((await standInLog(page)).at(-1).settings).not.toHaveProperty('group_col');
    expect(errors).toEqual([]);
  });

  test('APP-LIB-018: a chart whose factory the library does not have reads "not loaded" in words, and nothing throws (#181)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openWithLibrary(page);
    await tab(page, 'stand-in').click();
    await item(page, 'stand-in-absent').click();
    await expect(page.locator('.sva-message')).toHaveText(
      'The stand-in library on this page has no chart called absent, so this chart cannot be drawn.'
    );
    await expect(page.locator('.sva-chart')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('demo app data panel on a renamed-column study', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-LOAD-001: each chosen file is placed in its domain with its column count (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    for (const [domain, name, found] of [
      ['subject', 'dm.csv', '3 of 7 columns found'],
      ['ae', 'ae.csv', '9 of 10 columns found'],
      ['bds', 'labs_final.csv', '7 of 13 columns found'],
      ['eg', 'ecg.json', '9 of 10 columns found']
    ]) {
      await expect(card(page, domain).locator('.sva-file-name')).toHaveText(name);
      await expect(card(page, domain).locator('.sva-domain')).toHaveValue(domain);
      await expect(card(page, domain).locator('.sva-found')).toHaveText(found);
    }
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('Your 4 files');
  });

  test('APP-LOAD-002: the file that belongs to no domain is reported in one sentence that names it (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, [...STUDY, NO_DOMAIN]);
    await expect(page.locator('.sva-note')).toHaveText([
      'site_notes.csv was not placed in a domain: it matches at most 0 columns of any of them.'
    ]);
    await expect(page.locator('.sva-file.sva-unplaced .sva-file-name')).toHaveText(
      'site_notes.csv'
    );
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('Your 4 files');
  });

  test('APP-LOAD-003: before mapping, the chart list names what each unsupported chart is missing (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    // The biomarker charts read columns the renamed study's guesses already fill.
    await expect(page.locator('.sva-count')).toHaveText(
      '12 of 18 charts supported by the loaded data'
    );
    for (const [module, sentence] of [
      ['hep-explorer', 'Not mapped yet: Upper limit of normal, Total bilirubin.'],
      ['hep-waterfall', 'Not mapped yet: Upper limit of normal, Treatment arm.'],
      ['participant-profile', 'Not mapped yet: Upper limit of normal.'],
      ['qt-explorer', 'Not mapped yet: Treatment arm.'],
      ['ae-explorer', 'Not mapped yet: Treatment arm.'],
      ['time-to-event', 'Not mapped yet: End-of-study day.']
    ]) {
      await openChart(page, module);
      await expect(page.locator('.sva-message')).toHaveText(sentence);
      await expect(page.locator('.sva-chart')).toHaveCount(0);
    }
  });

  test('APP-LOAD-004: the mapping table labels each guess and prices each empty row in charts (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    const tag = (domain, kind, key) => mappingRow(page, domain, kind, key).locator('.sva-tag');
    await expect(tag('bds', 'column', 'SEX')).toHaveText('same name');
    await expect(tag('bds', 'column', 'USUBJID')).toHaveText('guessed');
    await expect(mappingRow(page, 'bds', 'column', 'USUBJID').locator('select')).toHaveValue(
      'SUBJID'
    );
    await expect(tag('bds', 'column', 'STNRHI')).toHaveText('needed by 3 charts');
    await expect(tag('bds', 'column', 'STRESU')).toHaveText('optional');
    await expect(tag('bds', 'measure', 'ALT')).toHaveText('guessed');
    await expect(tag('bds', 'measure', 'TB')).toHaveText('needed by 1 chart');
    await captureEvidence(page, 'APP-LOAD-004', 'mapping-table');
  });

  test('APP-LOAD-007: with the mapping corrected by hand, every chart the study supports draws (#151)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    await expect(mappingRow(page, 'bds', 'column', 'STNRHI').locator('.sva-tag')).toHaveText(
      'chosen'
    );
    for (const [module, entry] of destinations) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(
        page.locator('.sva-chart').locator('canvas:visible, table:visible').first()
      ).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    expect(errors).toEqual([]);
    await openChart(page, 'hep-explorer');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await captureEvidence(page, 'APP-LOAD-007', 'renamed-study-chart');
  });

  test('APP-LOAD-014: no network request leaves the page from the first file selection onward, unless the reader starts R: every chart and the RBQM tab are opened, and the footer names every address R is downloaded from (#151, #183, #235)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    await openEmpty(page);
    const requests = [];
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    await chooseFiles(page, [...STUDY, NO_DOMAIN]);
    await correct(page);
    for (const [module] of [...destinations, ...bioCharts]) await openChart(page, module);
    // The RBQM tab too: opened, it asks for nothing until Start R is pressed (#235).
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    await expect(page.locator('.sva-rbqm-status')).toBeVisible();
    await item(page, 'data').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-mapping"]').click();
    await download;
    await item(page, 'data').click();
    // blob: and data: URLs are the page talking to itself, not the network.
    expect(requests.filter((entry) => !/^GET (blob|data):/.test(entry))).toEqual([]);
    // And the footer says so, in these words (#196).
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(
      'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org and, for the RBQM tab, its packages from repo.r-wasm.org; your data stays in the browser, and R runs here.'
    );
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(HOSTED_PITCH);
  });

  test('APP-LOAD-008: the mapping downloads, and dropping it back with the files restores it (#151)', async ({
    page
  }, testInfo) => {
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    await correct(page);
    const before = await page.evaluate(`JSON.stringify(${APP}.state.mappings)`);
    const downloading = page.waitForEvent('download');
    await page.locator('[data-action="download-mapping"]').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('safety-viz-mapping.json');
    const saved = testInfo.outputPath('safety-viz-mapping.json');
    await download.saveAs(saved);
    const content = JSON.parse(readFileSync(saved, 'utf8'));
    expect(content.safetyVizMapping).toBe(1);
    expect(content.domains.bds).toMatchObject({
      file: 'labs_final.csv',
      columns: { STNRHI: 'ULN', ARM: 'TREATMENT' },
      measures: { TB: 'Tot. Bilirubin' }
    });

    // A fresh page: the files and the mapping file chosen together.
    await page.reload();
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 18 charts supported by the loaded data'
    );
    await page.locator('.sva-file-input').setInputFiles([...STUDY, saved]);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    const after = await page.evaluate(`JSON.stringify(${APP}.state.mappings)`);
    expect(JSON.parse(after)).toEqual(JSON.parse(before));
  });

  test('APP-LOAD-012: a file of another type is refused in a sentence that names it (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await page.locator('.sva-file-input').setInputFiles({
      name: 'labs.xpt',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('HEADER RECORD')
    });
    await expect(page.locator('.sva-note')).toHaveText([
      'labs.xpt is not a CSV or JSON file. SAS transport and sas7bdat files are not supported yet.'
    ]);
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 18 charts supported by the loaded data'
    );
  });

  test('APP-LOAD-015: files dropped on the drop zone load as chosen files do (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    const text = readFileSync('tests/e2e/fixtures/app/dm.csv', 'utf8');
    await page.evaluate((csv) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], 'dm.csv', { type: 'text/csv' }));
      document
        .querySelector('.sva-drop')
        .dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
    }, text);
    await expect(card(page, 'subject').locator('.sva-file-name')).toHaveText('dm.csv');
  });
});

// ---- the data view's sidebar (#159) ------------------------------------------
//
// On the data view only: the three steps as live status with their actions,
// the loaded files, Reset, and — where the page is served with them — the demo
// studies by name.

const step = (page, id) => page.locator(`.sva-step[data-step="${id}"]`);
const stepStatus = (page, id) => step(page, id).locator('.sva-step-status');
const sideAction = (page, name) => page.locator(`.sva-side [data-action="${name}"]`);

// The biomarker charts (#182, obot.roadmap#366): bio.viz's charts in the app,
// from its vendored bundle, handed in through the second-library seam. No R is
// on the page in this task, so each chart draws and its statistics line says
// statistics are unavailable. The sentence is bio.viz's own.
// Since R on request (#183) the hosted app hands the charts a connection that
// waits for the reader, so until R is started each line says statistics need
// R, in one short sentence that points at the control; the control's own
// sentence, on hover, says what starting R downloads (APP-R-006, #276).
// Since the copy of bio.viz was made again (#212, obot.roadmap#367) there are
// five: the cross-tabulation is listed, and the group comparison has three
// levels: trend tiles, one biomarker over time, and one visit.
const NO_R = 'Statistics need R. Start R, at the top right.';
const NEED_R_TITLE =
  'Statistics need R. Start R to compute them: about 13 MB, downloaded once from ' +
  'webr.r-wasm.org. The study’s data stays in this browser.';
// The R control, at the right end of the chart-name row (#276), and its parts.
const rControl = (page) => page.locator('.sva-charts > .sva-r');
const rChip = (page) => rControl(page).locator('.sva-chip.sva-r-ready');
const rPanel = (page) => page.locator('.sva-header .sva-r-panel');

// The pilot demo study's own rows, read here as the tests' side of every count
// the charts print. Neither file quotes a field.
const studyRows = (file) => {
  const [head, ...lines] = readFileSync(new URL(`../../site/data/${file}`, import.meta.url), 'utf8')
    .trim()
    .split(/\r?\n/);
  const keys = head.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  });
};
const results = studyRows('adbds.csv');
const participants = studyRows('adsl.csv');
const armOf = new Map(participants.map((row) => [row.USUBJID, row.ARM]));
const arms = [...new Set(participants.map((row) => row.ARM))].sort();
const measures = [...new Set(results.map((row) => row.TEST))];
// A visit named as unscheduled is left out of every level until the reader asks for it.
const unscheduled = (visit) => /unscheduled/i.test(visit);
const MEASURE = 'Alanine Aminotransferase';
const VISIT = 'Week 4';
// The measure's results that have a number, from participants the subject-level file has.
const drawn = results.filter(
  (row) =>
    row.TEST === MEASURE &&
    row.STRESN !== '' &&
    Number.isFinite(Number(row.STRESN)) &&
    armOf.has(row.USUBJID) &&
    !unscheduled(row.VISIT)
);
// Its scheduled visits, in visit order, and how many participants each arm has at each.
const visits = [...new Map(drawn.map((row) => [row.VISIT, Number(row.VISITNUM)]))]
  .sort(([, a], [, b]) => a - b)
  .map(([visit]) => visit);
const inArm = (visit, arm) =>
  new Set(
    drawn
      .filter((row) => row.VISIT === visit && armOf.get(row.USUBJID) === arm)
      .map((row) => row.USUBJID)
  ).size;

const controlOf = (page, label) =>
  page.locator('.sva-chart .sv-control', { has: page.locator(`label:text-is("${label}")`) });
const trail = (page) => page.locator('.sva-chart .bv-trail');
const tiles = (page) => page.locator('.sva-chart .bv-tile');
const testRow = (page) => page.locator('.sva-chart .bv-time-table tr[data-row="test"]');

test.describe('demo app with the biomarker charts', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  const statistics = (page) => page.locator('.sva-chart .bv-statistic');
  const sections = (page) => page.locator('.sva-chart .sv-section-title');

  test('APP-BIO-004: on the demo study the five biomarker charts have a tab of their own after the three domains, each ready, and the count includes them (#182, #212)', async ({
    page
  }) => {
    await openOnDemo(page);
    expect(bioCharts.map(([module]) => module)).toEqual([
      'group-comparison',
      'association-scatter',
      'correlation-matrix',
      'biomarker-screen',
      'cross-tab'
    ]);
    await expect(tab(page, 'biomarkers').locator('.sva-tab-title')).toHaveText('Biomarkers');
    await expect(tab(page, 'biomarkers').locator('.sva-tab-count')).toHaveText('5');
    await expect(tab(page, 'biomarkers')).toHaveClass(/sva-library-group/);
    // The last of the domains' tabs: the RBQM tab, a view of its own, follows it (#235).
    await expect(page.locator('.sva-tab[data-domain]').last()).toHaveAttribute(
      'data-domain',
      'biomarkers'
    );
    await tab(page, 'biomarkers').click();
    for (const [module, entry] of bioCharts) {
      await expect(item(page, module).locator('.sva-item-title')).toHaveText(entry.title);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
  });

  for (const [module, entry] of bioCharts) {
    test(`APP-BIO-005: ${entry.title} draws on the demo study with no console error, and ${
      module === 'group-comparison'
        ? 'opens on trend tiles that print no test; with a biomarker chosen, its line says statistics need R until R is started'
        : 'its statistics line says statistics need R until R is started'
    } (#182, #183${module === 'group-comparison' || module === 'cross-tab' ? ', #212' : ''})`, async ({
      page
    }) => {
      const errors = watchErrors(page);
      await openOnDemo(page);
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      // Drawn with safety.viz's kit, as the safety charts are.
      await expect(page.locator('.sva-chart .sv-root .sv-sidebar')).toBeVisible();
      if (module === 'group-comparison') {
        // It opens on its trend tiles: every biomarker, by arm. The tiles ask R
        // for nothing, so no test is printed.
        await expect(tiles(page).first()).toBeVisible();
        expect(
          (await statistics(page).allTextContents()).every((text) => text === ''),
          'the tiles print a statistics line'
        ).toBe(true);
        await expect(controlOf(page, 'Group by').locator('select')).toHaveValue('ARM');
        // One biomarker open, across the visits: its line says statistics need R.
        await controlOf(page, 'Biomarker').locator('select').selectOption({ index: 1 });
        await expect(statistics(page).filter({ hasText: NO_R }).first()).toBeVisible();
        for (const text of await statistics(page).allTextContents()) {
          expect(text === '' || text === NO_R || text.startsWith('Statistics: no test')).toBe(true);
        }
      } else {
        await expect(statistics(page)).toHaveText(NO_R);
      }
      expect(errors).toEqual([]);
    });
  }

  test('APP-BIO-015: the group comparison opens on trend tiles: one for each biomarker of the study, in the Biomarker control’s order, each a button named for its biomarker and drawing a line per arm across the scheduled visits; no test is printed and nothing is asked of R (#212)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await expect(tiles(page)).toHaveCount(measures.length);
    // No level is open, so nothing leads back from here.
    await expect(trail(page)).toHaveCount(0);
    const options = await controlOf(page, 'Biomarker').locator('option').allTextContents();
    expect(options[0]).toBe('All Biomarkers');
    expect(options.slice(1).sort()).toEqual([...measures].sort());
    await expect(page.locator('.sva-chart .bv-tile-name')).toHaveText(options.slice(1));
    // One key for every tile: the arms of the subject-level file.
    await expect(page.locator('.sva-chart .bv-tile-key [data-group]')).toHaveText(arms);
    const tile = page.locator(`.sva-chart .bv-tile[data-measure="${MEASURE}"]`);
    await expect(tile).toHaveAttribute('aria-label', `View ${MEASURE}`);
    // The tile's picture names each arm, and no visit named as unscheduled.
    const picture = await tile.locator('canvas').getAttribute('aria-label');
    for (const arm of arms) expect(picture).toContain(arm);
    for (const visit of visits) expect(picture).toContain(visit);
    expect(picture).not.toMatch(/unscheduled/i);
    const hidden = new Set(results.map((row) => row.VISIT).filter(unscheduled)).size;
    expect(hidden).toBeGreaterThan(0);
    await expect(page.locator('.sva-chart .bv-hidden-visits')).toContainText(
      `${hidden} unscheduled visits not drawn`
    );
    // No statistic: no line, no connection to R, and nothing fetched for one.
    expect((await statistics(page).allTextContents()).every((text) => text === '')).toBe(true);
    await expect(page.locator('.sva-chart .bv-foot')).toContainText('No statistic was asked of R.');
    expect(await page.evaluate(() => window.__rConnections)).toBe(0);
    expect(requests.filter((url) => /webr\.r-wasm\.org|statistics\.R/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
    await captureEvidence(page.locator('.sva-chart .bv-tiles'), 'APP-BIO-015', 'trend-tiles');
  });

  test('APP-BIO-016: a tile opens its biomarker over time: the scheduled visits along the bottom, the arms side by side, and under each visit the number in each arm, which is the study’s rows counted; the row for R’s test says statistics need R (#212)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await page.locator(`.sva-chart .bv-tile[data-measure="${MEASURE}"]`).click();
    await expect(trail(page)).toHaveAttribute('data-level', 'over-time');
    await expect(trail(page).locator('[aria-current]')).toHaveText(`${MEASURE} over time`);
    await expect(controlOf(page, 'Biomarker').locator('select')).toHaveValue(MEASURE);
    await expect(page.locator('.sva-chart .bv-time canvas:visible').first()).toBeVisible();
    // The visits are the study's scheduled visits that have this biomarker, in order.
    expect(visits.length).toBeGreaterThan(1);
    await expect(page.locator('.sva-chart .bv-time-visit')).toHaveText(visits);
    // Under each visit, the number in each arm.
    const table = page.locator('.sva-chart .bv-time-table');
    await expect(table.locator('tr[data-row="n"]')).toHaveCount(arms.length);
    for (const arm of arms) {
      await expect(
        table.locator(`tr[data-row="n"][data-group="${arm}"] td[data-visit]`),
        arm
      ).toHaveText(visits.map((visit) => `n = ${inArm(visit, arm)}`));
    }
    // The row for R's test is there, and says why it is empty.
    await expect(testRow(page)).toHaveAttribute('data-state', 'unavailable');
    await expect(testRow(page)).toContainText('Statistics unavailable');
    await expect(statistics(page).filter({ hasText: NO_R })).toHaveCount(1);
    expect(await page.evaluate(() => window.__rConnections)).toBe(0);
    expect(errors).toEqual([]);
    await captureEvidence(page.locator('.sva-chart .bv-time'), 'APP-BIO-016', 'over-time');
  });

  test('APP-BIO-017: a visit under the picture opens that visit alone, with the single-visit view’s own controls and the study’s counts, and the trail leads back to the picture over time and to the tiles (#212)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await page.locator(`.sva-chart .bv-tile[data-measure="${MEASURE}"]`).click();
    await page.locator(`.sva-chart .bv-time-visit[data-visit="${VISIT}"]`).click();
    await expect(trail(page)).toHaveAttribute('data-level', 'visits');
    await expect(trail(page).locator('[aria-current]')).toHaveText(VISIT);
    await expect(controlOf(page, 'Visit').locator('summary')).toHaveText(`1 of ${visits.length}`);
    // The view the chart has always drawn for one visit: its test menu and its
    // pairwise comparisons are offered here, and its picture names each arm's number.
    await expect(sections(page)).toContainText(['Statistics']);
    await expect(controlOf(page, 'Test').locator('select')).toBeVisible();
    await expect(page.locator('.sva-chart canvas:visible').first()).toHaveAttribute(
      'aria-label',
      new RegExp(`${arms.map((arm) => `${arm} n = ${inArm(VISIT, arm)}`).join('; ')}$`)
    );
    await expect(statistics(page).filter({ hasText: NO_R })).toHaveCount(1);
    // Back to the picture over time, and from there to the tiles.
    await trail(page)
      .getByRole('button', { name: `${MEASURE} over time` })
      .click();
    await expect(trail(page)).toHaveAttribute('data-level', 'over-time');
    await expect(page.locator('.sva-chart .bv-time-visit')).toHaveText(visits);
    await trail(page).getByRole('button', { name: 'All biomarkers' }).click();
    await expect(tiles(page)).toHaveCount(measures.length);
    await expect(controlOf(page, 'Biomarker').locator('option:checked')).toHaveText(
      'All Biomarkers'
    );
    expect(errors).toEqual([]);
  });

  test('APP-BIO-018: the cross-tabulation is listed with the biomarker charts and draws a two-way table of two columns of the study, where every count, every total and every percentage of its row is the study’s rows counted; choosing another column draws that table (#212)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await tab(page, 'biomarkers').click();
    await expect(item(page, 'cross-tab').locator('.sva-item-title')).toHaveText('Cross-tabulation');
    await item(page, 'cross-tab').click();
    await expect(page.locator('.sva-title')).toHaveText('Cross-tabulation');
    const table = page.locator('.sva-chart table.bv-crosstab');
    await expect(table).toBeVisible();
    // The two columns it opens on are columns of the subject-level file.
    const rowCol = await controlOf(page, 'Rows').locator('select').inputValue();
    const colCol = await controlOf(page, 'Columns').locator('select').inputValue();
    expect(rowCol).not.toBe(colCol);
    for (const column of [rowCol, colCol]) expect(Object.keys(participants[0])).toContain(column);
    await expect(table.locator('caption')).toHaveText(`${rowCol} by ${colCol}`);
    // The participants in the table: those of the subject-level file who have results.
    const withResults = new Set(results.map((row) => row.USUBJID));
    const tabled = participants.filter((row) => withResults.has(row.USUBJID));
    const levels = (column) => [...new Set(tabled.map((row) => row[column]))].sort();
    const count = (where) =>
      tabled.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
        .length;
    await expect(table.locator('thead th[scope="col"]')).toHaveText([
      `${rowCol} \\ ${colCol}`,
      ...levels(colCol),
      'Total'
    ]);
    await expect(table.locator('tbody th[scope="row"]')).toHaveText(levels(rowCol));
    for (const row of levels(rowCol)) {
      const total = count({ [rowCol]: row });
      for (const col of levels(colCol)) {
        const n = count({ [rowCol]: row, [colCol]: col });
        const cell = table.locator(`button[data-row="${row}"][data-col="${col}"]`);
        // The count, then its share of the row.
        await expect(cell, `${row}, ${col}`).toHaveText(`${n}${((100 * n) / total).toFixed(1)}%`);
      }
      await expect(
        table
          .locator('tbody tr', { has: page.locator(`th:text-is("${row}")`) })
          .locator('td.bv-total')
      ).toHaveText(String(total));
    }
    await expect(table.locator('tfoot td')).toHaveText([
      ...levels(colCol).map((col) => String(count({ [colCol]: col }))),
      String(tabled.length)
    ]);
    await expect(page.locator('.sva-chart .sv-notes')).toContainText(
      `${tabled.length} of ${withResults.size} participants in the table.`
    );
    // The same table again as bars, and R's test not yet asked for.
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await expect(statistics(page)).toHaveText(NO_R);
    await captureEvidence(
      page.locator('.sva-chart .bv-crosstab-wrap'),
      'APP-BIO-018',
      'cross-tabulation'
    );
    // Another column: the table is of that column, and still of everyone in it.
    const other = (
      await controlOf(page, 'Columns')
        .locator('option')
        .evaluateAll((list) => list.map((option) => option.value))
    ).find((value) => value !== rowCol && value !== colCol);
    await controlOf(page, 'Columns').locator('select').selectOption(other);
    await expect(table.locator('caption')).toHaveText(`${rowCol} by ${other}`);
    const cells = await table
      .locator('button[data-row][data-col]')
      .evaluateAll((list) => list.map((button) => Number(button.firstChild.textContent)));
    expect(cells.reduce((sum, n) => sum + n, 0)).toBe(
      Number(await table.locator('tfoot td').last().textContent())
    );
    expect(errors).toEqual([]);
  });

  test('APP-BIO-006: with the labs and vitals file alone every biomarker chart draws, with no filters (#182)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await openOnDemo(page);
    // On the demo study the participant file gives the group comparison its filters.
    await openChart(page, 'group-comparison');
    await expect(sections(page)).toContainText(['Filters']);
    await page.evaluate(async () => {
      const text = await fetch('/site/data/adbds.csv').then((response) => response.text());
      window.__safetyVizApp.loadFiles([{ name: 'adbds.csv', text }]);
    });
    for (const [module, entry] of bioCharts) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(sections(page).first()).toBeVisible();
      expect(await sections(page).allTextContents()).not.toContain('Filters');
    }
    expect(errors).toEqual([]);
  });

  test('APP-BIO-007: on the study with renamed columns, the one mapping readies both libraries’ charts, and each biomarker chart draws (#182)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    for (const [module, entry] of bioCharts) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
    }
    // The group comparison reads the renamed files through the same mapping:
    // its tiles are the labs file's own measures, and one opens over time.
    await openChart(page, 'group-comparison');
    const options = await controlOf(page, 'Biomarker').locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await expect(tiles(page)).toHaveCount(options.length - 1);
    await tiles(page).first().click();
    await expect(trail(page)).toHaveAttribute('data-level', 'over-time');
    await expect(page.locator('.sva-chart .bv-time-visit').first()).toBeVisible();
    // The cross-tabulation's columns are the subject-level file's own names.
    await openChart(page, 'cross-tab');
    await expect(page.locator('.sva-chart table.bv-crosstab caption')).toHaveText(
      /^(TREATMENT|STATUS|SEX|RACE|CENTRE) by (TREATMENT|STATUS|SEX|RACE|CENTRE)$/
    );
    expect(errors).toEqual([]);
  });

  test('APP-BIO-008: at phone width, with the Biomarkers tab open, no biomarker chart and no level of the group comparison scrolls the page sideways (#182, #212)', async ({
    page
  }) => {
    test.setTimeout(MANY_CHARTS);
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await tab(page, 'biomarkers').scrollIntoViewIfNeeded();
    await tab(page, 'biomarkers').click();
    await expect(page.locator('.sva-title')).toHaveText(bioCharts[0][1].title);
    await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
    expect(await overflow(), 'the trend tiles scroll the page sideways').toBeLessThanOrEqual(0);
    // One biomarker over time, then one visit of it.
    await page.locator(`.sva-chart .bv-tile[data-measure="${MEASURE}"]`).click();
    await expect(page.locator('.sva-chart .bv-time-table')).toBeVisible();
    expect(await overflow(), 'the picture over time scrolls the page sideways').toBeLessThanOrEqual(
      0
    );
    await page.locator(`.sva-chart .bv-time-visit[data-visit="${VISIT}"]`).click();
    await expect(trail(page)).toHaveAttribute('data-level', 'visits');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    expect(await overflow(), 'one visit scrolls the page sideways').toBeLessThanOrEqual(0);
    for (const [module] of bioCharts.slice(1)) {
      await item(page, module).scrollIntoViewIfNeeded();
      await item(page, module).click();
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      expect(await overflow(), `${module} scrolls the page sideways`).toBeLessThanOrEqual(0);
    }
  });
});

// R on request (#183, obot.roadmap#366; @jwildfire, 2026-10-02: "R on
// request"). The biomarker tab has one control that starts R in the browser,
// with bio.viz's own connection and the vendored gsm.bio statistics file.
// Before it is pressed nothing is fetched; after, one R answers every chart.
// The comparison with desktop R reads tests/fixtures/app-statistics/, written
// from the app by scripts/derive-app-statistics.mjs and scripts/app-statistics.R:
// one walk through the biomarker charts (scripts/app-statistics-lib.mjs), played
// there against a stand-in that records what is asked and here against real R.
const R_HOST = /webr\.r-wasm\.org|statistics\.R/;
const NEED_R = NO_R;
const R_DOWNLOAD_FAILED =
  'The browser could not download R from webr.r-wasm.org. Check the connection, or whether ' +
  'this network blocks that address, and try again. The charts still draw; only the ' +
  'statistics are missing.';
const expectedStatistics = JSON.parse(
  readFileSync(new URL('./../fixtures/app-statistics/expected.json', import.meta.url), 'utf8')
);
const answersOf = (step) => expectedStatistics.answers.filter((answer) => answer.step === step);
const biomarkerControl = (page) =>
  page
    .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
    .locator('select');
const settled = (page, timeout = 100000) =>
  page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.sva-chart .bv-statistic')].some((line) =>
        /waiting/.test(line.textContent)
      ) && !document.querySelector('.sva-chart [data-row="test"][data-state="waiting"]'),
    null,
    { timeout }
  );
// Requests to R's hosts, and the imports of webR itself, which is what starting R costs.
const rRequests = (requests) => requests.filter((url) => R_HOST.test(url));
const webrImports = (requests) => requests.filter((url) => /webr\.mjs$/.test(url));
// A p-value as the charts print it.
const printedP = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

// Two answers agree when every number is the same to twelve significant figures
// and everything else is the same.
function same(actual, expected, where = 'value') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const scale = Math.max(Math.abs(expected), Number.MIN_VALUE);
    expect(
      Math.abs(actual - expected) / scale,
      `${where}: ${actual} against ${expected}`
    ).toBeLessThan(1e-12);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${where} is not a list`).toBe(true);
    expect(actual.length, `${where}: length`).toBe(expected.length);
    expected.forEach((item, index) => same(actual[index], item, `${where}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual || {}).sort(), `${where}: keys`).toEqual(
      Object.keys(expected).sort()
    );
    for (const key of Object.keys(expected)) same(actual[key], expected[key], `${where}.${key}`);
    return;
  }
  expect(actual, where).toEqual(expected);
}

test.describe('demo app with R on request', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-R-006: before the control is pressed, no chart of either library asks R’s hosts for anything, and each biomarker chart’s statistics line says statistics need R and what that downloads (#183)', async ({
    page
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await openOnDemo(page);
    for (const [module] of [...destinations, ...bioCharts]) {
      await openChart(page, module);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      if (!bioManifest.modules[module]) continue;
      if (module === 'group-comparison') await biomarkerControl(page).selectOption({ index: 1 });
      await settled(page, 20000);
      await expect(
        page.locator('.sva-chart .bv-statistic').filter({ hasText: NEED_R }).first()
      ).toBeVisible();
    }
    await tab(page, 'biomarkers').click();
    await expect(rControl(page)).toHaveAttribute('data-phase', 'off');
    await expect(rControl(page).locator('.sva-r-say')).toHaveText('Statistics need R');
    await expect(page.locator('.sva-action')).toHaveText('Start R');
    await expect(page.locator('.sva-action')).toHaveAttribute('title', NEED_R_TITLE);
    expect(requests.filter((url) => R_HOST.test(url))).toEqual([]);
    expect(await page.evaluate(() => window.__rConnections)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('APP-R-007: pressing the control starts R once, about 13 MB from webr.r-wasm.org; a trend tile then opens its biomarker over time with R’s p-value under each visit, a visit opens with R’s test of it, and the cross-tabulation prints R’s test of its table; every answer real webR gives equals desktop R’s on the same rows (#183, #212)', async ({
    page,
    context
  }) => {
    test.setTimeout(300000);
    const errors = watchErrors(page);
    let transferred = 0;
    context.on('requestfinished', async (request) => {
      if (/webr\.r-wasm\.org/.test(request.url()))
        transferred += (await request.sizes()).responseBodySize;
    });
    await openOnDemo(page);
    await tab(page, 'biomarkers').click();
    await expect(rControl(page).locator('.sva-r-meta')).toHaveText('13 MB, once');
    // Pressed on the trend tiles, which ask R for nothing: R starts all the
    // same, and the control says so, then that it is running.
    await openAndStartR(page);
    await expect(rControl(page)).toHaveAttribute('data-phase', /starting|ready/);
    await expect(rChip(page)).toHaveText('R ready▾', { timeout: 150000 });
    // A chip, and no button: no greyed "R started" pill is left in the row.
    await expect(page.locator('.sva-action')).toHaveCount(0);
    expect(transferred).toBeGreaterThan(10e6);
    expect(await page.evaluate(() => window.__rAnswers)).toEqual([]);
    // The walk the requests were recorded on, now with real R. What each step
    // prints is R's answer, as desktop R gave it.
    const steps = SCENARIO;
    expect(expectedStatistics.steps.map((step) => step.id)).toEqual(steps.map((step) => step.id));
    const printed = {
      'over-time': async () => {
        const [{ value }] = answersOf('over-time');
        await expect(testRow(page)).toHaveAttribute('data-state', 'shown');
        await expect(testRow(page).locator('td[data-visit]')).toHaveText(
          value.rows.map((row) => printedP(row.p_value))
        );
        expect(value.rows.map((row) => row.by)).toEqual(visits);
        // R's counts at each visit are the numbers the table prints above them.
        for (const row of value.rows) {
          expect([row.n_1, row.n_2, row.n_3]).toEqual(
            [row.group_1, row.group_2, row.group_3].map((arm) => inArm(row.by, arm))
          );
        }
        await expect(page.locator('.sva-chart .bv-statistic').last()).toContainText(
          `${value.method} at each visit`
        );
      },
      'one-visit': async () => {
        const [{ value }] = answersOf('one-visit');
        const counts = Object.entries(value.counts)
          .map(([group, n]) => `${group} n = ${n}`)
          .join(', ');
        await expect(page.locator('.sva-chart .bv-statistic').last()).toContainText(
          `${value.method}: ${printedP(value.p_value)} (${counts})`
        );
      },
      'cross-tab': async () => {
        const [{ value }] = answersOf('cross-tab');
        await expect(page.locator('.sva-chart .bv-statistic')).toContainText(
          `${value.method}: ${printedP(value.p_value)} (n = ${value.counts})`
        );
      }
    };
    const ranges = await playScenario(page, {
      log: '__rAnswers',
      steps,
      counts: Object.fromEntries(steps.map((step) => [step.id, answersOf(step.id).length])),
      afterStep: (step) => printed[step.id]()
    });
    expect(await page.evaluate(() => window.__rConnections)).toBe(1);
    const answers = await page.evaluate(() => window.__rAnswers);
    expect(answers).toHaveLength(expectedStatistics.answers.length);
    for (const { id, from, to } of ranges) {
      const expected = answersOf(id);
      expect(expected.length, `desktop R has no answer for the step ${id}`).toBeGreaterThan(0);
      expect(to - from, `${id}: answers`).toBe(expected.length);
      answers.slice(from, to).forEach((answer, index) => {
        expect(answer.name).toBe(expected[index].name);
        expect(answer.args).toEqual(expected[index].args);
        expect(answer.rows).toBe(expected[index].rows);
        expect(answer.answer.status).toBe('ok');
        expect(answer.answer.form).toBe('browser');
        expect(expected[index].value.status, `${id}: desktop R’s status`).toBe('ok');
        same(answer.answer.value, expected[index].value, `${id}, answer ${index}`);
      });
    }
    // About 13 MB, as the statistics line and the control say.
    expect(transferred).toBeGreaterThan(10e6);
    expect(transferred).toBeLessThan(16e6);
    expect(errors).toEqual([]);
  });

  test('APP-R-017: pressing the control with a biomarker chosen keeps it: the open chart is not drawn again, and the row under its visits fills with R’s test for that biomarker (#183, #212)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    const [{ value }] = answersOf('over-time');
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await settled(page, 20000);
    await expect(testRow(page)).toHaveAttribute('data-state', 'unavailable');
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: NEED_R }).first()
    ).toBeVisible();
    // The picture is marked, so a second drawing of it would show.
    await page.evaluate(() => {
      document.querySelector('.sva-chart .sv-root').dataset.kept = 'yes';
    });
    await page.locator('.sva-action').click();
    await expect(testRow(page)).toHaveAttribute('data-state', 'shown', { timeout: 150000 });
    await settled(page);
    // Still the biomarker the reader chose, with R's answers under its visits.
    await expect(biomarkerControl(page)).toHaveValue(expectedStatistics.measure);
    await expect(trail(page)).toHaveAttribute('data-level', 'over-time');
    await expect(page.locator('.sva-chart .sv-root')).toHaveAttribute('data-kept', 'yes');
    await expect(testRow(page).locator('td[data-visit]')).toHaveText(
      value.rows.map((row) => printedP(row.p_value))
    );
    await expect(page.locator('.sva-chart .bv-statistic').filter({ hasText: NEED_R })).toHaveCount(
      0
    );
    expect(errors).toEqual([]);
  });

  test('APP-R-021: the chart open when R is started stops saying R is starting once R has started: no statistics line it prints afterwards carries the starting note (#193)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await page.locator('.sva-action').click();
    await expect(rChip(page)).toBeVisible({ timeout: 150000 });
    // Every statistics line the open chart prints from here on is recorded.
    await page.evaluate(() => {
      window.__lines = [];
      const record = () => {
        for (const line of document.querySelectorAll(
          '.sva-chart .bv-statistic, .sva-chart [data-row="test"]'
        )) {
          window.__lines.push(line.textContent);
        }
      };
      new MutationObserver(record).observe(document.querySelector('.sva-content'), {
        subtree: true,
        childList: true,
        characterData: true
      });
    });
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await expect(testRow(page)).toHaveAttribute('data-state', 'shown', { timeout: 150000 });
    await settled(page);
    const lines = await page.evaluate(() => window.__lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => /R is starting/.test(line))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-R-026: the cross-tabulation says statistics need R until R is started, then prints R’s chi-square test of the table drawn; choosing Fisher’s exact test asks R again and prints that (#212)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await openOnDemo(page);
    await openChart(page, 'cross-tab');
    const line = page.locator('.sva-chart .bv-statistic');
    await expect(line).toHaveText(NEED_R);
    const total = Number(
      await page.locator('.sva-chart table.bv-crosstab tfoot td').last().textContent()
    );
    await page.locator('.sva-action').click();
    await expect(line).toContainText("Pearson's Chi-squared test: p ", { timeout: 150000 });
    await expect(line).toContainText(`(n = ${total})`);
    // What is printed is what R answered, for the rows of the table drawn.
    const asked = async (method) =>
      (await page.evaluate(() => window.__rAnswers))
        .filter((answer) => answer.name === 'Analyze_Contingency')
        .filter((answer) => answer.args.strMethod === method)
        .pop();
    const chisq = await asked('chisq');
    expect(chisq.rows).toBe(total);
    expect(chisq.answer.status).toBe('ok');
    expect(chisq.answer.value.status).toBe('ok');
    expect(chisq.answer.value.counts).toBe(total);
    await expect(line).toContainText(printedP(chisq.answer.value.p_value));
    // The counts R tabulated are the counts in the table.
    const drawnCells = await page
      .locator('.sva-chart table.bv-crosstab button[data-row][data-col]')
      .evaluateAll((list) =>
        list.map((button) => ({
          row: button.dataset.row,
          col: button.dataset.col,
          n: Number(button.firstChild.textContent)
        }))
      );
    const byCell = (a, b) => `${a.row}|${a.col}`.localeCompare(`${b.row}|${b.col}`);
    expect([...drawnCells].sort(byCell)).toEqual(
      chisq.answer.value.rows.map(({ row, col, n }) => ({ row, col, n })).sort(byCell)
    );
    await page
      .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Test")') })
      .locator('select')
      .selectOption({ label: "Fisher's exact test" });
    await expect(line).toContainText('Fisher', { timeout: 60000 });
    await settled(page);
    const fisher = await asked('fisher');
    expect(fisher.answer.value.status).toBe('ok');
    await expect(line).toContainText(
      `${fisher.answer.value.method}: ${printedP(fisher.answer.value.p_value)}`
    );
    expect(await page.evaluate(() => window.__rConnections)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('APP-LOAD-026: loading a study and starting R send nothing beyond what R and its statistics file need: from the first file chosen until five quiet seconds after the last action, every request the page and its workers make is a GET or HEAD with no body, no query and no header the browser did not set itself, for the statistics file on the page’s own host or for one of the files webR asks for on webr.r-wasm.org; no address names a participant, and neither the page nor its workers open a socket (#196)', async ({
    page,
    context
  }) => {
    test.setTimeout(240000);
    // Tightened after the v1.9.1 release-candidate review (#210): a custom
    // header to the page's own host, a worker's fetch of an unlisted path on
    // webr.r-wasm.org, and a request sent after the last action each passed the
    // earlier version. Each was put into src/app/ and fails this one, as do a
    // WebSocket opened by the page and one opened by a worker. The RBQM tab's
    // walk is held the same way, to its three addresses, by APP-RBQM-030.
    const errors = watchErrors(page);
    const watch = watchRequests(page, context);
    const { requests, sockets } = watch;
    await openEmpty(page);
    const own = new URL(page.url()).origin;
    watch.chosen = true;
    await chooseFiles(page, STUDY);
    await correct(page);
    await openChart(page, 'group-comparison');
    await page.locator('.sva-action').click();
    await expect(rChip(page)).toBeVisible({ timeout: 150000 });
    await biomarkerControl(page).selectOption({ index: 1 });
    // The biomarker opens across its visits, and R's p-value is under each (#212).
    await expect(
      testRow(page)
        .locator('td[data-visit]')
        .filter({ hasText: /p [=<] / })
        .first()
    ).toBeVisible({
      timeout: 150000
    });
    // That was the last action.
    await watch.quiet();
    // R was asked for, and answered, in this browser.
    expect(requests.some((request) => /webr\.r-wasm\.org/.test(request.url))).toBe(true);
    const after = watch.onlyReads(own);
    // Only two places, and only the files each is asked for: the page's own
    // host for the statistics file R is given, and R's public host for the
    // files webR fetches as it starts (one version, and nothing else).
    const ownAsked = after.filter((request) => new URL(request.url).origin === own);
    expect([...new Set(ownAsked.map((request) => new URL(request.url).pathname))]).toEqual([
      '/site/vendor/gsm.bio/statistics.R'
    ]);
    const webrAsked = after.filter(
      (request) => new URL(request.url).origin === 'https://webr.r-wasm.org'
    );
    const versions = new Set(
      webrAsked.map((request) => new URL(request.url).pathname.split('/')[1])
    );
    expect(versions.size).toBe(1);
    const [version] = versions;
    expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    const webrFiles = [
      ...new Set(
        webrAsked.map(
          (request) =>
            `${request.method} ${new URL(request.url).pathname.slice(version.length + 2)}`
        )
      )
    ].sort();
    expect(webrFiles).toEqual([
      'GET R.js',
      'GET R.wasm',
      'GET libRblas.so',
      'GET libRlapack.so',
      'GET webr-worker.js',
      'GET webr.mjs',
      'HEAD vfs/usr/lib/R/library/translations/DESCRIPTION'
    ]);
    expect(
      after.filter(
        (request) => ![own, 'https://webr.r-wasm.org'].includes(new URL(request.url).origin)
      )
    ).toEqual([]);
    // No address names a participant of the study, written with or without its hyphens.
    const subjects = readFileSync(new URL('./fixtures/app/dm.csv', import.meta.url), 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split(',')[0]);
    expect(subjects.length).toBeGreaterThan(10);
    const named = after.filter((request) => {
      const url = decodeURIComponent(request.url);
      return subjects.some((id) => url.includes(id) || url.includes(id.replace(/-/g, '')));
    });
    expect(named).toEqual([]);
    expect(sockets).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-R-018: when R’s host cannot be reached, the control says R did not start and offers to try again, and charts opened afterwards do not try to start R each time (#183)', async ({
    page,
    context
  }) => {
    test.setTimeout(120000);
    await context.route(/webr\.r-wasm\.org/, (route) => route.abort());
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await openOnDemo(page);
    await openChart(page, 'group-comparison');
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await page.locator('.sva-action').click();
    const action = page.locator('.sva-action');
    await expect(action).toHaveText('Try again', { timeout: 60000 });
    await expect(action).toBeEnabled();
    // The failure state every tab that starts R shows (#277): the words, in
    // the alarm colour, Try again beside them, and no raw error in that line.
    await expect(rControl(page)).toHaveAttribute('data-phase', 'failed');
    await expect(rControl(page).locator('.sva-r-row')).toHaveText('R did not startTry againWhy▾');
    await expect(rControl(page).locator('.sva-r-say')).toHaveCSS('color', 'rgb(162, 66, 58)');
    // The reason is one click away, and what the browser said is behind a
    // disclosure inside it.
    await expect(rPanel(page)).toHaveCount(0);
    await rControl(page).locator('.sva-r-why').click();
    await expect(rPanel(page).locator('.sva-r-heading')).toHaveText('R did not start');
    await expect(rPanel(page).locator(':scope > .sva-r-text')).toHaveText(R_DOWNLOAD_FAILED);
    await expect(rPanel(page).locator('.sva-r-more summary')).toHaveText('What the browser said');
    await expect(rPanel(page).locator('.sva-r-more .sva-r-text')).toBeHidden();
    await rPanel(page).locator('.sva-r-more summary').click();
    await expect(rPanel(page).locator('.sva-r-more .sva-r-text')).toHaveText(
      /^The browser said: .*webr\.r-wasm\.org.*\.$/
    );
    await captureEvidence(page.locator('.sva-header'), 'APP-R-018', 'r-did-not-start');
    await page.keyboard.press('Escape');
    await expect(rPanel(page)).toHaveCount(0);
    await settled(page, 30000);
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: 'R did not start' }).first()
    ).toBeVisible();
    const fetched = rRequests(requests).length;
    for (const module of [
      'association-scatter',
      'correlation-matrix',
      'cross-tab',
      'biomarker-screen'
    ]) {
      await item(page, module).click();
      await settled(page, 30000);
      await expect(page.locator('.sva-chart .bv-statistic').first()).toContainText(
        'R did not start'
      );
    }
    expect(rRequests(requests)).toHaveLength(fetched);
  });

  test('APP-R-019: when the statistics file cannot be read, R is not started again for each chart opened afterwards, and trying again starts it once (#183)', async ({
    page,
    context
  }) => {
    test.setTimeout(240000);
    await context.route(/statistics\.R/, (route) =>
      route.fulfill({ status: 404, body: 'not here' })
    );
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await openOnDemo(page);
    await openChart(page, 'association-scatter');
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-action')).toHaveText('Try again', { timeout: 150000 });
    await settled(page, 30000);
    await expect(page.locator('.sva-chart .bv-statistic')).toContainText('R did not start');
    const first = { all: rRequests(requests).length, webr: webrImports(requests).length };
    expect(first.webr).toBe(1);
    for (const module of [
      'correlation-matrix',
      'cross-tab',
      'group-comparison',
      'biomarker-screen'
    ]) {
      await item(page, module).click();
      await settled(page, 30000);
    }
    expect(rRequests(requests)).toHaveLength(first.all);
    // Trying again makes one fresh start: the statistics file is asked for once more.
    await page.locator('.sva-action').click();
    await expect(rControl(page)).toHaveAttribute('data-phase', 'failed', { timeout: 150000 });
    await expect
      .poll(() => requests.filter((url) => /statistics\.R/.test(url)).length, { timeout: 150000 })
      .toBe(2);
    await expect(page.locator('.sva-action')).toHaveText('Try again', { timeout: 150000 });
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-R-051: the R control is at the right end of the chart-name row, outside the names that scroll; before a press it reads its reason, its cost and Start R; a press shows a spinner and a count of seconds, then a chip saying R is ready, and the chip opens R’s version, how long it took, the download and where R runs (#276)', { tag: '@real-r' }, async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openOnDemo(page);
    await openChart(page, 'cross-tab');
    const control = rControl(page);
    // In the row, after the names, and not among them: it does not scroll with them.
    await expect(page.locator('.sva-group .sva-r')).toHaveCount(0);
    const boxes = async () => {
      const [row, names, own] = await Promise.all(
        ['.sva-charts', '.sva-group:not([hidden])', '.sva-charts > .sva-r'].map((selector) =>
          page.locator(selector).boundingBox()
        )
      );
      return { row, names, own };
    };
    const off = await boxes();
    expect(off.own.x).toBeGreaterThanOrEqual(off.names.x + off.names.width);
    expect(off.own.x + off.own.width).toBeLessThanOrEqual(off.row.x + off.row.width);
    expect(off.row.x + off.row.width - (off.own.x + off.own.width)).toBeLessThan(40);
    await expect(control.locator('.sva-r-row')).toHaveText('Statistics need R13 MB, onceStart R');
    await expect(control.locator('.sva-r-row')).toHaveAttribute('title', NEED_R_TITLE);
    // The line inside the chart is one short sentence, which points at the control.
    await expect(page.locator('.sva-chart .bv-statistic').first()).toHaveText(NO_R);
    await captureEvidence(page.locator('.sva-header'), 'APP-R-051', 'r-control-off');
    // R can be up before the page is looked at again. Its first file is held
    // back for a moment, so the starting state is always there to see (#309).
    let held = false;
    await page.route('https://webr.r-wasm.org/**', async (route) => {
      if (!held) {
        held = true;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await route.continue();
    });
    await control.locator('.sva-action').click();
    // A spinner and a count of seconds while it starts.
    await expect(control).toHaveAttribute('data-phase', 'starting');
    await expect(control.locator('.sva-spin')).toBeVisible();
    await expect(control.locator('.sva-r-meta')).toHaveText(/^13 MB · \d+ s$/);
    await expect(rChip(page)).toHaveText('R ready▾', { timeout: 150000 });
    await expect(rChip(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.sva-charts .sva-action')).toHaveCount(0);
    // The statistic appears, with nothing drawn again.
    await expect(page.locator('.sva-chart .bv-statistic').first()).toContainText('Chi-squared', {
      timeout: 60000
    });
    // The chip opens the details, under the row and inside the window.
    await rChip(page).click();
    await expect(rChip(page)).toHaveAttribute('aria-expanded', 'true');
    const panel = rPanel(page);
    await expect(panel.locator('.sva-r-heading')).toHaveText('R is running in this browser');
    await expect(panel.locator('dt')).toHaveText(['Version', 'Started', 'Downloaded', 'Your data']);
    const said = await panel.locator('dd').allTextContents();
    // R said its own version; the page knew the runtime's.
    expect(said[0]).toMatch(/^R \d+\.\d+\.\d+, on webR \d+\.\d+\.\d+$/);
    expect(said[1]).toMatch(/^in \d+(\.\d)? seconds?$/);
    expect(said.slice(2)).toEqual([
      '13 MB, once, from webr.r-wasm.org',
      'stays in this browser; R runs here'
    ]);
    const place = await panel.boundingBox();
    expect(place.x + place.width).toBeLessThanOrEqual(1280);
    expect(place.y).toBeGreaterThan(off.row.y);
    // How long R took differs from run to run, so that one line is covered in the picture.
    await captureEvidence(page, 'APP-R-051', 'r-control-ready-details', {
      clip: { x: 0, y: 0, width: 1280, height: 420 },
      mask: [panel.locator('dd').nth(1)],
      maskColor: '#e4e6e3'
    });
    // The cross closes it and the keyboard goes back to the chip; Escape closes it too.
    await panel.locator('.sva-r-x').click();
    await expect(panel).toHaveCount(0);
    await expect(rChip(page)).toBeFocused();
    await rChip(page).click();
    await page.keyboard.press('Escape');
    await expect(rPanel(page)).toHaveCount(0);
    // Another biomarker chart: the chip is still there, and R is not started again.
    await item(page, 'association-scatter').click();
    await expect(rChip(page)).toHaveText('R ready▾');
    // A tab whose charts ask R for nothing has no control.
    await tab(page, 'bds').click();
    await expect(page.locator('.sva-charts > .sva-r')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('APP-R-052: at a 390-pixel viewport the control is first in the chart-name row and stays in view while the names scroll under it; it starts R, becomes the chip, and its details open inside the window; the page is never wider than the window (#276)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    await tab(page, 'biomarkers').click();
    await item(page, 'cross-tab').click();
    const control = rControl(page);
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
    const inView = async (locator) => {
      const box = await locator.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      return box;
    };
    // First in the row, with its cost and its button; the reason is the line in the chart.
    const first = await inView(control);
    expect(first.x).toBeLessThan(2);
    await expect(control.locator('.sva-r-say')).toBeHidden();
    await expect(control.locator('.sva-r-meta')).toHaveText('13 MB, once');
    await expect(page.locator('.sva-chart .bv-statistic').first()).toHaveText(
      'Statistics need R. Start R, above.'
    );
    // The open chart's name is clear of it, and scrolling the names leaves it where it is.
    const open = await item(page, 'cross-tab').boundingBox();
    expect(open.x).toBeGreaterThanOrEqual(first.x + first.width);
    await page.locator('.sva-charts').evaluate((row) => (row.scrollLeft = row.scrollWidth));
    expect((await control.boundingBox()).x).toBeLessThan(2);
    expect(await wide()).toBeLessThanOrEqual(390);
    await captureEvidence(page, 'APP-R-052', 'r-control-390-off', {
      clip: { x: 0, y: 0, width: 390, height: 300 }
    });
    await control.locator('.sva-action').click();
    await expect(rChip(page)).toBeVisible({ timeout: 150000 });
    await inView(rChip(page));
    await rChip(page).click();
    await inView(rPanel(page));
    await expect(rPanel(page).locator('dt')).toHaveText([
      'Version',
      'Started',
      'Downloaded',
      'Your data'
    ]);
    expect(await wide()).toBeLessThanOrEqual(390);
    await captureEvidence(page, 'APP-R-052', 'r-control-390-details', {
      clip: { x: 0, y: 0, width: 390, height: 420 },
      mask: [rPanel(page).locator('dd').nth(1)],
      maskColor: '#e4e6e3'
    });
    expect(errors).toEqual([]);
  });

  test('APP-R-053: with R’s hosts blocked, the Biomarkers tab and the RBQM tab say the same thing: "R did not start", in the alarm colour, with Try again beside it, the reason one click away and what the browser said behind a disclosure; no raw error is in the first line (#277)', async ({
    page,
    context
  }) => {
    test.setTimeout(240000);
    await context.route(/r-wasm\.org/, (route) => route.abort());
    await openOnDemo(page);
    const read = async (control, panel) => {
      await expect(control).toHaveAttribute('data-phase', 'failed', { timeout: 120000 });
      const line = await control.locator('.sva-r-row').textContent();
      const colour = await control
        .locator('.sva-r-say')
        .evaluate((node) => getComputedStyle(node).color);
      await expect(panel).toHaveCount(0);
      await control.locator('.sva-r-why').click();
      const heading = await panel.locator('.sva-r-heading').textContent();
      const reason = await panel.locator(':scope > .sva-r-text').textContent();
      await expect(panel.locator('.sva-r-more .sva-r-text')).toBeHidden();
      await panel.locator('.sva-r-more summary').click();
      const browser = await panel.locator('.sva-r-more .sva-r-text').textContent();
      return { line, colour, heading, reason, browser };
    };
    await openChart(page, 'cross-tab');
    await rControl(page).locator('.sva-action').click();
    const biomarkers = await read(rControl(page), rPanel(page));
    await page.keyboard.press('Escape');
    await rbqmTab(page).click();
    await rbqmStart(page).click();
    // The RBQM tab's control is the same one, in the same place (#280).
    const rbqm = await read(rControl(page), rPanel(page));
    await captureEvidence(page, 'APP-R-053', 'rbqm-r-host-blocked');
    await page.keyboard.press('Escape');
    // The same first line, the same colour and the same heading on both tabs.
    expect(biomarkers.line).toBe('R did not startTry againWhy▾');
    expect(rbqm.line).toBe(biomarkers.line);
    expect(rbqm.colour).toBe(biomarkers.colour);
    expect(biomarkers.colour).toBe('rgb(162, 66, 58)');
    expect(rbqm.heading).toBe('R did not start');
    expect(biomarkers.heading).toBe('R did not start');
    // One plain reason, in the same sentence; each tab ends it with what it has lost.
    const frame =
      'The browser could not download R from webr.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. ';
    expect(biomarkers.reason).toBe(
      `${frame}The charts still draw; only the statistics are missing.`
    );
    expect(rbqm.reason).toBe(`${frame}No metric was run.`);
    // What the browser said is there for a reader who asks, and nowhere else.
    for (const said of [biomarkers, rbqm]) {
      expect(said.browser).toMatch(/^The browser said: .*webr\.r-wasm\.org/);
      expect(said.line).not.toMatch(/fetch|import|module|http/i);
      expect(said.reason).not.toMatch(/Failed to fetch|dynamically imported/);
    }
    await expect(rbqmStart(page)).toHaveText('Try again');
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('no R');
  });

  test('APP-R-008: a second biomarker chart opened after R has started uses the same R: no second connection and no second download (#183)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await openOnDemo(page);
    await openChart(page, 'association-scatter');
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-chart .bv-statistic')).toContainText('correlation', {
      timeout: 150000
    });
    const fetched = requests.filter((url) => R_HOST.test(url)).length;
    expect(fetched).toBeGreaterThan(0);
    for (const module of ['correlation-matrix', 'cross-tab', 'biomarker-screen']) {
      await item(page, module).click();
      await settled(page);
      const lines = await page.locator('.sva-chart .bv-statistic').allTextContents();
      expect(lines.join(' ')).not.toContain('Statistics need R');
      expect(lines.join(' ')).not.toContain('no R is attached');
    }
    expect(requests.filter((url) => R_HOST.test(url))).toHaveLength(fetched);
    expect(await page.evaluate(() => window.__rConnections)).toBe(1);
    expect(errors).toEqual([]);
  });
});

// The gsm packages built for R in the browser (#229, obot.roadmap#373):
// gsm.core, gsm.mapping, gsm.reporting and workr, built from pinned release
// tags and kept as a package repository the site serves beside the app. The
// harness page (fixtures/r-wasm.html) starts real webR and installs them.
test.describe('gsm packages for R in the browser', () => {
  const pins = JSON.parse(
    readFileSync(new URL('../../site/vendor/r-wasm/pins.json', import.meta.url), 'utf8')
  );

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-R-032: R in the browser installs workr, gsm.core, gsm.mapping and gsm.reporting from the page’s own address and their dependencies from repo.r-wasm.org, at the pinned versions; they attach with duckdb, and a query runs through workr (#229)', { tag: '@real-r' }, async ({
    page,
    context
  }) => {
    // It downloads R and some forty packages: far more than the default allows.
    test.setTimeout(360_000);
    const requests = [];
    context.on('request', (request) => requests.push(request.url()));
    await page.goto('/tests/e2e/fixtures/r-wasm.html');
    await page.waitForFunction(() => window.__rWasm && window.__rWasm.done, null, {
      timeout: 330_000
    });
    const result = await page.evaluate(() => window.__rWasm);
    expect(result.error).toBeNull();
    expect(result.versions).toEqual(
      Object.fromEntries(pins.packages.map((pin) => [pin.package, pin.version]))
    );
    expect(result.loaded).toBe('loaded');
    expect(result.query).toBe('2');

    // Each of the four came from the page's own address, and none from the
    // public index, which has no build of them; everything else R asked for
    // came from webR's host or the public index.
    const own = new URL(page.url()).origin;
    const packageFile = (pin) => `${pin.package}_${pin.version}.tgz`;
    for (const pin of pins.packages) {
      const asked = requests.filter((url) => url.endsWith(`/${packageFile(pin)}`));
      expect(asked.map((url) => new URL(url).origin)).toEqual([own]);
    }
    const origins = [...new Set(requests.map((url) => new URL(url).origin))].sort();
    expect(origins).toEqual([own, 'https://repo.r-wasm.org', `https://webr.r-wasm.org`].sort());
  });
});

// The RBQM pipeline in R in the browser (#231, obot.roadmap#373): the gate. The
// harness page (fixtures/rbqm-pipeline.html) hands real webR the four gsm
// packages, the packages' own workflow files as copied from their tags, and
// the demo study's raw files, and runs adverse event rate by site end to end
// through workr. Desktop R's rows for the same files are in
// tests/fixtures/rbqm/expected.json (scripts/rbqm-reference.mjs).
test.describe('rbqm pipeline in R in the browser', () => {
  const expected = JSON.parse(
    readFileSync(new URL(`../../${RBQM_GATE.expected}`, import.meta.url), 'utf8')
  ).answer;
  const R_HOSTS = ['https://webr.r-wasm.org', RBQM_GATE.publicIndex];
  // Where the measurements of the canonical environment are kept, written once.
  const MEASURED = new URL(
    '../../docs/evidence/basic-app/APP-R-037-rbqm-pipeline-measurements.json',
    import.meta.url
  );
  // A table as a sorted list of its rows, each number to eight decimal places:
  // two tables are the same rows whatever order R gave them in.
  const canonical = (rows) =>
    rows
      .map((row) =>
        JSON.stringify(
          Object.keys(row)
            .sort()
            .map((key) => [key, typeof row[key] === 'number' ? row[key].toFixed(8) : row[key]])
        )
      )
      .sort();

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-R-037: rbqm pipeline: R in the browser runs the mapping, metric and reporting workflows for adverse event rate by site through workr on the demo study’s raw files, and its Results rows are desktop R’s: the same sites, and for each the same numerator, denominator, metric, score and flag to eight decimal places; before R is asked for, nothing is asked of R’s hosts, and R asks no host but webR’s, the public index and the page’s own (#231)', { tag: '@real-r' }, async ({
    page,
    context
  }, testInfo) => {
    // It downloads R and some forty packages, then runs the pipeline.
    test.setTimeout(480_000);
    const requests = [];
    const finished = [];
    context.on('request', (request) => requests.push(request.url()));
    context.on('requestfinished', (request) => finished.push(request));
    await page.goto('/tests/e2e/fixtures/rbqm-pipeline.html');
    await page.waitForLoadState('networkidle');
    const own = new URL(page.url()).origin;

    // Before R is asked for, the page has asked its own address only.
    const before = [...requests];
    expect(before.filter((url) => new URL(url).origin !== own)).toEqual([]);
    expect(before.filter((url) => /r-wasm\/repo|\.tgz$/.test(url))).toEqual([]);

    const outcome = await page.evaluate((run) => window.__rbqm.run(run), {
      packages: RBQM_GATE.packages,
      repos: [`/${RBQM_GATE.repository}`, RBQM_GATE.publicIndex],
      files: pipelineFiles(),
      study: studyFiles(),
      call: RBQM_GATE.call,
      args: pipelineArgs()
    });
    expect(outcome.started.message || outcome.started.status).toBe('ok');
    expect(outcome.answer.message || outcome.answer.status).toBe('ok');
    const answer = outcome.answer.value;

    // The Results rows are desktop R's: the same sites, and each site's row.
    const keyed = (rows) => new Map(rows.map((row) => [`${row.MetricID} ${row.GroupID}`, row]));
    const [browser, desktop] = [keyed(answer.Results), keyed(expected.Results)];
    expect(answer.Results).toHaveLength(expected.Results.length);
    expect(expected.Results.length).toBeGreaterThan(100);
    expect([...browser.keys()].sort()).toEqual([...desktop.keys()].sort());
    for (const [key, row] of desktop) {
      const got = browser.get(key);
      for (const column of RESULT_KEYS) expect(got[column], `${key} ${column}`).toBe(row[column]);
      for (const column of RESULT_NUMBERS) {
        if (row[column] === null) expect(got[column], `${key} ${column}`).toBeNull();
        else expect(got[column], `${key} ${column}`).toBeCloseTo(row[column], 8);
      }
    }
    // So are the three tables the charts will draw beside them.
    for (const table of ['Bounds', 'Groups', 'Metrics']) {
      expect(canonical(answer[table]), table).toEqual(canonical(expected[table]));
    }
    expect(answer.ran).toEqual(expected.ran);
    expect(answer.warnings).toEqual([]);
    // The gsm packages are the pinned ones in both; what they stand on is whatever each R has.
    for (const name of RBQM_GATE.packages)
      expect(answer.versions[name]).toBe(expected.versions[name]);

    // Everything R asked for came from webR's host, the public index or the
    // page's own address: duckdb, for one, fetched nothing from anywhere else.
    await page.waitForLoadState('networkidle');
    const origins = [...new Set(requests.map((url) => new URL(url).origin))].sort();
    expect(origins).toEqual([own, ...R_HOSTS].sort());

    // What it cost, measured here: bytes over the wire by where they came
    // from, and seconds for each step.
    const megabytes = { runtime: 0, publicIndex: 0, gsmPackages: 0, page: 0 };
    let publicPackages = 0;
    for (const request of finished) {
      const url = new URL(request.url());
      const sizes = await request.sizes().catch(() => null);
      const bytes = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
      if (url.origin === R_HOSTS[0]) megabytes.runtime += bytes;
      else if (url.origin === R_HOSTS[1]) {
        megabytes.publicIndex += bytes;
        if (url.pathname.endsWith('.tgz')) publicPackages += 1;
      } else if (url.pathname.includes(`/${RBQM_GATE.repository}/`)) megabytes.gsmPackages += bytes;
      else megabytes.page += bytes;
    }
    for (const key of Object.keys(megabytes)) {
      megabytes[key] = Math.round(megabytes[key] / 10485.76) / 100;
    }
    const measured = {
      megabytes: {
        ...megabytes,
        total:
          Math.round(Object.values(megabytes).reduce((sum, value) => sum + value, 0) * 100) / 100
      },
      packagesFromThePublicIndex: publicPackages,
      seconds: {
        startR: outcome.start,
        firstRun: outcome.run,
        secondRun: outcome.rerun,
        inR: answer.seconds
      },
      requestsBeforeR: { toThePage: before.length, toRsHosts: 0 },
      versions: answer.versions,
      platform: process.platform
    };
    await testInfo.attach('rbqm-pipeline-measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json'
    });
    console.log(`rbqm pipeline measurements: ${JSON.stringify(measured)}`);
    // The limit @jwildfire set on the gate (obot.roadmap#373): starting R for
    // this stack downloads no more than 80 MB.
    expect(measured.megabytes.total).toBeLessThan(80);
    expect(measured.megabytes.total).toBeGreaterThan(10);
    // The gate's limit on time was a minute, and the first run passed it at 29
    // to 50 seconds on the CI runner. A busy runner is slow, so this fails at
    // two minutes: double what was measured, not a slow day (#244).
    expect(outcome.run).toBeLessThan(120);
    expect(outcome.again).toBe('ok');
    // Kept with the evidence, from the canonical environment, the first time
    // it runs there; remove the file to have it measured again.
    if (CANONICAL && !existsSync(MEASURED)) {
      mkdirSync(new URL('.', MEASURED), { recursive: true });
      writeFileSync(MEASURED, `${JSON.stringify(measured, null, 2)}\n`);
    }
  });
});

test.describe('demo app data view sidebar', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-LOAD-017: the sidebar’s steps follow the work: load, check the mapping, open a chart (#159)', async ({
    page
  }) => {
    await openEmpty(page);
    await expect(step(page, 'load')).toHaveAttribute('data-state', 'current');
    await expect(stepStatus(page, 'load')).toHaveText('No files loaded');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'todo');
    await expect(sideAction(page, 'reset')).toHaveCount(0);
    await expect(sideAction(page, 'open-chart')).toHaveCount(0);

    // The picker opens from the first step.
    const choosing = page.waitForEvent('filechooser');
    await sideAction(page, 'choose-files').click();
    await (await choosing).setFiles(STUDY);
    await expect(step(page, 'load')).toHaveAttribute('data-state', 'done');
    await expect(stepStatus(page, 'load')).toHaveText('4 files loaded');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'current');
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 6 needed by a chart');
    // The RBQM tab's count sits beside the charts' (#281): this study has no site column.
    await expect(stepStatus(page, 'open')).toHaveText(
      '12 of 18 charts ready · 0 of 8 RBQM metrics'
    );
    await captureEvidence(page, 'APP-LOAD-017', 'sidebar');

    await correct(page);
    // No chart is waiting on a row: the step is done, with its guesses still counted (#163).
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 0 needed by a chart');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'done');
    await expect(step(page, 'open')).toHaveAttribute('data-state', 'current');
    await expect(stepStatus(page, 'open')).toHaveText(
      '18 of 18 charts ready · 0 of 8 RBQM metrics'
    );
    await sideAction(page, 'open-chart').click();
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
  });

  test('APP-LOAD-018: the loaded files are listed with their flags, and choosing one moves to its card (#159)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, [...STUDY, NO_DOMAIN]);
    await expect(page.locator('.sva-loaded-name')).toHaveText([
      'dm.csv',
      'ae.csv',
      'labs_final.csv',
      'ecg.json',
      'site_notes.csv'
    ]);
    const entry = (domain) => page.locator(`.sva-loaded-file[data-domain="${domain}"]`);
    await expect(entry('bds').locator('.sva-loaded-detail')).toHaveText(
      'Labs and vitals, 2,223 rows'
    );
    await expect(entry('bds').locator('.sva-flag')).toHaveText(['8 guessed', '3 needed']);
    await entry('eg').click();
    await expect(card(page, 'eg')).toBeFocused();
    await expect(card(page, 'eg')).toBeInViewport();
  });

  test('APP-LOAD-019: Reset returns the data view to the empty drop zone (#159)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, [...STUDY, NO_DOMAIN]);
    await correct(page);
    await sideAction(page, 'reset').click();
    await expect(page.locator('.sva-file')).toHaveCount(0);
    await expect(page.locator('.sva-note')).toHaveCount(0);
    await expect(page.locator('.sva-loaded-empty')).toHaveText('No files are loaded.');
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('no files');
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 18 charts supported by the loaded data'
    );
    await expect(sideAction(page, 'reset')).toHaveCount(0);
    // The same files can be chosen again, and arrive unmapped as they first did.
    await chooseFiles(page, STUDY);
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 6 needed by a chart');
  });

  test('APP-RBQM-007: choosing the RBQM study loads gsm’s nine raw files and keeps them as they are: each is listed with its rows, none is placed in a domain or mapped, no safety chart reads them, and the view fits a 390-pixel screen (#233)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await item(page, 'data').click();
    const menu = page.locator('.sva-side select.sva-study');
    await menu.selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveText([
      'Raw_SUBJ.csv',
      'Raw_AE.csv',
      'Raw_PD.csv',
      'Raw_LB.csv',
      'Raw_STUDCOMP.csv',
      'Raw_SDRGCOMP.csv',
      'Raw_SITE.csv',
      'Raw_STUDY.csv',
      'Raw_ENROLL.csv'
    ]);
    await expect(page.locator('.sva-study-note')).toContainText(
      '765 enrolled participants at 150 sites, of 1,005 screened, as gsm’s raw domains'
    );
    await expect(page.locator('.sva-loaded-detail').nth(3)).toHaveText('gsm raw file, 57,200 rows');
    await expect(page.locator('.sva-file.sva-raw')).toHaveCount(9);
    await expect(page.locator('.sva-file[data-domain]')).toHaveCount(0);
    await expect(page.locator('.sva-map')).toHaveCount(0);
    await expect(stepStatus(page, 'load')).toHaveText('9 files loaded');
    await expect(stepStatus(page, 'map')).toHaveText(
      'Nothing to map: gsm’s raw files are kept as they are'
    );
    // No chart reads them: the third step leads to the tab that runs them (#281).
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open the RBQM tab');
    await expect(stepStatus(page, 'open')).toHaveText(
      '8 of 8 metrics supported · 0 of 18 charts ready'
    );
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('RBQM study');
    // On a phone the nine cards and the sidebar fit the screen's width.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    // The pilot study replaces it whole.
    await menu.selectOption('pilot');
    await expect(page.locator('.sva-file.sva-raw')).toHaveCount(0);
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open a chart');
    await expect(stepStatus(page, 'open')).toHaveText(
      '18 of 18 charts ready · 3 of 8 RBQM metrics'
    );
    expect(errors).toEqual([]);
  });

  test('APP-LOAD-020: each demo study loads from the menu and replaces the one before it (#159)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await item(page, 'data').click();
    const menu = page.locator('.sva-side select.sva-study');
    await expect(menu.locator('option')).toHaveText([
      'Choose a demo study',
      'Pilot study',
      'Renamed columns',
      'Liver cohort, labs only',
      'RBQM study'
    ]);
    await expect(menu).toHaveValue('pilot');
    await expect(page.locator('.sva-study-note')).toContainText(
      '110 synthetic liver and kidney participants who are in no other file'
    );
    await expect(stepStatus(page, 'map')).toHaveText('4 guessed, 0 needed by a chart');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'done');

    await menu.selectOption('renamed');
    await expect(page.locator('.sva-loaded-name')).toHaveText([
      'dm.csv',
      'ae.csv',
      'labs_final.csv',
      'ecg.json'
    ]);
    await expect(page.locator('.sva-study-note')).toContainText('six rows');
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 6 needed by a chart');
    // The data view stays open: the mapping is what this study is for.
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');

    await menu.selectOption('liver');
    await expect(page.locator('.sva-loaded-name')).toHaveText(['adbds-abnbl.csv']);
    await expect(stepStatus(page, 'load')).toHaveText('1 file loaded');
    await expect(stepStatus(page, 'open')).toHaveText(
      '13 of 18 charts ready · 0 of 8 RBQM metrics'
    );
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '8 of 9',
      '0',
      '0',
      '5',
      'not run'
    ]);
    // It draws: the hepatic explorer from the one labs file.
    await openChart(page, 'hep-explorer');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();

    // Reset leaves the menu, with no study chosen; the pilot study loads again from it.
    await item(page, 'data').click();
    await sideAction(page, 'reset').click();
    await expect(menu).toHaveValue('');
    await expect(page.locator('.sva-file')).toHaveCount(0);
    await menu.selectOption('pilot');
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    expect(errors).toEqual([]);
  });

  test('APP-LOAD-020: a demo file answered with a 404 is not read as data: the study is reported as not loaded and nothing changes (#165)', async ({
    page
  }) => {
    await page.route('**/site/data/adbds.csv', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<!DOCTYPE html>\n<html><head><title>404</title></head>\n<body><h1>Not Found</h1></body></html>\n'
      })
    );
    await page.goto('/tests/e2e/fixtures/basic-app.html');
    await page.evaluate(`${APP}.ready`);
    await expect(page.locator('.sva-note')).toHaveText([
      /^The demo study could not be loaded: .*adbds\.csv was answered with HTTP 404\.$/
    ]);
    await expect(page.locator('.sva-file')).toHaveCount(0);
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('no files');
    await expect(page.locator('.sva-side select.sva-study')).toHaveValue('');
  });

  test('APP-LOAD-021: the sidebar sits beside the data view on a wide screen and on no chart view (#159)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOnDemo(page);
    // A chart view has no sidebar: the chart keeps the page's width.
    await expect(page.locator('.sva-chart')).toBeVisible();
    await expect(page.locator('.sva-side')).toHaveCount(0);
    await item(page, 'data').click();
    const side = await page.locator('.sva-side').boundingBox();
    const drop = await page.locator('.sva-drop').boundingBox();
    const first = await page.locator('.sva-file').first().boundingBox();
    expect(side.x + side.width).toBeLessThanOrEqual(drop.x);
    expect(Math.abs(side.y - drop.y)).toBeLessThan(2);
    expect(first.x).toBe(drop.x);
    // It stays in view while the cards scroll under the header.
    await page.locator('.sva-file').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.sva-side')).toBeInViewport();
  });

  test('APP-LOAD-021: at phone width the sidebar stacks above the drop zone and the page does not scroll sideways (#159)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    await item(page, 'data').click();
    const side = await page.locator('.sva-side').boundingBox();
    const drop = await page.locator('.sva-drop').boundingBox();
    expect(side.y + side.height).toBeLessThanOrEqual(drop.y);
    expect(side.x).toBe(drop.x);
    expect(side.width).toBe(drop.width);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('.sva-side select.sva-study').selectOption('renamed');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

// Every request a page and its workers make, R's downloads included, marked
// by whether a file had been chosen yet, and what holds them to reads that
// carry nothing (#196, #210). Used by the two walks that start R: the
// biomarker charts' (APP-LOAD-026) and the RBQM tab's (APP-RBQM-030).
function watchRequests(page, context) {
  const requests = [];
  // Every header as sent, cookies included: request.headers() leaves out
  // the ones the network stack adds, such as `cookie` (#211 review). A
  // request whose headers cannot be read fails the header check.
  const reading = [];
  const sockets = [];
  const watch = { requests, sockets, chosen: false };
  const record = (request) => {
    const entry = {
      method: request.method(),
      url: request.url(),
      body: request.postData(),
      headers: null,
      type: request.resourceType(),
      chosen: watch.chosen
    };
    requests.push(entry);
    reading.push(
      request
        .allHeaders()
        .then((headers) => (entry.headers = headers))
        .catch((error) => (entry.headers = { unreadable: error.message }))
    );
  };
  context.on('request', record);
  page.on('websocket', (socket) => sockets.push(socket.url()));

  // Keep listening after the last action until nothing has been asked for in
  // five seconds (at most a minute), so a request sent late is still seen: the
  // claim holds until then, not forever.
  watch.quiet = async () => {
    let quietSince = Date.now();
    let seen = requests.length;
    await expect
      .poll(
        () => {
          if (requests.length !== seen) [seen, quietSince] = [requests.length, Date.now()];
          return Date.now() - quietSince >= 5000;
        },
        { timeout: 60000, intervals: [250] }
      )
      .toBe(true);
    context.off('request', record);
    await Promise.all(reading);
  };

  // The requests made once a file was chosen, each held to a read: a GET or
  // HEAD with no body, no query and no header the browser did not set itself.
  watch.onlyReads = (own) => {
    // The page's own document is the one request the browser made with nothing
    // set by a script: the headers it carries are the browser's own.
    const page0 = requests.find((request) => request.type === 'document');
    // blob: and data: URLs are the page talking to itself, not the network.
    const after = requests.filter(
      (request) => request.chosen && !/^(blob|data):/.test(request.url)
    );
    expect(after.filter((request) => request.body)).toEqual([]);
    // Only reads: webR also asks with HEAD whether a file is there.
    expect(after.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
    // Nothing carried in a query, to any host.
    expect(after.filter((request) => new URL(request.url).search !== '')).toEqual([]);
    // Nothing carried in a header: each one is a header the browser sets, with
    // the value it gave the page's own document, or, for the referrer and
    // origin, the page's own address. A script's header, a script's value in a
    // browser header, or any cookie fails it. The network stack's own headers
    // (host, connection, accept-encoding, sec-fetch-*, HTTP/2's pseudo-headers)
    // cannot be set by a script, and must still name the request they are on.
    const fetchMetadata = /^[a-z-]+$|^\?[01]$/;
    const browserSet = {
      host: (value, request) => value === new URL(request.url).host,
      ':authority': (value, request) => value === new URL(request.url).host,
      ':scheme': (value, request) => `${value}:` === new URL(request.url).protocol,
      ':method': (value, request) => value === request.method,
      ':path': (value, request) => value === new URL(request.url).pathname,
      priority: (value) => /^u=[0-7](, i)?$/.test(value),
      connection: (value) => value === 'keep-alive',
      'accept-encoding': (value) => value === page0.headers['accept-encoding'],
      'user-agent': (value) => value === page0.headers['user-agent'],
      'accept-language': (value) => value === page0.headers['accept-language'],
      'sec-ch-ua': (value) => value === page0.headers['sec-ch-ua'],
      'sec-ch-ua-mobile': (value) => value === page0.headers['sec-ch-ua-mobile'],
      'sec-ch-ua-platform': (value) => value === page0.headers['sec-ch-ua-platform'],
      accept: (value) => value === '*/*',
      cookie: () => false,
      origin: (value) => value === own,
      referer: (value) => ['', `${own}/`, page0.url].includes(value)
    };
    // Fetch metadata (sec-fetch-site, -mode, -dest, -user, -storage-access, …)
    // is the browser's, and holds only a short token.
    const allowed = (name) =>
      browserSet[name] || (name.startsWith('sec-fetch-') && ((value) => fetchMetadata.test(value)));
    const headed = after.filter((request) =>
      Object.entries(request.headers).some(
        ([name, value]) => !allowed(name) || !allowed(name)(value, request)
      )
    );
    expect(headed).toEqual([]);
    return after;
  };
  return watch;
}

// What R asks webR's host for when it starts for the RBQM tab: webR itself,
// as for the biomarker charts, and the shared files of R's own library, which
// R reads when a package is installed. Nothing else.
const WEBR_FILES_FOR_PACKAGES = [
  'GET R.js',
  'GET R.wasm',
  'GET libRblas.so',
  'GET libRlapack.so',
  'GET vfs/usr/lib/R/share.data.gz',
  'GET vfs/usr/lib/R/share.js.metadata',
  'GET webr-worker.js',
  'GET webr.mjs',
  'HEAD vfs/usr/lib/R/library/translations/DESCRIPTION'
];

// ---- the RBQM tab (#235, obot.roadmap#374) ----------------------------------
//
// A tab of its own, brought by a library through the second-library seam. It
// starts R in the browser when the reader asks, runs gsm's workflows on the
// loaded raw files and draws what R returns with gsm.viz. Most of these tests
// give the tab a stand-in for R (`?rbqm=recorded` on the harness page), which
// answers at once with desktop R's answer for the same files, so they hold the
// page and not R. APP-RBQM-021 and APP-LOAD-026 start real R.

const rbqmTab = (page) => page.locator('.sva-tab[data-tab="rbqm"]');
const rbqmStatus = (page) => page.locator('.sva-rbqm-status');
const rbqmStart = (page) => page.locator('.sva-rbqm-start');
// The tab's own row (#279): Overview, then one item for each metric.
const rbqmOverview = (page) => page.locator('.sva-view-item[data-item=""]');
const rbqmChoice = (page, id) => page.locator(`.sva-view-item[data-item="${id}"]`);
const rbqmItems = (page) => page.locator('.sva-view-items .sva-view-item');
// Its R control, at the right end of that row (#280), and the panel behind its chip.
const rbqmControl = (page) => page.locator('.sva-charts > .sva-r');
const rbqmChip = (page) => rbqmControl(page).locator('.sva-chip.sva-r-ready');
const rbqmPanel = (page) => page.locator('.sva-header .sva-r-panel');
// Run details, read from the panel, which is opened if it is closed: its
// opening sentence, and under each heading what is listed there, a step with
// its note and a term with what is said of it each as one line.
async function runDetails(page) {
  if (!(await rbqmPanel(page).count())) await rbqmChip(page).click();
  await expect(rbqmPanel(page)).toBeVisible();
  return rbqmPanel(page).evaluate((panel) => {
    const line = (node) =>
      [...node.children].length
        ? [...node.children]
            .map((part) => part.textContent.trim())
            .filter(Boolean)
            .join(' ')
        : node.textContent.trim();
    const sections = {};
    for (const heading of panel.querySelectorAll('.sva-r-title')) {
      const lines = [];
      for (let next = heading.nextElementSibling; next; next = next.nextElementSibling) {
        if (next.matches('.sva-r-title')) break;
        if (next.matches('dl')) {
          const terms = [...next.querySelectorAll('dt')];
          lines.push(
            ...terms.map((term) => `${term.textContent}: ${term.nextElementSibling.textContent}`)
          );
        } else if (next.matches('ol, ul')) lines.push(...[...next.children].map(line));
        else lines.push(next.textContent.trim());
      }
      sections[heading.textContent] = lines;
    }
    return {
      heading: panel.querySelector('.sva-r-heading').textContent,
      text: [...panel.querySelectorAll(':scope > .sva-r-text')].map((node) => node.textContent),
      sections,
      actions: [...panel.querySelectorAll('.sva-r-actions button')].map((node) => node.textContent)
    };
  });
}
// The one line the tab opens on before R is started (#280), on any study.
const RBQM_NEED = 'Site metrics need R. Start R, at the top right.';
const PILOT_NEED = RBQM_NEED;
// What the control's own sentence says, on hover: what starting R downloads, and from where.
const RBQM_NEED_TITLE =
  'Site metrics need R. Start R to run them: about 55 MB, downloaded once from ' +
  'webr.r-wasm.org, repo.r-wasm.org and this page. The study’s data stays in this browser.';
// The six steps from the press to the first result, as the body lists them.
const RBQM_STEPS = [
  'Downloading R',
  'Installing R packages',
  'Fetching gsm’s workflow files',
  'Loading gsm’s packages, the long one',
  'Reading the study',
  'Running the workflows'
];
// A site's row of the overview table is keyed by the site's ID, the first word of its label.
const overviewRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sva-rbqm-table tbody tr')].map((row) => ({
      label: row.children[0].textContent.trim(),
      cells: [...row.children].map((cell) => ({
        text: cell.textContent.trim(),
        title: cell.getAttribute('title')
      }))
    }))
  );
// A number as gsm.viz prints one in a cell's tooltip: a whole number with
// thousands separators, any other to two decimal places, and a dash for none.
const printed = (value) =>
  value === null || value === undefined
    ? '—'
    : Number.isInteger(value)
      ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : value.toFixed(2);
// Whether a chart's canvas has something drawn on it.
const inked = (canvas) =>
  canvas.evaluate((node) => {
    const { data } = node.getContext('2d').getImageData(0, 0, node.width, node.height);
    for (let index = 3; index < data.length; index += 4) if (data[index]) return true;
    return false;
  });
const sidewaysScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// A reader's own files, where they are on disk (#236): two of the RBQM study's
// files as gsm names them, a file of no raw domain, and, written for the test,
// the study's adverse events file with one column taken out.
const onDisk = (file) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const OWN_SUBJ = onDisk('site/data/rbqm/Raw_SUBJ.csv');
const OWN_AE = onDisk('site/data/rbqm/Raw_AE.csv');
const OWN_PD = onDisk('site/data/rbqm/Raw_PD.csv');
const OWN_NOTES = onDisk('tests/e2e/fixtures/app/site_notes.csv');
const NOTES_UNPLACED =
  'site_notes.csv is not recognised: its name and its columns match no gsm raw domain.';
function withoutAColumn(testInfo) {
  const scenario = RBQM_TAB.scenarios.find((entry) => entry.id === 'no-column');
  const files = scenarioFiles(scenario, (file) =>
    readFileSync(new URL(`../../${file}`, import.meta.url))
  );
  const written = testInfo.outputPath('Raw_AE.csv');
  writeFileSync(written, files['Raw_AE.csv']);
  return written;
}
// Every file comes in on the Data tab (#282): its one chooser takes gsm's raw
// files too, and one card there says what the loaded data supports (#281).
async function chooseOnDataTab(page, files) {
  await item(page, 'data').click();
  await page.locator('.sva-file-input').setInputFiles(files);
}
const supportCard = (page) => page.locator('.sva-data .sva-support[data-support="rbqm"]');
const supportSay = (page) => supportCard(page).locator('.sva-support-say');
const rawTags = (page) => page.locator('.sva-file.sva-raw .sva-tag');
// What the card says of each metric before R is started: its id, whether the
// loaded data supports it, and for one it does not R's sentence saying why.
const saidOnCard = (page) =>
  supportCard(page).evaluate((card) => {
    const reasons = [...card.querySelectorAll('.sva-support-why li')].map(
      (node) => node.textContent
    );
    return [...card.querySelectorAll('.sva-support-items li')].map((node) => {
      const can = node.dataset.state !== 'cannot';
      return [node.dataset.item, can, can ? '' : reasons.shift()];
    });
  });

async function openRbqm(page, query = '') {
  await page.goto(`/tests/e2e/fixtures/basic-app.html${query}`);
  await page.evaluate(`${APP}.ready`);
  await item(page, 'data').click();
  await page.locator('.sva-side select.sva-study').selectOption('rbqm');
  await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
  await rbqmTab(page).click();
}

test.describe('demo app: the RBQM tab', () => {
  const tabExpected = JSON.parse(
    readFileSync(new URL(`../../${RBQM_TAB.expected}`, import.meta.url), 'utf8')
  );
  // Desktop R's answer for the pilot study as the app hands it to R (#253).
  const pilotExpected = JSON.parse(
    readFileSync(new URL(`../../${RBQM_PILOT.expected}`, import.meta.url), 'utf8')
  );
  // Where the measurements of the canonical environment are kept, written once.
  const TAB_MEASURED = new URL(
    '../../docs/evidence/basic-app/APP-RBQM-021-rbqm-tab-measurements.json',
    import.meta.url
  );

  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-RBQM-018: the RBQM tab follows the domains’ tabs and carries no pill of its own; before Start R is pressed it says in one line that site metrics need R and what the loaded study supports, its control says what starting R downloads and from where, and the page has asked nothing of R’s hosts, nor its own address for gsm.viz, R’s packages or R’s files (#235, #280)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/tests/e2e/fixtures/basic-app.html');
    await page.evaluate(`${APP}.ready`);
    await expect(page.locator('.sva-tab .sva-tab-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Biomarkers',
      'RBQM'
    ]);
    // The tab says its status once, on the corner of its view (#274): no pill
    // in the tab, and no word that only a hover shows.
    await expect(rbqmTab(page).locator('.sva-badge')).toHaveCount(0);
    await expect(rbqmTab(page)).not.toHaveAttribute('title', /.+/);
    // The header's bar is one line at a desktop's width, with the tab in it.
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(() => document.querySelector('.sva-bar').getBoundingClientRect().height)
      ).toBeLessThan(60);
    }
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('not run');
    // On the study the page opens with, the tab says what the press costs and
    // which of the study's files R will run on (#253).
    await rbqmTab(page).click();
    await expect(page).toHaveURL(/#rbqm$/);
    await expect(page.locator('.sva-title')).toHaveText('RBQM');
    // The tab has a row like every other tab's (#279), with its control at the end.
    await expect(page.locator('.sva-charts')).toBeVisible();
    await expect(rbqmStatus(page)).toHaveText(PILOT_NEED);
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded study supports 3 of 8 metrics. Change the data on the Data tab.'
    );
    await expect(rbqmControl(page).locator('.sva-r-row')).toHaveText(
      'Site metrics need R55 MB, onceStart R'
    );
    await expect(rbqmControl(page).locator('.sva-r-row')).toHaveAttribute('title', RBQM_NEED_TITLE);
    await expect(rbqmStart(page)).toBeEnabled();
    // No run box is left in the body.
    await expect(page.locator('.sva-content .sva-rbqm-start, .sva-rbqm-run')).toHaveCount(0);
    // With the RBQM study loaded it says what the press costs.
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await expect(rbqmStatus(page)).toHaveText(RBQM_NEED);
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded study supports 8 of 8 metrics. Change the data on the Data tab.'
    );
    await expect(rbqmStart(page)).toHaveText('Start R');
    await expect(rbqmStart(page)).toBeEnabled();
    await expect(page.locator('.sva-rbqm .sva-badge')).toHaveCount(0);
    await expect(page.locator('.sva-corner .sv-status-word')).toHaveText('Experimental');
    await expect(page.locator('.sva-rbqm-table')).toHaveCount(0);
    // Nothing has been asked of R's hosts, and nothing of R's has been fetched from the page.
    await page.waitForLoadState('networkidle');
    expect(requests.filter((url) => /r-wasm\.org/.test(url))).toEqual([]);
    expect(
      requests.filter((url) => /gsm\.viz|\/r-wasm\/|pipeline\.R|\.yaml$|webr/.test(url))
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-019: from the press to the first result the tab says what R is doing at every step: the control names the step, fills one of six segments and counts, the body ticks off the six steps, only one of which is called the long one, and the metrics that will run turn in the row; nothing can be pressed meanwhile, and the tab says R is starting, then running (#235, #280)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openRbqm(page, '?rbqm=recorded&slow');
    await rbqmStart(page).click();
    const letGo = () => page.evaluate(() => window.__rbqmLetGo());
    // What the connection reports, and the step of the six each is part of:
    // fetching the workflow files and reading the pipeline's R are one step.
    const moments = [
      [1, 'Downloading R', 'starting'],
      [2, 'Installing R packages', 'starting'],
      [3, 'Fetching gsm’s workflow files', 'starting'],
      [3, 'Fetching gsm’s workflow files', 'starting'],
      [4, 'Loading gsm’s packages', 'starting'],
      [5, 'Reading the study', 'running'],
      [6, 'Running the workflows', 'running']
    ];
    await expect(page.locator('.sva-rbqm-steps li')).toHaveText(RBQM_STEPS);
    for (const [index, name, tag] of moments) {
      await expect(rbqmControl(page)).toHaveAttribute('data-phase', 'starting');
      await expect(rbqmControl(page).locator('.sva-r-say')).toHaveText(`${index} of 6 · ${name}`);
      await expect(rbqmControl(page).locator('.sva-segs')).toHaveAttribute(
        'aria-label',
        `Step ${index} of 6`
      );
      await expect(rbqmControl(page).locator('.sva-segs i')).toHaveCount(6);
      // Counted on the tab's own clock, which stands still on this page.
      await expect(rbqmControl(page).locator('.sva-r-meta')).toHaveText('0 s');
      // The body: the steps before are done, this one is under way, the rest are to come.
      expect(
        await page
          .locator('.sva-rbqm-steps li')
          .evaluateAll((items) => items.map((item) => item.dataset.state))
      ).toEqual(
        RBQM_STEPS.map((_, at) => (at + 1 < index ? 'done' : at + 1 === index ? 'now' : 'todo'))
      );
      await expect(rbqmStatus(page)).toHaveText(
        tag === 'running'
          ? 'R is running the metrics. They appear here when it is done.'
          : 'R is starting. The metrics run by themselves when it is ready.'
      );
      // Nothing to press: the control is a spinner, and every metric is turning.
      await expect(page.locator('.sva-charts .sva-action')).toHaveCount(0);
      await expect(rbqmItems(page).locator('.sva-ico-running')).toHaveCount(8);
      await expect(rbqmChoice(page, 'kri0001')).toHaveAttribute(
        'aria-label',
        'Adverse Event Rate: running'
      );
      await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText(tag);
      if (index === 2) await captureEvidence(page, 'APP-RBQM-019', 'rbqm-tab-running');
      await letGo();
    }
    await expect(rbqmStatus(page)).toHaveText(/^R ran 8 of 8 metrics on the 9 loaded files/);
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('8 of 8');
    // R was asked three things, in this order, and once each.
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run'
    ]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-020: the tab draws what R returned with gsm.viz, one page at a time: the site overview with a row per site and a column per metric, or one metric’s scatter plot and bar chart; each of the eight metrics in turn draws both, from its item in the row or from a cell of the overview, and R is not asked again (#235, #279)', async ({
    page
  }) => {
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await openRbqm(page, '?rbqm=recorded');
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    const { whole } = tabExpected;
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    await expect(page.locator('.sva-rbqm-table thead th')).toHaveText([
      'Group',
      'Enrolled',
      'Red Flags',
      'Amber Flags',
      ...whole.Metrics.map((metric) => metric.Abbreviation)
    ]);
    // The Overview page holds the table and no chart; no buttons choose a metric in the body.
    await expect(rbqmOverview(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-rbqm canvas')).toHaveCount(0);
    await expect(page.locator('.sva-content .sva-rbqm-choice, .sva-rbqm-metrics')).toHaveCount(0);
    await expect(rbqmItems(page)).toHaveText([
      'Overview',
      ...whole.Metrics.map((metric) => metric.Abbreviation)
    ]);
    for (const metric of whole.Metrics) {
      await rbqmChoice(page, metric.ID).click();
      await expect(rbqmChoice(page, metric.ID)).toHaveAttribute('aria-current', 'page');
      await expect(rbqmChoice(page, metric.ID)).toHaveAttribute(
        'aria-label',
        `${metric.Metric}: ran`
      );
      await expect(page).toHaveURL(new RegExp(`#rbqm/${metric.ID}$`));
      await expect(page.locator('.sva-rbqm-metric-name')).toHaveText(metric.Metric);
      await expect(page.locator('.sva-rbqm-metric .sva-rbqm-count')).toHaveText(
        `${metric.Abbreviation}, ran`
      );
      // A metric's page holds its two charts and nothing else: no table.
      await expect(page.locator('.sva-rbqm-table')).toHaveCount(0);
      const canvases = page.locator('.sva-rbqm-figures canvas');
      await expect(canvases).toHaveCount(2);
      for (const index of [0, 1]) {
        await expect(canvases.nth(index)).toBeVisible();
        await expect.poll(() => inked(canvases.nth(index))).toBe(true);
      }
    }
    await expect(page.locator('.sva-rbqm-caption')).toHaveText(
      'Point size is relative to the number of enrolled participants.'
    );
    // A cell of the overview opens its metric: the first site's serious adverse events.
    await rbqmOverview(page).click();
    await expect(page).toHaveURL(/#rbqm$/);
    await page
      .locator('.sva-rbqm-table tbody tr')
      .first()
      .locator('td.group-overview--metric')
      .nth(1)
      .click();
    await expect(page.locator('.sva-rbqm-metric-name')).toHaveText('Serious Adverse Event Rate');
    await expect(rbqmChoice(page, 'kri0002')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/#rbqm\/kri0002$/);
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run'
    ]);
    // Leaving the tab and coming back shows the results again without asking R.
    await item(page, 'data').click();
    await rbqmTab(page).click();
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    expect(await page.evaluate(() => window.__rbqmSteps)).toHaveLength(3);
    await page.setViewportSize({ width: 1280, height: 900 });
    await captureEvidence(page, 'APP-RBQM-020', 'rbqm-tab');
    await rbqmChoice(page, 'kri0001').click();
    await expect.poll(() => inked(page.locator('.sva-rbqm-figures canvas').nth(1))).toBe(true);
    await captureEvidence(page, 'APP-RBQM-020', 'rbqm-metric');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-022: a metric that did not run is in the row with a grey bar, and its page is R’s sentence saying why with the way to the data in place of its charts; with no Groups table the overview still has a row for every site R scored and Run details says what is missing (#235, #279)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openRbqm(page, '?rbqm=recorded');
    // Two files of the reader's own, chosen on the Data tab (#282): they take
    // the demo study's place, and the page says so.
    await chooseOnDataTab(page, [OWN_SUBJ, OWN_AE]);
    await expect(page.locator('.sva-loaded-name')).toHaveText(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    await rbqmTab(page).click();
    await expect(page.locator('.sva-content > .sva-notes .sva-note')).toHaveText([
      'The demo study (RBQM study) was cleared to load your files.'
    ]);
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded files support 2 of 8 metrics. Change the data on the Data tab.'
    );
    // Before R the row already says which metrics the files cannot support.
    const states = () =>
      rbqmItems(page).evaluateAll((items) => items.slice(1).map((node) => node.dataset.state));
    expect(await states()).toEqual(['todo', 'todo', ...Array(6).fill('cannot')]);
    await rbqmStart(page).click();
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran 2 of 8 metrics on the 2 loaded files in [\d.]+ seconds?\. The other 6 need data it does not have: change the data on the Data tab\. Run details$/
    );
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('2 of 8');
    expect(await states()).toEqual(['ran', 'ran', ...Array(6).fill('cannot')]);
    await expect(rbqmItems(page).locator('.sva-ico-ran')).toHaveCount(2);
    await expect(rbqmItems(page).locator('.sva-ico-cannot')).toHaveCount(6);
    // The mark of one that did not run is grey: missing data is not an error.
    await expect(rbqmChoice(page, 'kri0012').locator('.sva-ico')).toHaveCSS(
      'color',
      'rgb(139, 147, 157)'
    );
    const two = tabExpected.partial['two-files'];
    for (const entry of two.status.filter((metric) => metric.state !== 'ran')) {
      await rbqmChoice(page, entry.id).click();
      await expect(rbqmChoice(page, entry.id)).toHaveAttribute(
        'aria-label',
        `${entry.metric}: did not run`
      );
      await expect(page.locator('.sva-rbqm-metric-name')).toHaveText(entry.metric);
      await expect(page.locator('.sva-rbqm-metric .sva-rbqm-count')).toHaveText(
        `${entry.abbreviation}, did not run`
      );
      await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
      await expect(page.locator('.sva-rbqm-figures')).toHaveCount(0);
      await expect(page.locator('.sva-rbqm-metric canvas')).toHaveCount(0);
    }
    await expect(page.locator('.sva-rbqm-why')).toHaveText(
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
    // The way to the data is the Data tab, where every file comes in (#282):
    // the RBQM tab has no place to load one.
    await expect(
      page.locator('.sva-view input[type="file"], .sva-view .sva-drop, .sva-view details')
    ).toHaveCount(0);
    await page.locator('.sva-rbqm-whybox .sva-rbqm-data').click();
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-data .sva-drop')).toBeInViewport();
    await expect(supportSay(page)).toHaveText('This data supports 2 of 8 metrics.');
    // Nothing was loaded there, so back on the tab R's answer stands.
    await rbqmTab(page).click();
    await rbqmOverview(page).click();
    await expect(rbqmOverview(page)).toHaveAttribute('aria-current', 'page');
    // What R said beside its tables, and what the overview then lacks, are in Run details.
    const details = await runDetails(page);
    expect(details.sections.Notes).toEqual([
      ...two.notes,
      two.groups.message,
      'With no Groups table, the overview names each site by its ID alone and shows no enrolment.',
      'The demo study (RBQM study) was cleared to load your files.'
    ]);
    expect(details.sections['Did not run']).toEqual(
      two.status.filter((metric) => metric.state !== 'ran').map((metric) => metric.message)
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.sva-content .sva-notes')).toHaveCount(0);
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(148);
    await expect(page.locator('.sva-rbqm-headrow .sva-rbqm-count')).toHaveText(
      '148 sites, 12 shown here'
    );
    await expect(page.locator('.sva-rbqm-table thead th')).toHaveText([
      'Group',
      'Red Flags',
      'Amber Flags',
      'AE',
      'SAE'
    ]);
    // A metric that ran still draws, with no group table to size its points by.
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await expect(page.locator('.sva-rbqm-caption')).toHaveCount(0);
    await rbqmChoice(page, 'kri0012').click();
    await captureEvidence(page, 'APP-RBQM-022', 'metric-did-not-run-1280');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await captureEvidence(page.locator('.sva-rbqm-metric'), 'APP-RBQM-022', 'metric-did-not-run');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-023: at a 390-pixel viewport the tab does not scroll sideways before the press, while R starts or with the results drawn; its row scrolls under the R control as any other tab’s does, the overview table and both charts fit the width, and the table’s headings are at least 10 pixels (#235, #278, #279)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openRbqm(page, '?rbqm=recorded');
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    // The row: the control first and in view, the nine items scrolling under it.
    const control = await rbqmControl(page).boundingBox();
    expect(control.x).toBeLessThan(2);
    expect(control.x + control.width).toBeLessThanOrEqual(390);
    expect(
      await page.locator('.sva-charts').evaluate((row) => row.scrollWidth > row.clientWidth)
    ).toBe(true);
    for (const one of await rbqmItems(page).all()) {
      expect((await one.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await rbqmChoice(page, 'kri0012').scrollIntoViewIfNeeded();
    expect((await rbqmControl(page).boundingBox()).x).toBeLessThan(2);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    // The table fits its box: nothing of it is off to the side.
    const table = await page
      .locator('.sva-rbqm-table')
      .evaluate((node) => ({ inner: node.scrollWidth, box: node.clientWidth }));
    expect(table.inner).toBeLessThanOrEqual(table.box);
    // Its headings are at least 10 pixels (#278).
    const headings = await page
      .locator('.sva-rbqm-table thead th')
      .evaluateAll((cells) => cells.map((cell) => parseFloat(getComputedStyle(cell).fontSize)));
    expect(Math.min(...headings)).toBeGreaterThanOrEqual(10);
    await captureEvidence(page, 'APP-RBQM-023', 'rbqm-tab-390');
    // Run details opens inside the window.
    await rbqmChip(page).click();
    const panel = await rbqmPanel(page).boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await expect.poll(() => inked(page.locator('.sva-rbqm-figures canvas').nth(1))).toBe(true);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    for (const box of await page.locator('.sva-rbqm-figures canvas').all()) {
      const { x, width } = await box.boundingBox();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(390);
    }
    await page.locator('.sva-rbqm-metric').scrollIntoViewIfNeeded();
    await captureEvidence(page.locator('.sva-rbqm-metric'), 'APP-RBQM-023', 'rbqm-charts-390');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-024: when R does not start the tab’s control says so and why and offers to try again, and the body says no metric was run; when R stops during the run they say R stopped and why, and offer to run again (#235, #280)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openRbqm(page, '?rbqm=recorded');
    await page.evaluate(() => (window.__rbqmFails = 'start'));
    await rbqmStart(page).click();
    // The same failure state as the Biomarkers tab's (#277), in the same place,
    // the row's control (#280): the same words, Try again beside them, and the
    // reason one click away.
    const failed = rbqmControl(page);
    await expect(failed).toHaveAttribute('data-phase', 'failed');
    await expect(failed.locator('.sva-r-row')).toHaveText('R did not startTry againWhy▾');
    await expect(rbqmStatus(page)).toHaveText(
      'R did not start, so no metric was run. Try again, at the top right.'
    );
    await expect(rbqmStatus(page)).toHaveCSS('color', 'rgb(162, 66, 58)');
    await expect(page.locator('.sva-rbqm-run')).toHaveCount(0);
    await expect(page.locator('.sva-rbqm-steps')).toHaveCount(0);
    await expect(rbqmStart(page)).toHaveText('Try again');
    // No metric is left turning: each is back to what the files support.
    await expect(rbqmItems(page).locator('.sva-ico-running')).toHaveCount(0);
    await expect(rbqmItems(page).locator('.sva-ico-todo')).toHaveCount(8);
    await failed.locator('.sva-r-why').click();
    const reason = rbqmPanel(page);
    await expect(reason.locator(':scope > .sva-r-text')).toHaveText(
      'The browser could not download R from webr.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. No metric was run.'
    );
    await expect(reason.locator('.sva-r-more .sva-r-text')).toBeHidden();
    await reason.locator('.sva-r-more summary').click();
    await expect(reason.locator('.sva-r-more .sva-r-text')).toHaveText(
      'The browser said: Failed to fetch.'
    );
    await captureEvidence(page, 'APP-RBQM-024', 'rbqm-r-did-not-start');
    await page.keyboard.press('Escape');
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('no R');
    await expect(page.locator('.sva-rbqm-table')).toHaveCount(0);
    await page.evaluate(() => (window.__rbqmFails = 'run'));
    await rbqmStart(page).click();
    await expect(failed.locator('.sva-r-row')).toHaveText('R stoppedRun againWhy▾');
    await expect(rbqmStatus(page)).toHaveText(
      'R stopped, so there are no results. Run again, at the top right.'
    );
    await failed.locator('.sva-r-why').click();
    await expect(rbqmPanel(page).locator(':scope > .sva-r-text')).toHaveText(
      'R stopped while it was running gsm’s workflows, so there are no results. Run again; if it stops again, reload the page.'
    );
    await rbqmPanel(page).locator('.sva-r-more summary').click();
    await expect(rbqmPanel(page).locator('.sva-r-more .sva-r-text')).toHaveText(
      'R said: Error in rbqm_run: something gave way.'
    );
    await page.keyboard.press('Escape');
    await expect(rbqmStart(page)).toHaveText('Run again');
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('stopped');
    await page.evaluate(() => (window.__rbqmFails = null));
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    expect(errors).toEqual([]);
  });

  // The site overview's measurements at 1,280 pixels (#278): each column's
  // width, the table's box against its card, and the rows the box shows.
  const overviewMeasured = (page) =>
    page.evaluate(() => {
      const box = document.querySelector('.sva-rbqm-table');
      const card = document.querySelector('.sva-rbqm-page');
      const style = getComputedStyle(card);
      const edge = box.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(box).borderBottomWidth);
      const rows = [...box.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect());
      const inView = rows.filter((row) => row.top < edge.bottom - border - 1);
      return {
        columns: [...box.querySelectorAll('thead th')]
          .slice(1)
          .map((cell) => cell.getBoundingClientRect().width),
        table: box.querySelector('table').getBoundingClientRect().width,
        box: edge.width,
        inside: card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        hidden: box.scrollWidth - box.clientWidth,
        rows: rows.length,
        inView: inView.length,
        // How far the last row in view ends from the foot of the box: nothing, when it is whole.
        cut: inView.at(-1).bottom - (edge.bottom - border)
      };
    });

  test('APP-RBQM-070: at 1,280 pixels the site overview is fitted to its numbers: on the study the app opens with, no number or flag column is wider than 100 pixels and the table is narrower than its card; on the RBQM study, with eight metrics, the table fits its card with nothing off to the side; the heading counts the sites and how many show, the last row in view is whole, and the key to the flags is shown (#278)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await rbqmTab(page).click();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    const pilot = await overviewMeasured(page);
    // Enrolled, the two flag counts and three metrics.
    expect(pilot.columns).toHaveLength(6);
    for (const width of pilot.columns) expect(width).toBeLessThanOrEqual(100.5);
    expect(pilot.table).toBeLessThan(pilot.inside - 100);
    expect(pilot.box).toBeLessThan(pilot.inside);
    expect(pilot.hidden).toBeLessThanOrEqual(0);
    expect([pilot.rows, pilot.inView]).toEqual([17, 12]);
    expect(Math.abs(pilot.cut)).toBeLessThanOrEqual(1);
    await expect(page.locator('.sva-rbqm-headrow h2, .sva-rbqm-headrow h3').first()).toHaveText(
      'Site overview'
    );
    await expect(page.locator('.sva-rbqm-headrow .sva-rbqm-count')).toHaveText(
      '17 sites, 12 shown here'
    );
    // The key is beside the table, where the card has room for it.
    const key = page.locator('.sva-rbqm-key');
    await expect(key).toBeVisible();
    await expect(key.locator('li')).toHaveText([
      'within limits',
      'amber flag: high, or low when it points down',
      'red flag: high, or low when it points down',
      'no score, so no flag'
    ]);
    await expect(key.locator('li svg')).toHaveCount(4);
    const [keyBox, tableBox] = [
      await key.boundingBox(),
      await page.locator('.sva-rbqm-table').boundingBox()
    ];
    expect(keyBox.x).toBeGreaterThanOrEqual(tableBox.x + tableBox.width);
    // The rest of the sites are a scroll away, inside the table's own box.
    await page.locator('.sva-rbqm-table').evaluate((box) => box.scrollTo(0, box.scrollHeight));
    await expect(page.locator('.sva-rbqm-table tbody tr').last()).toBeInViewport();
    await page.locator('.sva-rbqm-table').evaluate((box) => box.scrollTo(0, 0));
    await captureEvidence(page, 'APP-RBQM-070', 'overview-fitted-pilot');

    // The RBQM study: eight metrics, 150 sites.
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    const whole = await overviewMeasured(page);
    expect(whole.columns).toHaveLength(11);
    for (const width of whole.columns) expect(width).toBeLessThanOrEqual(100.5);
    expect(whole.box).toBeLessThanOrEqual(whole.inside);
    expect(whole.hidden).toBeLessThanOrEqual(0);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    expect([whole.rows, whole.inView]).toEqual([150, 12]);
    expect(Math.abs(whole.cut)).toBeLessThanOrEqual(1);
    await expect(page.locator('.sva-rbqm-headrow .sva-rbqm-count')).toHaveText(
      '150 sites, 12 shown here'
    );
    await expect(key).toBeVisible();
    await captureEvidence(page, 'APP-RBQM-070', 'overview-fitted-rbqm');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-071: at 1,280 pixels the RBQM tab has a row of its own: Overview and one item for each metric, each with a mark for its state and a name a screen reader says in full, "Adverse Event Rate: ran"; with eight metrics the row fits beside the R control and does not scroll; on the study the app opens with, the five metrics it cannot support are marked so before R, as ones that cannot run, and after, as ones that did not; the body holds no button that chooses a metric (#279)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const named = () =>
      rbqmItems(page).evaluateAll((items) =>
        items.map((node) => [
          node.textContent,
          node.getAttribute('aria-label'),
          [...(node.querySelector('svg') || { classList: [] }).classList].find((name) =>
            name.startsWith('sva-ico-')
          ) || null
        ])
      );
    const fits = async () => {
      const row = await page
        .locator('.sva-charts')
        .evaluate((node) => ({ inner: node.scrollWidth, box: node.clientWidth }));
      expect(row.inner).toBeLessThanOrEqual(row.box);
      // Every item, and the control after the last of them, on one line.
      const control = await rbqmControl(page).boundingBox();
      const last = await rbqmItems(page).last().boundingBox();
      expect(last.x + last.width).toBeLessThanOrEqual(control.x);
      expect(Math.abs(last.y + last.height / 2 - (control.y + control.height / 2))).toBeLessThan(
        control.height
      );
      expect(control.x + control.width).toBeLessThanOrEqual(1280);
    };

    // The study the app opens with: three metrics it supports, five it cannot.
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await rbqmTab(page).click();
    const { status } = pilotExpected.answer;
    expect(await named()).toEqual([
      ['Overview', null, null],
      ...status.map((entry) => [
        entry.abbreviation,
        `${entry.metric}: ${entry.state === 'ran' ? 'not started' : 'cannot run'}`,
        entry.state === 'ran' ? 'sva-ico-todo' : 'sva-ico-cannot'
      ])
    ]);
    await expect(rbqmOverview(page)).toHaveAttribute('aria-current', 'page');
    await fits();
    await captureEvidence(page, 'APP-RBQM-071', 'rbqm-row-before-r');
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    expect(await named()).toEqual([
      ['Overview', null, null],
      ...status.map((entry) => [
        entry.abbreviation,
        `${entry.metric}: ${entry.state === 'ran' ? 'ran' : 'did not run'}`,
        entry.state === 'ran' ? 'sva-ico-ran' : 'sva-ico-cannot'
      ])
    ]);
    // A mark is decoration: the state is in the item's name.
    await expect(rbqmItems(page).locator('svg[aria-hidden="true"]')).toHaveCount(8);
    await expect(rbqmChoice(page, 'kri0001').locator('.sva-ico')).toHaveCSS(
      'color',
      'rgb(95, 158, 69)'
    );
    await fits();
    // No buttons for choosing a metric are left in the body.
    await expect(page.locator('.sva-content button[data-metric]')).toHaveCount(0);
    await captureEvidence(page, 'APP-RBQM-071', 'rbqm-row-pilot');

    // The RBQM study: all eight run.
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    expect(await named()).toEqual([
      ['Overview', null, null],
      ...tabExpected.whole.Metrics.map((metric) => [
        metric.Abbreviation,
        `${metric.Metric}: ran`,
        'sva-ico-ran'
      ])
    ]);
    await fits();
    await captureEvidence(page, 'APP-RBQM-071', 'rbqm-row-rbqm');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-080: the RBQM tab ends with its footnote, one link reading "gsm.kri documentation": under the tab’s page at 1,280 pixels before R and after a run, on the Overview and on a metric’s page, opening in a new tab and asking nothing of that site until it is clicked; at 390 pixels it is on the page with no sideways scroll (#271)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    const asked = [];
    page.on('request', (request) => asked.push(new URL(request.url()).host));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded#rbqm');
    await page.evaluate(`${APP}.ready`);
    const footnote = page.locator('.sva-chart-links');
    const link = footnote.locator('a');
    const held = async () => {
      await expect(footnote).toHaveCount(1);
      await expect(footnote).toHaveText('RBQM: gsm.kri documentation');
      await expect(link).toHaveAttribute('href', 'https://gilead-public.github.io/gsm.kri/');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
      // Under everything the tab draws.
      const [view, note] = [
        await page.locator('.sva-view').boundingBox(),
        await footnote.boundingBox()
      ];
      expect(note.y).toBeGreaterThanOrEqual(view.y + view.height);
    };
    await held();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await held();
    await footnote.scrollIntoViewIfNeeded();
    await captureEvidence(footnote, 'APP-RBQM-080', 'rbqm-footnote');
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await held();
    // A phone: the footnote is on the page, and nothing runs off it.
    await page.setViewportSize({ width: 390, height: 844 });
    await held();
    await expect.poll(() => sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await rbqmOverview(page).click();
    await held();
    await expect.poll(() => sidewaysScroll(page)).toBeLessThanOrEqual(0);
    // Showing the link asked nothing of the site it leads to.
    expect(asked.filter((host) => /gilead/.test(host))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-072: a link to a metric’s address opens the tab on that metric: before R it is that metric’s page saying R is needed, one press then draws its two charts with no further choice; the address follows the row, and an address typed over it opens the metric it names, or the Overview when it names none (#279)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded#rbqm/kri0002');
    await page.evaluate(`${APP}.ready`);
    await expect(rbqmTab(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(rbqmChoice(page, 'kri0002')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-rbqm-metric-name')).toHaveText('Serious Adverse Event Rate');
    await expect(page.locator('.sva-rbqm-metric .sva-rbqm-count')).toHaveText('SAE, not started');
    await expect(rbqmStatus(page)).toHaveText(RBQM_NEED);
    await expect(page.locator('.sva-rbqm-table')).toHaveCount(0);
    // One press, and the metric the link named is drawn.
    await rbqmStart(page).click();
    const canvases = page.locator('.sva-rbqm-figures canvas');
    await expect(canvases).toHaveCount(2);
    await expect.poll(() => inked(canvases.nth(0))).toBe(true);
    await expect.poll(() => inked(canvases.nth(1))).toBe(true);
    await expect(page.locator('.sva-rbqm-metric .sva-rbqm-count')).toHaveText('SAE, ran');
    await expect(page).toHaveURL(/#rbqm\/kri0002$/);
    // The address follows the row, and the page follows an address typed over it.
    await rbqmChoice(page, 'kri0001').click();
    await expect(page).toHaveURL(/#rbqm\/kri0001$/);
    await rbqmOverview(page).click();
    await expect(page).toHaveURL(/#rbqm$/);
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await page.evaluate(() => (window.location.hash = '#rbqm/kri0001'));
    await expect(page.locator('.sva-rbqm-metric-name')).toHaveText('Adverse Event Rate');
    await expect(rbqmChoice(page, 'kri0001')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    // A metric the study cannot support, by its address.
    await page.evaluate(() => (window.location.hash = '#rbqm/kri0012'));
    await expect(page.locator('.sva-rbqm-why')).toHaveText(
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
    // An address that names no metric of the tab.
    await page.evaluate(() => (window.location.hash = '#rbqm/nothing'));
    await expect(rbqmOverview(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run'
    ]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-073: once R has run, the control is a chip whose panel is closed until it is opened, from the chip or from Run details beside the outcome; the panel holds the steps, what R was handed, what did not run, the versions and R’s warnings, and Run again, which runs the metrics on the R already started; choosing another study then runs it with no press (#280)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await rbqmTab(page).click();
    await captureEvidence(page, 'APP-RBQM-073', 'rbqm-before-r-1280');
    // One press, and no second.
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await expect(rbqmControl(page)).toHaveAttribute('data-phase', 'ready');
    await expect(rbqmControl(page).locator('.sva-r-row')).toHaveText('R ready▾');
    await expect(page.locator('.sva-charts .sva-action')).toHaveCount(0);
    await expect(rbqmPanel(page)).toHaveCount(0);
    await expect(rbqmChip(page)).toHaveAttribute('aria-expanded', 'false');
    await captureEvidence(page, 'APP-RBQM-073', 'rbqm-after-run-1280');

    // Opened from the line above the table.
    await page.locator('.sva-rbqm-details').click();
    await expect(rbqmPanel(page)).toBeVisible();
    await expect(rbqmChip(page)).toHaveAttribute('aria-expanded', 'true');
    const details = await runDetails(page);
    expect(details.heading).toBe('R is running in this browser');
    expect(Object.keys(details.sections)).toEqual([
      'Steps',
      'What R was handed',
      'Did not run',
      'Versions',
      'Warnings from R'
    ]);
    expect(details.sections.Steps.slice(0, 5)).toEqual([
      'Downloaded R 13 MB',
      'Installed R packages 42 MB',
      'Fetched gsm’s workflow files',
      'Loaded gsm’s packages',
      expect.stringMatching(/^Ran the workflows [\d.]+ s$/)
    ]);
    expect(details.sections['What R was handed']).toHaveLength(2);
    expect(details.sections['Did not run']).toHaveLength(5);
    expect(details.actions).toEqual(['Run again']);
    // The panel is inside the window, under the control.
    const panel = await rbqmPanel(page).boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(1280);
    await captureEvidence(page, 'APP-RBQM-073', 'rbqm-run-details-1280');
    // Closed by Escape, opened again from the chip.
    await page.keyboard.press('Escape');
    await expect(rbqmPanel(page)).toHaveCount(0);
    await rbqmChip(page).click();
    await expect(rbqmPanel(page)).toBeVisible();

    // Run again: the metrics, on the R already started.
    await rbqmPanel(page).locator('.sva-r-actions button', { hasText: 'Run again' }).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await expect(rbqmControl(page)).toHaveAttribute('data-phase', 'ready');
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run'
    ]);
    const again = await runDetails(page);
    expect(again.sections.Steps).toEqual([
      expect.stringMatching(/^Ran the workflows [\d.]+ s$/),
      'R was already running, so only the last step ran again.'
    ]);
    await page.keyboard.press('Escape');

    // Another study, chosen once R is ready, runs with no press.
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    await expect(rbqmStatus(page)).toHaveText(/^R ran 8 of 8 metrics on the 9 loaded files in /);
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('8 of 8');
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run',
      'rbqm_run'
    ]);
    expect(errors).toEqual([]);
  });

  test('APP-R-054: Run details left open is closed when the reader comes back to the tab: on the keynote’s path, with the panel open on the pilot study’s result, choosing the RBQM study on the Data tab and coming back shows the new result with nothing over it; while it is open the panel covers the tab’s status label whole (#309)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    // With the welcome line closed the tab's card, and the label on its corner,
    // are as high on the page as they get.
    await page.locator('.sva-welcome').getByRole('button', { name: 'Dismiss' }).click();
    await rbqmTab(page).click();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await page.locator('.sva-rbqm-details').click();
    await expect(rbqmPanel(page)).toBeVisible();
    // No edge of the tab's Experimental label shows above the open panel.
    const [pill, open] = await Promise.all([
      page.locator('.sva-corner .sv-status-label').boundingBox(),
      rbqmPanel(page).boundingBox()
    ]);
    expect(pill.x).toBeGreaterThan(open.x);
    expect(pill.x + pill.width).toBeLessThan(open.x + open.width);
    expect(pill.y).toBeGreaterThanOrEqual(open.y);
    // Left open, and the tab left.
    await item(page, 'data').click();
    await expect(rbqmPanel(page)).toHaveCount(0);
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    // The new study is run with no press, and its result has nothing over it.
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    await expect(rbqmStatus(page)).toHaveText(/^R ran 8 of 8 metrics on the 9 loaded files in /);
    await expect(rbqmPanel(page)).toHaveCount(0);
    await expect(rbqmChip(page)).toHaveAttribute('aria-expanded', 'false');
    await captureEvidence(page, 'APP-R-054', 'rbqm-back-with-no-panel-1280');
    // The same from a chart's tab, and the panel still opens when asked.
    await rbqmChip(page).click();
    await expect(rbqmPanel(page)).toBeVisible();
    await openChart(page, 'histogram');
    await rbqmTab(page).click();
    await expect(rbqmPanel(page)).toHaveCount(0);
    await rbqmChip(page).click();
    await expect(rbqmPanel(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-030: choosing the RBQM study and starting R send nothing beyond what R needs: from the study’s choice until five quiet seconds after the charts are drawn, every request the page and its workers make is a GET or HEAD with no body, no query and no header the browser did not set itself, to three addresses and no other: the page’s own, for the study’s files, gsm.viz’s bundle, the files R is given and gsm’s four packages; webr.r-wasm.org, for R; and repo.r-wasm.org, for packages. No address names a participant, and neither the page nor its workers open a socket (#235)', { tag: '@real-r' }, async ({
    page,
    context
  }) => {
    test.setTimeout(480000);
    const errors = watchErrors(page);
    const watch = watchRequests(page, context);
    const { requests, sockets } = watch;
    await page.goto('/tests/e2e/fixtures/basic-app.html');
    await page.evaluate(`${APP}.ready`);
    const own = new URL(page.url()).origin;
    await item(page, 'data').click();
    watch.chosen = true;
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360000
    });
    // Each metric's page in turn, from the tab's row (#279): its two charts.
    for (const metric of RBQM_TAB.metrics) {
      await rbqmChoice(page, metric).click();
      await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    }
    // That was the last action.
    await watch.quiet();
    const after = watch.onlyReads(own);
    const asked = (origin) => [
      ...new Set(
        after
          .filter((request) => new URL(request.url).origin === origin)
          .map((request) => `${request.method} ${new URL(request.url).pathname}`)
      )
    ];
    // Three addresses, and no other.
    const index = RBQM_TAB.publicIndex;
    expect([...new Set(after.map((request) => new URL(request.url).origin))].sort()).toEqual(
      [own, 'https://webr.r-wasm.org', index].sort()
    );
    // The page's own: the study's nine files, gsm.viz's bundle, each file R
    // is given, and gsm's four packages with the list that names them.
    const repository = `/${RBQM_TAB.repository}/`;
    const ownAsked = asked(own);
    expect(ownAsked.filter((entry) => !entry.includes(repository)).sort()).toEqual(
      [
        ...tabStudyFiles().map(({ file }) => `GET /${file}`),
        `GET /${RBQM_CHARTS.path}`,
        ...pipelineFiles().map(({ file }) => `GET /${file}`)
      ].sort()
    );
    const fromRepository = ownAsked.filter((entry) => entry.includes(repository));
    const tarballs = fromRepository.filter((entry) => entry.endsWith('.tgz'));
    expect(tarballs).toHaveLength(RBQM_TAB.packages.length);
    for (const name of RBQM_TAB.packages) {
      expect(
        tarballs.filter((entry) => entry.split('/').pop().startsWith(`${name}_`)),
        name
      ).toHaveLength(1);
    }
    const inARepository =
      /\/bin\/emscripten\/contrib\/\d+\.\d+\/(PACKAGES(\.gz|\.rds)?|[A-Za-z0-9.]+_[\w.-]+\.(tgz|js\.metadata|data(\.gz)?))$/;
    for (const entry of fromRepository) expect(entry).toMatch(inARepository);
    // The public index: its list of packages, and packages; nothing else.
    const indexAsked = asked(index);
    expect(indexAsked.length).toBeGreaterThan(20);
    for (const entry of indexAsked) expect(entry).toMatch(inARepository);
    // None of gsm's four came from the public index, which has no build of them.
    for (const name of RBQM_TAB.packages) {
      expect(indexAsked.filter((entry) => entry.includes(`/${name}_`))).toEqual([]);
    }
    // webR's host: one version of webR, and the files R asks it for.
    const webrAsked = after.filter(
      (request) => new URL(request.url).origin === 'https://webr.r-wasm.org'
    );
    const versions = new Set(
      webrAsked.map((request) => new URL(request.url).pathname.split('/')[1])
    );
    expect(versions.size).toBe(1);
    const [version] = versions;
    expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    const webrFiles = [
      ...new Set(
        webrAsked.map(
          (request) =>
            `${request.method} ${new URL(request.url).pathname.slice(version.length + 2)}`
        )
      )
    ].sort();
    expect(webrFiles).toEqual(WEBR_FILES_FOR_PACKAGES);
    // No address names a participant of the study: no ID of one is a word of any address.
    const columnOf = (file, name) => {
      const [header, ...lines] = readFileSync(new URL(file, import.meta.url), 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(',').map((field) => field.replace(/"/g, '')));
      return lines.map((fields) => fields[header.indexOf(name)]);
    };
    const subjects = new Set([
      ...columnOf('../../site/data/rbqm/Raw_ENROLL.csv', 'subjid'),
      ...columnOf('../../site/data/rbqm/Raw_ENROLL.csv', 'subjectid')
    ]);
    expect(subjects.size).toBeGreaterThan(2000);
    const named = after.filter((request) =>
      decodeURIComponent(request.url)
        .split(/[^A-Za-z0-9-]+/)
        .some((word) => subjects.has(word))
    );
    expect(named).toEqual([]);
    expect(requests.length).toBeGreaterThan(60);
    expect(sockets).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-036: a reader’s own raw files, with no demo study: files chosen from disk on the Data tab are kept as raw files, each card naming the raw domain it was placed in and one that lacks a column naming the column; a file of no raw domain dropped there is no raw file; the Data tab’s card says which metrics the files support before R is started, in the words desktop R said after running; Start R on the RBQM tab then draws the two adverse event metrics and says of each other metric which file it needs (#236, #281, #282)', async ({
    page
  }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty&rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    // With nothing loaded the RBQM tab has nothing to run, and no place to load a file.
    await rbqmTab(page).click();
    await expect(rbqmStatus(page)).toHaveText(
      'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or load gsm raw files there.'
    );
    await expect(rbqmStart(page)).toBeDisabled();
    await expect(
      page.locator('.sva-view input[type="file"], .sva-view .sva-drop, .sva-view details')
    ).toHaveCount(0);

    // Chosen from disk on the Data tab, with the browser's own file chooser.
    await item(page, 'data').click();
    await expect(page.locator('.sva-drop-note')).toHaveText(
      'Study files or gsm raw files. They are read in this browser and sent nowhere.'
    );
    await expect(supportCard(page)).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await sideAction(page, 'choose-files').click();
    await (await chooser).setFiles([OWN_SUBJ, withoutAColumn(testInfo)]);
    await expect(rawTags(page)).toHaveText([
      'gsm raw file: Raw_SUBJ, by its name',
      'gsm raw file: Raw_AE, by its name'
    ]);
    await expect(rawTags(page).nth(1)).toHaveAttribute(
      'title',
      'Raw_AE.csv is Raw_AE, by its name. It lacks the column aeser.'
    );
    await expect(supportSay(page)).toHaveText('This data supports 0 of 8 metrics.');
    const reasons = supportCard(page).locator('.sva-support-why li');
    await supportCard(page).locator('.sva-support-why summary').click();
    await expect(reasons.nth(0)).toHaveText(
      'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    );
    await expect(reasons.nth(1)).toHaveText(
      'Serious Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    );

    // The whole file of the same name takes its place. A file of no raw domain,
    // dropped as a reader drops one, is no raw file: it is a study file the
    // app could not place, and R is not handed it.
    await page.locator('.sva-file-input').setInputFiles([OWN_AE]);
    const dropped = await page.evaluateHandle(
      (text) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([text], 'site_notes.csv', { type: 'text/csv' }));
        return transfer;
      },
      readFileSync(OWN_NOTES, 'utf8')
    );
    await page.dispatchEvent('.sva-drop', 'drop', { dataTransfer: dropped });
    await expect(page.locator('.sva-file.sva-unplaced .sva-file-name')).toHaveText([
      'site_notes.csv'
    ]);
    await expect(rawTags(page)).toHaveText([
      'gsm raw file: Raw_SUBJ, by its name',
      'gsm raw file: Raw_AE, by its name'
    ]);
    await expect(rawTags(page).nth(1)).toHaveAttribute(
      'title',
      'Raw_AE.csv is Raw_AE, by its name.'
    );
    // Said before R is started, in the words desktop R said after running.
    const two = tabExpected.partial['two-files'];
    await expect(supportSay(page)).toHaveText('This data supports 2 of 8 metrics.');
    expect(await saidOnCard(page)).toEqual(
      two.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    await expect(supportCard(page).locator('.sva-support-why summary')).toHaveText(
      'Why 6 cannot run'
    );
    await expect(reasons.last()).toHaveText(two.groups.message);
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([]);
    // Neither raw file was placed in a safety domain or given a mapping.
    expect(
      await page.evaluate(() => {
        const { files, unplaced, raw } = window.__safetyVizApp.state;
        return [
          Object.keys(files),
          unplaced.map((entry) => entry.file.name),
          raw.map((file) => file.name)
        ];
      })
    ).toEqual([[], ['site_notes.csv'], ['Raw_SUBJ.csv', 'Raw_AE.csv']]);
    await captureEvidence(page.locator('.sva-data-main'), 'APP-RBQM-036', 'own-files-before-r');

    // The card's button leads to the tab, where R is started.
    await supportCard(page).locator('[data-action="open-view"]').click();
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded files support 2 of 8 metrics. Change the data on the Data tab.'
    );
    await rbqmStart(page).click();
    await expect(rbqmStatus(page)).toHaveText(/^R ran 2 of 8 metrics on the 2 loaded files/);
    // R was handed the two raw files, under gsm's names, and not the third.
    expect(
      await page.evaluate(() =>
        Object.keys(window.__rbqmRequest.files).map((file) => file.split('/').pop())
      )
    ).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    for (const entry of two.status) {
      await rbqmChoice(page, entry.id).click();
      await expect(page.locator('.sva-rbqm-metric-name')).toHaveText(entry.metric);
      if (entry.state === 'ran') {
        const canvases = page.locator('.sva-rbqm-figures canvas');
        await expect(canvases).toHaveCount(2);
        await expect.poll(() => inked(canvases.nth(0))).toBe(true);
        await expect.poll(() => inked(canvases.nth(1))).toBe(true);
      } else {
        await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
        await expect(page.locator('.sva-rbqm-figures')).toHaveCount(0);
      }
    }
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await captureEvidence(page.locator('.sva-rbqm'), 'APP-RBQM-036', 'own-files-two');

    // Back on the Data tab the card's marks are the tab's: two ran. At a
    // phone's width the card and its reasons fit.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(`${APP}.select('data')`);
    await expect(supportCard(page).locator('.sva-support-items li')).toHaveCount(8);
    expect(
      await supportCard(page)
        .locator('.sva-support-items li')
        .evaluateAll((items) => items.map((node) => node.dataset.state))
    ).toEqual(['ran', 'ran', ...Array(6).fill('cannot')]);
    await supportCard(page).locator('.sva-support-why summary').click();
    await expect(reasons).toHaveCount(7);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await captureEvidence(supportCard(page), 'APP-RBQM-036', 'own-files-390');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-075: a study’s files and gsm raw files chosen together on the Data tab each go where they belong: the raw files are kept as they are, the Renamed columns study is read as a study with `ae.csv` its adverse events file, and its charts draw; a demo study gives way once; a raw file that is not a CSV is refused with its sentence (#282)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await item(page, 'data').click();
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    // One choice of seven files: the four of the Renamed columns study and three raw files.
    await page.locator('.sva-file-input').setInputFiles([...STUDY, OWN_SUBJ, OWN_AE, OWN_PD]);
    await expect(page.locator('.sva-notes .sva-note')).toHaveText([
      'The demo study (Pilot study) was cleared to load your files.'
    ]);
    await expect(page.locator('.sva-file[data-domain] .sva-file-name')).toHaveText([
      'dm.csv',
      'ae.csv',
      'labs_final.csv',
      'ecg.json'
    ]);
    await expect(card(page, 'ae').locator('.sva-file-name')).toHaveText('ae.csv');
    await expect(card(page, 'ae').locator('.sva-map')).toBeVisible();
    await expect(page.locator('.sva-file.sva-raw .sva-file-name')).toHaveText([
      'Raw_SUBJ.csv',
      'Raw_AE.csv',
      'Raw_PD.csv'
    ]);
    await expect(rawTags(page)).toHaveText([
      'gsm raw file: Raw_SUBJ, by its name',
      'gsm raw file: Raw_AE, by its name',
      'gsm raw file: Raw_PD, by its name'
    ]);
    await expect(page.locator('.sva-file.sva-raw .sva-map')).toHaveCount(0);
    await expect(page.locator('.sva-file.sva-unplaced')).toHaveCount(0);
    await expect(stepStatus(page, 'load')).toHaveText('7 files loaded');
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 6 needed by a chart');
    // The study's charts lead the third step; the metrics are counted beside them.
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open a chart');
    await expect(stepStatus(page, 'open')).toHaveText(
      '12 of 18 charts ready · 4 of 8 RBQM metrics'
    );
    await captureEvidence(page, 'APP-RBQM-075', 'mixed-drop-1280');

    // A raw file that is not a CSV, told by its name, is refused in the tab's sentence.
    await page.locator('.sva-file-input').setInputFiles([
      {
        name: 'Raw_LB.json',
        mimeType: 'application/json',
        buffer: Buffer.from('[{"subjid":"0001","toxgrg_nsv":"3"}]')
      }
    ]);
    await expect(page.locator('.sva-notes .sva-note')).toHaveText([
      'Raw_LB.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.'
    ]);
    await expect(page.locator('.sva-file.sva-raw')).toHaveCount(3);
    await expect(page.locator('.sva-file[data-domain]')).toHaveCount(4);

    // The study's charts draw as they did before the Data tab took raw files.
    await correct(page);
    await expect(stepStatus(page, 'open')).toHaveText(
      '18 of 18 charts ready · 4 of 8 RBQM metrics'
    );
    await sideAction(page, 'open-chart').click();
    await expect(item(page, 'histogram')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await openChart(page, 'ae-explorer');
    await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
    // And the raw files are what R is handed on the RBQM tab, with the study's
    // subject-level file for the one raw table they do not give. The stand-in
    // for R answers with another study's rows here, so only what it was handed is read.
    await rbqmTab(page).click();
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded files support 4 of 8 metrics. Change the data on the Data tab.'
    );
    await rbqmStart(page).click();
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran \d of 8 metrics on the 3 loaded files and the loaded study’s dm\.csv /
    );
    expect(
      await page.evaluate(() =>
        Object.keys(window.__rbqmRequest.files)
          .map((file) => file.split('/').pop())
          .filter((file) => file.startsWith('Raw_'))
      )
    ).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv', 'Raw_PD.csv']);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-076: the Data tab’s one RBQM card, between the drop zone and the files, in its three states at 1,280 pixels and at 390: on three raw files, four of eight metrics with R’s reasons behind "Why 4 cannot run"; on the RBQM study, eight of eight and no reasons; on the study the app opens with, three of eight with the reasons in the open and which raw tables R makes from which file; each metric has the mark the RBQM tab’s row gives it, nothing scrolls sideways, and the card’s button opens the tab (#281)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    const marks = () =>
      supportCard(page)
        .locator('.sva-support-items li')
        .evaluateAll((items) =>
          items.map((node) => [
            node.textContent,
            node.dataset.state,
            node.querySelector('svg').getAttribute('class')
          ])
        );
    const three = tabExpected.partial['three-files'];
    // At both widths the card sits under the drop zone and above the first file's card.
    const placed = async () => {
      const [drop, said, file] = await Promise.all(
        ['.sva-drop', '.sva-support[data-support="rbqm"]', '.sva-file'].map((selector) =>
          page.locator(`.sva-data-main ${selector}`).first().boundingBox()
        )
      );
      expect(said.y).toBeGreaterThanOrEqual(drop.y + drop.height);
      expect(file.y).toBeGreaterThanOrEqual(said.y + said.height);
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    };
    const both = async (slug) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await placed();
      await captureEvidence(page, 'APP-RBQM-076', `${slug}-1280`);
      await page.setViewportSize({ width: 390, height: 844 });
      await placed();
      await captureEvidence(supportCard(page), 'APP-RBQM-076', `${slug}-390`);
      await page.setViewportSize({ width: 1280, height: 900 });
    };

    // Three raw files of the reader's own, dropped on the one drop zone.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty&rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await expect(supportCard(page)).toHaveCount(0);
    const dropped = await page.evaluateHandle(
      (files) => {
        const transfer = new DataTransfer();
        for (const [name, text] of files) {
          transfer.items.add(new File([text], name, { type: 'text/csv' }));
        }
        return transfer;
      },
      [OWN_SUBJ, OWN_AE, OWN_PD].map((file) => [file.split('/').pop(), readFileSync(file, 'utf8')])
    );
    await page.dispatchEvent('.sva-drop', 'drop', { dataTransfer: dropped });
    await expect(supportCard(page).locator('.sva-support-title')).toHaveText('RBQM');
    await expect(supportSay(page)).toHaveText('This data supports 4 of 8 metrics.');
    expect(await marks()).toEqual(
      three.status.map((entry) => [
        entry.abbreviation,
        entry.state === 'ran' ? 'todo' : 'cannot',
        expect.stringContaining(entry.state === 'ran' ? 'sva-ico-todo' : 'sva-ico-cannot')
      ])
    );
    // What the card says of each metric is what desktop R said after running the three files.
    expect(await saidOnCard(page)).toEqual(
      three.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    const why = supportCard(page).locator('.sva-support-why');
    await expect(why.locator('summary')).toHaveText('Why 4 cannot run');
    expect(await why.evaluate((node) => node.open)).toBe(false);
    await expect(why.locator('li').last()).toHaveText(three.groups.message, {
      useInnerText: false
    });
    await expect(supportCard(page).locator('.sva-support-key span')).toHaveText([
      'not started',
      'cannot run: missing data'
    ]);
    await expect(supportCard(page).locator('.sva-support-note')).toHaveText(
      'Read from the files’ names and columns. R says the same when it runs.'
    );
    await expect(rawTags(page)).toHaveText([
      'gsm raw file: Raw_SUBJ, by its name',
      'gsm raw file: Raw_AE, by its name',
      'gsm raw file: Raw_PD, by its name'
    ]);
    // A metric's mark says its state and R's reason to a pointer and to a screen reader.
    await expect(supportCard(page).locator('li[data-item="kri0012"]')).toHaveAttribute(
      'aria-label',
      'Screen Failure Rate: cannot run: missing data. Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
    await both('own-files');
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([]);

    // The RBQM study, on the page as it is served with its demo studies: all
    // eight, and nothing to explain.
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await expect(supportSay(page)).toHaveText('This data supports 8 of 8 metrics.');
    await expect(supportCard(page).locator('.sva-support-why')).toHaveCount(0);
    await expect(supportCard(page).locator('.sva-support-key span')).toHaveText(['not started']);
    expect((await marks()).map(([, state]) => state)).toEqual(Array(8).fill('todo'));
    await expect(rawTags(page)).toHaveCount(9);
    await both('rbqm-study');

    // The study the app opens with: three of eight, with the reasons in the open.
    await page.locator('.sva-side select.sva-study').selectOption('pilot');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    await expect(supportSay(page)).toHaveText('This data supports 3 of 8 metrics.');
    expect(await why.evaluate((node) => node.open)).toBe(true);
    await expect(why.locator('summary')).toHaveText('Why 5 cannot run');
    expect(await saidOnCard(page)).toEqual(
      pilotExpected.answer.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    await expect(supportCard(page).locator('.sva-support-lines li')).toHaveText([
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.',
      'adae.csv, the Adverse events file, gives Raw_AE.'
    ]);
    await expect(page.locator('.sva-file.sva-raw')).toHaveCount(0);
    await both('pilot-study');

    // The card starts nothing: its one button opens the tab, where R is started.
    await expect(supportCard(page).locator('button')).toHaveText(['Open RBQM']);
    await supportCard(page).locator('[data-action="open-view"]').click();
    await expect(rbqmStatus(page)).toHaveText(PILOT_NEED);
    expect(new URL(page.url()).hash).toBe('#rbqm');
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([]);
    // After a run the card's marks are the row's.
    await rbqmStart(page).click();
    await expect(rbqmStatus(page)).toHaveText(/^R ran 3 of 8 metrics on the Pilot study/);
    await item(page, 'data').click();
    expect((await marks()).map(([, state]) => state)).toEqual(
      pilotExpected.answer.status.map((entry) => (entry.state === 'ran' ? 'ran' : 'cannot'))
    );
    await expect(supportCard(page).locator('.sva-support-key span')).toHaveText([
      'ran',
      'cannot run: missing data'
    ]);
    await captureEvidence(supportCard(page), 'APP-RBQM-076', 'pilot-study-after-run');
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-077: with gsm raw files loaded and no chart ready the workflow’s third step reads "Open the RBQM tab", is the current step, counts the metrics before the charts and opens the tab; on the study the app opens with it reads "Open a chart" and counts the RBQM metrics beside the charts (#281)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty&rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open a chart');
    await expect(stepStatus(page, 'open')).toHaveText('0 of 18 charts ready');
    await page.locator('.sva-file-input').setInputFiles([OWN_SUBJ, OWN_AE, OWN_PD]);
    await expect(step(page, 'load')).toHaveAttribute('data-state', 'done');
    await expect(stepStatus(page, 'load')).toHaveText('3 files loaded');
    await expect(stepStatus(page, 'map')).toHaveText(
      'Nothing to map: gsm’s raw files are kept as they are'
    );
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open the RBQM tab');
    await expect(step(page, 'open')).toHaveAttribute('data-state', 'current');
    await expect(step(page, 'open')).toHaveAttribute('aria-current', 'step');
    await expect(stepStatus(page, 'open')).toHaveText(
      '4 of 8 metrics supported · 0 of 18 charts ready'
    );
    await expect(step(page, 'open').locator('button')).toHaveText(['Open RBQM']);
    await expect(sideAction(page, 'open-chart')).toHaveCount(0);
    await sideAction(page, 'open-view').click();
    await expect(rbqmStatus(page)).toHaveText(RBQM_NEED);
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded files support 4 of 8 metrics. Change the data on the Data tab.'
    );
    // The whole RBQM study leads there too, on the page as it is served with its demo studies.
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open the RBQM tab');
    await expect(stepStatus(page, 'open')).toHaveText(
      '8 of 8 metrics supported · 0 of 18 charts ready'
    );
    // A study whose charts are ready: the step is the charts', and the metrics are counted beside them.
    await page.locator('.sva-side select.sva-study').selectOption('pilot');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    await expect(step(page, 'open').locator('.sva-step-title')).toHaveText('Open a chart');
    await expect(stepStatus(page, 'open')).toHaveText(
      '18 of 18 charts ready · 3 of 8 RBQM metrics'
    );
    await expect(step(page, 'open').locator('button')).toHaveText(['Open first chart']);
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-078: three raw files dropped on the Data tab, in real R: the subjects, adverse events and protocol deviations files are dropped on the drop zone, the RBQM tab is opened from the card and Start R pressed; R runs the four metrics the card said the files support, every Results row of each is desktop R’s to eight decimal places, and what R says of each other metric is what the card said before R was started (#282)', { tag: '@real-r' }, async ({
    page
  }) => {
    test.setTimeout(480000);
    const errors = watchErrors(page);
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty');
    await page.evaluate(`${APP}.ready`);
    const dropped = await page.evaluateHandle(
      (files) => {
        const transfer = new DataTransfer();
        for (const [name, text] of files) {
          transfer.items.add(new File([text], name, { type: 'text/csv' }));
        }
        return transfer;
      },
      [OWN_SUBJ, OWN_AE, OWN_PD].map((file) => [file.split('/').pop(), readFileSync(file, 'utf8')])
    );
    await page.dispatchEvent('.sva-drop', 'drop', { dataTransfer: dropped });
    await expect(supportSay(page)).toHaveText('This data supports 4 of 8 metrics.');
    const before = await saidOnCard(page);
    // The three are kept as they are: none is placed in a standard domain or mapped.
    expect(
      await page.evaluate(() => {
        const { files, unplaced, raw } = window.__safetyVizApp.state;
        return [Object.keys(files), unplaced.length, raw.map((file) => file.name)];
      })
    ).toEqual([[], 0, ['Raw_SUBJ.csv', 'Raw_AE.csv', 'Raw_PD.csv']]);
    await supportCard(page).locator('[data-action="open-view"]').click();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360000
    });
    await expect(rbqmStatus(page)).toHaveText(/^R ran 4 of 8 metrics on the 3 loaded files/);

    // What R returned to the tab is what desktop R returned for the same three files.
    const three = tabExpected.partial['three-files'];
    const answer = await page.evaluate(() => window.__rbqmView.state().result.answer);
    expect(answer.warnings).toEqual([]);
    expect(answer.ran).toEqual(three.ran);
    expect(answer.ran.metrics).toEqual(['kri0001', 'kri0002', 'kri0003', 'kri0004']);
    const said = answer.status.map((entry) => [entry.id, entry.state === 'ran', entry.message]);
    expect(said).toEqual(before);
    expect(said).toEqual(
      three.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    expect(answer.groups).toEqual(three.groups);
    expect(answer.notes).toEqual(three.notes);
    // Desktop R's rows for the three files are the whole study's rows for the
    // four metrics, which scripts/rbqm-reference.mjs checks when it writes them.
    const key = (row) => `${row.MetricID} ${row.GroupID}`;
    const results = new Map(answer.Results.map((row) => [key(row), row]));
    for (const metric of three.ran.metrics) {
      const reference = tabExpected.whole.Results.filter(
        (row) => row.MetricID === `Analysis_${metric}`
      );
      expect(reference.length, metric).toBeGreaterThan(100);
      const got = answer.Results.filter((row) => row.MetricID === `Analysis_${metric}`);
      expect(got.map(key).sort(), metric).toEqual(reference.map(key).sort());
      for (const row of reference) {
        const mine = results.get(key(row));
        // Each key but the snapshot's date, which on the tab is the reader's own day.
        for (const column of RESULT_KEYS.filter((name) => name !== 'SnapshotDate')) {
          expect(mine[column], `${key(row)} ${column}`).toBe(row[column]);
        }
        for (const column of RESULT_NUMBERS) {
          if (row[column] === null) expect(mine[column], `${key(row)} ${column}`).toBeNull();
          else expect(mine[column], `${key(row)} ${column}`).toBeCloseTo(row[column], 8);
        }
      }
    }
    expect(answer.Results).toHaveLength(three.rows.Results);
    // Each of the four draws its two charts, and each other says R's sentence.
    for (const entry of three.status) {
      await rbqmChoice(page, entry.id).click();
      if (entry.state === 'ran') {
        const canvases = page.locator('.sva-rbqm-figures canvas');
        await expect(canvases).toHaveCount(2);
        await expect.poll(() => inked(canvases.nth(0))).toBe(true);
        await expect.poll(() => inked(canvases.nth(1))).toBe(true);
      } else {
        await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
        await expect(page.locator('.sva-rbqm-metric canvas')).toHaveCount(0);
      }
    }
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-046: on the app as it opens, with the study the other charts use and nothing else loaded, the RBQM tab says R will run on that study’s subject-level and adverse events files and which three of the eight metrics it supports; Start R draws the overview with a row for each of 17 sites and a column for each of the three metrics, every cell R’s own row, and the scatter plot and bar chart of each; each other metric says which file it needs; nothing scrolls sideways at 390 pixels; and the RBQM study, chosen afterwards, still runs all eight (#253)', async ({
    page
  }) => {
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto('/tests/e2e/fixtures/basic-app.html?rbqm=recorded');
    await page.evaluate(`${APP}.ready`);
    // Nothing is chosen or loaded: the Data tab's card says what the study the
    // page opens with supports (#281), and which raw tables R makes from which file.
    await item(page, 'data').click();
    await expect(supportSay(page)).toHaveText('This data supports 3 of 8 metrics.');
    await expect(supportCard(page).locator('.sva-support-lines li')).toHaveText([
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.',
      'adae.csv, the Adverse events file, gives Raw_AE.'
    ]);
    // The study runs as it is, so why the other five cannot is said in the open, in R's words.
    const { answer } = pilotExpected;
    expect(
      await supportCard(page)
        .locator('.sva-support-why')
        .evaluate((node) => node.open)
    ).toBe(true);
    expect(await saidOnCard(page)).toEqual(
      answer.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    // The card's button opens the tab, on the study the page opens with.
    await supportCard(page).locator('[data-action="open-view"]').click();
    await expect(rbqmStatus(page)).toHaveText(PILOT_NEED);
    await expect(page.locator('.sva-rbqm-supports')).toHaveText(
      'The loaded study supports 3 of 8 metrics. Change the data on the Data tab.'
    );
    await expect(rbqmStart(page)).toBeEnabled();
    // The row says the same before R: three metrics to run, five the study cannot support.
    expect(
      await rbqmItems(page).evaluateAll((items) => items.slice(1).map((node) => node.dataset.state))
    ).toEqual(
      pilotExpected.answer.status.map((entry) => (entry.state === 'ran' ? 'todo' : 'cannot'))
    );
    await captureEvidence(page.locator('.sva-rbqm'), 'APP-RBQM-046', 'pilot-before-r');

    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran 3 of 8 metrics on the Pilot study in [\d.]+ seconds?\. The other 5 need data it does not have: change the data on the Data tab\. Run details$/
    );
    await expect(page.locator('.sva-rbqm-headrow .sva-rbqm-count')).toHaveText(
      '17 sites, 12 shown here'
    );
    await expect(rbqmTab(page).locator('.sva-tab-count')).toHaveText('3 of 8');
    expect(
      await rbqmItems(page).evaluateAll((items) => items.slice(1).map((node) => node.dataset.state))
    ).toEqual(
      pilotExpected.answer.status.map((entry) => (entry.state === 'ran' ? 'ran' : 'cannot'))
    );
    // R was handed the study's two files, under the standard names, and nothing else.
    const handed = await page.evaluate(() => ({
      files: Object.keys(window.__rbqmRequest.files),
      headers: Object.values(window.__rbqmRequest.files).map((text) => text.split('\n')[0]),
      labels: window.__rbqmRequest.args.labels
    }));
    expect(handed).toEqual({
      files: ['/rbqm/runs/1/Standard_subject.csv', '/rbqm/runs/1/Standard_ae.csv'],
      headers: ['SITEID,USUBJID,EOSSTT,EOSDY', 'USUBJID,AEDECOD,AESER'],
      labels: pilotExpected.labels
    });

    // The overview: a row for each site, a column for each metric that ran.
    await expect(page.locator('.sva-rbqm-table thead th')).toHaveText([
      'Group',
      'Enrolled',
      'Red Flags',
      'Amber Flags',
      ...answer.Metrics.map((metric) => metric.Abbreviation)
    ]);
    expect(answer.Metrics.map((metric) => metric.Abbreviation)).toEqual(['AE', 'SAE', 'SDSC']);
    const rows = await overviewRows(page);
    const enrolled = new Map(
      answer.Groups.filter(
        (row) => row.GroupLevel === 'Site' && row.Param === 'ParticipantCount'
      ).map((row) => [row.GroupID, row.Value])
    );
    expect(rows).toHaveLength(17);
    // A site is labelled with its ID alone: the study's file names no investigator.
    expect(rows.map((row) => row.label).sort()).toEqual([...enrolled.keys()].sort());
    const results = new Map(answer.Results.map((row) => [`${row.MetricID} ${row.GroupID}`, row]));
    let cellsChecked = 0;
    for (const row of rows) {
      const [, enrolment, , , ...metricCells] = row.cells;
      expect(enrolment.text, `${row.label} enrolled`).toBe(enrolled.get(row.label));
      expect(metricCells).toHaveLength(3);
      answer.Metrics.forEach((metric, index) => {
        const result = results.get(`${metric.MetricID} ${row.label}`);
        expect(metricCells[index].title, `${row.label} ${metric.Abbreviation}`).toBe(
          [
            `${metric.Score}: ${printed(result.Score)}`,
            `${metric.Metric}: ${printed(result.Metric)}`,
            `${metric.Numerator}: ${printed(result.Numerator)}`,
            `${metric.Denominator}: ${printed(result.Denominator)}`
          ].join('\n')
        );
        cellsChecked += 1;
      });
    }
    expect(cellsChecked).toBe(51);
    // R made the Groups table, so the tab stands nothing in for it; Run details
    // says what R was handed and which metrics did not run, in R's words.
    const details = await runDetails(page);
    expect(details.text).toEqual([
      'It ran 3 of 8 metrics on the Pilot study. About 55 MB was downloaded, once; the study’s data stays here.'
    ]);
    expect(details.sections['Did not run']).toEqual(
      answer.status.filter((entry) => entry.state !== 'ran').map((entry) => entry.message)
    );
    expect(details.sections.Notes).toBeUndefined();
    expect(details.actions).toEqual(['Run again']);
    await captureEvidence(page, 'APP-RBQM-046', 'pilot-run-details');
    await page.keyboard.press('Escape');
    await expect(rbqmPanel(page)).toHaveCount(0);
    await captureEvidence(page, 'APP-RBQM-046', 'pilot-overview');

    // Each metric in turn: its two charts, or the file it needs.
    for (const entry of answer.status) {
      await rbqmChoice(page, entry.id).click();
      if (entry.state === 'ran') {
        const canvases = page.locator('.sva-rbqm-figures canvas');
        await expect(canvases).toHaveCount(2);
        await expect.poll(() => inked(canvases.nth(0))).toBe(true);
        await expect.poll(() => inked(canvases.nth(1))).toBe(true);
      } else {
        await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
        await expect(page.locator('.sva-rbqm-metric canvas')).toHaveCount(0);
      }
    }
    await expect(rbqmChoice(page, 'kri0012')).toHaveAttribute(
      'title',
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
    expect(await page.evaluate(() => window.__rbqmSteps)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run'
    ]);
    await rbqmChoice(page, 'kri0001').click();
    await expect.poll(() => inked(page.locator('.sva-rbqm-figures canvas').nth(1))).toBe(true);
    await captureEvidence(page, 'APP-RBQM-046', 'pilot-tab');

    // At a phone's width nothing is off to the side.
    await page.setViewportSize({ width: 390, height: 844 });
    // The charts take a moment to follow the window down to its new width.
    await expect.poll(() => sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await expect.poll(() => inked(page.locator('.sva-rbqm-figures canvas').nth(1))).toBe(true);
    for (const box of await page.locator('.sva-rbqm-figures canvas').all()) {
      const { x, width } = await box.boundingBox();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(390);
    }
    await captureEvidence(page, 'APP-RBQM-046', 'pilot-tab-390');
    await rbqmOverview(page).click();
    const table = await page
      .locator('.sva-rbqm-table')
      .evaluate((node) => ({ inner: node.scrollWidth, box: node.clientWidth }));
    expect(table.inner).toBeLessThanOrEqual(table.box);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);

    // The RBQM study still runs all eight, on its own raw files; and the pilot
    // study, chosen again, runs its three.
    await page.setViewportSize({ width: 1280, height: 900 });
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await rbqmTab(page).click();
    await rbqmOverview(page).click();
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran 8 of 8 metrics on the 9 loaded files in [\d.]+ seconds?\. To use other files, change the data on the Data tab\. Run details$/
    );
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(150);
    await item(page, 'data').click();
    await page.locator('.sva-side select.sva-study').selectOption('pilot');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(4);
    await rbqmTab(page).click();
    await rbqmOverview(page).click();
    await expect(rbqmStatus(page)).toHaveText(/^R ran 3 of 8 metrics on the Pilot study in /);
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(17);
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-039: a reader’s own files in real R, and what leaves the browser: with no demo study, the subjects and adverse events files chosen from disk and Start R pressed, R draws the two adverse event metrics and says of each other metric what the tab said before R started; the same adverse events file with a column taken out is run at once and R names the column. From the first file chosen until five quiet seconds after, every request is a GET or HEAD with no body, no query and no header the browser did not set itself, to the page’s own address, webr.r-wasm.org and repo.r-wasm.org and no other; the page’s own address is asked for gsm.viz’s bundle, the files R is given and gsm’s packages, and for nothing of the reader’s; no address names a file of theirs or a participant in them (#236)', { tag: '@real-r' }, async ({
    page,
    context
  }, testInfo) => {
    test.setTimeout(480000);
    const errors = watchErrors(page);
    const watch = watchRequests(page, context);
    const { sockets } = watch;
    await page.goto('/tests/e2e/fixtures/basic-app.html?empty');
    await page.evaluate(`${APP}.ready`);
    const own = new URL(page.url()).origin;
    // The files are chosen on the Data tab, where every file comes in (#282).
    watch.chosen = true;
    await chooseOnDataTab(page, [OWN_SUBJ, OWN_AE, OWN_NOTES]);
    await expect(supportSay(page)).toHaveText('This data supports 2 of 8 metrics.');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(3);
    const two = tabExpected.partial['two-files'];
    const before = await saidOnCard(page);
    await rbqmTab(page).click();
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360000
    });
    await expect(rbqmStatus(page)).toHaveText(/^R ran 2 of 8 metrics on the 2 loaded files/);
    // What R said of each metric is what the tab said before R was started,
    // and what desktop R said of the same two files.
    const said = await page.evaluate(() => {
      const { status, groups } = window.__rbqmView.state().result.answer;
      return {
        status: status.map((entry) => [entry.id, entry.state === 'ran', entry.message]),
        groups: groups.message
      };
    });
    expect(said.status).toEqual(before);
    expect(said.status).toEqual(
      two.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    expect(said.groups).toBe(two.groups.message);
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(148);
    for (const entry of two.status) {
      await rbqmChoice(page, entry.id).click();
      if (entry.state === 'ran') {
        const canvases = page.locator('.sva-rbqm-figures canvas');
        await expect(canvases).toHaveCount(2);
        await expect.poll(() => inked(canvases.nth(0))).toBe(true);
        await expect.poll(() => inked(canvases.nth(1))).toBe(true);
      } else {
        await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
        await expect(page.locator('.sva-rbqm-metric canvas')).toHaveCount(0);
      }
    }

    // The adverse events file with a column taken out, chosen on the Data tab:
    // its card names the column, and R is up, so on the tab it is run at once
    // and R names the column too.
    await chooseOnDataTab(page, [withoutAColumn(testInfo)]);
    await expect(supportSay(page)).toHaveText('This data supports 0 of 8 metrics.');
    expect((await saidOnCard(page))[0]).toEqual([
      'kri0001',
      false,
      'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    ]);
    await rbqmTab(page).click();
    await rbqmOverview(page).click();
    await expect(rbqmStatus(page)).toHaveText(/^R ran 0 of 8 metrics on the 2 loaded files/, {
      timeout: 120000
    });
    await expect(page.locator('.sva-rbqm-overview .sva-problem')).toHaveText(
      'No metric ran, so there is no overview to draw.'
    );
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-why')).toHaveText(
      'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    );

    // That was the last action.
    await watch.quiet();
    const after = watch.onlyReads(own);
    const index = RBQM_TAB.publicIndex;
    expect([...new Set(after.map((request) => new URL(request.url).origin))].sort()).toEqual(
      [own, 'https://webr.r-wasm.org', index].sort()
    );
    // The page's own address: gsm.viz's bundle, each file R is given, and
    // gsm's packages. No study file is asked for: the files came from disk.
    const repository = `/${RBQM_TAB.repository}/`;
    const ownAsked = [
      ...new Set(
        after
          .filter((request) => new URL(request.url).origin === own)
          .map((request) => `${request.method} ${new URL(request.url).pathname}`)
      )
    ];
    expect(ownAsked.filter((entry) => !entry.includes(repository)).sort()).toEqual(
      [`GET /${RBQM_CHARTS.path}`, ...pipelineFiles().map(({ file }) => `GET /${file}`)].sort()
    );
    // No address names a file of the reader's, or a participant or site in them.
    const fields = (file) =>
      readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(',').map((field) => field.replace(/"/g, '')));
    const [header, ...rows] = fields(OWN_SUBJ);
    const ids = new Set(
      ['subjid', 'subject_nsv', 'invid'].flatMap((name) =>
        rows.map((row) => row[header.indexOf(name)])
      )
    );
    expect(ids.has(undefined)).toBe(false);
    expect(ids.size).toBeGreaterThan(1500);
    const words = (url) => decodeURIComponent(url).split(/[^A-Za-z0-9_-]+/);
    expect(after.filter((request) => words(request.url).some((word) => ids.has(word)))).toEqual([]);
    expect(
      after.filter((request) => /Raw_(SUBJ|AE)|site_notes/i.test(decodeURIComponent(request.url)))
    ).toEqual([]);
    expect(after.length).toBeGreaterThan(60);
    expect(sockets).toEqual([]);
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-047: the study the other charts use in real R, and what leaves the browser: on the app as it opens, Start R runs gsm’s workflows on the study’s subject-level and adverse events files and draws three metrics at 17 sites; every Results row is desktop R’s to eight decimal places, and what R says of each metric is what the tab said before R started; with the site’s mapping cleared on the Data tab R runs at once and names the column. From the tab’s opening until five quiet seconds after, every request is a GET or HEAD with no body, no query and no header the browser did not set itself, to the page’s own address, webr.r-wasm.org and repo.r-wasm.org and no other; the page’s own address is asked for gsm.viz’s bundle, the files R is given and gsm’s packages, and no address names a participant (#253)', { tag: '@real-r' }, async ({
    page,
    context
  }) => {
    test.setTimeout(480000);
    const errors = watchErrors(page);
    const watch = watchRequests(page, context);
    const { sockets } = watch;
    await page.goto('/tests/e2e/fixtures/basic-app.html');
    await page.evaluate(`${APP}.ready`);
    const own = new URL(page.url()).origin;
    // The study is loaded; from here on nothing of it may leave.
    watch.chosen = true;
    // What the study supports is said on the Data tab's card, before R (#281).
    await item(page, 'data').click();
    await expect(supportSay(page)).toHaveText('This data supports 3 of 8 metrics.');
    const before = await saidOnCard(page);
    await rbqmTab(page).click();
    await expect(rbqmStatus(page)).toHaveText(PILOT_NEED);
    await rbqmStart(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360000
    });
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran 3 of 8 metrics on the Pilot study in [\d.]+ seconds?\. The other 5 need data it does not have: change the data on the Data tab\. Run details$/
    );
    // What R was handed, as Run details says it: the study's two files.
    const details = await runDetails(page);
    expect(details.sections['What R was handed']).toHaveLength(2);
    expect(details.sections['What R was handed'].join(' ')).toMatch(/adsl\.csv.*adae\.csv/);
    expect(details.sections.Steps.at(-1)).toMatch(/^\d+ seconds from the press to the charts\.$/);
    await page.keyboard.press('Escape');

    // What R returned to the tab is what desktop R returned for the same two files.
    const desktop = pilotExpected.answer;
    const answer = await page.evaluate(() => window.__rbqmView.state().result.answer);
    expect(answer.warnings).toEqual([]);
    expect(answer.notes).toEqual([]);
    expect(answer.ran).toEqual(desktop.ran);
    const said = answer.status.map((entry) => [entry.id, entry.state === 'ran', entry.message]);
    expect(said).toEqual(before);
    expect(said).toEqual(
      desktop.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    expect(answer.groups.state).toBe('ran');
    const key = (row) => `${row.MetricID} ${row.GroupID}`;
    const results = new Map(answer.Results.map((row) => [key(row), row]));
    const reference = new Map(desktop.Results.map((row) => [key(row), row]));
    expect(reference.size).toBe(51);
    expect([...results.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [id, row] of reference) {
      for (const column of RESULT_NUMBERS) {
        if (row[column] === null) expect(results.get(id)[column], `${id} ${column}`).toBeNull();
        else expect(results.get(id)[column], `${id} ${column}`).toBeCloseTo(row[column], 8);
      }
    }
    // The Groups table R made here is desktop R's: each site's participants.
    const counts = (groups) =>
      groups
        .filter((row) => row.Param === 'ParticipantCount')
        .map((row) => `${row.GroupLevel} ${row.GroupID} ${row.Value}`)
        .sort();
    expect(counts(answer.Groups)).toEqual(counts(desktop.Groups));
    await expect(page.locator('.sva-rbqm-table tbody tr')).toHaveCount(17);
    await expect(page.locator('.sva-rbqm-table thead th')).toHaveText([
      'Group',
      'Enrolled',
      'Red Flags',
      'Amber Flags',
      'AE',
      'SAE',
      'SDSC'
    ]);
    for (const entry of desktop.status) {
      await rbqmChoice(page, entry.id).click();
      if (entry.state === 'ran') {
        const canvases = page.locator('.sva-rbqm-figures canvas');
        await expect(canvases).toHaveCount(2);
        await expect.poll(() => inked(canvases.nth(0))).toBe(true);
        await expect.poll(() => inked(canvases.nth(1))).toBe(true);
      } else {
        await expect(page.locator('.sva-rbqm-why')).toHaveText(entry.message);
      }
    }

    // The site's row of the mapping cleared: R is up, so the study is run at
    // once, and R says what the tab says, and what desktop R said.
    await item(page, 'data').click();
    await page.evaluate(`${APP}.setColumn('subject', 'SITEID', null)`);
    await rbqmTab(page).click();
    await rbqmOverview(page).click();
    await expect(rbqmStatus(page)).toHaveText(/^R ran 0 of 8 metrics on the Pilot study in /, {
      timeout: 120000
    });
    const unmapped = await page.evaluate(() => {
      const { status, groups } = window.__rbqmView.state().result.answer;
      return {
        status: status.map((entry) => [entry.id, entry.state === 'ran', entry.message]),
        groups: groups.message
      };
    });
    expect(unmapped.status).toEqual(
      pilotExpected.no_site.status.map((entry) => [entry.id, entry.state === 'ran', entry.message])
    );
    expect(unmapped.groups).toBe(pilotExpected.no_site.groups.message);
    await rbqmChoice(page, 'kri0001').click();
    await expect(page.locator('.sva-rbqm-why')).toHaveText(
      'Adverse Event Rate needs the column SITEID, which no column of adsl.csv is mapped to.'
    );

    // That was the last action.
    await watch.quiet();
    const after = watch.onlyReads(own);
    expect([...new Set(after.map((request) => new URL(request.url).origin))].sort()).toEqual(
      [own, 'https://webr.r-wasm.org', RBQM_TAB.publicIndex].sort()
    );
    // The page's own address: gsm.viz's bundle, each file R is given, and
    // gsm's packages. The study's files were fetched before, and not again.
    const repository = `/${RBQM_TAB.repository}/`;
    const ownAsked = [
      ...new Set(
        after
          .filter((request) => new URL(request.url).origin === own)
          .map((request) => `${request.method} ${new URL(request.url).pathname}`)
      )
    ];
    expect(ownAsked.filter((entry) => !entry.includes(repository)).sort()).toEqual(
      [`GET /${RBQM_CHARTS.path}`, ...pipelineFiles().map(({ file }) => `GET /${file}`)].sort()
    );
    // No address names a participant of the study.
    const ids = new Set(participants.map((row) => row.USUBJID));
    expect(ids.size).toBe(254);
    const words = (url) => decodeURIComponent(url).split(/[^A-Za-z0-9_-]+/);
    expect(after.filter((request) => words(request.url).some((word) => ids.has(word)))).toEqual([]);
    expect(after.filter((request) => /adsl|adae/i.test(decodeURIComponent(request.url)))).toEqual(
      []
    );
    expect(after.length).toBeGreaterThan(60);
    expect(sockets).toEqual([]);
    expect(errors).toEqual([]);
  });

  // Starts real R, so it runs in the check's real-R job (CONTRIBUTING.md, "How the
  // check is laid out"). Prettier would re-indent the whole test to fit the tag.
  // prettier-ignore
  test('APP-RBQM-021: rbqm tab in real R: on the RBQM study, pressing Start R starts R in the browser, says what it is doing meanwhile, and draws the overview, the scatter plot and the bar chart; every number in the overview table is R’s: each cell prints the score, metric, numerator and denominator of the Results row R returned for that site and metric, the enrolment is the Groups table’s, and the red and amber counts are R’s flags counted; R’s rows are desktop R’s to eight decimal places; each of the eight metrics draws; what the tab says R downloads is what was downloaded (#235)', { tag: '@real-r' }, async ({
    page,
    context
  }, testInfo) => {
    // It downloads R and some forty packages, then runs every workflow.
    test.setTimeout(420_000);
    const errors = watchErrors(page);
    const finished = [];
    context.on('requestfinished', (request) => finished.push(request));
    await openRbqm(page);
    await expect(rbqmStatus(page)).toHaveText(RBQM_NEED);
    const pressed = Date.now();
    await rbqmStart(page).click();
    // It says what R is doing from the first moment, and counts the seconds:
    // the control names the step of six, and nothing is left to press.
    await expect(rbqmControl(page)).toHaveAttribute('data-phase', 'starting');
    await expect(rbqmControl(page).locator('.sva-r-say')).toHaveText(/^[1-6] of 6 · /);
    await expect(rbqmControl(page).locator('.sva-r-meta')).toHaveText(/^\d+ s$/);
    await expect(rbqmStatus(page)).toHaveText(
      'R is starting. The metrics run by themselves when it is ready.'
    );
    await expect(page.locator('.sva-rbqm-steps li')).toHaveText(RBQM_STEPS);
    await expect(page.locator('.sva-charts .sva-action')).toHaveCount(0);
    const said = new Set();
    const listen = setInterval(async () => {
      const text = await rbqmControl(page)
        .locator('.sva-r-say')
        .textContent()
        .catch(() => '');
      said.add(text);
    }, 250);
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: 360_000
    });
    clearInterval(listen);
    const firstResult = (Date.now() - pressed) / 1000;
    // One line above the table; the rest is one click away, in Run details.
    await expect(rbqmStatus(page)).toHaveText(
      /^R ran 8 of 8 metrics on the 9 loaded files in [\d.]+ seconds?\. To use other files, change the data on the Data tab\. Run details$/
    );
    await expect(rbqmChip(page)).toHaveText('R ready▾');
    await expect(rbqmItems(page).locator('.sva-ico-ran')).toHaveCount(8);
    // Every step was said while it happened.
    for (const step of [
      '2 of 6 · Installing R packages',
      '4 of 6 · Loading gsm’s packages',
      '6 of 6 · Running the workflows'
    ]) {
      expect([...said], step).toContain(step);
    }
    await page.locator('.sva-rbqm-details').click();
    const details = await runDetails(page);
    expect(details.heading).toBe('R is running in this browser');
    expect(details.text).toEqual([
      'It ran 8 of 8 metrics on the 9 loaded files. About 55 MB was downloaded, once; the study’s data stays here.'
    ]);
    expect(details.sections.Steps.at(-1)).toMatch(/^\d+ seconds from the press to the charts\.$/);
    expect(details.sections['Did not run']).toEqual(['Nothing: all 8 ran.']);
    const versions = details.sections.Versions;
    expect(versions[0]).toMatch(/^R: 4\.\d+\.\d+, on webR \d+\.\d+\.\d+$/);
    expect(versions[1]).toMatch(
      /^gsm: gsm\.core [\d.]+, gsm\.mapping [\d.]+, gsm\.reporting [\d.]+(,| and) workr [\d.]+$/
    );
    expect(versions.join(' | ')).toMatch(/gsm\.kri 1\.7\.0/);
    expect(versions.join(' | ')).toMatch(/gsm\.viz 2\.4\.1/);
    expect(versions.at(-1)).toMatch(/^Snapshot: \d{4}-\d\d-\d\d$/);
    expect(details.sections['Warnings from R']).toEqual(['None.']);
    expect(details.actions).toEqual(['Run again']);
    await page.keyboard.press('Escape');

    // What R returned to the tab.
    const answer = await page.evaluate(() => window.__rbqmView.state().result.answer);
    expect(answer.warnings).toEqual([]);
    expect(answer.status.map((metric) => metric.state)).toEqual(Array(8).fill('ran'));
    const key = (row) => `${row.MetricID} ${row.GroupID}`;
    const results = new Map(answer.Results.map((row) => [key(row), row]));
    // R's rows on the tab are desktop R's, to eight decimal places.
    const desktop = new Map(tabExpected.whole.Results.map((row) => [key(row), row]));
    expect([...results.keys()].sort()).toEqual([...desktop.keys()].sort());
    for (const [id, row] of desktop) {
      for (const column of RESULT_NUMBERS) {
        if (row[column] === null) expect(results.get(id)[column], `${id} ${column}`).toBeNull();
        else expect(results.get(id)[column], `${id} ${column}`).toBeCloseTo(row[column], 8);
      }
    }

    // Every number in the overview table is R's.
    const sites = [...new Set(answer.Results.map((row) => row.GroupID))];
    const enrolled = new Map(
      answer.Groups.filter(
        (row) => row.GroupLevel === 'Site' && row.Param === 'ParticipantCount'
      ).map((row) => [row.GroupID, row.Value])
    );
    const lastName = new Map(
      answer.Groups.filter(
        (row) => row.GroupLevel === 'Site' && row.Param === 'InvestigatorLastName'
      ).map((row) => [row.GroupID, row.Value])
    );
    const rows = await overviewRows(page);
    // A row per site: every site the Groups table names, which holds every site R scored.
    const named = new Set(
      answer.Groups.filter((row) => row.GroupLevel === 'Site').map((row) => row.GroupID)
    );
    expect(rows).toHaveLength(150);
    expect(rows.map((row) => row.label.split(' ')[0]).sort()).toEqual([...named].sort());
    for (const site of sites) expect(named.has(site), site).toBe(true);
    let cellsChecked = 0;
    for (const row of rows) {
      const site = row.label.split(' ')[0];
      expect(row.label, site).toBe(`${site} (${lastName.get(site)})`);
      const [, enrolment, red, amber, ...metricCells] = row.cells;
      // A site with nobody enrolled has no count in the Groups table, and none is printed.
      if (enrolled.has(site)) {
        expect(enrolment.text, `${site} enrolled`).toBe(String(enrolled.get(site)));
      } else expect(enrolment.text, `${site} enrolled`).not.toMatch(/\d/);
      const flags = answer.Results.filter((result) => result.GroupID === site).map(
        (result) => result.Flag
      );
      expect(red.text, `${site} red flags`).toBe(
        String(flags.filter((flag) => Math.abs(flag) === 2).length)
      );
      expect(amber.text, `${site} amber flags`).toBe(
        String(flags.filter((flag) => Math.abs(flag) === 1).length)
      );
      expect(metricCells).toHaveLength(8);
      answer.Metrics.forEach((metric, index) => {
        const result = results.get(`${metric.MetricID} ${site}`);
        const cell = metricCells[index];
        if (!result) {
          // R returned no row for this site and metric: the cell prints no number.
          expect(cell.title || '', `${site} ${metric.Abbreviation}`).not.toMatch(/\d/);
          return;
        }
        expect(cell.title, `${site} ${metric.Abbreviation}`).toBe(
          [
            `${metric.Score}: ${printed(result.Score)}`,
            `${metric.Metric}: ${printed(result.Metric)}`,
            `${metric.Numerator}: ${printed(result.Numerator)}`,
            `${metric.Denominator}: ${printed(result.Denominator)}`
          ].join('\n')
        );
        cellsChecked += 1;
      });
    }
    // Every Results row R returned was read off the table.
    expect(cellsChecked).toBe(answer.Results.length);
    expect(cellsChecked).toBe(1186);

    // The scatter plot and the bar chart of each of the eight metrics in turn.
    for (const metric of answer.Metrics) {
      await rbqmChoice(page, metric.ID).click();
      await expect(page.locator('.sva-rbqm-metric-name')).toHaveText(metric.Metric);
      const canvases = page.locator('.sva-rbqm-figures canvas');
      await expect(canvases).toHaveCount(2);
      for (const index of [0, 1]) await expect.poll(() => inked(canvases.nth(index))).toBe(true);
    }
    // And on a phone the tab still does not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    // The charts take a moment to follow the window down to its new width.
    await expect.poll(() => sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await rbqmOverview(page).click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible();
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);

    // What starting R downloaded, by where it came from, beside what the tab says.
    const own = new URL(page.url()).origin;
    const megabytes = { 'webr.r-wasm.org': 0, 'repo.r-wasm.org': 0, page: 0, files: 0 };
    for (const request of finished) {
      const url = new URL(request.url());
      const sizes = await request.sizes().catch(() => null);
      const bytes = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
      if (url.origin !== own) megabytes[url.host] = (megabytes[url.host] || 0) + bytes;
      else if (url.pathname.includes(`/${RBQM_TAB.repository}/`)) megabytes.page += bytes;
      else megabytes.files += bytes;
    }
    for (const name of Object.keys(megabytes)) {
      megabytes[name] = Math.round(megabytes[name] / 10485.76) / 100;
    }
    expect(Object.keys(megabytes).sort()).toEqual(
      ['files', 'page', 'repo.r-wasm.org', 'webr.r-wasm.org'].sort()
    );
    for (const download of RBQM_DOWNLOADS) {
      const measured = megabytes[download.host || 'page'];
      expect(
        Math.abs(measured - download.megabytes),
        `${download.what}: ${measured} MB`
      ).toBeLessThan(1.5);
    }
    const state = await page.evaluate(() => {
      const { result } = window.__rbqmView.state();
      return { seconds: result.seconds, sinceStart: result.sinceStart, inR: result.answer.seconds };
    });
    const measured = {
      megabytes,
      seconds: {
        startRToFirstResult: Math.round(firstResult * 10) / 10,
        asTheTabSays: state.sinceStart,
        eightMetrics: state.seconds,
        eightMetricsInR: state.inR
      },
      rows: {
        Results: answer.Results.length,
        Bounds: answer.Bounds.length,
        Groups: answer.Groups.length,
        Metrics: answer.Metrics.length
      },
      overviewCellsChecked: cellsChecked,
      versions: answer.versions,
      platform: process.platform
    };
    await testInfo.attach('rbqm-tab-measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json'
    });
    console.log(`rbqm tab on the page, measurements: ${JSON.stringify(measured)}`);
    // Kept with the evidence, from the canonical environment, the first time
    // it runs there; remove the file to have it measured again.
    if (CANONICAL && !existsSync(TAB_MEASURED)) {
      mkdirSync(new URL('.', TAB_MEASURED), { recursive: true });
      writeFileSync(TAB_MEASURED, `${JSON.stringify(measured, null, 2)}\n`);
    }
    expect(errors).toEqual([]);
  });
});

// ---- the single file (#152) --------------------------------------------------
//
// `npm run build:app` also writes build/app/safety.viz-app.html: the app inlined
// into one HTML file. It is opened here from disk, with the browser offline.

const SINGLE_FILE = new URL('../../build/app/safety.viz-app.html', import.meta.url);

test.describe('demo app as one file, offline', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-FILE-005: the file opens from disk with no network, empty and ready for files (#152)', async ({
    page,
    context
  }) => {
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await context.setOffline(true);
    await page.goto(SINGLE_FILE.href);
    // It opens empty, on the Data tab, and the title says so (#270).
    await expect(page).toHaveTitle('Data · safety.viz demo');
    await expect(page.locator('.sva-wordmark')).toHaveText('safety.viz');
    await expect(page.locator('.sva-kicker')).toHaveText('Demo app');
    await expect(page.locator('.sva-version')).toHaveText(/^safety\.viz \d+\.\d+\.\d+$/);
    // With no site around it, its links go to the published one.
    await expect(page.locator('.sva-links a[data-link="docs"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/'
    );
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 18 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-drop')).toBeVisible();
    await expect(page.locator('.sva-study')).toHaveCount(0);
    // A chart's footnote leads to the published site too (#246), and showing it asks for nothing.
    await page.evaluate(() => window.__safetyVizApp.select('hep-explorer'));
    await expect(page.locator('.sva-chart-links')).toHaveText(
      'Hepatic Safety Explorer: Clinical guide · Test evidence'
    );
    await expect(page.locator('.sva-chart-links a[data-link="evidence"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/hep-explorer/evidence.html'
    );
    await page.evaluate(() => window.__safetyVizApp.select('data'));
    // The only thing fetched is the file itself.
    expect(requests).toEqual([SINGLE_FILE.href]);
    expect(errors).toEqual([]);
  });

  test('APP-FILE-006: offline, the file loads the renamed study, takes the corrections and draws every chart of both libraries, the group comparison’s three levels among them, and sends no request (#152, #182, #212)', async ({
    page,
    context
  }) => {
    // It opens every chart, one after another: more than the default allows on a busy runner.
    test.setTimeout(MANY_CHARTS);
    const errors = watchErrors(page);
    await context.setOffline(true);
    await page.goto(SINGLE_FILE.href);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await chooseFiles(page, STUDY);
    await expect(page.locator('.sva-count')).toHaveText(
      '12 of 18 charts supported by the loaded data'
    );
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '18 of 18 charts supported by the loaded data'
    );
    // Every chart of both libraries draws, with no request but the file itself.
    for (const [module, entry] of [...destinations, ...bioCharts]) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    // The group comparison's levels too: a tile opens its biomarker over time,
    // and a visit opens alone (#212).
    await openChart(page, 'group-comparison');
    await tiles(page).first().click();
    await expect(trail(page)).toHaveAttribute('data-level', 'over-time');
    await expect(page.locator('.sva-chart .bv-time-table')).toBeVisible();
    await page.locator('.sva-chart .bv-time-visit').first().click();
    await expect(trail(page)).toHaveAttribute('data-level', 'visits');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    expect(requests.filter((url) => !/^(blob|data):/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-R-009: offline, the single file shows no control to start R, each biomarker chart says statistics are unavailable in this file and why, and nothing is requested (#183)', async ({
    page,
    context
  }) => {
    const errors = watchErrors(page);
    await context.setOffline(true);
    await page.goto(SINGLE_FILE.href);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(FILE_PITCH);
    await chooseFiles(page, STUDY);
    await correct(page);
    for (const [module] of bioCharts) {
      await openChart(page, module);
      await expect(page.locator('.sva-action')).toHaveCount(0);
      if (module === 'group-comparison') {
        await page
          .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
          .locator('select')
          .selectOption({ index: 1 });
      }
      if (module === 'cross-tab') {
        // The table it opens on here has one column, the study's one centre,
        // and no test applies to that. Sex has two values.
        await controlOf(page, 'Columns').locator('select').selectOption('SEX');
      }
      await expect(
        page.locator('.sva-chart .bv-statistic').filter({ hasText: FILE_NO_R }).first()
      ).toBeVisible();
    }
    expect(requests.filter((url) => !/^(blob|data):/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-RBQM-025: offline, the single file’s RBQM tab says it needs R and that the file loads nothing, offers no control to start R, and requests nothing (#235)', async ({
    page,
    context
  }) => {
    const errors = watchErrors(page);
    await context.setOffline(true);
    await page.goto(SINGLE_FILE.href);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    const tabOfIts = page.locator('.sva-tab[data-tab="rbqm"]');
    await expect(tabOfIts.locator('.sva-tab-title')).toHaveText('RBQM');
    await expect(tabOfIts.locator('.sva-badge')).toHaveCount(0);
    await expect(tabOfIts.locator('.sva-tab-count')).toHaveText('needs R');
    await tabOfIts.click();
    // The file is handed the tab's rung with the charts', so the tab says it is Experimental.
    await expect(page.locator('.sva-corner .sv-status-word')).toHaveText('Experimental');
    await expect(page.locator('.sva-rbqm-status')).toHaveText(FILE_NO_RBQM);
    await expect(page.locator('.sva-rbqm-status')).toHaveText(
      'The RBQM tab needs R, and this file loads nothing, so it cannot start R. The hosted demo app can start R in your browser.'
    );
    await expect(page.locator('.sva-rbqm-start')).toHaveCount(0);
    await expect(page.locator('.sva-charts > .sva-r')).toHaveCount(0);
    await expect(page.locator('.sva-rbqm-table')).toHaveCount(0);
    expect(requests.filter((url) => !/^(blob|data):/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-FILE-007: the built file holds no script, stylesheet or image reference to another URL, and inlines bio.viz’s bundle as it was vendored (#152, #182)', async () => {
    const html = readFileSync(SINGLE_FILE, 'utf8');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link\b[^>]*\shref=/i);
    expect(html).not.toMatch(/<img\b[^>]*\ssrc=["']?https?:/i);
    expect(html).not.toContain('sourceMappingURL');
    // Three script elements: the inlined app, bio.viz's inlined bundle, and the
    // one line that mounts the app with it.
    expect(html.match(/<script>/g)).toHaveLength(3);
    // The second is bio.viz's bundle, whole, as it was vendored, less only its
    // source-map comment line, with any closing script tag escaped.
    const vendored = readFileSync(
      new URL(`../../${APP_LIBRARIES[0].path}`, import.meta.url),
      'utf8'
    );
    expect(vendored).toContain('//# sourceMappingURL=');
    const inlined = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(inlined[1]).toBe(
      vendored
        .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
        .replace(/<\/script/gi, '<\\/script')
        .trim()
    );
  });
});

// ---- The status ladder (obot.roadmap#403) ----

const appLabel = (page) => page.locator('.sva-appstatus .sv-status');
const pill = (label) => label.locator('.sv-status-label');
const panelOf = (label) => label.locator('.sv-status-panel');
const APP_LINE = 'Nothing in this app is qualified. Confirm every result.';
const APP_TEXT =
  'Nothing here is qualified. The charts, statistics and site metrics are tested and documented, ' +
  'but none has been through qualification. Confirm every result in a qualified system before ' +
  'you rely on it.';
const RUNG_MEANINGS = [
  ['Qualified', 'Validated for regulated use. Nothing in safety.viz is, yet.'],
  ['Exploratory', 'Tested and documented. Confirm every result.'],
  ['Experimental', 'Tested and documented, but what it shows or how it behaves may still change.'],
  ['Prototype', 'An early look, on the docs site only. Not in this app.']
];
// Whether a box is wholly inside the window.
const insideWindow = async (page, locator) => {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;
};

test.describe('demo app: the status label', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('APP-TIER-014: at 1,280 pixels the header shows one label reading Exploratory on the tabs’ row; hovering it shows one line, a click opens the disclaimer and the four rungs with the app’s marked, and Escape, a second click or the cross closes it (#273)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openOnDemo(page);
    const label = appLabel(page);
    await expect(page.locator('.sva-header .sv-status')).toHaveCount(1);
    await expect(pill(label).locator('.sv-status-word')).toHaveText('Exploratory');
    await expect(pill(label)).toHaveAttribute('data-tier', 'exploratory');
    // The header is still one row: the wordmark, the last tab and the label share a line.
    const middle = async (locator) => {
      const box = await locator.boundingBox();
      return box.y + box.height / 2;
    };
    const row = await middle(page.locator('.sva-brand'));
    expect(Math.abs((await middle(page.locator('.sva-tab[data-tab="rbqm"]'))) - row)).toBeLessThan(
      8
    );
    expect(Math.abs((await middle(pill(label))) - row)).toBeLessThan(8);
    // Ink on white with a solid outline, and no mark.
    const drawn = await pill(label).evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopStyle, style.borderTopColor, style.color, style.backgroundColor];
    });
    expect(drawn).toEqual(['solid', 'rgb(31, 35, 40)', 'rgb(31, 35, 40)', 'rgb(255, 255, 255)']);
    await expect(pill(label).locator('svg, img')).toHaveCount(0);

    // Hover: one line, and the panel stays shut.
    const tip = pill(label).locator('.sv-status-tip');
    await expect(tip).toBeHidden();
    await pill(label).hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(APP_LINE);
    await expect(panelOf(label)).toBeHidden();
    expect(await insideWindow(page, tip)).toBe(true);

    // A click: the panel, which stays open.
    await pill(label).click();
    const panel = panelOf(label);
    await expect(panel).toBeVisible();
    await expect(tip).toBeHidden();
    await expect(pill(label)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('heading')).toHaveText('This app is exploratory');
    await expect(panel.locator('.sv-status-text').nth(0)).toHaveText(APP_TEXT);
    await expect(panel.locator('.sv-status-count')).toHaveText(
      '13 charts are Exploratory. 5 charts and the RBQM tab are Experimental, and say so when you open them.'
    );
    const steps = panel.locator('.sv-status-step');
    await expect(steps.locator('.sv-status-rung')).toHaveText(RUNG_MEANINGS.map(([word]) => word));
    await expect(steps.locator('.sv-status-meaning')).toHaveText(
      RUNG_MEANINGS.map(([, meaning]) => meaning)
    );
    await expect(panel.locator('.sv-status-here')).toHaveAttribute('data-tier', 'exploratory');
    await expect(panel.locator('.sv-status-mark')).toHaveText(['This app']);
    // The four outlines, top to bottom: filled, solid, dashed, dotted and grey.
    const outlines = await steps.locator('.sv-status-rung').evaluateAll((rungs) =>
      rungs.map((rung) => {
        const style = getComputedStyle(rung);
        return [style.borderTopStyle, style.backgroundColor, style.color];
      })
    );
    expect(outlines).toEqual([
      ['solid', 'rgb(31, 35, 40)', 'rgb(255, 255, 255)'],
      ['solid', 'rgb(255, 255, 255)', 'rgb(31, 35, 40)'],
      ['dashed', 'rgb(255, 255, 255)', 'rgb(31, 35, 40)'],
      ['dotted', 'rgb(255, 255, 255)', 'rgb(91, 100, 112)']
    ]);
    await expect(panel.getByRole('link', { name: 'What each rung means' })).toHaveAttribute(
      'href',
      /developer-guidelines\.md#status-ladder$/
    );
    expect(await insideWindow(page, panel)).toBe(true);
    await captureEvidence(page, 'APP-TIER-014', 'app-label-panel');
    // It stays open while the reader goes on working: a click on the page does not close it.
    await page.locator('.sva-main').click({ position: { x: 5, y: 5 } });
    await expect(panel).toBeVisible();
    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(pill(label)).toHaveAttribute('aria-expanded', 'false');
    // A second click closes it.
    await pill(label).click();
    await expect(panel).toBeVisible();
    await pill(label).click();
    await expect(panel).toBeHidden();
    // The cross closes it.
    await pill(label).click();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
    // Nothing in the app is labelled Qualified.
    await expect(page.locator('.sv-status-label[data-tier="qualified"]')).toHaveCount(0);
  });

  test('APP-TIER-015: the app’s label is reached and opened from the keyboard: it follows the last tab, Enter or Space opens it, the next stop is its cross, and closing hands the keyboard back to it (#273)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openOnDemo(page);
    const label = appLabel(page);
    const panel = panelOf(label);
    // From the last tab, one press of Tab reaches the label.
    await page.locator('.sva-tab[data-tab="rbqm"]').focus();
    await page.keyboard.press('Tab');
    await expect(pill(label)).toBeFocused();
    // Focus shows the hover line, and a ring.
    await expect(pill(label).locator('.sv-status-tip')).toBeVisible();
    expect(await pill(label).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
      'solid'
    );
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    // The panel follows the label in the page, so Tab goes into it: the cross first.
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    await expect(pill(label)).toBeFocused();
    // Space opens it too, and Escape from inside it closes it and hands the keyboard back.
    await page.keyboard.press('Space');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('link', { name: 'What each rung means' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(pill(label)).toBeFocused();
  });

  test('APP-TIER-016: at 390 pixels the app’s label is on screen beside the wordmark, and its panel opens inside the window with nothing running off the page (#273)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    const label = appLabel(page);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await expect(pill(label)).toBeVisible();
    expect(await insideWindow(page, pill(label))).toBe(true);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // A tap opens the panel; a phone has no hover.
    await pill(label).click();
    const panel = panelOf(label);
    await expect(panel).toBeVisible();
    expect(await insideWindow(page, panel)).toBe(true);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(panel.locator('.sv-status-text').nth(0)).toHaveText(APP_TEXT);
    await expect(panel.locator('.sv-status-step')).toHaveCount(4);
    // The cross is big enough for a thumb's tip, and closes it.
    const cross = panel.getByRole('button', { name: 'Close' });
    expect(await insideWindow(page, cross)).toBe(true);
    await captureEvidence(page, 'APP-TIER-016', 'phone-app-label-panel');
    await cross.click();
    await expect(panel).toBeHidden();
  });
});

test.describe('demo app: the label on a chart or a tab below Exploratory', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });
  // The five Experimental charts and the RBQM tab, each with the name its panel
  // is headed by and the sentence that says why: the approved design's table.
  const BELOW = [
    [
      'time-to-event',
      'Time-to-Event Explorer is experimental',
      'Experimental until an external clinical review confirms its Kaplan–Meier estimates.'
    ],
    [
      'hep-waterfall',
      'Hepatic ALT Waterfall is experimental',
      'Experimental: a new chart, drawn from a 2025 paper; its layout and settings may still change.'
    ],
    [
      'nep-explorer',
      'Nephrotoxicity Explorer is experimental',
      'Experimental until its kidney-injury staging has had a clinical review.'
    ],
    [
      'participant-profile',
      'Participant Profile is experimental',
      'Experimental: what it lists for a participant, and how, may still change.'
    ],
    [
      'qt-explorer',
      'QT Safety Explorer is experimental',
      'Experimental: its settings and its table may still change.'
    ],
    [
      'rbqm',
      'The RBQM tab is experimental',
      'Experimental: new in 1.10. R runs in the browser, and what the tab shows may still change.'
    ]
  ];
  const corner = (page) => page.locator('.sva-content .sva-corner .sv-status');
  const open = (page, id) =>
    page.evaluate(([app, view]) => window[app].select(view), ['__safetyVizApp', id]);

  test('APP-TIER-021: each of the five Experimental charts and the RBQM tab shows the label on the corner of its card with its own reason, and no chart draws a status banner inside itself; an Exploratory chart shows no second label (#274)', async ({
    page
  }) => {
    test.setTimeout(MANY_CHARTS);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openOnDemo(page);
    // The page was handed the rung of every chart and of the tab.
    const told = await page.evaluate(`${APP}.tiers()`);
    expect(Object.keys(told)).toHaveLength(modules.length + bioCharts.length + 1);
    expect(
      Object.keys(told)
        .filter((id) => told[id].tier === 'experimental')
        .sort()
    ).toEqual(BELOW.map(([id]) => id).sort());
    expect(Object.values(told).filter((rung) => rung.tier === 'qualified')).toEqual([]);

    for (const [id, heading, reason] of BELOW) {
      await open(page, id);
      const label = corner(page);
      await expect(label, id).toHaveCount(1);
      await expect(pill(label).locator('.sv-status-word'), id).toHaveText('Experimental');
      // Dashed, for Experimental.
      expect(
        await pill(label).evaluate((element) => getComputedStyle(element).borderTopStyle),
        id
      ).toBe('dashed');
      await expect(pill(label), id).toHaveAttribute(
        'aria-label',
        `Status: Experimental. ${reason}`
      );
      await pill(label).click();
      const panel = panelOf(label);
      await expect(panel.getByRole('heading'), id).toHaveText(heading);
      await expect(panel.locator('.sv-status-text').nth(0), id).toHaveText(reason);
      await expect(panel.locator('.sv-status-here'), id).toHaveAttribute(
        'data-tier',
        'experimental'
      );
      await expect(panel.locator('.sv-status-mark'), id).toHaveText([
        'This app',
        id === 'rbqm' ? 'This tab' : 'This chart'
      ]);
      expect(await insideWindow(page, panel), id).toBe(true);
      if (id === 'time-to-event') {
        // The label sits on the top edge of the chart's card, at its right.
        const [card, on] = [
          await page.locator('.sva-content .sva-chart').boundingBox(),
          await pill(label).boundingBox()
        ];
        expect(on.y).toBeLessThan(card.y);
        expect(on.y + on.height).toBeGreaterThan(card.y);
        expect(card.x + card.width - (on.x + on.width)).toBeGreaterThan(0);
        expect(card.x + card.width - (on.x + on.width)).toBeLessThan(40);
        await captureEvidence(page, 'APP-TIER-021', 'chart-label-panel');
      }
      // The label is the one place the status is said: nothing inside the chart, no pill.
      await expect(page.locator('.sva-content .sv-experimental'), id).toHaveCount(0);
      await expect(page.locator('.sva-content .sv-status'), id).toHaveCount(1);
      await expect(page.locator('.sva-badge'), id).toHaveCount(0);
      // The app's own label is still the only one in the header, and opening this one closed nothing else.
      await expect(page.locator('.sva-header .sv-status'), id).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(panel, id).toBeHidden();
    }

    // An Exploratory chart, of safety.viz's and of the biomarker library's: no second label.
    for (const id of ['histogram', 'ae-explorer', 'hep-explorer', bioCharts[0][0]]) {
      await open(page, id);
      await expect(item(page, id), id).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.sva-main .sv-status'), id).toHaveCount(0);
      await expect(page.locator('.sva-content .sv-experimental'), id).toHaveCount(0);
    }
    // Nor the Hepatic Explorer's migration view, which carried a banner of its own.
    await open(page, 'hep-explorer');
    await page.locator('.sva-chart .sv-view-option', { hasText: 'Migration' }).click();
    await expect(page.locator('.sva-chart .hep-sankey')).toBeVisible();
    await expect(page.locator('.sva-content .sv-experimental')).toHaveCount(0);
    await expect(page.locator('.sva-main .sv-status')).toHaveCount(0);
  });

  test('APP-TIER-022: at 390 pixels the label on a chart’s card is on screen and its panel opens inside the window, with nothing running off the page; the RBQM tab’s label has a line of its own above the tab’s first words (#274)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tests/e2e/fixtures/basic-app.html#time-to-event');
    await page.evaluate(`${APP}.ready`);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const label = corner(page);
    await expect(pill(label)).toBeVisible();
    await pill(label).scrollIntoViewIfNeeded();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await pill(label).click();
    const panel = panelOf(label);
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(panel.getByRole('heading')).toHaveText('Time-to-Event Explorer is experimental');
    await captureEvidence(page, 'APP-TIER-022', 'phone-chart-label-panel');
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
    // The RBQM tab's too.
    await page.evaluate(() => {
      window.location.hash = '#rbqm';
    });
    await expect(corner(page).locator('.sv-status-word')).toHaveText('Experimental');
    // On a tab's view the label has a line of its own at this width, above
    // the tab's card and not over its first words.
    const own = await pill(corner(page)).boundingBox();
    const card = await page.locator('.sva-rbqm-page').boundingBox();
    expect(own.y + own.height).toBeLessThanOrEqual(card.y);
    await pill(corner(page)).click();
    const tabBox = await panelOf(corner(page)).boundingBox();
    expect(tabBox.x).toBeGreaterThanOrEqual(0);
    expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
