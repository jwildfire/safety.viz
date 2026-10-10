// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { rbqmTab } from '../../../src/app/rbqm-view.js';
import { RBQM_DOWNLOADS, rbqmTabOptions } from '../../../scripts/app-libraries.mjs';
import {
  GSM_KRI_WORKFLOWS,
  GSM_VIZ,
  RBQM_STUDY,
  readRecord
} from '../../../scripts/vendor-lib.mjs';
import { RBQM_NEEDS, RBQM_PILOT, RBQM_TAB, standardFiles } from '../../../scripts/rbqm-lib.mjs';

// The RBQM tab on the page (#235, obot.roadmap#374): a tab a library brings
// through the second-library seam, which starts R only when the reader asks,
// says what R is doing, and hands what R returns to gsm.viz. R and gsm.viz are
// stand-ins here: the connection answers with desktop R's answer for the demo
// study, and the charts record what they were handed. Real R and the real
// charts are held by the browser tests.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const expected = JSON.parse(readFileSync(path.join(root, RBQM_TAB.expected), 'utf8'));
const { whole, partial } = expected;
const STUDY = RBQM_STUDY.files.map(({ file }) => ({
  name: file,
  // The first lines are enough for the page, which reads names and counts rows.
  text: readFileSync(path.join(root, RBQM_STUDY.directory, file), 'utf8')
    .split('\n')
    .slice(0, 4)
    .join('\n')
}));
const OPTIONS = rbqmTabOptions();
const noLabs = {
  ...whole,
  Results: whole.Results.filter((row) => row.MetricID !== 'Analysis_kri0005'),
  Bounds: whole.Bounds.filter((row) => row.MetricID !== 'Analysis_kri0005'),
  Metrics: whole.Metrics.filter((row) => row.MetricID !== 'Analysis_kri0005'),
  status: partial['no-labs'].status,
  thresholds: partial['no-labs'].thresholds
};

// A stand-in for gsm.viz: each chart records what it was handed.
function fakeViz() {
  const calls = [];
  const chart = (name) =>
    vi.fn((element, ...rest) => {
      const call = { name, element, rest, destroyed: false };
      calls.push(call);
      element.append(document.createElement(name === 'groupOverview' ? 'table' : 'canvas'));
      return { destroy: () => (call.destroyed = true) };
    });
  globalThis.gsmViz = {
    default: {
      groupOverview: chart('groupOverview'),
      scatterPlot: chart('scatterPlot'),
      barChart: chart('barChart')
    }
  };
  return calls;
}

// A stand-in for the connection to R: every step waits until the test lets it
// go, and answers what the test says.
function fakeR(answers = {}) {
  const made = [];
  const createConnection = vi.fn((options) => {
    const connection = { options, runs: [], waiting: [] };
    connection.run = vi.fn((name, request) => {
      connection.runs.push({ name, request });
      return new Promise((resolve) => {
        connection.waiting.push(() =>
          resolve(
            (answers[name] && answers[name](request, connection)) || { status: 'ok', value: null }
          )
        );
      });
    });
    connection.letGo = async () => {
      connection.waiting.shift()();
      // The tab's own awaits, and the page's redraw, run before the test goes on.
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    };
    made.push(connection);
    return connection;
  });
  return { createConnection, made };
}

function mount({
  answers,
  tab = {},
  clock = { now: new Date(2026, 9, 7, 9, 0, 0).getTime() }
} = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#');
  const r = fakeR(answers);
  const view = rbqmTab({
    createConnection: r.createConnection,
    ...OPTIONS,
    now: () => new Date(clock.now),
    ...tab
  });
  const app = mountApp('#app', {
    charts: { portfolio: manifest },
    manifest,
    libraries: [{ name: 'gsm.viz', view }]
  });
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  return { app, view, r, clock, $, $$ };
}

const RUN_OK = { rbqm_run: () => ({ status: 'ok', value: whole, form: 'browser' }) };

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.gsmViz;
});

describe('the page: a library that brings a view', () => {
  it('APP-RBQM-017: a library may bring a view in place of charts: a tab of its own after the domains’ tabs, with its name and what it says of itself; opening it draws the view in the main area, hides the chart row and writes its address (#235)', () => {
    const { app, $, $$ } = mount();
    const tabs = $$('.sva-tab');
    const tab = tabs.at(-1);
    expect(tab.dataset.tab).toBe('rbqm');
    expect(tabs.slice(0, -1).every((node) => node.dataset.domain)).toBe(true);
    expect(tab.querySelector('.sva-tab-title').textContent).toBe('RBQM');
    expect(tab.querySelector('.sva-tab-count').textContent).toBe('not run');
    expect(tab.getAttribute('aria-pressed')).toBe('false');
    tab.click();
    expect(app.state.selected).toBe('rbqm');
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-tab[data-tab="rbqm"]').getAttribute('aria-pressed')).toBe('true');
    expect($('.sva-title').textContent).toBe('RBQM');
    expect($('.sva-charts').hidden).toBe(true);
    expect($('.sva-view .sva-rbqm')).not.toBeNull();
    // Another tab takes the main area back, and the address.
    $('.sva-item[data-view="data"]').click();
    expect($('.sva-view')).toBeNull();
    expect(window.location.hash).toBe('#data');
    // The address opens it, as it opens a chart.
    window.location.hash = '#rbqm';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(app.state.selected).toBe('rbqm');
  });

  it('APP-RBQM-017: a view with no id, or the id of the data view, a chart or another view, is left out with a warning, and the page still mounts (#235)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<div id="app"></div>';
    const view = (id) => ({ id, title: String(id), tag: () => '', render: () => null });
    mountApp('#app', {
      charts: { portfolio: manifest },
      manifest,
      libraries: [
        { name: 'one', view: view('data') },
        { name: 'two', view: view('histogram') },
        { name: 'three', view: view('rbqm') },
        { name: 'four', view: view('rbqm') },
        { name: 'five', view: view('') }
      ]
    });
    expect(
      [...document.querySelectorAll('.sva-tab[data-tab]')].map((node) => node.dataset.tab)
    ).toEqual(['rbqm']);
    expect(warn).toHaveBeenCalledTimes(4);
    // None of them is taken for a chart library with no chart list.
    expect(document.querySelector('.sva-library-notes')).toBeNull();
    warn.mockRestore();
  });

  it('APP-RBQM-017: a view that throws as it draws says so in the main area and the page stays up (#235)', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = mountApp('#app', {
      charts: { portfolio: manifest },
      manifest,
      libraries: [
        {
          name: 'broken',
          view: {
            id: 'broken',
            title: 'Broken',
            tag: () => 'x',
            render() {
              throw new Error('nothing to draw with');
            }
          }
        }
      ]
    });
    app.select('broken');
    expect(document.querySelector('.sva-view .sva-problem').textContent).toBe(
      'Did not draw. nothing to draw with'
    );
    app.select('data');
    expect(app.state.selected).toBe('data');
  });
});

