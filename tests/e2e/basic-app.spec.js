import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the portfolio app (#150, obot.roadmap#352): one page
// that lists every chart in the portfolio manifest by domain, says which the
// loaded data supports, and draws one at a time. Test names are keyed to the
// APP-* rows in requirements/portfolio-app.md.
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

test.describe('portfolio app on the demo study', () => {
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
    await item(page, 'data').click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
