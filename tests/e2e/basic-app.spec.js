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
    await expect(page.locator('.sva-group .sva-item-title')).toHaveText(
      modules.map(([, entry]) => entry.title)
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
    await captureEvidence(page, 'APP-PAGE-002', 'demo-study');
  });

  for (const [module, entry] of destinations) {
    test(`APP-PAGE-003: ${entry.title} draws from the demo study with no console error (#150)`, async ({
      page
    }) => {
      const errors = watchErrors(page);
      await openOnDemo(page);
      await item(page, module).click();
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
      await item(page, module).click();
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
    await item(page, 'shift-plot').click();
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
    await item(page, 'patient-journey-explorer').click();
    await expect(page.locator('.sva-message')).toContainText('six domains of its own');
    await expect(page.locator('.sva-chart')).toHaveCount(0);
  });

  test('APP-PAGE-007: the participant profile is explained, and opens as the rail beside its host chart (#150)', async ({
    page
  }) => {
    await openOnDemo(page);
    await item(page, 'participant-profile').click();
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

  test('APP-PAGE-012: the page’s own chrome fits a phone-width viewport (#150)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    await page.locator('.sva-navtoggle').click();
    await item(page, 'data').click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('APP-PAGE-021: at phone width the chart list folds behind a Charts button and closes on a choice (#150)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnDemo(page);
    const toggle = page.locator('.sva-navtoggle');
    await expect(toggle).toBeVisible();
    await expect(page.locator('.sva-nav')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'qt-explorer')).toBeVisible();
    await item(page, 'qt-explorer').click();
    await expect(page.locator('.sva-nav')).toBeHidden();
    await expect(page.locator('.sva-title')).toHaveText('QT Safety Explorer');
    // On a wide screen there is no button and the list is always there.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(toggle).toBeHidden();
    await expect(page.locator('.sva-nav')).toBeVisible();
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
      await item(page, module).click();
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
      await item(page, module).click();
      await expect(page.locator('.sva-title')).toHaveText(entry.title);
      await expect(
        page.locator('.sva-chart').locator('canvas:visible, table:visible').first()
      ).toBeVisible();
      await expect(item(page, module).locator('.sva-tag')).toHaveText('ready');
    }
    expect(errors).toEqual([]);
    await item(page, 'hep-explorer').click();
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
    for (const [module] of destinations) await item(page, module).click();
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
      await item(page, module).click();
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
