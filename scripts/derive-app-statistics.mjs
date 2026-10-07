// Writes what the biomarker charts ask R for in the demo app, so desktop R can
// answer the same requests (#183, #212). Nothing is typed by hand: the app
// itself, on its pilot demo study, is walked through the steps listed in
// scripts/app-statistics-lib.mjs with R started — a trend tile opened into one
// biomarker over time, a visit opened from it, the cross-tabulation — and every
// request a chart makes on the way, the R function, its arguments and its rows,
// is recorded by the harness page's stand-in for R
// (tests/e2e/fixtures/basic-app.html?record) and written to
// tests/fixtures/app-statistics/requests.json under the step that made it, with
// checksums of what it was derived from. scripts/app-statistics.R then answers
// each request with the vendored gsm.bio statistics file in desktop R, and the
// browser tests compare real webR's answers with desktop R's.
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
import {
  APP_STATISTICS,
  SCENARIO,
  derivedFrom,
  openAndStartR,
  playScenario
} from './app-statistics-lib.mjs';

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
  await openAndStartR(page);
  const steps = SCENARIO;
  const ranges = await playScenario(page, { log: '__rCalls', steps, timeout: 30000 });
  const calls = await page.evaluate(() => window.__rCalls);
  await browser.close();
  const requests = ranges.flatMap(({ id, from, to }) =>
    calls.slice(from, to).map((call) => ({ step: id, ...call }))
  );
  // Each step asks for the function it is listed with, and for nothing else.
  for (const step of steps) {
    const asked = requests.filter((request) => request.step === step.id);
    if (!asked.length || asked.some((request) => request.name !== step.asks)) {
      throw new Error(
        `The step "${step.id}" was expected to ask R for ${step.asks}, and asked for: ` +
          `${asked.map((request) => request.name).join(', ') || 'nothing'}.`
      );
    }
  }
  const directory = path.join(rootDir, APP_STATISTICS.directory);
  mkdirSync(directory, { recursive: true });
  const document = {
    measure: APP_STATISTICS.measure,
    visit: APP_STATISTICS.visit,
    steps: steps.map(({ id, chart, asks, what }) => ({ id, chart, asks, what })),
    derived_from: derivedFrom((file) => readFileSync(path.join(rootDir, file))),
    requests
  };
  writeFileSync(path.join(directory, 'requests.json'), `${JSON.stringify(document, null, 1)}\n`);
  console.log(
    `✓ Wrote ${APP_STATISTICS.directory}/requests.json — ${requests.length} requests over ${steps.length} steps`
  );
} finally {
  server.kill();
}
