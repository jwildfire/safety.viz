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
  noRFactory
} from '../../../scripts/app-libraries.mjs';
import { APP_STATISTICS, derivedFrom } from '../../../scripts/app-statistics-lib.mjs';
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
  it('APP-R-010: gsm.bio’s statistics file is copied from gsm.bio’s dev branch, and matches its record of the commit, checksum and size (#183)', () => {
    const directory = path.join(root, GSM_BIO_STATISTICS.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record).toMatchObject({
      statistics: 'gsm.bio statistics functions',
      repository: 'https://github.com/jwildfire/gsm.bio',
      ref: 'dev',
      merged_to_dev: true
    });
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

  it('APP-R-011: the recorded requests and desktop R’s answers are derived from the study, the app code that shapes the rows, the bundle and the statistics file as they are now (#183)', () => {
    const now = derivedFrom(read);
    expect(requests.derived_from, 'rerun scripts/derive-app-statistics.mjs').toEqual(now);
    expect(expected.derived_from, 'rerun scripts/app-statistics.R').toEqual(now);
    expect(requests).toMatchObject({
      chart: APP_STATISTICS.chart,
      measure: APP_STATISTICS.measure
    });
    expect(expected.statistics).toBe('site/vendor/gsm.bio/statistics.R');
    // One answer per request, for the same function, arguments and rows.
    expect(expected.answers).toHaveLength(requests.requests.length);
    requests.requests.forEach((request, index) => {
      const answer = expected.answers[index];
      expect(answer.name).toBe(request.name);
      expect(answer.args).toEqual(request.args);
      expect(answer.rows).toBe(request.data.length);
    });
    // Desktop R tested at least one visit.
    expect(expected.answers.some((answer) => answer.value.status === 'ok')).toBe(true);
  });
});

describe('the pages', () => {
  it('APP-R-012: the hosted page hands bio.viz’s charts R on request with the statistics file beside it, and says what the app now promises (#183)', () => {
    const html = renderDemoAppPage({
      bundle: 'safety.viz-app.js',
      download: 'safety.viz-app.html',
      repoUrl: 'https://github.com/jwildfire/safety.viz',
      libraries: APP_LIBRARIES,
      charts: 'thirteen clinical safety charts and four biomarker charts'
    });
    expect(html).toContain(`libraries: ${librariesExpression(APP_LIBRARIES, { r: 'request' })}`);
    expect(html).toContain(
      'SafetyVizApp.rOnRequest({ createConnection: window.BioViz?.r?.createConnection, ' +
        'browser: { sourceUrl: "./statistics.R", packages: [] }, megabytes: 13, host: "webr.r-wasm.org" })'
    );
    expect(html).toContain(`pitch: '${HOSTED_PITCH.replace(/'/g, "\\'")}'`);
    // The page fetches its own fonts, bundles and demo files from its own host:
    // what it promises is that nothing else is asked for until R is (#193).
    expect(html).toMatch(
      /<meta name="description" content="[^"]*the page fetches nothing from any other host unless you start R[^"]*">/
    );
    expect(html).not.toContain('nothing is fetched');
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
