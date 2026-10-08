import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { CANONICAL } from './evidence.js';
import {
  RBQM_TAB,
  RESULT_KEYS,
  RESULT_NUMBERS,
  pipelineFiles,
  scenarioFiles,
  scenarioFolder,
  tabArgs
} from '../../scripts/rbqm-lib.mjs';
import { RBQM_STUDY } from '../../scripts/vendor-lib.mjs';

// The RBQM tab's run in real R in the browser (#234, obot.roadmap#374): every
// mapping, metric and reporting workflow in scope, through workr, on the demo
// study's nine raw files, held to desktop R's rows; and the same run on two
// studies with something missing, held to what desktop R says of each metric.
// The harness page (fixtures/rbqm-pipeline.html) loads the app's connection to
// R and nothing else. Run it alone with `npx playwright test rbqm-pipeline`.

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url));
const expected = JSON.parse(read(RBQM_TAB.expected).toString('utf8'));
const R_HOSTS = ['https://webr.r-wasm.org', RBQM_TAB.publicIndex];
// Where the measurements of the canonical environment are kept, written once.
const MEASURED = new URL(
  '../../docs/evidence/basic-app/APP-RBQM-012-rbqm-tab-measurements.json',
  import.meta.url
);
// A table as a sorted list of its rows, each number to eight decimal places:
// two tables are the same rows whatever order R gave them in.
const canonical = (rows) =>
  rows
    .map((row) =>
      JSON.stringify(
        Object.keys(row)
          .sort()
          .map((key) => [key, typeof row[key] === 'number' ? row[key].toFixed(8) : row[key]])
      )
    )
    .sort();
const keyed = (rows) => new Map(rows.map((row) => [`${row.MetricID} ${row.GroupID}`, row]));

// Every Results row R in the browser gave is desktop R's row for the same
// metric and site: the keys exactly, the numbers to eight decimal places.
function expectRows(browser, desktop, label) {
  expect([...browser.keys()].sort(), label).toEqual([...desktop.keys()].sort());
  for (const [key, row] of desktop) {
    const got = browser.get(key);
    for (const column of RESULT_KEYS) {
      expect(got[column], `${label} ${key} ${column}`).toBe(row[column]);
    }
    for (const column of RESULT_NUMBERS) {
      if (row[column] === null) expect(got[column], `${label} ${key} ${column}`).toBeNull();
      else expect(got[column], `${label} ${key} ${column}`).toBeCloseTo(row[column], 8);
    }
  }
}

