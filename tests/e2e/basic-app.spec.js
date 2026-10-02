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
// Drawn in the main pane: everything but the participant profile (a rail
// inside its host charts) and the Patient Journey Explorer (its own domains).
const destinations = modules.filter(
  ([module, entry]) => module !== 'participant-profile' && !entry.externalDomains
);

const APP = 'window.__safetyVizApp';
const item = (page, id) => page.locator(`.sva-item[data-view="${id}"]`);
const tab = (page, domain) => page.locator(`.sva-tab[data-domain="${domain}"]`);

// A chart sits under its domain's tab: open the tab, then choose the chart.
const domainOf = (module) =>
  manifest.modules[module].externalDomains ? 'other' : manifest.modules[module].domains[0];
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

  test('APP-PAGE-001: every chart in the manifest is listed under its domain with a status (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    await expect(page.locator('.sva-group-title')).toHaveText([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Outside the standard domains'
    ]);
    // A chip drops the word every chart shares.
    await expect(page.locator('.sva-group .sva-item-title')).toHaveText(
      modules.map(([, entry]) => entry.title.replace('Safety ', ''))
    );
    await expect(page.locator('.sva-group .sva-tag')).toHaveCount(14);
  });

  test('APP-PAGE-002: the demo study reads 13 of 14 supported and opens on the first chart (#150)', async ({
    page
  }) => {
    const errors = watchErrors(page);
    await openOnDemo(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 14 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-tag.sva-ready')).toHaveCount(13);
    await expect(item(page, 'patient-journey-explorer').locator('.sva-tag')).toHaveText(
      'needs more domains'
    );
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
      '12 of 14 charts supported by the loaded data'
    );
  });

  test('APP-PAGE-006: a chart the data cannot support is not drawn, and the page says why (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    await openChart(page, 'patient-journey-explorer');
    await expect(page.locator('.sva-message')).toContainText('six domains of its own');
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
      '0 of 14 charts supported by the loaded data'
    );
    await expect(item(page, 'data')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.sva-data')).toContainText('No files are loaded.');
    await expect(page.locator('[data-action="demo"]')).toHaveCount(0);
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
    // even for the nine charts of labs and vitals, down to a 1280-pixel screen.
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await tab(page, 'bds').click();
      const size = await page.evaluate(() => {
        const row = document.querySelector('.sva-group:not([hidden])');
        return {
          header: document.querySelector('.sva-header').getBoundingClientRect().height,
          row: document.querySelector('.sva-charts').getBoundingClientRect().height,
          fits: row.scrollWidth <= row.clientWidth
        };
      });
      expect(size.header).toBeLessThan(100);
      expect(size.row).toBeLessThan(40);
      expect(size.fits).toBe(true);
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
      'Adverse events',
      'Other'
    ]);
    await expect(page.locator('.sva-tab .sva-tab-count')).toHaveText([
      '9 of 9',
      '1 of 1',
      '3 of 3',
      '0 of 1'
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
      '7 of 14 charts supported by the loaded data'
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
      '13 of 14 charts supported by the loaded data'
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
      '0 of 14 charts supported by the loaded data'
    );
    await page.locator('.sva-file-input').setInputFiles([...STUDY, saved]);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 14 charts supported by the loaded data'
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
      '0 of 14 charts supported by the loaded data'
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
      '0 of 14 charts supported by the loaded data'
    );
    await expect(page.locator('.sva-drop')).toBeVisible();
    await expect(page.locator('[data-action="demo"]')).toHaveCount(0);
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
      '7 of 14 charts supported by the loaded data'
    );
    await correct(page);
    await expect(page.locator('.sva-count')).toHaveText(
      '13 of 14 charts supported by the loaded data'
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
