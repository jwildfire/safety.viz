import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// The keynote's demo path (#287): one walk through the demo app as it is
// deployed, in the order it will be shown, at the size it will be shown.
//
// It is not part of the browser suite. That suite runs against the fixture
// pages of the commit under test, with a stand-in for R where it can; this
// walk runs against a published site, with real R downloaded from R's own
// hosts, and so belongs to no commit's evidence. `npm run demo-path` runs it
// against the dev demo, or against the address in DEMO_PATH_URL:
//
//   DEMO_PATH_URL=https://jwildfire.github.io/safety.viz/demo/ npm run demo-path
//
// Each step keeps a screenshot in docs/evidence/basic-app/demo-path/, and the
// walk fails on any console error, any page error, any request that fails and
// any answer of 400 or more. The order of the steps is @jwildfire's to change.

const shots = fileURLToPath(new URL('../../docs/evidence/basic-app/demo-path/', import.meta.url));

// Starting R is a 13 MB download, and an RBQM run a larger one: gsm's packages.
const R_STARTS = 180_000;
const RBQM_RUNS = 420_000;

test('the keynote’s demo path: the app opens on the pilot study, a chart, the status label, an Experimental chart’s reason, a statistic from R, the RBQM tab on the pilot study, then the RBQM demo study and its eight metrics (#287)', async ({
  page
}) => {
  mkdirSync(shots, { recursive: true });
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', (request) =>
    failed.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`)
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  const shot = (name) => page.screenshot({ path: `${shots}${name}.png` });
  const tab = (name) => page.locator('.sva-tab', { hasText: name });
  const chart = (id) => page.locator(`.sva-item[data-view="${id}"]`);
  const control = page.locator('.sva-charts > .sva-r');
  const chip = control.locator('.sva-chip.sva-r-ready');

  await test.step('1. the app opens on the pilot study', async () => {
    await page.goto('./');
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('.sva-welcome')).toContainText(
      'You are looking at the CDISC pilot study, a public demo'
    );
    await expect(chart('data').locator('.sva-tag')).toHaveText('Pilot study');
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    await shot('01-opens-on-the-pilot-study');
  });

  await test.step('2. a chart is opened', async () => {
    await tab('Adverse events').click();
    await chart('ae-explorer').click();
    await expect(page).toHaveTitle(/^Adverse Event Explorer · /);
    await expect(page.locator('.sva-chart table:visible').first()).toBeVisible();
    await shot('02-a-chart-is-opened');
  });

  await test.step('3. the app’s status label is opened and closed', async () => {
    const label = page.locator('.sva-appstatus .sv-status');
    await expect(label.locator('.sv-status-word')).toHaveText('Exploratory');
    await label.locator('.sv-status-label').click();
    await expect(label.locator('.sv-status-panel')).toContainText('Nothing here is qualified.');
    await shot('03-the-apps-status-label');
    await page.keyboard.press('Escape');
    await expect(label.locator('.sv-status-panel')).toBeHidden();
  });

  await test.step('4. an Experimental chart’s label is opened', async () => {
    await tab('Labs and vitals').click();
    await chart('hep-waterfall').click();
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    const label = page.locator('.sva-content .sva-corner .sv-status');
    await expect(label.locator('.sv-status-word')).toHaveText('Experimental');
    await label.locator('.sv-status-label').click();
    await expect(label.locator('.sv-status-panel')).toContainText(/^.*Experimental: /s);
    await shot('04-an-experimental-charts-label');
    await page.keyboard.press('Escape');
    await expect(label.locator('.sv-status-panel')).toBeHidden();
  });

  await test.step('5. a biomarker chart starts R and shows a statistic', async () => {
    await tab('Biomarkers').click();
    await chart('cross-tab').click();
    const statistic = page.locator('.sva-chart .bv-statistic').first();
    await expect(statistic).toHaveText('Statistics need R. Start R, at the top right.');
    await control.locator('.sva-action').click();
    await expect(chip).toBeVisible({ timeout: R_STARTS });
    await expect(statistic).toContainText('Chi-squared test: p ', { timeout: 60_000 });
    await shot('05-a-statistic-from-r');
  });

  await test.step('6. the RBQM tab runs on the pilot study', async () => {
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    await control.locator('.sva-action').click();
    await expect(page.locator('.sva-rbqm-table table.group-overview')).toBeVisible({
      timeout: RBQM_RUNS
    });
    await expect(page.locator('.sva-rbqm-status')).toHaveText(/^R ran 3 of 8 metrics /);
    await shot('06-rbqm-on-the-pilot-study');
  });

  await test.step('7. the RBQM demo study is chosen on the Data tab', async () => {
    await chart('data').click();
    await page.locator('.sva-side select.sva-study').selectOption('rbqm');
    await expect(page.locator('.sva-loaded-name')).toHaveCount(9);
    await expect(
      page.locator('.sva-data .sva-support[data-support="rbqm"] .sva-support-say')
    ).toHaveText('This data supports 8 of 8 metrics.');
    await shot('07-the-rbqm-demo-study-on-the-data-tab');
  });

  await test.step('8. the RBQM tab runs its eight metrics', async () => {
    // R is already running, so the tab runs the new study with no press.
    await page.locator('.sva-tab[data-tab="rbqm"]').click();
    await expect(page.locator('.sva-rbqm-status')).toHaveText(/^R ran 8 of 8 metrics /, {
      timeout: RBQM_RUNS
    });
    await expect(page.locator('.sva-view-items .sva-view-item')).toHaveCount(9);
    await shot('08-rbqm-eight-metrics');
    await page.locator('.sva-view-item[data-item="kri0001"]').click();
    await expect(page.locator('.sva-rbqm-figures canvas')).toHaveCount(2);
    await shot('09-one-metrics-page');
  });

  expect(failed, 'requests that failed').toEqual([]);
  expect(errors, 'console and page errors').toEqual([]);
});
