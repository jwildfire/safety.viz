import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';
import {
  APP_LIBRARIES,
  FILE_NO_R,
  FILE_PITCH,
  HOSTED_PITCH,
  libraryManifest
} from '../../scripts/app-libraries.mjs';

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
// a hang (#193).
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

  test('APP-PAGE-001: every chart is listed under its group with a status: thirteen safety charts under three domains, and four biomarker charts in their own tab (#150, #165, #182)', async ({
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
    await expect(page.locator('.sva-group .sva-tag')).toHaveCount(17);
    // The experimental Patient Journey Explorer is not offered.
    await expect(page.locator('.sva-app')).not.toContainText('Patient Journey');
  });

  test('APP-PAGE-002: the demo study reads 17 of 17 supported and opens on the first chart (#150, #165, #182)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '17 of 17 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-tag.sva-ready')).toHaveCount(17);
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('4 files');
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
      '16 of 17 charts supported by the loaded data'
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
      '0 of 17 charts supported by the loaded data'
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
    await expect(page.locator('.sva-tab .sva-tab-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Biomarkers'
    ]);
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '9 of 9',
      '1 of 1',
      '3 of 3',
      '4 of 4'
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
      '17 of 17 charts supported by the loaded data'
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
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('4 files');
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
    await expect(item(page, 'data').locator('.sva-tag')).toHaveText('4 files');
  });

  test('APP-LOAD-003: before mapping, the chart list names what each unsupported chart is missing (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    // The biomarker charts read columns the renamed study's guesses already fill.
    await expect(page.locator('.sva-count')).toHaveText(
      '11 of 17 charts supported by the loaded data'
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
      '17 of 17 charts supported by the loaded data'
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

  test('APP-LOAD-014: no network request leaves the page from the first file selection onward, unless the reader starts R (#151, #183)', async ({
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
    await item(page, 'data').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-mapping"]').click();
    await download;
    await item(page, 'data').click();
    // blob: and data: URLs are the page talking to itself, not the network.
    expect(requests.filter((entry) => !/^GET (blob|data):/.test(entry))).toEqual([]);
    // And the footer says so, in these words (#196).
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(
      'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org; your data stays in the browser, and R runs here.'
    );
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
      '0 of 17 charts supported by the loaded data'
    );
    await page.locator('.sva-file-input').setInputFiles([...STUDY, saved]);
    await expect(page.locator('.sva-count')).toHaveText(
      '17 of 17 charts supported by the loaded data'
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
      '0 of 17 charts supported by the loaded data'
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
// R and what starting it downloads (APP-R-006).
const NO_R =
  'Statistics need R. Start R to compute them: it downloads about 13 MB, once, from ' +
  'webr.r-wasm.org, and the study’s data stays in this browser.';

test.describe('demo app with the biomarker charts', () => {
  test.beforeAll(() => {
    execSync('npm run build:app', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  const statistics = (page) => page.locator('.sva-chart .bv-statistic');
  const sections = (page) => page.locator('.sva-chart .sv-section-title');

  test('APP-BIO-004: on the demo study the four biomarker charts have a tab of their own after the three domains, each ready, and the count includes them (#182)', async ({
    page
  }) => {
    await openOnDemo(page);
    expect(bioCharts).toHaveLength(4);
    await expect(tab(page, 'biomarkers').locator('.sva-tab-title')).toHaveText('Biomarkers');
    await expect(tab(page, 'biomarkers').locator('.sva-tab-count')).toHaveText('4 of 4');
    await expect(tab(page, 'biomarkers')).toHaveClass(/sva-library-group/);
    await expect(page.locator('.sva-tab').last()).toHaveAttribute('data-domain', 'biomarkers');
    await tab(page, 'biomarkers').click();
    for (const [module, entry] of bioCharts) {
      await expect(item(page, module).locator('.sva-item-title')).toHaveText(entry.title);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    await expect(page.locator('.sva-count')).toHaveText(
      '17 of 17 charts supported by the loaded data'
    );
  });

  for (const [module, entry] of bioCharts) {
    test(`APP-BIO-005: ${entry.title} draws on the demo study with no console error, and ${
      module === 'group-comparison'
        ? 'opens on an overview that prints no test; with a biomarker chosen, its lines say statistics need R until R is started'
        : 'its statistics line says statistics need R until R is started'
    } (#182, #183)`, async ({ page }) => {
      const errors = watchErrors(page);
      await openOnDemo(page);
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      // Drawn with safety.viz's kit, as the safety charts are.
      await expect(page.locator('.sva-chart .sv-root .sv-sidebar')).toBeVisible();
      if (module === 'group-comparison') {
        // It opens on its overview: every measure, every visit, by arm. The
        // overview asks R for nothing, so it prints no test.
        expect(
          (await statistics(page).allTextContents()).every((text) => text === ''),
          'the overview prints a statistics line'
        ).toBe(true);
        const measures = new Set(
          readFileSync(new URL('../../site/data/adbds.csv', import.meta.url), 'utf8')
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .map((line) => line.split(',')[8])
        ).size;
        await expect(page.locator('.sva-chart .bv-overview-count').first()).toContainText(
          `of ${measures} biomarkers shown`
        );
        await expect(page.locator('.sva-chart .bv-overview-panel').first()).toBeVisible();
        const groupBy = page
          .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Group by")') })
          .locator('select');
        await expect(groupBy).toHaveValue('ARM');
        // One biomarker open: each visit's line, where a test applies, says so.
        await page
          .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
          .locator('select')
          .selectOption({ index: 1 });
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
      '17 of 17 charts supported by the loaded data'
    );
    for (const [module, entry] of bioCharts) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
    }
    // The group comparison reads the renamed files through the same mapping:
    // its measures are the labs file's own.
    await openChart(page, 'group-comparison');
    const options = await page
      .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
      .locator('option')
      .allTextContents();
    expect(options.length).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });

  test('APP-BIO-008: at phone width, with the Biomarkers tab and a biomarker chart open, the page does not scroll sideways (#182)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await tab(page, 'biomarkers').scrollIntoViewIfNeeded();
    await tab(page, 'biomarkers').click();
    await expect(page.locator('.sva-title')).toHaveText(bioCharts[0][1].title);
    await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
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
// from the app by scripts/derive-app-statistics.mjs and scripts/app-statistics.R.
const R_HOST = /webr\.r-wasm\.org|statistics\.R/;
const NEED_R = NO_R;
const expectedStatistics = JSON.parse(
  readFileSync(new URL('./../fixtures/app-statistics/expected.json', import.meta.url), 'utf8')
);
const biomarkerControl = (page) =>
  page
    .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
    .locator('select');
const settled = (page, timeout = 100000) =>
  page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.sva-chart .bv-statistic')].some((line) =>
        /waiting/.test(line.textContent)
      ),
    null,
    { timeout }
  );
// Requests to R's hosts, and the imports of webR itself, which is what starting R costs.
const rRequests = (requests) => requests.filter((url) => R_HOST.test(url));
const webrImports = (requests) => requests.filter((url) => /webr\.mjs$/.test(url));

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
    await expect(page.locator('.sva-action')).toHaveText('Start R');
    await expect(page.locator('.sva-action')).toHaveAttribute('title', NEED_R);
    expect(requests.filter((url) => R_HOST.test(url))).toEqual([]);
    expect(await page.evaluate(() => window.__rConnections)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('APP-R-007: pressing the control starts R once, about 13 MB from webr.r-wasm.org, and the group comparison prints R’s test under each visit, equal to desktop R on the same rows (#183)', async ({
    page,
    context
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    let transferred = 0;
    context.on('requestfinished', async (request) => {
      if (/webr\.r-wasm\.org/.test(request.url()))
        transferred += (await request.sizes()).responseBodySize;
    });
    await openOnDemo(page);
    await openChart(page, expectedStatistics.chart);
    await expect(page.locator('.sva-action-hint')).toHaveText('About 13 MB, once');
    // Pressed on the overview, which asks R for nothing: R starts all the same,
    // and the control says so, then that it is running.
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-action')).toHaveText('Starting R…');
    await expect(page.locator('.sva-action')).toHaveText('R started', { timeout: 150000 });
    await expect(page.locator('.sva-action')).toBeDisabled();
    await expect(page.locator('.sva-action')).toHaveAttribute(
      'title',
      'R is running in this browser.'
    );
    expect(transferred).toBeGreaterThan(10e6);
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await page.waitForFunction(
      (count) => window.__rAnswers.length >= count,
      expectedStatistics.answers.length,
      { timeout: 150000 }
    );
    await settled(page);
    expect(await page.evaluate(() => window.__rConnections)).toBe(1);
    const answers = await page.evaluate(() => window.__rAnswers);
    expect(answers).toHaveLength(expectedStatistics.answers.length);
    answers.forEach((answer, index) => {
      const expected = expectedStatistics.answers[index];
      expect(answer.name).toBe(expected.name);
      expect(answer.args).toEqual(expected.args);
      expect(answer.rows).toBe(expected.rows);
      expect(answer.answer.status).toBe('ok');
      expect(answer.answer.form).toBe('browser');
      same(answer.answer.value, expected.value, `answer ${index}`);
    });
    // What the chart prints is R's: each panel R tested names R's method and counts.
    const printed = await page.locator('.sva-chart .bv-statistic').allTextContents();
    const tested = expectedStatistics.answers.filter((answer) => answer.value.status === 'ok');
    expect(tested.length).toBeGreaterThan(0);
    for (const answer of tested) {
      const counts = Object.entries(answer.value.counts)
        .map(([group, n]) => `${group} n = ${n}`)
        .join(', ');
      expect(
        printed.some((line) => line.startsWith(answer.value.method) && line.includes(counts)),
        `no line prints ${answer.value.method} with ${counts}`
      ).toBe(true);
    }
    // About 13 MB, as the statistics line and the control say.
    expect(transferred).toBeGreaterThan(10e6);
    expect(transferred).toBeLessThan(16e6);
    expect(errors).toEqual([]);
  });

  test('APP-R-017: pressing the control with a biomarker chosen keeps it: the open chart is not drawn again, and prints R’s test for that biomarker (#183)', async ({
    page
  }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await openOnDemo(page);
    await openChart(page, expectedStatistics.chart);
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await settled(page, 20000);
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: NEED_R }).first()
    ).toBeVisible();
    await page.locator('.sva-action').click();
    await page.waitForFunction(
      (count) => window.__rAnswers.length >= count,
      expectedStatistics.answers.length,
      { timeout: 150000 }
    );
    await settled(page);
    // Still the biomarker the reader chose, with R's answers under its visits.
    await expect(biomarkerControl(page)).toHaveValue(expectedStatistics.measure);
    const [tested] = expectedStatistics.answers.filter((answer) => answer.value.status === 'ok');
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: tested.value.method }).first()
    ).toBeVisible();
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
    await openChart(page, expectedStatistics.chart);
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-action')).toHaveText('R started', { timeout: 150000 });
    // Every statistics line the open chart prints from here on is recorded.
    await page.evaluate(() => {
      window.__lines = [];
      const record = () => {
        for (const line of document.querySelectorAll('.sva-chart .bv-statistic')) {
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
    await page.waitForFunction(
      (count) => window.__rAnswers.length >= count,
      expectedStatistics.answers.length,
      { timeout: 150000 }
    );
    await settled(page);
    const lines = await page.evaluate(() => window.__lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => /R is starting/.test(line))).toEqual([]);
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
    // WebSocket opened by the page and one opened by a worker.
    const errors = watchErrors(page);
    // Every request the page and its workers make, R's download included,
    // marked by whether a file had been chosen yet.
    let chosen = false;
    const requests = [];
    // Every header as sent, cookies included: request.headers() leaves out
    // the ones the network stack adds, such as `cookie` (#211 review). A
    // request whose headers cannot be read fails the header check.
    const reading = [];
    const record = (request) => {
      const entry = {
        method: request.method(),
        url: request.url(),
        body: request.postData(),
        headers: null,
        type: request.resourceType(),
        chosen
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
    const sockets = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await openEmpty(page);
    const own = new URL(page.url()).origin;
    chosen = true;
    await chooseFiles(page, STUDY);
    await correct(page);
    await openChart(page, expectedStatistics.chart);
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-action')).toHaveText('R started', { timeout: 150000 });
    await biomarkerControl(page).selectOption({ index: 1 });
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: /p = / }).first()
    ).toBeVisible({ timeout: 150000 });
    // That was the last action. Keep listening after it until nothing has been
    // asked for in five seconds (at most a minute), so a request sent late is
    // still seen: the claim holds until then, not forever.
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
    // The page's own document is the one request the browser made with nothing
    // set by a script: the headers it carries are the browser's own.
    const page0 = requests.find((request) => request.type === 'document');
    // R was asked for, and answered, in this browser.
    expect(requests.some((request) => /webr\.r-wasm\.org/.test(request.url))).toBe(true);
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
    await openChart(page, expectedStatistics.chart);
    await biomarkerControl(page).selectOption({ label: expectedStatistics.measure });
    await page.locator('.sva-action').click();
    const action = page.locator('.sva-action');
    await expect(action).toHaveText('Try R again', { timeout: 60000 });
    await expect(action).toBeEnabled();
    await expect(action).toHaveAttribute(
      'title',
      /^R did not start: .* Try again; if it fails again, reload the page\.$/
    );
    await settled(page, 30000);
    await expect(
      page.locator('.sva-chart .bv-statistic').filter({ hasText: 'R did not start' }).first()
    ).toBeVisible();
    const fetched = rRequests(requests).length;
    for (const module of ['association-scatter', 'correlation-matrix', 'biomarker-screen']) {
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
    await expect(page.locator('.sva-action')).toHaveText('Try R again', { timeout: 150000 });
    await settled(page, 30000);
    await expect(page.locator('.sva-chart .bv-statistic')).toContainText('R did not start');
    const first = { all: rRequests(requests).length, webr: webrImports(requests).length };
    expect(first.webr).toBe(1);
    for (const module of ['correlation-matrix', 'biomarker-screen', 'group-comparison']) {
      await item(page, module).click();
      await settled(page, 30000);
    }
    expect(rRequests(requests)).toHaveLength(first.all);
    // Trying again makes one fresh start: the statistics file is asked for once more.
    await page.locator('.sva-action').click();
    await expect(page.locator('.sva-action')).toHaveText('Try R again', { timeout: 150000 });
    expect(requests.filter((url) => /statistics\.R/.test(url))).toHaveLength(2);
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
    for (const module of ['correlation-matrix', 'biomarker-screen']) {
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
    await expect(stepStatus(page, 'open')).toHaveText('11 of 17 charts ready');
    await captureEvidence(page, 'APP-LOAD-017', 'sidebar');

    await correct(page);
    // No chart is waiting on a row: the step is done, with its guesses still counted (#163).
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 0 needed by a chart');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'done');
    await expect(step(page, 'open')).toHaveAttribute('data-state', 'current');
    await expect(stepStatus(page, 'open')).toHaveText('17 of 17 charts ready');
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
      '0 of 17 charts supported by the loaded data'
    );
    await expect(sideAction(page, 'reset')).toHaveCount(0);
    // The same files can be chosen again, and arrive unmapped as they first did.
    await chooseFiles(page, STUDY);
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 6 needed by a chart');
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
      'Liver cohort, labs only'
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
    await expect(stepStatus(page, 'open')).toHaveText('12 of 17 charts ready');
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '8 of 9',
      '0 of 1',
      '0 of 3',
      '4 of 4'
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
      '17 of 17 charts supported by the loaded data'
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
    await expect(page).toHaveTitle('safety.viz demo');
    await expect(page.locator('.sva-wordmark')).toHaveText('safety.viz');
    await expect(page.locator('.sva-kicker')).toHaveText('Demo app');
    await expect(page.locator('.sva-version')).toHaveText(/^safety\.viz \d+\.\d+\.\d+$/);
    // With no site around it, its links go to the published one.
    await expect(page.locator('.sva-links a[data-link="docs"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/'
    );
    await expect(page.locator('.sva-count')).toHaveText(
      '0 of 17 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-drop')).toBeVisible();
    await expect(page.locator('.sva-study')).toHaveCount(0);
    // The only thing fetched is the file itself.
    expect(requests).toEqual([SINGLE_FILE.href]);
    expect(errors).toEqual([]);
  });

  test('APP-FILE-006: offline, the file loads the renamed study, takes the corrections and draws every chart of both libraries (#152, #182)', async ({
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
      '11 of 17 charts supported by the loaded data'
    );
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '17 of 17 charts supported by the loaded data'
    );
    // Every chart of both libraries draws, with no request but the file itself.
    for (const [module, entry] of [...destinations, ...bioCharts]) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(page.locator('.sva-chart').locator(DRAWN).first()).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
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
      await expect(
        page.locator('.sva-chart .bv-statistic').filter({ hasText: FILE_NO_R }).first()
      ).toBeVisible();
    }
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
