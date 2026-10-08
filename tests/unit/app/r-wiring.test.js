import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GSM_BIO_STATISTICS,
  readRecord,
  sha256,
  verifyVendored
} from '../../../scripts/vendor-lib.mjs';
import {
  APP_LIBRARIES,
  FILE_NO_R,
  FILE_PITCH,
  HOSTED_PITCH,
  librariesExpression,
  libraryScript,
  noRFactory,
  rbqmTabExpression
} from '../../../scripts/app-libraries.mjs';
import { APP_STATISTICS, SCENARIO, derivedFrom } from '../../../scripts/app-statistics-lib.mjs';
import { renderAppHtml } from '../../../scripts/build-app.mjs';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';

// R on request, as the pages wire it (#183, obot.roadmap#366): the vendored
// statistics file R in the browser is given, the desktop-R results the browser
// test compares with, and what the hosted page and the single file each hand
// the app.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file));
const [bioViz] = APP_LIBRARIES;

describe('the vendored statistics file', () => {
  it('APP-R-010: gsm.bio’s statistics file is copied from gsm.bio’s dev branch or from a release tag of the version it records, and matches its record of the commit, checksum and size (#183, #212)', () => {
    const directory = path.join(root, GSM_BIO_STATISTICS.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record).toMatchObject({
      statistics: 'gsm.bio statistics functions',
      repository: 'https://github.com/jwildfire/gsm.bio'
    });
    // From the head of dev, or from a release: the record says which.
    expect(record).toMatchObject(
      record.tag === undefined
        ? { ref: 'dev', merged_to_dev: true }
        : { ref: `v${record.version}`, tag: `v${record.version}`, merged_to_dev: false }
    );
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.files).toEqual([
      expect.objectContaining({
        file: 'statistics.R',
        source: 'inst/statistics/statistics.R',
        sha256: sha256(read('site/vendor/gsm.bio/statistics.R'))
      })
    ]);
    // It is the file the hosted page hands R.
    expect(bioViz.r.statistics.path).toBe(path.join(GSM_BIO_STATISTICS.directory, 'statistics.R'));
  });
});

describe('the desktop-R results the browser test compares with', () => {
  const requests = JSON.parse(read(`${APP_STATISTICS.directory}/requests.json`));
  const expected = JSON.parse(read(`${APP_STATISTICS.directory}/expected.json`));

  it('APP-R-011: the recorded requests and desktop R’s answers are derived from the study, the app code that shapes the rows, the bundle and the statistics file as they are now, over every step of the walk (#183, #212)', () => {
    const now = derivedFrom(read);
    expect(requests.derived_from, 'rerun scripts/derive-app-statistics.mjs').toEqual(now);
    expect(expected.derived_from, 'rerun scripts/app-statistics.R').toEqual(now);
    expect(requests).toMatchObject({
      measure: APP_STATISTICS.measure,
      visit: APP_STATISTICS.visit
    });
    expect(expected.statistics).toBe('site/vendor/gsm.bio/statistics.R');
    // The steps recorded are the walk's, each asking R for the function it is
    // listed with: the row of visits, one visit, and the two-way table.
    const steps = SCENARIO.map(({ id, chart, asks, what }) => ({ id, chart, asks, what }));
    expect(requests.steps, 'rerun scripts/derive-app-statistics.mjs').toEqual(steps);
    expect(expected.steps, 'rerun scripts/app-statistics.R').toEqual(steps);
    expect(steps.map((step) => step.asks)).toEqual(
      expect.arrayContaining([
        'Analyze_GroupDifferenceBy',
        'Analyze_GroupDifference',
        'Analyze_Contingency'
      ])
    );
    for (const step of steps) {
      const asked = requests.requests.filter((request) => request.step === step.id);
      expect(asked.length, step.id).toBeGreaterThan(0);
      for (const request of asked) expect(request.name, step.id).toBe(step.asks);
    }
    // One answer per request, for the same step, function, arguments and rows.
    expect(expected.answers).toHaveLength(requests.requests.length);
    requests.requests.forEach((request, index) => {
      const answer = expected.answers[index];
      expect(answer.step).toBe(request.step);
      expect(answer.name).toBe(request.name);
      expect(answer.args).toEqual(request.args);
      expect(answer.rows).toBe(request.data.length);
      // Desktop R answered each of them with a test.
      expect(answer.value.status, `${request.step}: ${answer.value.reason}`).toBe('ok');
    });
  });

  it('APP-R-027: every function the walk asks R for is defined in the vendored statistics file, the one the picture over time needs among them, which the 0.1.0 file did not have (#212)', () => {
    const statistics = read('site/vendor/gsm.bio/statistics.R').toString('utf8');
    const defined = (name) => new RegExp(`^${name} <- function\\(`, 'm').test(statistics);
    expect(SCENARIO.map((step) => [step.id, step.chart, step.asks])).toEqual([
      ['over-time', 'group-comparison', 'Analyze_GroupDifferenceBy'],
      ['one-visit', 'group-comparison', 'Analyze_GroupDifference'],
      ['cross-tab', 'cross-tab', 'Analyze_Contingency']
    ]);
    for (const step of SCENARIO) expect(defined(step.asks), step.asks).toBe(true);
    // The check can fail: a function the file does not define is not found.
    expect(defined('Analyze_NoSuchFunction')).toBe(false);
  });
});

