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
  libraryScript
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
      'SafetyVizApp.rOnRequest({ createConnection: window.BioViz.r.createConnection, ' +
        'browser: { sourceUrl: "./statistics.R", packages: [] }, megabytes: 13, host: "webr.r-wasm.org" })'
    );
    expect(html).toContain(`pitch: '${HOSTED_PITCH.replace(/'/g, "\\'")}'`);
    expect(html).toMatch(
      /<meta name="description" content="[^"]*nothing is fetched unless you start R[^"]*">/
    );
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
