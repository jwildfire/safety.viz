import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
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
    await expect(page).toHaveTitle(/ · safety\.viz demo$/);
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

  test('APP-PAGE-031: with no docs site beside it, a chart’s footnote leads to the chart’s pages on the published site (#246)', async ({
    page
  }) => {
    await page.goto(`${base}#hep-explorer`);
    await page.evaluate('window.__safetyVizApp.ready');
    const footnote = page.locator('.sva-chart-links');
    await expect(footnote).toHaveText('Hepatic Safety Explorer: Clinical guide · Test evidence');
    await expect(footnote.locator('a[data-link="guide"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/hep-explorer/guide.html'
    );
    await expect(footnote.locator('a[data-link="evidence"]')).toHaveAttribute(
      'href',
      'https://jwildfire.github.io/safety.viz/hep-explorer/evidence.html'
    );
  });

  test('APP-LOCAL-004: the running server gives nothing from outside the demo (#214)', async () => {
    // Sent as written, on a bare request: a browser, like Playwright's own
    // client, tidies `..` out of an address before it is sent.
    const asWritten = (path, headers = {}) =>
      new Promise((resolve, reject) => {
        const { hostname, port } = new URL(base);
        const request = http.request({ host: hostname, port, path, headers }, (response) => {
          let body = '';
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () => resolve({ status: response.statusCode, body }));
        });
        request.on('error', reject);
        request.end();
      });
    // package.json is one directory above build/, two above the demo.
    for (const path of [
      '/../../package.json',
      '/%2e%2e/%2e%2e/package.json',
      '/..%2f..%2fpackage.json',
      '/..%5c..%5cpackage.json'
    ]) {
      const response = await asWritten(path);
      expect(response.status, path).toBe(403);
      expect(response.body, path).not.toContain('"name": "safety.viz"');
    }
    // And nothing to a page that reaches this machine under another name.
    const foreign = await asWritten('/adsl.csv', { Host: 'elsewhere.example' });
    expect(foreign.status).toBe(403);
    expect((await asWritten('/adsl.csv')).status).toBe(200);
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
    await page.locator('.sva-charts > .sva-r .sva-action').click();
    await expect(page.locator('.sva-chart .bv-statistic').first()).toContainText(
      "Pearson's product-moment correlation",
      { timeout: 150000 }
    );
    expect(requests).toContain(`${base}${bioViz.r.statistics.file}`);
    expect(errors).toEqual([]);
  });
});