describe('the pages', () => {
  it('APP-R-012: the hosted page hands bio.viz’s charts R on request with the statistics file beside it, and says what the app now promises (#183)', () => {
    const html = renderDemoAppPage({
      bundle: 'safety.viz-app.js',
      download: 'safety.viz-app.html',
      repoUrl: 'https://github.com/jwildfire/safety.viz',
      libraries: APP_LIBRARIES,
      charts: 'thirteen clinical safety charts and five biomarker charts'
    });
    // After bio.viz's entry comes the RBQM tab's, a library that brings a view (#235).
    expect(html).toContain(
      `libraries: ${librariesExpression(APP_LIBRARIES, { r: 'request', more: [rbqmTabExpression()] })}`
    );
    expect(html).toContain(
      'SafetyVizApp.rOnRequest({ createConnection: window.BioViz?.r?.createConnection, ' +
        'browser: { sourceUrl: "./statistics.R", packages: [] }, megabytes: 13, host: "webr.r-wasm.org" })'
    );
    expect(html).toContain(`pitch: '${HOSTED_PITCH.replace(/'/g, "\\'")}'`);
    // It says what starting R downloads, and from where (#196).
    expect(html).toMatch(
      /<meta name="description" content="[^"]*starting R downloads R from webr\.r-wasm\.org[^"]*">/
    );
    expect(html).not.toContain('nothing is fetched');
  });

  it('APP-LOAD-027: the hosted footer, the single file’s footer and the hosted page’s description say what happens to the data a reader loads, in plain words (#196)', () => {
    // Every address R is downloaded from is named: the RBQM tab's packages
    // come from a second one (#235).
    expect(HOSTED_PITCH).toBe(
      'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org and, for the RBQM tab, its packages from repo.r-wasm.org; your data stays in the browser, and R runs here.'
    );
    expect(FILE_PITCH).toBe(
      'This file loads nothing; files you add are read here and never leave this computer.'
    );
    const html = renderDemoAppPage({
      bundle: 'safety.viz-app.js',
      download: 'safety.viz-app.html',
      repoUrl: 'https://github.com/jwildfire/safety.viz',
      libraries: APP_LIBRARIES,
      charts: 'thirteen clinical safety charts and five biomarker charts'
    });
    const [, description] = html.match(/<meta name="description" content="([^"]*)">/);
    expect(description).toContain(
      'Files you load are read in your browser and never uploaded; starting R downloads R from webr.r-wasm.org and, for the RBQM tab, its packages from repo.r-wasm.org, and your data stays in your browser.'
    );
    expect(description).not.toMatch(/fetches nothing|No request leaves/);
    const file = renderAppHtml({
      script: 'window.SafetyVizApp={mount(){}};',
      libraries: [{ ...bioViz, script: libraryScript(bioViz) }]
    });
    expect(file).toContain(`pitch: ${JSON.stringify(FILE_PITCH)}`);
  });

  it('APP-R-023: the hosted page mounts when a library is missing or has no connection to R: a missing one is handed in by name and file, and one with no connection factory says statistics are unavailable and why (#193)', async () => {
    const SafetyVizApp = await import('../../../src/app/r-on-request.js');
    const evaluate = (window) =>
      new Function(
        'window',
        'SafetyVizApp',
        `return ${librariesExpression(APP_LIBRARIES, { r: 'request' })};`
      )(window, SafetyVizApp);
    // bio.viz did not load.
    expect(() => evaluate({})).not.toThrow();
    const [missing] = evaluate({});
    expect(missing).toMatchObject({ name: 'bio.viz', file: 'bio.viz.js' });
    expect(missing.charts).toBeUndefined();
    expect(missing.manifest).toBeUndefined();
    // bio.viz loaded, but with no connection to R.
    const portfolio = { version: 2, modules: {} };
    expect(() => evaluate({ BioViz: { portfolio } })).not.toThrow();
    const [noR] = evaluate({ BioViz: { portfolio } });
    expect(noR.manifest).toBe(portfolio);
    expect(noR.action).toBeUndefined();
    const answer = await noR.settings().connection.run('anything', { data: [], args: {} });
    expect(answer).toMatchObject({ status: 'unavailable' });
    expect(answer.message).toBe(noRFactory(bioViz));
    expect(answer.message).toBe(
      'Statistics are unavailable: the bio.viz on this page has no connection to R (bio.viz’s r.createConnection is missing).'
    );
    // With the factory there, the control is offered.
    const [withR] = evaluate({ BioViz: { portfolio, r: { createConnection: () => ({}) } } });
    expect(withR.action.state().label).toBe('Start R');
  });

  it('APP-R-013: the single file hands them no R, only the sentence that says why, and says it loads nothing (#183)', () => {
    const html = renderAppHtml({
      script: 'window.SafetyVizApp={mount(){}};',
      libraries: [{ ...bioViz, script: libraryScript(bioViz) }]
    });
    expect(html).toContain('SafetyVizApp.rUnavailable(');
    expect(html).toContain(JSON.stringify(FILE_NO_R));
    expect(html).not.toContain('SafetyVizApp.rOnRequest(');
    expect(html).not.toContain('statistics.R');
    expect(html).toContain(`pitch: ${JSON.stringify(FILE_PITCH)}`);
  });
});