describe('the RBQM tab on the page', () => {
  it('APP-RBQM-026: the tab is Experimental by its entry in site/config.json, which says why; the tab and its view carry no pill of their own, and the page shows the status label on the tab’s corner (#235, #274)', () => {
    const config = JSON.parse(readFileSync(path.join(root, 'site/config.json'), 'utf8'));
    expect(config.appTabs).toEqual([
      expect.objectContaining({
        id: 'rbqm',
        title: 'RBQM',
        tier: 'experimental',
        tierNote:
          'Experimental: new in 1.10. R runs in the browser, and what the tab shows may still change.'
      })
    ]);
    // The build hands the tab no badge, and the view takes none.
    expect(OPTIONS).not.toHaveProperty('badge');
    const { app, $ } = mount();
    expect($('.sva-tab[data-tab="rbqm"] .sva-badge')).toBeNull();
    expect($('.sva-tab[data-tab="rbqm"]').title).toBe('');
    app.select('rbqm');
    expect($('.sva-rbqm-lede .sva-badge')).toBeNull();
    expect($('.sva-rbqm-lede').textContent).not.toContain('Experimental');
  });

  it('APP-RBQM-018: before the press the tab says what starting R downloads and from where, makes no connection and loads no chart library; with no raw file loaded it says so and its control cannot be pressed (#235)', () => {
    const { app, r, $ } = mount();
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(
      'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or drop gsm raw files here.'
    );
    expect($('.sva-rbqm-start').textContent).toBe('Start R');
    expect($('.sva-rbqm-start').disabled).toBe(true);
    app.loadRaw(STUDY);
    expect($('.sva-rbqm-status').textContent).toBe(
      'Start R to run gsm’s workflows on the 9 loaded raw files. It downloads about 55 MB, once: ' +
        'R itself from webr.r-wasm.org (about 13 MB), its packages from repo.r-wasm.org (about 40 MB) ' +
        'and gsm’s packages from this page (about 2 MB). The files stay in this browser, and R runs here.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(false);
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
    expect($('.sva-rbqm-results')).toBeNull();
  });

  it('APP-RBQM-019: the press makes one connection, with the packages, the two repositories, gsm’s workflow files and the pipeline’s R, and asks for gsm.viz from the page’s own address; until R answers the tab says the step R is at and the seconds since the press, and its control cannot be pressed again (#235)', async () => {
    vi.useFakeTimers();
    const calls = fakeViz();
    const { app, view, r, clock, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    const [connection] = r.made;
    expect(connection.options.packages).toEqual([
      'workr',
      'gsm.core',
      'gsm.mapping',
      'gsm.reporting'
    ]);
    expect(connection.options.repos).toEqual(['./r-wasm', 'https://repo.r-wasm.org']);
    expect(connection.options.source).toEqual(['/rbqm/pipeline.R']);
    expect(connection.options.files[0]).toEqual({
      path: '/rbqm/pipeline.R',
      url: './rbqm/pipeline.R'
    });
    // Every file is asked of the page's own address, under the path R keeps it at.
    expect(connection.options.files.length).toBeGreaterThan(20);
    for (const file of connection.options.files) expect(file.url).toBe(`.${file.path}`);
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time']);
    expect($('.sva-rbqm-start').textContent).toBe('Starting R…');
    expect($('.sva-rbqm-start').disabled).toBe(true);
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('starting');
    expect($('.sva-rbqm-status').textContent).toBe(
      'Starting R: downloading R itself, about 13 MB from webr.r-wasm.org. 0 seconds so far.'
    );
    // The seconds are counted while R starts, and each step is said as it begins.
    clock.now += 7000;
    vi.advanceTimersByTime(1000);
    expect($('.sva-rbqm-status').textContent).toContain('7 seconds so far.');
    connection.options.onStage('packages');
    expect($('.sva-rbqm-status').textContent).toBe(
      'Starting R: installing its packages, about 40 MB from repo.r-wasm.org and about 2 MB from this page. This is the longest step. 7 seconds so far.'
    );
    connection.options.onStage('files');
    expect($('.sva-rbqm-status').textContent).toContain('fetching gsm’s workflow files');
    connection.options.onStage('source');
    expect($('.sva-rbqm-status').textContent).toContain('reading the pipeline’s R');
    // R has started: the packages are attached with a call of their own.
    await connection.letGo();
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach']);
    expect($('.sva-rbqm-status').textContent).toContain('R has started. Loading gsm’s packages');
    await connection.letGo();
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach', 'rbqm_run']);
    expect($('.sva-rbqm-status').textContent).toContain(
      'Running gsm’s workflows on the 9 loaded files'
    );
    expect($('.sva-rbqm-start').textContent).toBe('Running…');
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('running');
    // Pressed again while it runs, nothing more is started.
    $('.sva-rbqm-start').click();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    clock.now += 4600;
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 8 of 8 metrics on the 9 loaded files in 4\.6 seconds, 12 seconds after Start R was pressed\. The snapshot is dated 2026-10-07\./
    );
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('8 of 8');
    expect(calls.map((call) => call.name)).toEqual(['groupOverview', 'scatterPlot', 'barChart']);
  });

  it('APP-RBQM-028: R is handed each loaded file as text in a folder of this run’s own, the folders of gsm’s workflows, and the reader’s own day as the snapshot’s date; no metric is named, so R tries every one (#235)', async () => {
    fakeViz();
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    await connection.letGo();
    await connection.letGo();
    const { request } = connection.runs.at(-1);
    expect(Object.keys(request.files)).toEqual(STUDY.map((file) => `/rbqm/runs/1/${file.name}`));
    expect(Object.values(request.files)).toEqual(STUDY.map((file) => file.text));
    expect(request.args).toEqual({
      data: '/rbqm/runs/1',
      mappings: '/rbqm/gsm.mapping/workflow/1_mappings',
      metrics: '/rbqm/gsm.kri/workflow/2_metrics',
      reporting: '/rbqm/gsm.reporting/workflow/3_reporting',
      helpers: '/rbqm/gsm.kri/R/util-Report.R',
      standard: '/rbqm/standard',
      snapshot_date: '2026-10-07'
    });
  });

  it('APP-RBQM-020: what R returns is drawn by gsm.viz: the overview is handed every Results row with the Groups and Metrics tables, and the chosen metric’s scatter plot and bar chart its own rows, R’s bounds and R’s thresholds; choosing another metric draws that one’s, and R’s answer is not changed by any of it (#235)', async () => {
    const calls = fakeViz();
    const before = JSON.stringify(whole);
    const { app, r, $, $$ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    const [overview, scatter, bar] = calls;
    expect(overview.rest[0]).toEqual(whole.Results);
    expect(overview.rest[1]).toMatchObject({
      GroupLevel: 'Site',
      groupLabelKey: 'InvestigatorLastName'
    });
    expect(overview.rest[2]).toEqual(whole.Groups);
    expect(overview.rest[3]).toEqual(whole.Metrics);
    const of = (rows, id) => rows.filter((row) => row.MetricID === id);
    expect(scatter.rest[0]).toEqual(of(whole.Results, 'Analysis_kri0001'));
    expect(scatter.rest[1]).toEqual(whole.Metrics[0]);
    expect(scatter.rest[2]).toEqual(of(whole.Bounds, 'Analysis_kri0001'));
    expect(scatter.rest[2].length).toBeGreaterThan(100);
    expect(scatter.rest[3]).toEqual(whole.Groups);
    expect(bar.rest[0]).toEqual(of(whole.Results, 'Analysis_kri0001'));
    expect(bar.rest[1]).toEqual({ ...whole.Metrics[0], y: 'Score' });
    expect(bar.rest[2]).toEqual([-2, -1, 2, 3]);
    // No two charts share a row: gsm.viz writes to the rows it is given.
    expect(scatter.rest[0][0]).not.toBe(bar.rest[0][0]);
    expect(scatter.rest[0][0]).not.toBe(overview.rest[0][0]);
    // The eight metrics, by abbreviation, each a button; the first is open.
    expect($$('.sva-rbqm-choice').map((node) => node.textContent)).toEqual(
      ['AE', 'SAE', 'PD', 'IPD', 'LB', 'SDSC', 'TDSC', 'SF'].map((name) => `${name}ran`)
    );
    expect($('.sva-rbqm-choice[aria-pressed="true"]').dataset.metric).toBe('kri0001');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Adverse Event Rate');
    expect($('.sva-rbqm-caption').textContent).toBe(
      'Point size is relative to the number of enrolled participants.'
    );
    // Another metric: the charts on the page are torn down, and its own drawn.
    $('.sva-rbqm-choice[data-metric="kri0012"]').click();
    expect(calls.slice(0, 3).every((call) => call.destroyed || call.name === 'groupOverview')).toBe(
      true
    );
    const [, lastScatter, lastBar] = calls.slice(-3);
    expect($('.sva-rbqm-metric-name').textContent).toBe('Screen Failure Rate');
    expect(lastScatter.rest[0]).toEqual(of(whole.Results, 'Analysis_kri0012'));
    expect(lastScatter.rest[0]).toHaveLength(150);
    expect(lastBar.rest[2]).toEqual([-3, -2, 2, 3]);
    // A cell of the overview chooses its metric too.
    calls.at(-3).rest[1].metricClickCallback({ MetricID: 'Analysis_kri0003' });
    expect($('.sva-rbqm-metric-name').textContent).toBe('Non-Important Protocol Deviation Rate');
    // R was asked once: choosing a metric asks R for nothing.
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach', 'rbqm_run']);
    expect(JSON.stringify(whole)).toBe(before);
  });

  it('APP-RBQM-022: a metric that did not run is listed as one that did not, and choosing it shows R’s sentence saying why in place of its charts (#235)', async () => {
    const calls = fakeViz();
    const { app, r, $, $$ } = mount({
      answers: { rbqm_run: () => ({ status: 'ok', value: noLabs }) }
    });
    app.loadRaw(STUDY.filter((file) => file.name !== 'Raw_LB.csv'));
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('7 of 8');
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 7 of 8 metrics on the 8 loaded files/
    );
    const lab = $('.sva-rbqm-choice[data-metric="kri0005"]');
    expect(lab.textContent).toBe('LBdid not run');
    expect(lab.title).toBe('Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.');
    const drawnBefore = calls.length;
    lab.click();
    expect($('.sva-rbqm-metric-name').textContent).toBe('Grade 3+ Lab Abnormality Rate');
    expect($('.sva-rbqm-why').textContent).toBe(
      'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.'
    );
    expect($('.sva-rbqm-figures')).toBeNull();
    // Only the overview was drawn again: the metric has no chart.
    expect(calls.slice(drawnBefore).map((call) => call.name)).toEqual(['groupOverview']);
    expect($$('.sva-rbqm-choice .sva-missing')).toHaveLength(1);
  });

  it('APP-RBQM-024: when R does not start the tab says so and why, and offers to try again; trying again makes one fresh connection (#235)', async () => {
    fakeViz();
    let attempt = 0;
    const { app, r, view, $ } = mount({
      answers: {
        'Sys.time': () =>
          (attempt += 1) === 1
            ? { status: 'unavailable', reason: 'load-failed', message: 'Failed to fetch' }
            : { status: 'ok', value: 'now' },
        ...RUN_OK
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    await r.made[0].letGo();
    expect(view.state().phase).toBe('failed');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R did not start: Failed to fetch. Try again; if it fails again, reload the page.'
    );
    expect($('.sva-rbqm-status').classList.contains('sva-rbqm-problem')).toBe(true);
    expect($('.sva-rbqm-start').textContent).toBe('Try R again');
    expect($('.sva-rbqm-start').disabled).toBe(false);
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('no R');
    $('.sva-rbqm-start').click();
    expect(r.createConnection).toHaveBeenCalledTimes(2);
    for (let step = 0; step < 3; step += 1) await r.made[1].letGo();
    expect(view.state().phase).toBe('done');
  });

  it('APP-RBQM-024: when R stops during the run the tab says R stopped and why, keeps R, and offers to run again without starting R again (#235)', async () => {
    fakeViz();
    let attempt = 0;
    const { app, r, view, $ } = mount({
      answers: {
        rbqm_run: () =>
          (attempt += 1) === 1
            ? { status: 'error', message: 'Error in rbqm_run: something gave way' }
            : { status: 'ok', value: whole }
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    expect(view.state().phase).toBe('stopped');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R stopped while running the workflows: Error in rbqm_run: something gave way.'
    );
    expect($('.sva-rbqm-results')).toBeNull();
    expect($('.sva-rbqm-start').textContent).toBe('Run again');
    $('.sva-rbqm-start').click();
    await r.made[0].letGo();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(r.made[0].runs.map((run) => run.name)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run'
    ]);
    expect(view.state().phase).toBe('done');
    // The second run's files are in a folder of their own.
    expect(r.made[0].runs.at(-1).request.args.data).toBe('/rbqm/runs/2');
  });

  it('APP-RBQM-028: once R is up, a study loaded afterwards is run at once without starting R again, and the results of the study before it are not shown as its own (#235)', async () => {
    fakeViz();
    const { app, r, view, $ } = mount({
      answers: {
        rbqm_run: (request) => ({
          status: 'ok',
          value: Object.keys(request.files).length === 9 ? whole : noLabs
        })
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('8 of 8');
    // Another study: what is loaded is cleared, and eight of the files loaded.
    app.reset();
    app.loadRaw(STUDY.filter((file) => file.name !== 'Raw_LB.csv'));
    app.select('rbqm');
    expect($('.sva-rbqm-results')).toBeNull();
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(view.state().phase).toBe('running');
    await connection.letGo();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(connection.runs.map((run) => run.name)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run'
    ]);
    expect(Object.keys(connection.runs.at(-1).request.files)).toHaveLength(8);
    expect(connection.runs.at(-1).request.args.data).toBe('/rbqm/runs/2');
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('7 of 8');
    // A later run says how long it took, not how long since R was started.
    expect($('.sva-rbqm-status').textContent).not.toContain('after Start R was pressed');
  });

  it('APP-RBQM-025: on a page that cannot start R the tab says so in a sentence and offers no control; nothing is connected and no chart library is asked for (#235)', () => {
    const sentence =
      'The RBQM tab needs R, and this file loads nothing, so it cannot start R. The hosted demo app can start R in your browser.';
    const { app, r, $ } = mount({ tab: { unavailable: sentence, createConnection: undefined } });
    app.loadRaw(STUDY);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(sentence);
    expect($('.sva-rbqm-start')).toBeNull();
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('needs R');
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('APP-RBQM-027: when gsm.viz does not load the tab says the charts are not drawn and why, and still lists every metric with what R said of it (#235)', async () => {
    const { app, r, $, $$ } = mount({ answers: RUN_OK, tab: { charts: null } });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    expect($('.sva-rbqm-results .sva-problem').textContent).toBe(
      'The charts are not drawn: this page serves no gsm.viz.'
    );
    expect($$('.sva-rbqm-choice')).toHaveLength(8);
    expect($$('.sva-rbqm-results canvas')).toHaveLength(0);
  });

  it('APP-RBQM-018: what the tab says starting R downloads is what the page is built to say (#235)', () => {
    expect(OPTIONS.downloads).toBe(RBQM_DOWNLOADS);
    expect(OPTIONS.charts).toEqual({ url: './gsm.viz.js', global: 'gsmViz' });
    expect(OPTIONS.r.attach).toBe('rbqm_attach');
    expect(OPTIONS.r.call).toBe('rbqm_run');
  });

  it('APP-RBQM-048: once R has answered, the tab names beside R’s own versions what is copied in and not installed in R: gsm.kri’s metric workflows and gsm.viz’s charts, each at the version the record of its copy names (#255)', async () => {
    const kri = readRecord(path.join(root, GSM_KRI_WORKFLOWS.directory));
    const viz = readRecord(path.join(root, GSM_VIZ.directory));
    expect(OPTIONS.copies).toEqual({
      workflows: { name: 'gsm.kri', version: kri.version },
      charts: { name: 'gsm.viz', version: viz.version }
    });
    // The records are of the tags the copies are held to.
    expect(kri.tag).toBe(`v${kri.version}`);
    expect(viz.tag).toBe(`v${viz.version}`);
    fakeViz();
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    // Before R has answered nothing is said of versions.
    expect($('.sva-rbqm-status').textContent).not.toMatch(/gsm\.kri/);
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect($('.sva-rbqm-status').textContent).toMatch(
      new RegExp(
        `gsm\\.reporting ${whole.versions['gsm.reporting']} and workr ${whole.versions.workr}\\. ` +
          `The metric workflows are gsm\\.kri ${kri.version}’s and the charts gsm\\.viz ${viz.version}’s\\.$`
      )
    );
    // R reported no version of gsm.kri: the package is not installed there.
    expect(Object.keys(whole.versions)).not.toContain('gsm.kri');
  });

  it('APP-RBQM-018: what the tab places a reader’s files with is what desktop R read from the workflows (#236)', () => {
    const { needs } = JSON.parse(readFileSync(path.join(root, RBQM_NEEDS.file), 'utf8'));
    expect(OPTIONS.needs).toEqual(needs);
  });
});

// A reader's own files (#236). The files here are the demo study's first rows
// under other names, a file of no raw domain, and File stand-ins that are read
// as the browser's file reader reads them.
describe('the RBQM tab: a reader’s own raw files', () => {
  const named = (file, name) => ({ ...STUDY.find((entry) => entry.name === file), name });
  const NOTES = { name: 'site_notes.csv', text: 'SITE,NOTE\n01,Visited in March\n' };
  const asFile = ({ name, text }) => ({ name, size: text.length, text: async () => text });
  const settle = async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  };
  // Desktop R's answer for the subjects and adverse events files alone: what
  // it said of each metric, with the rows of the two that ran.
  const ran = new Set(partial['two-files'].ran.metrics.map((id) => `Analysis_${id}`));
  const kept = (rows) => rows.filter((row) => ran.has(row.MetricID));
  const twoFiles = {
    ...whole,
    Results: kept(whole.Results),
    Bounds: kept(whole.Bounds),
    Metrics: kept(whole.Metrics),
    Groups: [],
    status: partial['two-files'].status,
    groups: partial['two-files'].groups,
    notes: partial['two-files'].notes,
    thresholds: partial['two-files'].thresholds
  };
  const TWO = { rbqm_run: () => ({ status: 'ok', value: twoFiles, form: 'browser' }) };

  it('APP-RBQM-036: before R is started the tab lists each loaded file with the raw domain it was placed in and which metrics the files support, and makes no connection; with no file it shows where to drop them (#236)', () => {
    const { app, r, $, $$ } = mount();
    app.select('rbqm');
    expect($('.sva-rbqm-files').open).toBe(true);
    expect($('.sva-rbqm-files-summary').textContent).toBe('No files are loaded.');
    expect($('.sva-rbqm-drop p').textContent).toBe('Drop your own gsm raw files here, as CSV');
    expect($('.sva-rbqm-drop .sva-drop-note').textContent).toBe(
      'They are read in this browser and sent nowhere.'
    );
    expect($('.sva-rbqm-input').accept).toBe('.csv,text/csv');
    expect($('.sva-rbqm-loaded')).toBeNull();
    app.loadRaw(STUDY);
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '9 files loaded, 9 placed in a gsm raw domain. They support 8 of 8 metrics.'
    );
    expect($$('.sva-rbqm-file').map((item) => item.textContent)).toEqual(
      STUDY.map((file) => `${file.name} is ${file.name.replace('.csv', '')}, by its name.`)
    );
    expect($$('.sva-rbqm-support .sva-rbqm-can')).toHaveLength(8);
    expect($('.sva-rbqm-support li').textContent).toBe(
      'AE Adverse Event Rate: the files and columns it needs are loaded.'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('APP-RBQM-037: files dropped on the tab, or chosen there, are read with the browser’s file reader and kept as raw files: none is placed in a safety domain or given a mapping; a file that is not a CSV is named and not kept (#236)', async () => {
    const { app, $, $$ } = mount();
    app.select('rbqm');
    const reads = [];
    const files = [named('Raw_SUBJ.csv', 'Raw_SUBJ.csv'), named('Raw_AE.csv', 'Raw_AE.csv')].map(
      (file) => ({
        ...asFile(file),
        text: async () => {
          reads.push(file.name);
          return file.text;
        }
      })
    );
    const drop = new Event('drop');
    drop.dataTransfer = { files: [...files, asFile({ name: 'study.json', text: '[{"a":1}]' })] };
    const over = new Event('dragover', { cancelable: true });
    $('.sva-rbqm-drop').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect($('.sva-rbqm-drop').classList.contains('sva-over')).toBe(true);
    $('.sva-rbqm-drop').dispatchEvent(drop);
    await settle();
    expect(reads).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    expect(app.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    expect(app.state.raw[1].text).toBe(STUDY.find((file) => file.name === 'Raw_AE.csv').text);
    expect(app.state.files).toEqual({});
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.study).toBeNull();
    expect($$('.sva-notes .sva-note').map((note) => note.textContent)).toEqual([
      'study.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.'
    ]);
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '2 files loaded, 2 placed in a gsm raw domain. They support 2 of 8 metrics.'
    );
    // Choosing files is the same reading: the button opens the browser's own chooser.
    const input = $('.sva-rbqm-input');
    const opened = vi.spyOn(input, 'click').mockImplementation(() => {});
    $('.sva-rbqm-choose').click();
    expect(opened).toHaveBeenCalledTimes(1);
    Object.defineProperty(input, 'files', { value: [asFile(named('Raw_PD.csv', 'Raw_PD.csv'))] });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(app.state.raw.map((file) => file.name)).toEqual([
      'Raw_SUBJ.csv',
      'Raw_AE.csv',
      'Raw_PD.csv'
    ]);
  });

  it('APP-RBQM-038: R is handed the one file of each raw domain under gsm’s name for it, whatever the reader called it, and no file that was not placed; the tab says before the press which metrics the files support and of each other which file it needs, in the words R then says (#236)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: TWO });
    app.select('rbqm');
    const subjects = named('Raw_SUBJ.csv', 'subjects_export.csv');
    const events = named('Raw_AE.csv', 'ae.csv');
    app.loadRaw([subjects, NOTES, events]);
    expect($$('.sva-rbqm-file').map((item) => item.textContent)).toEqual([
      'subjects_export.csv is Raw_SUBJ, by its columns.',
      'site_notes.csv is not recognised: its name and its columns match no gsm raw domain.',
      'ae.csv is Raw_AE, by its name.'
    ]);
    expect($$('.sva-rbqm-unused').map((item) => item.textContent)).toEqual([
      'site_notes.csv is not recognised: its name and its columns match no gsm raw domain.'
    ]);
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '3 files loaded, 2 placed in a gsm raw domain. They support 2 of 8 metrics.'
    );
    const said = partial['two-files'].status;
    expect(
      $$('.sva-rbqm-support li[data-metric]').map((item) => [
        item.dataset.metric,
        item.classList.contains('sva-rbqm-can'),
        item.textContent
      ])
    ).toEqual(
      said.map((line) => [
        line.id,
        line.state === 'ran',
        line.state === 'ran'
          ? `${line.abbreviation} ${line.metric}: the files and columns it needs are loaded.`
          : `${line.abbreviation} ${line.message}`
      ])
    );
    expect($('.sva-rbqm-support .sva-rbqm-groups').textContent).toBe(
      partial['two-files'].groups.message
    );
    expect($('.sva-rbqm-status').textContent).toContain('on the 2 loaded raw files.');
    expect(r.createConnection).not.toHaveBeenCalled();

    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    const { request } = connection.runs.at(-1);
    expect(request.files).toEqual({
      '/rbqm/runs/1/Raw_SUBJ.csv': subjects.text,
      '/rbqm/runs/1/Raw_AE.csv': events.text
    });
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 2 of 8 metrics on the 2 loaded files/
    );
    // R has answered: the list folds away, and the metrics say what R said.
    expect($('.sva-rbqm-files').open).toBe(false);
    expect($$('.sva-rbqm-choice').map((button) => [button.dataset.metric, button.title])).toEqual(
      said.map((line) => [line.id, line.state === 'ran' ? line.metric : line.message])
    );
    // A file R is not handed changes nothing R ran on: it is listed, and R is not asked again.
    app.loadRaw([{ name: 'more_notes.csv', text: NOTES.text }]);
    await settle();
    expect(connection.runs).toHaveLength(3);
    expect($$('.sva-rbqm-file')).toHaveLength(4);
    expect($('.sva-rbqm-results')).not.toBeNull();
  });

  it('APP-RBQM-038: when no loaded file is a gsm raw file the tab says there is nothing for R to run, and its control cannot be pressed (#236)', () => {
    const { app, r, $ } = mount();
    app.select('rbqm');
    app.loadRaw([NOTES]);
    expect($('.sva-rbqm-status').textContent).toBe(
      'None of the loaded files is a subject-level or adverse events file, or a gsm raw file, so there is nothing for R to run.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(true);
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '1 file loaded, 0 placed in a gsm raw domain. It supports 0 of 8 metrics.'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
  });

  it('APP-RBQM-034: a file that lacks a column its workflow names is listed with the column, and each metric that needs it says so before the press (#236)', () => {
    const { app, $, $$ } = mount();
    app.select('rbqm');
    const events = STUDY.find((file) => file.name === 'Raw_AE.csv');
    const [header, ...rows] = events.text.split('\n');
    const at = header.split(',').findIndex((column) => column.replaceAll('"', '') === 'aeser');
    const less = (line) =>
      line
        .split(',')
        .filter((_, index) => index !== at)
        .join(',');
    app.loadRaw([
      named('Raw_SUBJ.csv', 'Raw_SUBJ.csv'),
      { name: 'Raw_AE.csv', text: [less(header), ...rows.map(less)].join('\n') }
    ]);
    expect($$('.sva-rbqm-file')[1].textContent).toBe(
      'Raw_AE.csv is Raw_AE, by its name. It lacks the column aeser.'
    );
    expect($('.sva-rbqm-support li[data-metric="kri0001"]').textContent).toBe(
      'AE Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    );
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '2 files loaded, 2 placed in a gsm raw domain. They support 0 of 8 metrics.'
    );
  });
});

describe('the RBQM tab: the study the other charts use', () => {
  const pilot = JSON.parse(readFileSync(path.join(root, RBQM_PILOT.expected), 'utf8'));
  const PILOT = RBQM_PILOT.files.map(({ file }) => ({
    name: path.basename(file),
    text: readFileSync(path.join(root, file), 'utf8')
  }));
  const LABS = {
    name: 'adbds.csv',
    text: readFileSync(path.join(root, 'site/data/adbds.csv'), 'utf8')
      .split('\n')
      .slice(0, 40)
      .join('\n')
  };
  // The stand-in answers as desktop R did: the pilot study as it is, or with no site mapped.
  const noSite = {
    ...pilot.answer,
    Results: [],
    Bounds: [],
    Groups: [],
    Metrics: [],
    thresholds: {},
    status: pilot.no_site.status,
    groups: pilot.no_site.groups,
    ran: pilot.no_site.ran
  };
  const ANSWERS = {
    rbqm_run: (request) => ({
      status: 'ok',
      form: 'browser',
      value: Object.values(request.files).some((text) => text.startsWith('SITEID,'))
        ? pilot.answer
        : noSite
    })
  };
  const settle = async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  };

  it('APP-RBQM-045: with the study the other charts use loaded and nothing else, the tab says R will run on its subject-level and adverse events files, lists what each gives and which metrics the study supports, and its control can be pressed; the list is closed, the study needing nothing more of the reader (#253)', () => {
    const { app, r, $, $$ } = mount();
    app.loadFiles([...PILOT, LABS]);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(
      'Start R to run gsm’s workflows on the loaded study’s adsl.csv and adae.csv. It downloads about 55 MB, once: ' +
        'R itself from webr.r-wasm.org (about 13 MB), its packages from repo.r-wasm.org (about 40 MB) ' +
        'and gsm’s packages from this page (about 2 MB). The files stay in this browser, and R runs here.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(false);
    expect($('.sva-rbqm-files').open).toBe(false);
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      'The loaded study supports 3 of 8 metrics. R makes gsm’s raw tables from its adsl.csv and adae.csv.'
    );
    expect(
      $$('.sva-rbqm-study-file').map((node) => [node.dataset.table, node.textContent])
    ).toEqual([
      [
        'Standard_subject',
        'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.'
      ],
      ['Standard_ae', 'adae.csv, the Adverse events file, gives Raw_AE.']
    ]);
    // No raw file is loaded, so none is listed; the place to drop one is still there.
    expect($$('.sva-rbqm-file')).toHaveLength(0);
    expect($('.sva-rbqm-drop')).not.toBeNull();
    expect(
      $$('.sva-rbqm-support li[data-metric]').map((node) => [
        node.dataset.metric,
        node.classList.contains('sva-rbqm-can'),
        node.textContent
      ])
    ).toEqual(
      pilot.answer.status.map((line) => [
        line.id,
        line.state === 'ran',
        line.state === 'ran'
          ? `${line.abbreviation} ${line.metric}: the files and columns it needs are loaded.`
          : `${line.abbreviation} ${line.message}`
      ])
    );
    expect($$('.sva-rbqm-support .sva-rbqm-can').map((node) => node.dataset.metric)).toEqual(
      RBQM_PILOT.metrics
    );
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('APP-RBQM-045: R is handed the study’s two files under the standard column names, in a folder of the run’s own, with the folder of the workflows that make gsm’s raw tables and what each file is called; no other file of the study goes to R, and the tab then says what R ran on (#253)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: ANSWERS });
    app.loadFiles([...PILOT, LABS]);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    const { request } = connection.runs.at(-1);
    expect(Object.keys(request.files)).toEqual([
      '/rbqm/runs/1/Standard_subject.csv',
      '/rbqm/runs/1/Standard_ae.csv'
    ]);
    // The bytes desktop R was given for the reference.
    const needs = JSON.parse(readFileSync(path.join(root, RBQM_NEEDS.file), 'utf8')).needs;
    const given = standardFiles(RBQM_PILOT.files, needs, manifest, (file) =>
      readFileSync(path.join(root, file))
    );
    expect(request.files).toEqual(
      Object.fromEntries(
        Object.entries(given.files).map(([name, text]) => [`/rbqm/runs/1/${name}`, text])
      )
    );
    expect(request.args).toMatchObject({
      data: '/rbqm/runs/1',
      standard: '/rbqm/standard',
      labels: { Standard_subject: 'adsl.csv', Standard_ae: 'adae.csv' }
    });
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 3 of 8 metrics on the loaded study’s adsl\.csv and adae\.csv in /
    );
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('3 of 8');
    expect($('.sva-rbqm-files').open).toBe(false);
    expect($$('.sva-rbqm-choice').map((button) => [button.dataset.metric, button.title])).toEqual(
      pilot.answer.status.map((line) => [
        line.id,
        line.state === 'ran' ? line.metric : line.message
      ])
    );
    // R's own Groups table is handed to the overview: no stand-in row, and no name where R has none.
    expect($('.sva-rbqm-note')).toBeNull();
    const overview = globalThis.gsmViz.default.groupOverview.mock.calls.at(-1);
    expect(overview[1]).toHaveLength(51);
    expect(overview[2]).toMatchObject({ GroupLevel: 'Site', groupLabelKey: null });
    expect(overview[3].filter((row) => row.Param === 'ParticipantCount')).toHaveLength(17 + 1 + 1);
  });

  it('APP-RBQM-045: a mapping changed on the Data tab is a different study to R: once R is up it is run again at once, and with the site not mapped the tab says of each metric the column no column of the file is mapped to (#253)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: ANSWERS });
    app.loadFiles(PILOT);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('3 of 8');
    // The reader clears the site's row of the mapping table.
    app.select('data');
    app.setColumn('subject', 'SITEID', null);
    app.select('rbqm');
    await settle();
    await connection.letGo();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(connection.runs.map((run) => run.name)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run'
    ]);
    const { request } = connection.runs.at(-1);
    expect(request.args.data).toBe('/rbqm/runs/2');
    expect(request.files['/rbqm/runs/2/Standard_subject.csv'].split('\n')[0]).toBe(
      'USUBJID,EOSSTT,EOSDY'
    );
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('0 of 8');
    expect($('.sva-rbqm-choice[data-metric="kri0001"]').title).toBe(
      'Adverse Event Rate needs the column SITEID, which no column of adsl.csv is mapped to.'
    );
    expect($$('.sva-rbqm-study-file')[0].textContent).toBe(
      'adsl.csv, the Subject-level file, gives Raw_STUDY. It has no column mapped to SITEID, ' +
        'so Raw_SITE, Raw_STUDCOMP and Raw_SUBJ are not made. Map it on the Data tab.'
    );
    // Mapped again, it is the study it was, and R runs it a third time.
    app.select('data');
    app.setColumn('subject', 'SITEID', 'SITEID');
    app.select('rbqm');
    await settle();
    await connection.letGo();
    expect(connection.runs).toHaveLength(5);
    expect($('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent).toBe('3 of 8');
  });

  it('APP-RBQM-045: a study with no subject-level or adverse events file has nothing for R to run, and the tab says which files the metrics run on; gsm raw files loaded beside a study are used as they are, and the study’s files only for the raw tables that are not loaded (#253)', () => {
    const { app, $, $$ } = mount();
    app.loadFiles([LABS]);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(
      'None of the loaded files is a subject-level or adverse events file, or a gsm raw file, so there is nothing for R to run.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(true);
    expect($('.sva-rbqm-files').open).toBe(true);
    app.reset();
    app.loadFiles(PILOT);
    app.loadRaw([STUDY.find((file) => file.name === 'Raw_AE.csv')]);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toContain(
      'on the 1 loaded raw file and the loaded study’s adsl.csv.'
    );
    expect($('.sva-rbqm-files-summary').textContent).toBe(
      '1 file loaded, 1 placed in a gsm raw domain. R makes gsm’s raw tables from the loaded study’s adsl.csv. Together they support 3 of 8 metrics.'
    );
    // With raw files to check, the list is open.
    expect($('.sva-rbqm-files').open).toBe(true);
    expect($$('.sva-rbqm-study-file').map((node) => node.dataset.table)).toEqual([
      'Standard_subject'
    ]);
    expect($$('.sva-rbqm-file').map((node) => node.textContent)).toEqual([
      'Raw_AE.csv is Raw_AE, by its name.'
    ]);
  });
});

describe('what the review of the v1.10.0 release candidate found (#258)', () => {
  const pilotExpected = JSON.parse(readFileSync(path.join(root, RBQM_PILOT.expected), 'utf8'));
  const settle = async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  };
  const count = ($) => $('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent;

  it('APP-RBQM-049: what R warned of is listed with the run’s notes, in R’s words; a run with no warning lists none', async () => {
    fakeViz();
    const warned = pilotExpected.some_sites_blank.warnings;
    let run = 0;
    const { app, r, $, $$ } = mount({
      answers: {
        rbqm_run: () => ({
          status: 'ok',
          value: (run += 1) === 1 ? { ...whole, warnings: warned } : whole
        })
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect($$('.sva-rbqm-notes .sva-note').map((note) => note.textContent)).toEqual([
      "R warned: 26 cases of NA's in GroupID, cases are removed in output."
    ]);
    // The metrics still ran, and say so.
    expect(count($)).toBe('8 of 8');
    $('.sva-rbqm-start').click();
    await connection.letGo();
    expect($('.sva-rbqm-notes')).toBeNull();
  });

  it('APP-RBQM-051: the tab’s count follows the loaded study while another tab is open: after the study is cleared or changed there it reads not run, not the last study’s count; opened with nothing loaded the control cannot be pressed, does not offer to run again, and the list of files is open', async () => {
    fakeViz();
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(count($)).toBe('8 of 8');
    app.select('data');
    expect(count($)).toBe('8 of 8');
    app.reset();
    expect(count($)).toBe('not run');
    app.select('rbqm');
    await settle();
    expect(count($)).toBe('not run');
    expect($('.sva-rbqm-start').textContent).toBe('Run the metrics');
    expect($('.sva-rbqm-start').disabled).toBe(true);
    expect($('.sva-rbqm-files').open).toBe(true);
    expect($('.sva-rbqm-results')).toBeNull();
    // Nothing was run on nothing.
    expect(connection.runs.filter((run) => run.name === 'rbqm_run')).toHaveLength(1);
  });

  it('APP-RBQM-051: “after Start R was pressed” is said only of the press that started R: when the study is cleared while R starts, a later press runs the metrics and says how long the run took and nothing of Start R', async () => {
    fakeViz();
    const { app, r, clock, view, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    // The study is cleared while R starts: R comes up and there is nothing to run.
    app.reset();
    for (let step = 0; step < 2; step += 1) await connection.letGo();
    expect(view.state().up).toBe(true);
    expect(view.state().phase).toBe('idle');
    clock.now += 10 * 60 * 1000;
    app.loadRaw(STUDY);
    app.select('rbqm');
    expect($('.sva-rbqm-start').textContent).toBe('Run the metrics');
    $('.sva-rbqm-start').click();
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 8 of 8 metrics on the 9 loaded files in /
    );
    expect($('.sva-rbqm-status').textContent).not.toContain('after Start R was pressed');
  });

  it('APP-RBQM-052: R is told which folder the run before left its files in, and removes it as the next run begins: the first run names none, each later run names the one before', async () => {
    fakeViz();
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    for (let again = 0; again < 2; again += 1) {
      $('.sva-rbqm-start').click();
      await connection.letGo();
    }
    const runs = connection.runs.filter((run) => run.name === 'rbqm_run');
    expect(runs.map((run) => [run.request.args.data, run.request.args.forget])).toEqual([
      ['/rbqm/runs/1', undefined],
      ['/rbqm/runs/2', '/rbqm/runs/1'],
      ['/rbqm/runs/3', '/rbqm/runs/2']
    ]);
  });

  it('APP-RBQM-052: the folder of a run that failed is forgotten by the next run, as a run that answered is', async () => {
    fakeViz();
    let asked = 0;
    const { app, r, $ } = mount({
      answers: {
        rbqm_run: () => {
          asked += 1;
          return asked === 1
            ? { status: 'error', message: 'R stopped' }
            : { status: 'ok', value: whole, form: 'browser' };
        }
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    $('.sva-rbqm-start').click();
    await connection.letGo();
    const runs = connection.runs.filter((run) => run.name === 'rbqm_run');
    expect(runs.map((run) => [run.request.args.data, run.request.args.forget])).toEqual([
      ['/rbqm/runs/1', undefined],
      ['/rbqm/runs/2', '/rbqm/runs/1']
    ]);
  });

  it('APP-RBQM-052: desktop R, asked to forget while it reads one folder, removes only the one folder beside its own, and reads a name as a name: not its own however spelt, its parent, a folder elsewhere, what a pattern matches, two at once, or one that is not there; and a whole run told of the folder before removes it and returns its rows', () => {
    const { cases, in_a_run: inARun } = pilotExpected.forgets;
    const all = RBQM_PILOT.forgetFolders;
    expect(all).toEqual(['runs/1', 'runs/2', 'runs/else-a', 'runs/else*', 'elsewhere/9']);
    expect(cases.map(({ id }) => id)).toEqual(RBQM_PILOT.forgets.map(({ id }) => id));
    const without = (folder) => all.filter((each) => each !== folder);
    const removes = { beside: 'runs/1', 'named-like-a-pattern': 'runs/else*' };
    expect(cases.length).toBe(10);
    for (const { id, forget, removed, left } of cases) {
      // The one folder asked for, where R may remove it; nothing anywhere else.
      expect([id, removed, left]).toEqual(
        removes[id] ? [id, true, without(removes[id])] : [id, false, all]
      );
      if (removes[id]) expect(forget).toBe(removes[id]);
    }
    expect(inARun).toEqual({
      earlier_left: false,
      own_left: true,
      rows: pilotExpected.answer.Results.length
    });
    expect(inARun.rows).toBe(51);
  });

  it('APP-RBQM-050: with lines above the subject-level file’s header that are empty or only spaces or a tab, desktop R reads the header from the first line with anything on it and returns the rows it returns without them', () => {
    expect(RBQM_PILOT.linesAboveHeader.above).toBe('\n   \n\t\n');
    const above = pilotExpected.lines_above_header;
    expect(above.rows).toBe(51);
    expect(above.same_rows_as_held).toBe(true);
    expect(above.warnings).toEqual([]);
    expect(above.status.map(({ id, state }) => [id, state])).toEqual(
      pilotExpected.answer.status.map(({ id, state }) => [id, state])
    );
  });

  it('APP-RBQM-024: when R comes up and its packages cannot be attached R is not taken as up: the tab says so and offers to try again, and trying again closes that R and makes one fresh connection, started from the beginning (#258)', async () => {
    fakeViz();
    const inner = fakeR({
      rbqm_attach: (request, connection) =>
        connection === inner.made[0]
          ? { status: 'error', message: 'there is no package called ‘gsm.core’' }
          : { status: 'ok', value: null },
      ...RUN_OK
    });
    const closed = [];
    const { app, view, $ } = mount({
      tab: {
        createConnection: (options) => {
          const connection = inner.createConnection(options);
          connection.close = vi.fn(async () => closed.push(inner.made.indexOf(connection)));
          return connection;
        }
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 2; step += 1) await inner.made[0].letGo();
    expect(view.state().phase).toBe('failed');
    expect(view.state().up).toBe(false);
    expect($('.sva-rbqm-start').textContent).toBe('Try R again');
    expect($('.sva-rbqm-status').textContent).toContain('there is no package called ‘gsm.core’');
    expect(closed).toEqual([]);
    $('.sva-rbqm-start').click();
    await settle();
    expect(closed).toEqual([0]);
    expect(inner.made).toHaveLength(2);
    for (let step = 0; step < 3; step += 1) await inner.made[1].letGo();
    expect(inner.made[1].runs.map((run) => run.name)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run'
    ]);
    expect(view.state().phase).toBe('done');
    // The first run on the new R names no earlier folder: that R is gone.
    expect(inner.made[1].runs.at(-1).request.args.forget).toBeUndefined();
  });

  it('APP-RBQM-028: files loaded while R is running are run when that run ends, without a press, and theirs are the results shown (#258)', async () => {
    fakeViz();
    const { app, r, view, $ } = mount({
      answers: {
        rbqm_run: (request) => ({
          status: 'ok',
          value: Object.keys(request.files).length === 9 ? whole : noLabs
        })
      }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 2; step += 1) await connection.letGo();
    expect(view.state().phase).toBe('running');
    // While R runs on nine files, the reader loads eight in their place.
    app.reset();
    app.loadRaw(STUDY.filter((file) => file.name !== 'Raw_LB.csv'));
    await connection.letGo();
    expect(view.state().phase).toBe('running');
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    const runs = connection.runs.filter((run) => run.name === 'rbqm_run');
    expect(runs.map((run) => Object.keys(run.request.files).length)).toEqual([9, 8]);
    app.select('rbqm');
    expect(count($)).toBe('7 of 8');
  });

  it('APP-RBQM-019: the count of seconds runs while R starts and runs, and stops when the run ends: nothing is left ticking (#258)', async () => {
    vi.useFakeTimers();
    fakeViz();
    const { app, r, clock, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    // The tab's count is the one thing here that ticks once a second.
    const set = vi.spyOn(globalThis, 'setInterval');
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const counts = () =>
      set.mock.calls.flatMap(([, every], index) =>
        every === 1000 ? [set.mock.results[index].value] : []
      );
    const ticking = () =>
      counts().filter((id) => !cleared.mock.calls.some(([gone]) => gone === id));
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    expect(ticking()).toHaveLength(1);
    clock.now += 7000;
    vi.advanceTimersByTime(1000);
    expect($('.sva-rbqm-status').textContent).toMatch(/7 seconds so far\.$/);
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(counts()).toHaveLength(1);
    expect(ticking()).toEqual([]);
    const said = $('.sva-rbqm-status').textContent;
    clock.now += 60000;
    vi.advanceTimersByTime(5000);
    expect($('.sva-rbqm-status').textContent).toBe(said);
  });
});
