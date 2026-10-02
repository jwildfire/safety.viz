import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the demo app (#150, obot.roadmap#352): a full-page app
// that lists every chart in the portfolio manifest by domain, says which the
// loaded data supports, and draws one at a time. Test names are keyed to the
// APP-* rows in requirements/demo-app.md.
//
// The harness page (fixtures/basic-app.html) mounts the real app bundle on the
// vendored demo extracts. The bundle is a build product, so it is built here.

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/portfolio.json', import.meta.url), 'utf8')
);
const modules = Object.entries(manifest.modules);
// Drawn in the main pane: everything but the participant profile, which is a
// rail inside its host charts.
const destinations = modules.filter(([module]) => module !== 'participant-profile');

const APP = 'window.__safetyVizApp';
const item = (page, id) => page.locator(`.sva-item[data-view="${id}"]`);
const tab = (page, domain) => page.locator(`.sva-tab[data-domain="${domain}"]`);

// A chart sits under its domain's tab: open the tab, then choose the chart.
const domainOf = (module) => manifest.modules[module].domains[0];
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

  test('APP-PAGE-001: every chart in the manifest is listed under its domain with a status: thirteen charts, three domains (#150, #165)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(page.locator('.sva-group-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events'
    ]);
    // A chip drops the word every chart shares.
    await expect(page.locator('.sva-group .sva-item-title')).toHaveText(
      modules.map(([, entry]) => entry.title.replace('Safety ', ''))
    );
    await expect(page.locator('.sva-group .sva-tag')).toHaveCount(13);
    // The experimental Patient Journey Explorer is not offered.
    await expect(page.locator('.sva-app')).not.toContainText('Patient Journey');
  });

  test('APP-PAGE-002: the demo study reads 13 of 13 supported and opens on the first chart (#150, #165)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 13 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-tag.sva-ready')).toHaveCount(13);
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
      '12 of 13 charts supported by the loaded data'
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
      '0 of 13 charts supported by the loaded data'
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
    await expect(page.locator('.sva-footer .sva-pitch')).toHaveText(
      'Everything runs in this browser. Nothing is sent anywhere.'
    );
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
      'Adverse events'
    ]);
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '9 of 9',
      '1 of 1',
      '3 of 3'
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
    const errors = watchErrors(page);
    await openOnDemo(page);
    // On the data view, where a mapping edit redraws the table and no chart.
    await item(page, 'data').click();
    // Clear each row in turn; a row some chart cannot draw without is put back.
    const cleared = await page.evaluate(`(() => {
      const app = ${APP};
      const ready = () =>
        Object.values(app.status()).filter((status) => status.state === 'ready').length;
      const done = [];
      for (const [domain, mapping] of Object.entries(app.state.mappings)) {
        for (const [column, row] of Object.entries(mapping.columns)) {
          if (!row.value) continue;
          app.setColumn(domain, column, null);
          if (ready() < 13) app.setColumn(domain, column, row.value);
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
      '13 of 13 charts supported by the loaded data'
    );
    for (const [module, entry] of destinations) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(
        page.locator('.sva-chart').locator('canvas:visible, table:visible').first()
      ).toBeVisible();
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
    await expect(page.locator('.sva-count')).toHaveText(
      '7 of 13 charts supported by the loaded data'
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
    const errors = watchErrors(page);
    await openEmpty(page);
    await chooseFiles(page, STUDY);
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 13 charts supported by the loaded data'
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

  test('APP-LOAD-014: no network request leaves the page from the first file selection onward (#151)', async ({
    page
  }) => {
    await openEmpty(page);
    const requests = [];
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    await chooseFiles(page, [...STUDY, NO_DOMAIN]);
    await correct(page);
    for (const [module] of destinations) await openChart(page, module);
    await item(page, 'data').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-mapping"]').click();
    await download;
    await item(page, 'data').click();
    // blob: and data: URLs are the page talking to itself, not the network.
    expect(requests.filter((entry) => !/^GET (blob|data):/.test(entry))).toEqual([]);
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
      '0 of 13 charts supported by the loaded data'
    );
    await page.locator('.sva-file-input').setInputFiles([...STUDY, saved]);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 13 charts supported by the loaded data'
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
      '0 of 13 charts supported by the loaded data'
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
    await expect(stepStatus(page, 'open')).toHaveText('7 of 13 charts ready');
    await captureEvidence(page, 'APP-LOAD-017', 'sidebar');

    await correct(page);
    // No chart is waiting on a row: the step is done, with its guesses still counted (#163).
    await expect(stepStatus(page, 'map')).toHaveText('23 guessed, 0 needed by a chart');
    await expect(step(page, 'map')).toHaveAttribute('data-state', 'done');
    await expect(step(page, 'open')).toHaveAttribute('data-state', 'current');
    await expect(stepStatus(page, 'open')).toHaveText('13 of 13 charts ready');
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
      '0 of 13 charts supported by the loaded data'
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
    await expect(stepStatus(page, 'open')).toHaveText('8 of 13 charts ready');
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '8 of 9',
      '0 of 1',
      '0 of 3'
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
      '13 of 13 charts supported by the loaded data'
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
      '0 of 13 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-drop')).toBeVisible();
    await expect(page.locator('.sva-study')).toHaveCount(0);
    // The only thing fetched is the file itself.
    expect(requests).toEqual([SINGLE_FILE.href]);
    expect(errors).toEqual([]);
  });

  test('APP-FILE-006: offline, the file loads the renamed study, takes the corrections and draws its charts (#152)', async ({
    page,
    context
  }) => {
    const errors = watchErrors(page);
    await context.setOffline(true);
    await page.goto(SINGLE_FILE.href);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await chooseFiles(page, STUDY);
    await expect(page.locator('.sva-count')).toHaveText(
      '7 of 13 charts supported by the loaded data'
    );
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 13 charts supported by the loaded data'
    );
    for (const [module, entry] of destinations) {
      await openChart(page, module);
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(
        page.locator('.sva-chart').locator('canvas:visible, table:visible').first()
      ).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    expect(requests.filter((url) => !/^(blob|data):/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-FILE-007: the built file holds no script, stylesheet or image reference to another URL (#152)', async () => {
    const html = readFileSync(SINGLE_FILE, 'utf8');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link\b[^>]*\shref=/i);
    expect(html).not.toMatch(/<img\b[^>]*\ssrc=["']?https?:/i);
    expect(html).not.toContain('sourceMappingURL');
    // Two script elements: the inlined app, and the one line that mounts it.
    expect(html.match(/<script>/g)).toHaveLength(2);
  });
});
