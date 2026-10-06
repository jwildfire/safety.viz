import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { APP_LIBRARIES } from '../../scripts/app-libraries.mjs';
import { DEMO_STUDIES } from '../../src/app/studies.js';

// The demo app on a reader's own machine (#214): `npm run demo` builds the
// directory the site serves at demo/ and serves it with its own small server.
// This spec starts that command as a reader would, reads the address it
// prints, and opens it. Evidence for the APP-LOCAL rows of
// requirements/demo-app.md.

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
// Beside the fixture server's port (playwright.config.js), so parallel
// worktrees do not meet; the command steps past a busy port by itself.
const firstPort = Number(process.env.PW_PORT || 8099) + 1;

test.describe('the demo app served by `npm run demo`', () => {
  let demo;
  let output = '';
  let base;

  test.beforeAll(async () => {
    demo = spawn(process.execPath, ['scripts/demo.mjs', '--no-open', '--port', String(firstPort)], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    base = await new Promise((resolve, reject) => {
      const read = (chunk) => {
        output += chunk;
        const address = output.match(/running at (http:\/\/127\.0\.0\.1:\d+\/)/);
        if (address) resolve(address[1]);
      };
      demo.stdout.on('data', read);
      demo.stderr.on('data', read);
      demo.on('exit', (code) => reject(new Error(`npm run demo ended (${code}):\n${output}`)));
    });
  });

  test.afterAll(async () => {
    if (!demo || demo.exitCode !== null) return;
    const ended = new Promise((resolve) => demo.on('exit', resolve));
    demo.kill('SIGINT');
    // Stopped as a reader stops it, it ends cleanly.
    expect(await ended).toBe(0);
  });

  test('APP-LOCAL-006: the page opens on the pilot study with every chart supported, draws one, and reports no error (#214)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const failed = [];
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(base);
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page).toHaveTitle('safety.viz demo');
    // Every chart the app carries is supported by the study it opens on.
    await expect(page.locator('.sva-count')).toHaveText(
      /^(\d+) of \1 charts supported by the loaded data$/
    );
    await expect(page.locator('.sva-chart canvas:visible').first()).toBeVisible();
    // The app's typefaces came from the local server too.
    expect(await page.evaluate(() => document.fonts.check('16px "Instrument Sans"'))).toBe(true);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('APP-LOCAL-006: every demo study in the menu loads from the local server (#214)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}#data`);
    await page.evaluate('window.__safetyVizApp.ready');
    const menu = page.locator('.sva-side select.sva-study');
    await expect(menu).toHaveValue(DEMO_STUDIES[0].id);
    for (const study of [...DEMO_STUDIES.slice(1), DEMO_STUDIES[0]]) {
      await menu.selectOption(study.id);
      await expect(page.locator('.sva-loaded-name')).toHaveText(study.files);
    }
    expect(errors).toEqual([]);
  });

  test('APP-LOCAL-002: with no docs site beside it, the page’s links lead to the published site, and the single file is served beside it (#214)', async ({
    page
  }) => {
    await page.goto(base);
    await page.evaluate('window.__safetyVizApp.ready');
    await expect(page.locator('.sva-links a[data-link="docs"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/'
    );
    await expect(page.locator('.sva-links a[data-link="domains"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/domains/'
    );
    const download = page.locator('.sva-links a[data-link="download"]');
    await expect(download).toHaveAttribute('href', './safety.viz-app.html');
    const single = await page.request.get(`${base}safety.viz-app.html`);
    expect(single.ok()).toBe(true);
    expect(single.headers()['content-type']).toBe('text/html; charset=utf-8');
  });

  test('APP-LOCAL-004: the running server gives nothing from outside the demo (#214)', async ({
    request
  }) => {
    // package.json is one directory above build/, two above the demo.
    for (const path of ['%2e%2e/%2e%2e/package.json', '..%2f..%2fpackage.json']) {
      const response = await request.get(`${base}${path}`);
      expect(response.ok(), path).toBe(false);
      expect(await response.text(), path).not.toContain('"name": "safety.viz"');
    }
  });

  test('APP-LOCAL-006: R starts on request from the local page, with the statistics file the local server gives it (#214)', async ({
    page
  }) => {
    test.setTimeout(180_000);
    const [bioViz] = APP_LIBRARIES;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    const statistics = await page.request.get(`${base}${bioViz.r.statistics.file}`);
    expect(
      (await statistics.body()).equals(
        readFileSync(new URL(`../../${bioViz.r.statistics.path}`, import.meta.url))
      )
    ).toBe(true);
    await page.goto(base);
    await page.evaluate('window.__safetyVizApp.ready');
    await page.evaluate(() => window.__safetyVizApp.select('association-scatter'));
    await page.locator('.sva-group[data-group="biomarkers"] .sva-action').click();
    await expect(page.locator('.sva-chart .bv-statistic').first()).toContainText(
      "Pearson's product-moment correlation",
      { timeout: 150000 }
    );
    expect(requests).toContain(`${base}${bioViz.r.statistics.file}`);
    expect(errors).toEqual([]);
  });
});