test.describe('the RBQM tab’s run in R in the browser', () => {
  test('APP-RBQM-012: rbqm tab pipeline: R in the browser runs every mapping, metric and reporting workflow in scope through workr on the demo study’s nine raw files, and every one of the eight metrics’ Results rows is desktop R’s: the same sites, and for each the same numerator, denominator, metric, score and flag to eight decimal places; with the labs file left out seven metrics run and the lab metric says it needs the labs file; with a column taken out of the adverse events file the two adverse event metrics name the column; with two files alone the two metrics they support run; R asks no host but webR’s, the public index and the page’s own (#234)', async ({
    page,
    context
  }, testInfo) => {
    // It downloads R and some forty packages, then runs the pipeline three times.
    test.setTimeout(480_000);
    const requests = [];
    const finished = [];
    context.on('request', (request) => requests.push(request.url()));
    context.on('requestfinished', (request) => finished.push(request));
    await page.goto('/tests/e2e/fixtures/rbqm-pipeline.html');
    await page.waitForLoadState('networkidle');
    const own = new URL(page.url()).origin;
    const before = [...requests];
    expect(before.filter((url) => new URL(url).origin !== own)).toEqual([]);

    // Each study's files: fetched by the page from where the repository keeps
    // them, but for the one file a scenario changes, which is passed as text.
    const studies = RBQM_TAB.scenarios.map((scenario) => {
      const texts = scenarioFiles(scenario, read);
      const folder = scenarioFolder(scenario);
      return {
        id: scenario.id,
        folder,
        args: tabArgs(folder),
        files: Object.keys(texts).map((name) =>
          scenario.dropColumn && scenario.dropColumn.file === name
            ? { name, text: texts[name] }
            : { name, url: `/${RBQM_STUDY.directory}/${name}` }
        )
      };
    });
    expect(studies.map((study) => study.files.length)).toEqual([9, 8, 9, 2]);

    const outcome = await page.evaluate((run) => window.__rbqm.runTab(run), {
      packages: RBQM_TAB.packages,
      repos: [`/${RBQM_TAB.repository}`, RBQM_TAB.publicIndex],
      files: pipelineFiles(),
      attach: RBQM_TAB.attach,
      call: RBQM_TAB.call,
      studies
    });
    expect(outcome.started.message || outcome.started.status).toBe('ok');
    expect(outcome.attached.message || outcome.attached.status).toBe('ok');
    expect(outcome.attached.value).toEqual(RBQM_TAB.packages);
    for (const study of studies) {
      const answer = outcome.answers[study.id];
      expect(answer.message || answer.status, study.id).toBe('ok');
    }

    // ---- The whole study: all eight metrics, every row desktop R's ----
    const whole = outcome.answers.whole.value;
    const desktop = expected.whole;
    expect(desktop.Results.length).toBeGreaterThan(1000);
    expect(whole.Results).toHaveLength(desktop.Results.length);
    expect([...new Set(whole.Results.map((row) => row.MetricID))].sort()).toEqual(
      RBQM_TAB.metrics.map((id) => `Analysis_${id}`)
    );
    expectRows(keyed(whole.Results), keyed(desktop.Results), 'whole');
    // So are the three tables the charts draw beside them.
    for (const table of ['Bounds', 'Groups', 'Metrics']) {
      expect(canonical(whole[table]), table).toEqual(canonical(desktop[table]));
    }
    // Every metric ran, and says so; the Groups table was made; R warned of nothing.
    expect(whole.status).toEqual(desktop.status);
    expect(whole.status.map((line) => [line.id, line.state])).toEqual(
      RBQM_TAB.metrics.map((id) => [id, 'ran'])
    );
    expect(whole.groups).toEqual(desktop.groups);
    // Each metric's thresholds, as numbers, are R's own parsing of the workflow's text.
    expect(whole.thresholds).toEqual(desktop.thresholds);
    expect(whole.thresholds.Analysis_kri0001).toEqual([-2, -1, 2, 3]);
    expect(whole.notes).toEqual([]);
    expect(whole.ran).toEqual(desktop.ran);
    expect(whole.warnings).toEqual([]);
    // The gsm packages are the pinned ones in both; what they stand on is whatever each R has.
    for (const name of RBQM_TAB.packages) {
      expect(whole.versions[name]).toBe(desktop.versions[name]);
    }

    // ---- Something missing: what ran is desktop R's, and so is each sentence ----
    const wholeRows = keyed(desktop.Results);
    for (const id of ['no-labs', 'no-column', 'two-files']) {
      const answer = outcome.answers[id].value;
      const wanted = expected.partial[id];
      expect(answer.status, id).toEqual(wanted.status);
      expect(answer.groups, id).toEqual(wanted.groups);
      expect(answer.notes, id).toEqual(wanted.notes);
      expect(answer.thresholds, id).toEqual(wanted.thresholds);
      expect(answer.ran, id).toEqual(wanted.ran);
      expect(answer.warnings, id).toEqual([]);
      for (const table of ['Results', 'Bounds', 'Groups', 'Metrics']) {
        expect(answer[table], `${id} ${table}`).toHaveLength(wanted.rows[table]);
      }
      // A metric that still runs gives the rows it gives on the whole study.
      const ran = new Set(wanted.ran.metrics.map((metric) => `Analysis_${metric}`));
      expectRows(
        keyed(answer.Results),
        new Map([...wholeRows].filter(([, row]) => ran.has(row.MetricID))),
        id
      );
    }
    const said = (id) =>
      Object.fromEntries(
        outcome.answers[id].value.status
          .filter((line) => line.state !== 'ran')
          .map((line) => [line.id, [line.state, line.message]])
      );
    expect(said('no-labs')).toEqual({
      kri0005: ['no file', 'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.']
    });
    expect(said('no-column')).toEqual({
      kri0001: [
        'no column',
        'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
      ],
      kri0002: [
        'no column',
        'Serious Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
      ]
    });

    // Two files alone, as a reader might load them: the two adverse event
    // metrics run, each other metric names the file it needs, the Groups table
    // is not made, and the run says where it read the study's ID.
    const two = outcome.answers['two-files'].value;
    expect(two.ran.metrics).toEqual(['kri0001', 'kri0002']);
    expect(two.status.filter((line) => line.state !== 'ran').map((line) => line.message)).toEqual([
      'Non-Important Protocol Deviation Rate needs Raw_PD.csv, which is not loaded.',
      'Important Protocol Deviation Rate needs Raw_PD.csv, which is not loaded.',
      'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.',
      'Study Discontinuation Rate needs Raw_STUDCOMP.csv, which is not loaded.',
      'Treatment Discontinuation Rate needs Raw_SDRGCOMP.csv, which is not loaded.',
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    ]);
    expect(two.Groups).toEqual([]);
    expect(two.groups).toEqual({
      state: 'no file',
      files: ['Raw_STUDY.csv', 'Raw_SITE.csv'],
      columns: [],
      message: 'The Groups table needs Raw_STUDY.csv and Raw_SITE.csv, which are not loaded.'
    });
    expect(two.notes).toEqual([
      'No study table was made, so the study’s ID, AA-AA-000-0000, is read from the study ID column of the loaded files.'.replace(
        '’',
        "'"
      )
    ]);
    expect([...new Set(two.Results.map((row) => row.StudyID))]).toEqual(['AA-AA-000-0000']);

    // Everything R asked for came from webR's host, the public index or the
    // page's own address.
    await page.waitForLoadState('networkidle');
    const origins = [...new Set(requests.map((url) => new URL(url).origin))].sort();
    expect(origins).toEqual([own, ...R_HOSTS].sort());

    // What it cost, measured here: bytes over the wire by where they came
    // from, and seconds for each step.
    const megabytes = { runtime: 0, publicIndex: 0, gsmPackages: 0, page: 0 };
    for (const request of finished) {
      const url = new URL(request.url());
      const sizes = await request.sizes().catch(() => null);
      const bytes = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
      if (url.origin === R_HOSTS[0]) megabytes.runtime += bytes;
      else if (url.origin === R_HOSTS[1]) megabytes.publicIndex += bytes;
      else if (url.pathname.includes(`/${RBQM_TAB.repository}/`)) megabytes.gsmPackages += bytes;
      else megabytes.page += bytes;
    }
    for (const key of Object.keys(megabytes)) {
      megabytes[key] = Math.round(megabytes[key] / 10485.76) / 100;
    }
    const measured = {
      megabytes: {
        ...megabytes,
        total:
          Math.round(Object.values(megabytes).reduce((sum, value) => sum + value, 0) * 100) / 100
      },
      seconds: {
        startR: outcome.start,
        attachPackages: outcome.attaching,
        eightMetrics: outcome.took.whole,
        eightMetricsInR: whole.seconds,
        sevenMetrics: outcome.took['no-labs'],
        sixMetrics: outcome.took['no-column'],
        twoMetrics: outcome.took['two-files'],
        startToFirstResult:
          Math.round((outcome.start + outcome.attaching + outcome.took.whole) * 100) / 100
      },
      rows: {
        Results: whole.Results.length,
        Bounds: whole.Bounds.length,
        Groups: whole.Groups.length,
        Metrics: whole.Metrics.length
      },
      versions: whole.versions,
      platform: process.platform
    };
    await testInfo.attach('rbqm-tab-measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json'
    });
    console.log(`rbqm tab measurements: ${JSON.stringify(measured)}`);
    // The gate's limits hold for the whole tab: under 80 MB to start R, and
    // under two minutes from starting R's packages to the eight metrics' rows.
    expect(measured.megabytes.total).toBeLessThan(80);
    expect(measured.megabytes.total).toBeGreaterThan(10);
    expect(outcome.attaching + outcome.took.whole).toBeLessThan(120);
    // Kept with the evidence, from the canonical environment, the first time
    // it runs there; remove the file to have it measured again.
    if (CANONICAL && !existsSync(MEASURED)) {
      mkdirSync(new URL('.', MEASURED), { recursive: true });
      writeFileSync(MEASURED, `${JSON.stringify(measured, null, 2)}\n`);
    }
  });
});
