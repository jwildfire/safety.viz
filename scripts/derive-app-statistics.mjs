// Writes what the group comparison chart asks R for in the demo app, so desktop
// R can answer the same requests (#183, obot.roadmap#366). Nothing is typed by
// hand: the app itself, on its pilot demo study, opens the group comparison on
// one measure with R started, and every request the chart makes — the R
// function, its arguments and the rows of one visit's panel — is recorded by
// the harness page's stand-in for R (tests/e2e/fixtures/basic-app.html?record)
// and written to tests/fixtures/app-statistics/requests.json, with checksums of
// what it was derived from. scripts/app-statistics.R then answers each request
// with the vendored gsm.bio statistics file in desktop R, and the browser tests
// compare real webR's answers with desktop R's.
//
//   npm run build:app && node scripts/derive-app-statistics.mjs && Rscript scripts/app-statistics.R
//
// Rerun when the demo study, bio.viz's bundle, the statistics file or the app's
// settings change; a unit test fails until it is rerun.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { APP_STATISTICS, derivedFrom } from './app-statistics-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PW_PORT || 8199);
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', rootDir], {
  stdio: 'ignore'
});
try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/tests/e2e/fixtures/basic-app.html?record`);
  await page.evaluate('window.__safetyVizApp.ready');
  await page.evaluate((module) => window.__safetyVizApp.select(module), APP_STATISTICS.chart);
  await page.locator('.sva-action').click();
  await page
    .locator('.sva-chart .sv-control', { has: page.locator('label:text-is("Biomarker")') })
    .locator('select')
    .selectOption({ label: APP_STATISTICS.measure });
  await page.waitForFunction(
    () =>
      window.__rCalls.length > 0 &&
      ![...document.querySelectorAll('.sva-chart .bv-statistic')].some((line) =>
        /waiting/.test(line.textContent)
      )
  );
  const requests = await page.evaluate(() => window.__rCalls);
  await browser.close();
  const directory = path.join(rootDir, APP_STATISTICS.directory);
  mkdirSync(directory, { recursive: true });
  const document = {
    chart: APP_STATISTICS.chart,
    measure: APP_STATISTICS.measure,
    derived_from: derivedFrom((file) => readFileSync(path.join(rootDir, file))),
    requests
  };
  writeFileSync(path.join(directory, 'requests.json'), `${JSON.stringify(document, null, 1)}\n`);
  console.log(`✓ Wrote ${APP_STATISTICS.directory}/requests.json — ${requests.length} requests`);
} finally {
  server.kill();
}
