// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { DEMO_STUDIES } from '../../../src/app/studies.js';
import { WEBR_VERSION } from '../../../src/app/r-browser.js';
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
//
// The tab brings the app a row of its own (#279, obot.roadmap#405): Overview and
// one item for each metric, each with an address. The app's one R control is
// at the row's right end (#280), and what a run did is in the panel behind its
// chip. The body shows one page at a time: the Overview, or one metric's.

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
    // The real connection says when the run's files are written, before R is
    // called. This one says so only when a test asks it to.
    connection.wrote = () => {
      const { request } = connection.runs.at(-1);
      if (request && typeof request.onFiles === 'function') request.onFiles();
    };
    made.push(connection);
    return connection;
  });
  return { createConnection, made };
}

function mount({
  answers,
  tab = {},
  page = {},
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
    libraries: [{ name: 'gsm.viz', view }],
    ...page
  });
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  return { app, view, r, clock, $, $$ };
}

const RUN_OK = { rbqm_run: () => ({ status: 'ok', value: whole, form: 'browser' }) };
const ABBREVIATIONS = ['AE', 'SAE', 'PD', 'IPD', 'LB', 'SDSC', 'TDSC', 'SF'];
const NEED = 'Site metrics need R. Start R, at the top right.';
const NO_FILES =
  'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or load gsm raw files there.';
const NONE_PLACED =
  'None of the loaded files is a subject-level or adverse events file, or a gsm raw file, so there is nothing for R to run.';
const ONLY_LAST = 'R was already running, so only the last step ran again.';
// The six steps as the body marks them when it is at one of them.
const at = (step) => [...Array(step - 1).fill('done'), 'now', ...Array(6 - step).fill('todo')];

const settle = async () => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

// The tab's row: each metric's item, as the page drew it.
const metricItems = () => [
  ...document.querySelectorAll('.sva-view-items .sva-view-item:not([data-item=""])')
];
const item = (id) => document.querySelector(`.sva-view-items .sva-view-item[data-item="${id}"]`);
const tabCount = () =>
  document.querySelector('.sva-tab[data-tab="rbqm"] .sva-tab-count').textContent;

// The Data tab's card for the tab (#281), read from the page: its sentence,
// each metric's id, state and full name, the key to the marks, the reasons
// with their title and whether they are open, and the sentences said in the open.
const card = () => {
  const node = document.querySelector('.sva-data .sva-support[data-support="rbqm"]');
  if (!node) return null;
  const texts = (selector) => [...node.querySelectorAll(selector)].map((one) => one.textContent);
  const why = node.querySelector('.sva-support-why');
  return {
    say: node.querySelector('.sva-support-say').textContent,
    items: [...node.querySelectorAll('.sva-support-items li')].map((one) => [
      one.dataset.item,
      one.dataset.state,
      one.getAttribute('aria-label')
    ]),
    key: texts('.sva-support-key span'),
    why: why && {
      title: why.querySelector('summary').textContent,
      open: why.open,
      items: [...why.querySelectorAll('li')].map((one) => one.textContent)
    },
    lines: texts('.sva-support-lines li'),
    note: node.querySelector('.sva-support-note').textContent
  };
};

// The control, at the right end of the row, and the panel under the row.
const control = () => document.querySelector('.sva-charts > .sva-r');
const panel = () => document.querySelector('.sva-r-under .sva-r-panel');
const openDetails = () => {
  if (!panel()) document.querySelector('.sva-charts .sva-chip').click();
  return panel();
};
// What the open panel holds under one of its titles, read from the page.
function inPanel(title) {
  const heading = [...panel().querySelectorAll('.sva-r-title')].find(
    (node) => node.textContent === title
  );
  if (!heading) return null;
  const parts = [];
  for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
    if (node.classList.contains('sva-r-title')) break;
    parts.push(node);
  }
  const all = (selector) => parts.flatMap((node) => [...node.querySelectorAll(selector)]);
  return {
    steps: all('.sva-r-steps li').map((node) =>
      [...node.querySelectorAll('span')].map((part) => part.textContent)
    ),
    items: all('.sva-r-items li').map((node) => node.textContent),
    rows: all('dt').map((term) => [term.textContent, term.nextElementSibling.textContent]),
    text: parts.filter((node) => node.matches('p.sva-r-text')).map((node) => node.textContent)
  };
}
// Run again, from the panel behind the chip.
const runAgain = () => openDetails().querySelector('.sva-r-actions .sva-action').click();
// The body's six steps, each as done, now or todo.
const stepStates = () =>
  [...document.querySelectorAll('.sva-rbqm-steps li')].map((node) => node.dataset.state);

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.gsmViz;
});

describe('the page: a library that brings a view', () => {
  it('APP-RBQM-017: a library may bring a view in place of charts: a tab of its own after the domains’ tabs, with its name and what it says of itself; opening it draws the view in the main area, shows the view’s own row where a domain’s charts are named and writes its address (#235, #279)', () => {
    const { app, $, $$ } = mount();
    const tabs = $$('.sva-tab');
    const tab = tabs.at(-1);
    expect(tab.dataset.tab).toBe('rbqm');
    expect(tabs.slice(0, -1).every((node) => node.dataset.domain)).toBe(true);
    expect(tab.querySelector('.sva-tab-title').textContent).toBe('RBQM');
    expect(tab.querySelector('.sva-tab-count').textContent).toBe('not run');
    expect(tab.getAttribute('aria-pressed')).toBe('false');
    // Until the tab is opened its row is not on the page.
    expect($('.sva-view-items')).toBeNull();
    tab.click();
    expect(app.state.selected).toBe('rbqm');
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-tab[data-tab="rbqm"]').getAttribute('aria-pressed')).toBe('true');
    expect($('.sva-title').textContent).toBe('RBQM');
    // No domain's charts are named: the one group shown is the view's own.
    expect($('.sva-charts').hidden).toBe(false);
    expect(
      $$('.sva-charts > .sva-group:not([hidden])').map((group) => group.dataset.group)
    ).toEqual(['rbqm']);
    expect($('.sva-view-items .sva-group-title').textContent).toBe('RBQM');
    expect($('.sva-view .sva-rbqm')).not.toBeNull();
    // Another tab takes the main area back, and the row, and the address.
    $('.sva-item[data-view="data"]').click();
    expect($('.sva-view')).toBeNull();
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
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
    // It brings no row of its own, so no row is shown above it.
    expect(document.querySelector('.sva-charts').hidden).toBe(true);
    app.select('data');
    expect(app.state.selected).toBe('data');
  });
});

describe('the RBQM tab on the page', () => {
  it('APP-RBQM-026: the tab is Experimental by its entry in site/config.json, which says why; the tab, its row and its view carry no pill of their own, and the page shows the status label on the tab’s corner (#235, #274)', () => {
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
    expect($('.sva-view .sva-rbqm')).not.toBeNull();
    expect($('.sva-view .sva-badge')).toBeNull();
    expect($('.sva-view').textContent).not.toContain('Experimental');
    // Nor does the tab's row, or its control.
    expect($('.sva-view-items')).not.toBeNull();
    expect($('.sva-charts .sva-badge')).toBeNull();
    expect($('.sva-charts').textContent).not.toContain('Experimental');
  });

  it('APP-RBQM-018: before the press the tab says R is needed and where to start it, and its control what starting R costs, with what it downloads and from where on hover; it makes no connection and loads no chart library; with nothing loaded it says so and its control cannot be pressed (#235, #280)', () => {
    const { app, r, $ } = mount();
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(NO_FILES);
    expect($('.sva-rbqm-supports')).toBeNull();
    expect($('.sva-rbqm-start').textContent).toBe('Start R');
    expect($('.sva-rbqm-start').disabled).toBe(true);
    app.loadRaw(STUDY);
    // One short line, which points at the control, and how much the files support.
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    expect($('.sva-rbqm-status').textContent).toBe(NEED);
    expect($('.sva-rbqm-status').getAttribute('role')).toBe('status');
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded files support 8 of 8 metrics. Change the data on the Data tab.'
    );
    expect($('.sva-rbqm-placeholder').textContent).toBe(
      'Risk-based quality monitoring: gsm’s metrics for every site of the loaded study, worked out by R in this browser. The site overview and each metric’s two charts appear here, usually 20 to 45 seconds after Start R the first time.'
    );
    // The control, at the right end of the row: why, the cost, and the one button.
    expect(control().dataset.phase).toBe('off');
    expect(
      [...control().querySelectorAll('.sva-r-row > *')].map((part) => part.textContent)
    ).toEqual(['Site metrics need R', '55 MB, once', 'Start R']);
    expect($('.sva-rbqm-start').title).toBe(
      'Site metrics need R. Start R to run them: about 55 MB, downloaded once from webr.r-wasm.org, repo.r-wasm.org and this page. The study’s data stays in this browser.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(false);
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
    // Nothing of a run is on the page.
    expect($('.sva-rbqm-steps')).toBeNull();
    expect($('.sva-rbqm-outcome')).toBeNull();
    expect($('.sva-rbqm-table')).toBeNull();
  });

  it('APP-RBQM-019: the press makes one connection, with the packages, the two repositories, gsm’s workflow files and the pipeline’s R, and asks for gsm.viz from the page’s own address; until R answers the control names the step R is at and counts the seconds since the press, the tab lists the steps, and nothing is left to press (#235, #280)', async () => {
    vi.useFakeTimers();
    const calls = fakeViz();
    const { app, view, r, clock, $, $$ } = mount({ answers: RUN_OK });
    // The control counts on the browser's clock: here it is the tab's.
    vi.setSystemTime(clock.now);
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
    // The control: the step, a segment for each of the six, and the seconds. No button.
    const said = () => $('.sva-r-say').textContent;
    expect(control().dataset.phase).toBe('starting');
    expect(said()).toBe('1 of 6 · Downloading R');
    expect($('.sva-segs').getAttribute('aria-label')).toBe('Step 1 of 6');
    expect($$('.sva-segs i')).toHaveLength(6);
    expect($('.sva-r-meta').textContent).toBe('0 s');
    expect($$('.sva-r button')).toEqual([]);
    expect($('.sva-rbqm-start')).toBeNull();
    expect(tabCount()).toBe('starting');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is starting. The metrics run by themselves when it is ready.'
    );
    expect(stepStates()).toEqual(at(1));
    // The seconds are counted while R starts, and each step is said as it begins.
    clock.now += 7000;
    vi.advanceTimersByTime(7000);
    expect($('.sva-r-meta').textContent).toBe('7 s');
    connection.options.onStage('packages');
    expect(said()).toBe('2 of 6 · Installing R packages');
    expect($('.sva-r-meta').textContent).toBe('7 s');
    expect(stepStates()).toEqual(at(2));
    connection.options.onStage('files');
    expect(said()).toBe('3 of 6 · Fetching gsm’s workflow files');
    // Reading the pipeline's R is part of the same step.
    connection.options.onStage('source');
    expect(said()).toBe('3 of 6 · Fetching gsm’s workflow files');
    expect(stepStates()).toEqual(at(3));
    // R has started: the packages are attached with a call of their own.
    await connection.letGo();
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach']);
    expect(said()).toBe('4 of 6 · Loading gsm’s packages');
    expect(stepStates()).toEqual(at(4));
    await connection.letGo();
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach', 'rbqm_run']);
    expect(said()).toBe('5 of 6 · Reading the study');
    expect(stepStates()).toEqual(at(5));
    expect(control().dataset.phase).toBe('starting');
    expect(tabCount()).toBe('running');
    // There is nothing to press while it runs, and a press that came anyway starts nothing.
    expect($$('.sva-r button')).toEqual([]);
    await view.control(app).press();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(connection.runs).toHaveLength(3);
    clock.now += 4600;
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R ran 8 of 8 metrics on the 9 loaded files in 4.6 seconds. To use other files, change the data on the Data tab. Run details'
    );
    // How long it was from the press, and the snapshot's date, are in Run details.
    $('.sva-rbqm-details').click();
    expect(inPanel('Steps').text).toEqual(['12 seconds from the press to the charts.']);
    expect(inPanel('Versions').rows.at(-1)).toEqual(['Snapshot', '2026-10-07']);
    expect(tabCount()).toBe('8 of 8');
    expect(control().dataset.phase).toBe('ready');
    expect(calls.map((call) => call.name)).toEqual(['groupOverview']);
  });

  it('APP-RBQM-019: gsm.viz is asked for when R is started and not before, once, from the page’s own address, and what it defines draws the results; when it does not load the tab says so (#235)', async () => {
    const { app, r, $, $$ } = mount({ answers: RUN_OK });
    const asked = () => [...document.head.querySelectorAll('script[src]')];
    try {
      app.loadRaw(STUDY);
      app.select('rbqm');
      expect(asked()).toEqual([]);
      $('.sva-rbqm-start').click();
      expect(asked().map((script) => script.getAttribute('src'))).toEqual(['./gsm.viz.js']);
      const [connection] = r.made;
      // The script did not load: the run goes on, and the tab asks once more when it has results.
      asked()[0].onerror();
      for (let step = 0; step < 3; step += 1) await connection.letGo();
      expect(asked()).toHaveLength(2);
      expect($('.sva-rbqm-table')).toBeNull();
      asked()[1].onerror();
      await settle();
      expect($('.sva-rbqm-overview .sva-problem').textContent).toBe(
        'The charts are not drawn: ./gsm.viz.js did not load on this page.'
      );
      expect($('.sva-rbqm-outcome').textContent).toMatch(/^R ran 8 of 8 metrics /);
      // Opened again, it asks again; this time the script loads and defines the charts.
      app.select('rbqm');
      expect(asked()).toHaveLength(3);
      const calls = fakeViz();
      asked()[2].onload();
      await settle();
      expect(calls.map((call) => call.name)).toEqual(['groupOverview']);
      expect($('.sva-rbqm-table > table')).not.toBeNull();
      expect($('.sva-rbqm-overview .sva-problem')).toBeNull();
      // Loaded, it is not asked for again.
      item('kri0001').click();
      expect(asked()).toHaveLength(3);
      expect($$('.sva-rbqm-metric canvas')).toHaveLength(2);
    } finally {
      for (const script of asked()) script.remove();
    }
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

  it('APP-RBQM-020: what R returns is drawn by gsm.viz: the overview is handed every Results row with the Groups and Metrics tables, and a metric’s page its scatter plot and bar chart with the metric’s own rows, R’s bounds and R’s thresholds; opening another metric draws that one’s, and R’s answer is not changed by any of it (#235, #279)', async () => {
    const calls = fakeViz();
    const before = JSON.stringify(whole);
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(calls).toHaveLength(1);
    const [overview] = calls;
    expect(overview.element).toBe($('.sva-rbqm-table'));
    expect(overview.rest[0]).toEqual(whole.Results);
    expect(overview.rest[1]).toMatchObject({
      GroupLevel: 'Site',
      groupLabelKey: 'InvestigatorLastName'
    });
    expect(overview.rest[2]).toEqual(whole.Groups);
    expect(overview.rest[3]).toEqual(whole.Metrics);
    // The eight metrics, by abbreviation, each an item of the row; all ran.
    expect(metricItems().map((node) => [node.textContent, node.dataset.state])).toEqual(
      ABBREVIATIONS.map((name) => [name, 'ran'])
    );
    // A metric's page: its two charts.
    item('kri0001').click();
    const [, scatter, bar] = calls;
    expect(calls.map((call) => call.name)).toEqual(['groupOverview', 'scatterPlot', 'barChart']);
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
    expect(item('kri0001').getAttribute('aria-current')).toBe('page');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Adverse Event Rate');
    expect($('.sva-rbqm-caption').textContent).toBe(
      'Point size is relative to the number of enrolled participants.'
    );
    // Another metric: the charts on the page are torn down, and its own drawn.
    item('kri0012').click();
    expect([scatter.destroyed, bar.destroyed]).toEqual([true, true]);
    expect(calls.map((call) => call.name).slice(3)).toEqual(['scatterPlot', 'barChart']);
    const [lastScatter, lastBar] = calls.slice(-2);
    expect($('.sva-rbqm-metric-name').textContent).toBe('Screen Failure Rate');
    expect(lastScatter.rest[0]).toEqual(of(whole.Results, 'Analysis_kri0012'));
    expect(lastScatter.rest[0]).toHaveLength(150);
    expect(lastBar.rest[2]).toEqual([-3, -2, 2, 3]);
    // R was asked once: opening a metric asks R for nothing.
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach', 'rbqm_run']);
    expect(JSON.stringify(whole)).toBe(before);
  });

  it('APP-RBQM-022: a metric that did not run is marked in the row as one that did not, and opening it shows R’s sentence saying why in place of its charts, with the way to the data (#235, #279)', async () => {
    const calls = fakeViz();
    const { app, r, $, $$ } = mount({
      answers: { rbqm_run: () => ({ status: 'ok', value: noLabs }) }
    });
    app.loadRaw(STUDY.filter((file) => file.name !== 'Raw_LB.csv'));
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    expect(tabCount()).toBe('7 of 8');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R ran 7 of 8 metrics on the 8 loaded files in 0 seconds. The other 1 needs data it does not have: change the data on the Data tab. Run details'
    );
    const why = 'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.';
    const lab = item('kri0005');
    expect(lab.textContent).toBe('LB');
    expect(lab.dataset.state).toBe('cannot');
    expect(lab.getAttribute('aria-label')).toBe('Grade 3+ Lab Abnormality Rate: did not run');
    expect(lab.title).toBe(why);
    expect(lab.querySelector('svg.sva-ico-cannot')).not.toBeNull();
    const drawnBefore = calls.length;
    lab.click();
    expect($('.sva-rbqm-page').dataset.page).toBe('metric');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Grade 3+ Lab Abnormality Rate');
    expect($('.sva-rbqm-count').textContent).toBe('LB, did not run');
    // R's sentence, alone in its paragraph, and beside it the way to the data.
    expect($('p.sva-rbqm-why').textContent).toBe(why);
    expect($('.sva-rbqm-whybox > .sva-rbqm-data').textContent).toBe(
      'Change the data on the Data tab.'
    );
    expect($('.sva-rbqm-figures')).toBeNull();
    expect($$('.sva-view canvas')).toHaveLength(0);
    // Nothing was drawn for it: the metric has no chart.
    expect(calls.slice(drawnBefore)).toEqual([]);
    expect($$('.sva-view-item[data-state="cannot"]')).toHaveLength(1);
    expect($$('.sva-view-item[data-state="ran"]')).toHaveLength(7);
  });

  it('APP-RBQM-024: when R does not start the control says so and why, and offers to try again, and the tab says no metric was run; trying again makes one fresh connection (#235, #280)', async () => {
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
    // The failure state every tab that starts R shows (#277): the words, in the
    // alarm colour, Try again beside them, and no raw error in that line.
    expect(control().dataset.phase).toBe('failed');
    expect($('.sva-r-say').textContent).toBe('R did not start');
    expect($('.sva-r-say').classList.contains('sva-bad')).toBe(true);
    expect($('.sva-rbqm-start').textContent).toBe('Try again');
    expect($('.sva-rbqm-start').disabled).toBe(false);
    // The tab says what that means for the metrics, and points at the control.
    expect($('.sva-rbqm-status').textContent).toBe(
      'R did not start, so no metric was run. Try again, at the top right.'
    );
    expect($('.sva-rbqm-status').classList.contains('sva-rbqm-problem')).toBe(true);
    expect($('.sva-rbqm-steps')).toBeNull();
    expect(document.body.textContent).not.toContain('Failed to fetch');
    // The reason is one click away: a plain sentence, with what the browser
    // said behind a disclosure inside it.
    expect(panel()).toBeNull();
    $('.sva-r-why').click();
    expect(panel().querySelector('.sva-r-heading').textContent).toBe('R did not start');
    expect($('.sva-r-panel > .sva-r-text').textContent).toBe(
      'The browser could not download R from webr.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. No metric was run.'
    );
    expect($('.sva-r-more summary').textContent).toBe('What the browser said');
    expect($('.sva-r-more').open).toBe(false);
    expect($('.sva-r-more .sva-r-text').textContent).toBe('The browser said: Failed to fetch.');
    $('.sva-r-x').click();
    expect(panel()).toBeNull();
    expect(tabCount()).toBe('no R');
    // No metric is marked as running any more.
    expect(metricItems().map((node) => node.dataset.state)).toEqual(Array(8).fill('todo'));
    $('.sva-rbqm-start').click();
    expect(r.createConnection).toHaveBeenCalledTimes(2);
    for (let step = 0; step < 3; step += 1) await r.made[1].letGo();
    expect(view.state().phase).toBe('done');
  });

  it('APP-RBQM-024: when R stops during the run the control says R stopped and why, the tab says there are no results, R is kept, and Run again runs without starting R again (#235, #280)', async () => {
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
    expect(view.state().up).toBe(true);
    expect(control().dataset.phase).toBe('failed');
    expect($('.sva-r-say').textContent).toBe('R stopped');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R stopped, so there are no results. Run again, at the top right.'
    );
    expect($('.sva-rbqm-status').classList.contains('sva-rbqm-problem')).toBe(true);
    expect(tabCount()).toBe('stopped');
    $('.sva-r-why').click();
    expect($('.sva-r-panel > .sva-r-text').textContent).toBe(
      'R stopped while it was running gsm’s workflows, so there are no results. Run again; if it stops again, reload the page.'
    );
    expect($('.sva-r-more summary').textContent).toBe('What R said');
    expect($('.sva-r-more .sva-r-text').textContent).toBe(
      'R said: Error in rbqm_run: something gave way.'
    );
    expect($('.sva-rbqm-outcome')).toBeNull();
    expect($('.sva-rbqm-table')).toBeNull();
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
    expect($('.sva-rbqm-table')).not.toBeNull();
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
    expect(tabCount()).toBe('8 of 8');
    // Another study: what is loaded is cleared, and eight of the files loaded.
    app.reset();
    app.loadRaw(STUDY.filter((file) => file.name !== 'Raw_LB.csv'));
    app.select('rbqm');
    // The table of the study before is not drawn for this one.
    expect($('.sva-rbqm-table')).toBeNull();
    expect($('.sva-rbqm-outcome')).toBeNull();
    await settle();
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
    expect(tabCount()).toBe('7 of 8');
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 7 of 8 metrics on the 8 loaded files in /
    );
    expect(item('kri0005').dataset.state).toBe('cannot');
    // A later run says how long it took, not how long since R was started.
    openDetails();
    expect(inPanel('Steps').steps).toEqual([['Ran the workflows', '0 s']]);
    expect(inPanel('Steps').text).toEqual([ONLY_LAST]);
    expect(panel().textContent).not.toContain('from the press to the charts');
  });

  it('APP-RBQM-025: on a page that cannot start R the tab says so in a sentence and offers no control; nothing is connected and no chart library is asked for (#235)', () => {
    const sentence =
      'The RBQM tab needs R, and this file loads nothing, so it cannot start R. The hosted demo app can start R in your browser.';
    const { app, r, view, $ } = mount({
      tab: { unavailable: sentence, createConnection: undefined }
    });
    app.loadRaw(STUDY);
    // With nothing R could run the tab asks nothing of the Data tab: no file is its own, and it has no card there.
    expect(view.claims).toBeUndefined();
    expect(view.supports).toBeUndefined();
    expect($('.sva-support')).toBeNull();
    expect($('.sva-drop .sva-drop-note').textContent).toBe(
      'They are read in this browser and sent nowhere.'
    );
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(sentence);
    expect($('.sva-rbqm-start')).toBeNull();
    expect($('.sva-r')).toBeNull();
    // With nothing R could run there is no row of metrics either.
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
    expect(tabCount()).toBe('needs R');
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('APP-RBQM-027: when gsm.viz does not load the tab says the charts are not drawn and why, on the Overview and on a metric’s page, and still marks every metric with what R said of it (#235, #279)', async () => {
    const { app, r, $, $$ } = mount({ answers: RUN_OK, tab: { charts: null } });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    const problem = 'The charts are not drawn: this page serves no gsm.viz.';
    expect($('.sva-rbqm-overview .sva-problem').textContent).toBe(problem);
    expect($('.sva-rbqm-outcome').textContent).toMatch(
      /^R ran 8 of 8 metrics on the 9 loaded files /
    );
    expect(metricItems().map((node) => [node.textContent, node.dataset.state])).toEqual(
      ABBREVIATIONS.map((name) => [name, 'ran'])
    );
    expect($('.sva-rbqm-table')).toBeNull();
    expect($$('.sva-view canvas')).toHaveLength(0);
    // A metric's page says the same, under the metric's name.
    item('kri0001').click();
    await settle();
    expect($('.sva-rbqm-metric .sva-problem').textContent).toBe(problem);
    expect($('.sva-rbqm-metric-name').textContent).toBe('Adverse Event Rate');
    expect($('.sva-rbqm-figures')).toBeNull();
    expect($$('.sva-view canvas')).toHaveLength(0);
  });

  it('APP-RBQM-018: what the tab says starting R downloads is what the page is built to say (#235)', () => {
    expect(OPTIONS.downloads).toBe(RBQM_DOWNLOADS);
    expect(OPTIONS.charts).toEqual({ url: './gsm.viz.js', global: 'gsmViz' });
    expect(OPTIONS.r.attach).toBe('rbqm_attach');
    expect(OPTIONS.r.call).toBe('rbqm_run');
  });

  it('APP-RBQM-048: once R has answered, Run details names beside R’s own versions what is copied in and not installed in R: gsm.kri’s metric workflows and gsm.viz’s charts, each at the version the record of its copy names (#255, #280)', async () => {
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
    const { app, r, view, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    // Before R has answered nothing is said of versions, in the tab or behind its control.
    expect($('.sva-view').textContent).not.toMatch(/gsm\.kri/);
    expect($('.sva-charts').textContent).not.toMatch(/gsm\.kri/);
    expect(view.control(app).state().details).toBeUndefined();
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    $('.sva-rbqm-details').click();
    const { versions } = whole;
    expect(inPanel('Versions').rows).toEqual([
      ['R', `${versions.R}, on webR ${WEBR_VERSION}`],
      [
        'gsm',
        `gsm.core ${versions['gsm.core']}, gsm.mapping ${versions['gsm.mapping']}, ` +
          `gsm.reporting ${versions['gsm.reporting']}, workr ${versions.workr}`
      ],
      ['Metric workflows', `gsm.kri ${kri.version}`],
      ['Charts', `gsm.viz ${viz.version}`],
      ['Snapshot', '2026-10-07']
    ]);
    // R reported no version of gsm.kri: the package is not installed there.
    expect(Object.keys(whole.versions)).not.toContain('gsm.kri');
  });

  it('APP-RBQM-018: what the tab places a reader’s files with is what desktop R read from the workflows (#236)', () => {
    const { needs } = JSON.parse(readFileSync(path.join(root, RBQM_NEEDS.file), 'utf8'));
    expect(OPTIONS.needs).toEqual(needs);
  });
});

// A reader's own files (#236), which come in on the Data tab (#282). The files
// here are the demo study's first rows under other names, a file of no raw
// domain, and File stand-ins that are read as the browser's file reader reads
// them.
describe('the RBQM tab: a reader’s own raw files', () => {
  const named = (file, name) => ({ ...STUDY.find((entry) => entry.name === file), name });
  const NOTES = { name: 'site_notes.csv', text: 'SITE,NOTE\n01,Visited in March\n' };
  const asFile = ({ name, text }) => ({ name, size: text.length, text: async () => text });
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

  it('APP-RBQM-036: before R is started the Data tab’s card says how many metrics the loaded raw files support and each file’s card names the raw domain it was placed in, and no connection is made; with no file there is no card, and the RBQM tab has nowhere to drop one (#236, #281, #282)', () => {
    const { app, r, $, $$ } = mount();
    expect($('.sva-support')).toBeNull();
    // The one drop zone says it takes both kinds of file.
    expect($('.sva-drop .sva-drop-note').textContent).toBe(
      'Study files or gsm raw files. They are read in this browser and sent nowhere.'
    );
    app.select('rbqm');
    expect($('.sva-view .sva-drop')).toBeNull();
    expect($('.sva-view input[type="file"]')).toBeNull();
    app.select('data');
    app.loadRaw(STUDY);
    expect(card().say).toBe('This data supports 8 of 8 metrics.');
    expect(card().items).toEqual(
      whole.status.map((line) => [line.id, 'todo', `${line.metric}: not started`])
    );
    expect(card().key).toEqual(['not started']);
    expect(card().why).toBeNull();
    expect(card().lines).toEqual([]);
    expect($$('.sva-file.sva-raw .sva-tag').map((tag) => [tag.textContent, tag.title])).toEqual(
      STUDY.map((file) => {
        const table = file.name.replace('.csv', '');
        return [`gsm raw file: ${table}, by its name`, `${file.name} is ${table}, by its name.`];
      })
    );
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('APP-RBQM-037: files dropped on the Data tab, or chosen there, are read with the browser’s file reader, and a gsm raw file among them is kept as a raw file: it is not placed in a safety domain or given a mapping; a raw file that is not a CSV, told by its name or by its columns, is named and not kept (#236, #282)', async () => {
    const { app, $, $$ } = mount();
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
    // Two raw files as JSON: one raw by its name, one by its columns.
    const deviations = OPTIONS.needs.raw.find((entry) => entry.table === 'Raw_PD').columns;
    const asJson = JSON.stringify([Object.fromEntries(deviations.map((column) => [column, 'x']))]);
    const drop = new Event('drop');
    drop.dataTransfer = {
      files: [
        ...files,
        asFile({ name: 'Raw_LB.json', text: '[{"a":1}]' }),
        asFile({ name: 'deviations.json', text: asJson })
      ]
    };
    $('.sva-drop').dispatchEvent(drop);
    await settle();
    expect(reads).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    expect(app.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv', 'Raw_AE.csv']);
    expect(app.state.raw[1].text).toBe(STUDY.find((file) => file.name === 'Raw_AE.csv').text);
    expect(app.state.files).toEqual({});
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.study).toBeNull();
    expect($$('.sva-notes .sva-note').map((note) => note.textContent)).toEqual([
      'Raw_LB.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.',
      'deviations.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.'
    ]);
    expect(card().say).toBe('This data supports 2 of 8 metrics.');
    // Choosing files is the same reading: the button opens the browser's own chooser.
    const input = $('.sva-file-input');
    const opened = vi.spyOn(input, 'click').mockImplementation(() => {});
    $('.sva-side [data-action="choose-files"]').click();
    expect(opened).toHaveBeenCalledTimes(1);
    Object.defineProperty(input, 'files', { value: [asFile(named('Raw_PD.csv', 'Raw_PD.csv'))] });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(app.state.raw.map((file) => file.name)).toEqual([
      'Raw_SUBJ.csv',
      'Raw_AE.csv',
      'Raw_PD.csv'
    ]);
    expect(card().say).toBe('This data supports 4 of 8 metrics.');
  });

  it('APP-RBQM-038: R is handed the one file of each raw domain under gsm’s name for it, whatever the reader called it, and no file that was not placed; the Data tab’s card and the RBQM tab’s row say before the press which metrics the files support and of each other which file it needs, in the words R then says (#236, #281)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: TWO });
    const subjects = named('Raw_SUBJ.csv', 'subjects_export.csv');
    const events = named('Raw_AE.csv', 'ae.csv');
    // Kept as raw files, as the loader that keeps a file as it is keeps them.
    app.loadRaw([subjects, NOTES, events]);
    expect($$('.sva-file.sva-raw .sva-tag').map((tag) => [tag.textContent, tag.title])).toEqual([
      [
        'gsm raw file: Raw_SUBJ, by its columns',
        'subjects_export.csv is Raw_SUBJ, by its columns.'
      ],
      [
        'gsm raw file: not recognised',
        'site_notes.csv is not recognised: its name and its columns match no gsm raw domain.'
      ],
      ['gsm raw file: Raw_AE, by its name', 'ae.csv is Raw_AE, by its name.']
    ]);
    const said = partial['two-files'].status;
    const not = said.filter((line) => line.state !== 'ran');
    expect(card().say).toBe('This data supports 2 of 8 metrics.');
    expect(card().items).toEqual(
      said.map((line) => [
        line.id,
        line.state === 'ran' ? 'todo' : 'cannot',
        line.state === 'ran'
          ? `${line.metric}: not started`
          : `${line.metric}: cannot run: missing data. ${line.message}`
      ])
    );
    expect(card().key).toEqual(['not started', 'cannot run: missing data']);
    // R's sentences, behind their title: the reader chose these files.
    expect(card().why).toEqual({
      title: 'Why 6 cannot run',
      open: false,
      items: [...not.map((line) => line.message), partial['two-files'].groups.message]
    });
    app.select('rbqm');
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded files support 2 of 8 metrics. Change the data on the Data tab.'
    );
    // The row says the same of each metric before R has run.
    expect(
      metricItems().map((node) => [node.dataset.item, node.dataset.state, node.title])
    ).toEqual(
      said.map((line) => [
        line.id,
        line.state === 'ran' ? 'todo' : 'cannot',
        line.state === 'ran' ? line.metric : line.message
      ])
    );
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
    // R has answered: the metrics say what R said.
    expect(
      metricItems().map((node) => [node.dataset.item, node.dataset.state, node.title])
    ).toEqual(
      said.map((line) => [
        line.id,
        line.state === 'ran' ? 'ran' : 'cannot',
        line.state === 'ran' ? line.metric : line.message
      ])
    );
    // A file R is not handed changes nothing R ran on: it is kept, and R is not asked again.
    app.loadRaw([{ name: 'more_notes.csv', text: NOTES.text }]);
    await settle();
    expect(connection.runs).toHaveLength(3);
    expect(app.state.raw).toHaveLength(4);
    expect($('.sva-rbqm-table')).not.toBeNull();
    expect($('.sva-rbqm-outcome')).not.toBeNull();
    // Back on the Data tab the card's marks are the row's: two ran.
    app.select('data');
    expect(card().items.map(([, state]) => state)).toEqual(
      said.map((line) => (line.state === 'ran' ? 'ran' : 'cannot'))
    );
    expect(card().key).toEqual(['ran', 'cannot run: missing data']);
  });

  it('APP-RBQM-038: when no kept file is placed in a gsm raw domain the tab says there is nothing for R to run, and its control cannot be pressed (#236)', () => {
    const { app, r, $ } = mount();
    app.select('rbqm');
    app.loadRaw([NOTES]);
    expect($('.sva-rbqm-status').textContent).toBe(NONE_PLACED);
    expect($('.sva-rbqm-supports')).toBeNull();
    expect($('.sva-rbqm-start').disabled).toBe(true);
    app.select('data');
    expect(card().say).toBe('This data supports 0 of 8 metrics.');
    expect(r.createConnection).not.toHaveBeenCalled();
  });

  it('APP-RBQM-034: a file that lacks a column its workflow names says so on its card, and the Data tab’s card says of each metric that needs the column that it does, before the press (#236, #281)', () => {
    const { app, $ } = mount();
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
    const tag = $('.sva-file.sva-raw[data-raw="Raw_AE.csv"] .sva-tag');
    expect(tag.textContent).toBe('gsm raw file: Raw_AE, by its name');
    expect(tag.title).toBe('Raw_AE.csv is Raw_AE, by its name. It lacks the column aeser.');
    expect(card().say).toBe('This data supports 0 of 8 metrics.');
    expect(card().why.items[0]).toBe(
      'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    );
    expect(card().items[0]).toEqual([
      'kri0001',
      'cannot',
      'Adverse Event Rate: cannot run: missing data. Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    ]);
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

  it('APP-RBQM-045: with the study the other charts use loaded and nothing else, the tab says how many metrics it supports and its control can be pressed; the Data tab’s card says the same, which raw tables R makes from the subject-level and the adverse events file, and of each other metric why it cannot run, in the open (#253, #279, #281)', () => {
    const { app, r, $, $$ } = mount();
    app.loadFiles([...PILOT, LABS]);
    const status = pilot.answer.status;
    expect(card().say).toBe('This data supports 3 of 8 metrics.');
    expect(card().lines).toEqual([
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.',
      'adae.csv, the Adverse events file, gives Raw_AE.'
    ]);
    expect(card().items).toEqual(
      status.map((line) => [
        line.id,
        line.state === 'ran' ? 'todo' : 'cannot',
        line.state === 'ran'
          ? `${line.metric}: not started`
          : `${line.metric}: cannot run: missing data. ${line.message}`
      ])
    );
    expect(
      card()
        .items.filter(([, state]) => state === 'todo')
        .map(([id]) => id)
    ).toEqual(RBQM_PILOT.metrics);
    // The study runs as it is, so the reasons are said in the open, in R's words.
    expect(card().why).toEqual({
      title: 'Why 5 cannot run',
      open: true,
      items: status.filter((line) => line.state !== 'ran').map((line) => line.message)
    });
    expect(card().note).toBe(
      'Read from the files’ names and columns. R says the same when it runs.'
    );
    // No raw file is loaded, so no card is one.
    expect($$('.sva-file.sva-raw')).toHaveLength(0);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(NEED);
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded study supports 3 of 8 metrics. Change the data on the Data tab.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(false);
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
    expect(tabCount()).toBe('3 of 8');
    expect(
      metricItems().map((node) => [node.dataset.item, node.dataset.state, node.title])
    ).toEqual(
      pilot.answer.status.map((line) => [
        line.id,
        line.state === 'ran' ? 'ran' : 'cannot',
        line.state === 'ran' ? line.metric : line.message
      ])
    );
    // Run details says what R was handed, as the Data tab's card does.
    $('.sva-rbqm-details').click();
    expect(inPanel('What R was handed').items).toEqual([
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.',
      'adae.csv, the Adverse events file, gives Raw_AE.'
    ]);
    // R's own Groups table is handed to the overview: no stand-in row, so
    // nothing is said of one, and no name where R has none.
    expect(inPanel('Notes')).toBeNull();
    expect(panel().textContent).not.toContain('With no Groups table');
    const overview = globalThis.gsmViz.default.groupOverview.mock.calls.at(-1);
    expect(overview[1]).toHaveLength(51);
    expect(overview[2]).toMatchObject({ GroupLevel: 'Site', groupLabelKey: null });
    expect(overview[3].filter((row) => row.Param === 'ParticipantCount')).toHaveLength(17 + 1 + 1);
  });

  it('APP-RBQM-062: above the site table one line says how many metrics R ran, on what and in how long, and how many need data the study does not have, and leads to the data and to Run details; a loaded demo study is named by its name, there and in Run details (#280)', async () => {
    fakeViz();
    const clock = { now: new Date(2026, 9, 7, 9, 0, 0).getTime() };
    const served = Object.fromEntries(PILOT.map((file) => [`/demo/${file.name}`, file.text]));
    const { app, r, $ } = mount({
      clock,
      answers: {
        rbqm_run: () => {
          clock.now += 2500;
          return { status: 'ok', form: 'browser', value: pilot.answer };
        }
      },
      page: {
        demo: {
          base: '/demo/',
          studies: [{ id: 'pilot', label: 'Pilot study', files: PILOT.map((file) => file.name) }]
        },
        fetchText: (url) =>
          url in served ? Promise.resolve(served[url]) : Promise.reject(new Error(`no ${url}`))
      }
    });
    await settle();
    expect(app.state.study).toBe('pilot');
    app.select('rbqm');
    // Before R: a demo study is a study, and a reader's own files are files.
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded study supports 3 of 8 metrics. Change the data on the Data tab.'
    );
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    const line = $('p.sva-rbqm-outcome.sva-rbqm-status');
    expect(line.getAttribute('role')).toBe('status');
    expect(line.textContent).toBe(
      'R ran 3 of 8 metrics on the Pilot study in 2.5 seconds. The other 5 need data it does not have: change the data on the Data tab. Run details'
    );
    // The two things a reader can do about it are a link and a button in the line.
    expect([...line.querySelectorAll('button')].map((node) => [node.className, node.type])).toEqual(
      [
        ['sva-link sva-rbqm-data', 'button'],
        ['sva-link sva-rbqm-details', 'button']
      ]
    );
    // It is one line: the versions, the date and R's notes are not in it.
    expect(line.textContent).not.toMatch(/gsm\.|snapshot|2026|webR/i);
    $('.sva-rbqm-details').click();
    expect(panel().querySelector(':scope > .sva-r-text').textContent).toBe(
      'It ran 3 of 8 metrics on the Pilot study. About 55 MB was downloaded, once; the study’s data stays here.'
    );
    expect(inPanel('Steps').steps.at(-1)).toEqual(['Ran the workflows', '2.5 s']);
  });

  it('APP-RBQM-045: a mapping changed on the Data tab is a different study to R: once R is up it is run again at once, and with the site not mapped the row says of each metric the column no column of the file is mapped to (#253, #279)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: ANSWERS });
    app.loadFiles(PILOT);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(tabCount()).toBe('3 of 8');
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
    expect(tabCount()).toBe('0 of 8');
    expect(item('kri0001').title).toBe(
      'Adverse Event Rate needs the column SITEID, which no column of adsl.csv is mapped to.'
    );
    expect(item('kri0001').getAttribute('aria-label')).toBe('Adverse Event Rate: did not run');
    expect(metricItems().map((node) => node.dataset.state)).toEqual(Array(8).fill('cannot'));
    // Mapped again, it is the study it was, and R runs it a third time.
    app.select('data');
    expect(card().lines[0]).toBe(
      'adsl.csv, the Subject-level file, gives Raw_STUDY. It has no column mapped to SITEID, ' +
        'so Raw_SITE, Raw_STUDCOMP and Raw_SUBJ are not made. Map it on the Data tab.'
    );
    expect(card().say).toBe('This data supports 0 of 8 metrics.');
    app.setColumn('subject', 'SITEID', 'SITEID');
    app.select('rbqm');
    await settle();
    await connection.letGo();
    expect(connection.runs).toHaveLength(5);
    expect(tabCount()).toBe('3 of 8');
  });

  it('APP-RBQM-045: a study with no subject-level or adverse events file has nothing for R to run, and the tab says which files the metrics run on; gsm raw files loaded beside a study are used as they are, and the study’s files only for the raw tables that are not loaded, as the Data tab’s card says (#253, #281)', () => {
    const { app, $, $$ } = mount();
    app.loadFiles([LABS]);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(NONE_PLACED);
    expect($('.sva-rbqm-supports')).toBeNull();
    expect($('.sva-rbqm-start').disabled).toBe(true);
    app.reset();
    app.loadFiles(PILOT);
    app.loadRaw([STUDY.find((file) => file.name === 'Raw_AE.csv')]);
    // The raw file is used as it is, and only the subject-level file stands in for raw tables.
    expect(card().say).toBe('This data supports 3 of 8 metrics.');
    expect(card().lines).toEqual([
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.'
    ]);
    expect($$('.sva-file.sva-raw .sva-tag').map((node) => node.textContent)).toEqual([
      'gsm raw file: Raw_AE, by its name'
    ]);
    // With raw files loaded the reasons wait behind their title.
    expect(card().why.open).toBe(false);
    app.select('rbqm');
    expect($('.sva-rbqm-status').textContent).toBe(NEED);
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded files support 3 of 8 metrics. Change the data on the Data tab.'
    );
    expect($('.sva-rbqm-start').disabled).toBe(false);
  });
});

describe('what the review of the v1.10.0 release candidate found (#258)', () => {
  const pilotExpected = JSON.parse(readFileSync(path.join(root, RBQM_PILOT.expected), 'utf8'));

  it('APP-RBQM-049: what R warned of is listed in Run details, in R’s words; a run with no warning says there was none (#280)', async () => {
    fakeViz();
    const warned = pilotExpected.some_sites_blank.warnings;
    let run = 0;
    const { app, r, $ } = mount({
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
    openDetails();
    expect(inPanel('Warnings from R').items).toEqual([
      "R warned: 26 cases of NA's in GroupID, cases are removed in output."
    ]);
    // The metrics still ran, and say so.
    expect(tabCount()).toBe('8 of 8');
    runAgain();
    await connection.letGo();
    openDetails();
    expect(inPanel('Warnings from R').items).toEqual(['None.']);
  });

  it('APP-RBQM-051: the tab’s count follows the loaded study while another tab is open: after the study is cleared or changed there it reads not run, not the last study’s count; opened with nothing loaded the control offers nothing to press and no run (#280)', async () => {
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(tabCount()).toBe('8 of 8');
    app.select('data');
    expect(tabCount()).toBe('8 of 8');
    app.reset();
    expect(tabCount()).toBe('not run');
    app.select('rbqm');
    await settle();
    expect(tabCount()).toBe('not run');
    // R is up with nothing to run on: the chip's panel says so, and offers no run.
    expect($('.sva-rbqm-start')).toBeNull();
    expect(control().dataset.phase).toBe('ready');
    expect(openDetails().querySelector('.sva-r-text').textContent).toBe(
      'R is running, and nothing has been run on what is loaded now.'
    );
    expect(panel().querySelector('.sva-r-actions')).toBeNull();
    expect($$('.sva-charts button.sva-action, .sva-r-under button.sva-action')).toEqual([]);
    expect($('.sva-rbqm-status').textContent).toBe(NO_FILES);
    expect($('.sva-rbqm-outcome')).toBeNull();
    expect($('.sva-rbqm-table')).toBeNull();
    // Nothing was run on nothing.
    expect(connection.runs.filter((run) => run.name === 'rbqm_run')).toHaveLength(1);
  });

  it('APP-RBQM-051: how long it was from the press to the charts is said only of the press that started R: when the study is cleared while R starts, a later press runs the metrics and Run details says how long the run took and nothing of the start (#280)', async () => {
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
    // R is up and nothing has run: the tab points at the chip, where the run is offered.
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is ready. Run the metrics from the R chip, at the top right.'
    );
    const run = openDetails().querySelector('.sva-r-actions .sva-action');
    expect(run.textContent).toBe('Run the metrics');
    run.click();
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 8 of 8 metrics on the 9 loaded files in /
    );
    openDetails();
    expect(inPanel('Steps').steps).toEqual([['Ran the workflows', '0 s']]);
    expect(inPanel('Steps').text).toEqual([ONLY_LAST]);
    expect(panel().textContent).not.toContain('from the press to the charts');
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
      runAgain();
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
    // The run stopped: Run again is the control's own button.
    expect($('.sva-rbqm-start').textContent).toBe('Run again');
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

  it('APP-RBQM-024: when R comes up and its packages cannot be attached R is not taken as up: the control says so and offers to try again, and trying again closes that R and makes one fresh connection, started from the beginning (#258)', async () => {
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
    expect($('.sva-rbqm-start').textContent).toBe('Try again');
    expect($('.sva-r-say').textContent).toBe('R did not start');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R did not start, so no metric was run. Try again, at the top right.'
    );
    $('.sva-r-why').click();
    expect($('.sva-r-panel > .sva-r-text').textContent).toMatch(
      /^R started, but gsm’s packages did not load in it\. /
    );
    expect($('.sva-r-more .sva-r-text').textContent).toBe(
      'R said: there is no package called ‘gsm.core’.'
    );
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
    expect(tabCount()).toBe('7 of 8');
  });

  it('APP-RBQM-019: the control counts the seconds while R starts and runs, one count at a time, and stops when the run ends: the tab keeps no clock of its own, and nothing the press set going is left ticking (#258, #280)', async () => {
    vi.useFakeTimers();
    fakeViz();
    const { app, r, clock, $ } = mount({ answers: RUN_OK });
    vi.setSystemTime(clock.now);
    app.loadRaw(STUDY);
    app.select('rbqm');
    // What the page itself left for the next moment is let run first.
    vi.advanceTimersByTime(1);
    const idle = vi.getTimerCount();
    expect(idle).toBe(0);
    // The control's count is the one thing here that ticks once a second.
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
    expect($('.sva-r-meta').textContent).toBe('0 s');
    clock.now += 7000;
    vi.advanceTimersByTime(7000);
    expect($('.sva-r-meta').textContent).toBe('7 s');
    // The tab's own line says no seconds: the count is the control's.
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is starting. The metrics run by themselves when it is ready.'
    );
    // The control is drawn again at each step, and counts on from the press.
    connection.options.onStage('packages');
    expect(ticking()).toHaveLength(1);
    expect($('.sva-r-meta').textContent).toBe('7 s');
    for (let step = 0; step < 2; step += 1) {
      await connection.letGo();
      expect(ticking()).toHaveLength(1);
    }
    clock.now += 3000;
    vi.advanceTimersByTime(3000);
    expect($('.sva-r-meta').textContent).toBe('10 s');
    await connection.letGo();
    expect(ticking()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(idle);
    expect($('.sva-r-meta')).toBeNull();
    const said = $('.sva-view').textContent;
    clock.now += 60000;
    vi.advanceTimersByTime(5000);
    expect($('.sva-view').textContent).toBe(said);
    // The tab itself sets no clock going.
    const source = readFileSync(path.join(root, 'src/app/rbqm-view.js'), 'utf8');
    expect(source).not.toMatch(/setInterval/);
  });

  // An R that stops answering (#261): the tab gives up after a stated time.
  const LIMITS = { start: 600, attach: 180, run: 300 };
  const silentAt = (stopsAt) => {
    fakeViz();
    const closed = [];
    const inner = fakeR(RUN_OK);
    const mounted = mount({
      tab: {
        limits: LIMITS,
        createConnection: (options) => {
          const connection = inner.createConnection(options);
          connection.close = vi.fn(async () => closed.push(inner.made.indexOf(connection)));
          return connection;
        }
      }
    });
    return { ...mounted, inner, closed, stopsAt };
  };
  const turns = async () => {
    for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
  };

  it.each([
    ['start', 0, 'it was starting', '10 minutes'],
    ['attach', 1, 'it was loading gsm’s packages', '3 minutes'],
    ['run', 2, 'it was running the workflows', '5 minutes']
  ])(
    'APP-R-046: an R that never answers while %s is given up on at that step’s limit: the control and the tab say R stopped answering, that R is closed without waiting on it, and Try again starts a fresh one from the beginning (#261)',
    async (when, answered, doing, waited) => {
      vi.useFakeTimers();
      const { app, view, inner, closed, $ } = silentAt(when);
      app.loadRaw(STUDY);
      app.select('rbqm');
      // What the page itself left for the next moment is let run first.
      vi.advanceTimersByTime(1);
      const idle = vi.getTimerCount();
      expect(idle).toBe(0);
      $('.sva-rbqm-start').click();
      // The steps before this one answer; this one never does.
      for (let step = 0; step < answered; step += 1) await inner.made[0].letGo();
      const busyAs = view.state().phase;
      expect(['starting', 'attaching', 'running']).toContain(busyAs);
      // One second short of the limit, the tab is still waiting.
      await vi.advanceTimersByTimeAsync((LIMITS[when] - 1) * 1000);
      expect(view.state().phase).toBe(busyAs);
      expect(closed).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      await turns();
      expect(view.state()).toMatchObject({ phase: 'failed', up: false });
      // Nothing the press set going is left counting.
      vi.advanceTimersByTime(1);
      expect(vi.getTimerCount()).toBe(idle);
      expect($('.sva-r-meta')).toBeNull();
      expect($('.sva-r-say').textContent).toBe('R stopped answering');
      expect($('.sva-rbqm-status').textContent).toBe(
        'R stopped answering, so no metric was run. Try again, at the top right.'
      );
      expect($('.sva-rbqm-start').textContent).toBe('Try again');
      expect($('.sva-rbqm-start').disabled).toBe(false);
      expect($('.sva-rbqm-steps')).toBeNull();
      expect($('.sva-rbqm-outcome')).toBeNull();
      expect($('.sva-rbqm-table')).toBeNull();
      expect(tabCount()).toBe('no R');
      $('.sva-r-why').click();
      expect($('.sva-r-panel > .sva-r-text').textContent).toBe(
        `R gave no answer for ${waited} while ${doing}, so it was closed. Try again; if it stops again, reload the page. No metric was run.`
      );
      // That R was closed, once, though it never answered.
      expect(closed).toEqual([0]);
      // Try again: one fresh R, started from the beginning, and the run it was asked for.
      $('.sva-rbqm-start').click();
      await turns();
      expect(inner.made).toHaveLength(2);
      for (let step = 0; step < 3; step += 1) await inner.made[1].letGo();
      expect(inner.made[1].runs.map((run) => run.name)).toEqual([
        'Sys.time',
        'rbqm_attach',
        'rbqm_run'
      ]);
      expect(view.state()).toMatchObject({ phase: 'done', up: true });
      expect(closed).toEqual([0]);
      // An answer the first R gives late changes nothing.
      if (inner.made[0].waiting.length) await inner.made[0].letGo();
      expect(view.state().phase).toBe('done');
    }
  );

  it('APP-R-047: an R that is only slow, answering within each step’s limit, is unaffected: nothing is closed and the run ends as it always did; a tab given no limit waits as long as R takes (#261)', async () => {
    vi.useFakeTimers();
    const { app, view, inner, closed, $ } = silentAt(null);
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (const when of ['start', 'attach', 'run']) {
      await vi.advanceTimersByTimeAsync((LIMITS[when] - 1) * 1000);
      await inner.made[0].letGo();
    }
    expect(view.state()).toMatchObject({ phase: 'done', up: true });
    expect(closed).toEqual([]);
    // No limit is left running once R has answered.
    await vi.advanceTimersByTimeAsync(3600 * 1000);
    expect(view.state().phase).toBe('done');
    // The control is the quiet chip of an R that is ready, not a failure.
    expect(control().dataset.phase).toBe('ready');
    expect($('.sva-r-why')).toBeNull();
    expect($('.sva-rbqm-problem')).toBeNull();

    fakeViz();
    const unlimited = mount({ answers: RUN_OK, tab: { limits: {} } });
    unlimited.app.loadRaw(STUDY);
    unlimited.app.select('rbqm');
    unlimited.$('.sva-rbqm-start').click();
    await vi.advanceTimersByTimeAsync(3600 * 1000);
    expect(unlimited.view.state().phase).toBe('starting');
    for (let step = 0; step < 3; step += 1) await unlimited.r.made[0].letGo();
    expect(unlimited.view.state().phase).toBe('done');
  });
});

// The tab's own row, its pages and what is behind its control (#278, #279,
// #280, obot.roadmap#405).
describe('the RBQM tab: its footnote (#271)', () => {
  it('APP-RBQM-079: the tab ends with one link, "gsm.kri documentation", to gsm.kri’s own site, under the tab’s name, before R is started and after a run, on the Overview page and on a metric’s; a page that cannot start R has it too', async () => {
    const read = ($) => [
      $('.sva-chart-links').textContent,
      ...[...document.querySelectorAll('.sva-chart-links a')].map((a) => [
        a.dataset.link,
        a.getAttribute('href'),
        a.getAttribute('target'),
        a.getAttribute('rel')
      ])
    ];
    const said = [
      'RBQM: gsm.kri documentation',
      ['docs', 'https://gilead-public.github.io/gsm.kri/', '_blank', 'noopener']
    ];
    fakeViz();
    const { app, r, $, $$ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    expect(read($)).toEqual(said);
    // After everything the tab draws, and once only.
    expect($('.sva-chart-links').previousElementSibling).toBe($('.sva-view'));
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect($('.sva-rbqm-table')).not.toBeNull();
    expect(read($)).toEqual(said);
    $('.sva-view-item[data-item="kri0001"]').click();
    expect(read($)).toEqual(said);
    expect($$('.sva-chart-links')).toHaveLength(1);

    const without = mount({ tab: { unavailable: 'This file cannot start R.' } });
    without.app.select('rbqm');
    expect(read(without.$)).toEqual(said);
  });
});

describe('the RBQM tab: a row of its own, one page at a time', () => {
  const noLab = STUDY.filter((file) => file.name !== 'Raw_LB.csv');
  const LAB_NEEDS = 'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.';
  const byFiles = {
    rbqm_run: (request) => ({
      status: 'ok',
      form: 'browser',
      value: Object.keys(request.files).length === 9 ? whole : noLabs
    })
  };
  const follow = (hash) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const started = async ({ files = STUDY, ...options } = {}) => {
    const calls = fakeViz();
    const mounted = mount({ answers: RUN_OK, ...options });
    mounted.app.loadRaw(files);
    mounted.app.select('rbqm');
    mounted.$('.sva-rbqm-start').click();
    const [connection] = mounted.r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    return { ...mounted, calls, connection };
  };

  it('APP-RBQM-054: before R is started the tab’s row lists Overview and then every metric by its abbreviation, each marked not started or, where the loaded files cannot support it, as one that cannot run, with the metric’s name and its state as its accessible name; nothing is asked of R (#279)', () => {
    const { app, r, $$ } = mount();
    app.loadRaw(noLab);
    app.select('rbqm');
    const items = $$('.sva-charts > .sva-group.sva-view-items > button.sva-item.sva-view-item');
    expect(
      items.map((node) => [node.dataset.item, node.querySelector('.sva-item-title').textContent])
    ).toEqual([
      ['', 'Overview'],
      ...RBQM_TAB.metrics.map((id, index) => [id, ABBREVIATIONS[index]])
    ]);
    expect(items.every((node) => node.type === 'button' && node.dataset.view === 'rbqm')).toBe(
      true
    );
    // Overview is the open page. It is no metric: it keeps a hex and has no state.
    const [overview] = items;
    expect(overview.getAttribute('aria-current')).toBe('page');
    expect(overview.querySelector('.sva-hex')).not.toBeNull();
    expect(overview.querySelector('svg')).toBeNull();
    expect(overview.dataset.state).toBeUndefined();
    expect(overview.getAttribute('aria-label')).toBeNull();
    // A metric's state is in its mark, in a word of its own and in its name for a screen reader.
    const names = whole.status.map((line) => line.metric);
    expect(names.slice(0, 2)).toEqual(['Adverse Event Rate', 'Serious Adverse Event Rate']);
    expect(
      metricItems().map((node) => [
        node.dataset.state,
        node.getAttribute('aria-label'),
        node.title,
        node.querySelector('svg').getAttribute('class'),
        node.querySelector('svg').getAttribute('aria-hidden')
      ])
    ).toEqual(
      names.map((name, index) =>
        RBQM_TAB.metrics[index] === 'kri0005'
          ? ['cannot', `${name}: cannot run`, LAB_NEEDS, 'sva-ico sva-ico-cannot', 'true']
          : ['todo', `${name}: not started`, name, 'sva-ico sva-ico-todo', 'true']
      )
    );
    expect(metricItems().every((node) => !node.querySelector('.sva-hex'))).toBe(true);
    expect(metricItems().every((node) => !node.hasAttribute('aria-current'))).toBe(true);
    // With nothing loaded no metric can run, and each says what it needs.
    app.reset();
    app.select('rbqm');
    expect(metricItems().map((node) => node.dataset.state)).toEqual(Array(8).fill('cannot'));
    expect(item('kri0001').title).toBe(
      'Adverse Event Rate needs Raw_AE.csv and Raw_SUBJ.csv, which are not loaded.'
    );
    expect(item('kri0001').getAttribute('aria-label')).toBe('Adverse Event Rate: cannot run');
    expect(item('kri0012').title).toBe(
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
  });

  it('APP-RBQM-055: while R starts and runs every metric the loaded files support is marked running, and once R has answered each is marked ran or did not run from R’s own answer, in its mark and in its accessible name (#279)', async () => {
    fakeViz();
    // The files support all eight; R then says one of them did not run.
    const { app, r, view, $ } = mount({
      answers: { rbqm_run: () => ({ status: 'ok', value: noLabs }) }
    });
    app.loadRaw(STUDY);
    app.select('rbqm');
    const states = () => metricItems().map((node) => node.dataset.state);
    expect(states()).toEqual(Array(8).fill('todo'));
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    const running = () => {
      expect(states()).toEqual(Array(8).fill('running'));
      expect(item('kri0001').getAttribute('aria-label')).toBe('Adverse Event Rate: running');
      expect(item('kri0001').querySelector('svg').getAttribute('class')).toBe(
        'sva-ico sva-ico-running'
      );
    };
    running();
    connection.options.onStage('packages');
    running();
    await connection.letGo();
    running();
    await connection.letGo();
    running();
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect(
      metricItems().map((node) => [
        node.dataset.item,
        node.dataset.state,
        node.getAttribute('aria-label'),
        node.querySelector('svg').getAttribute('class')
      ])
    ).toEqual(
      noLabs.status.map((line) =>
        line.state === 'ran'
          ? [line.id, 'ran', `${line.metric}: ran`, 'sva-ico sva-ico-ran']
          : [line.id, 'cannot', `${line.metric}: did not run`, 'sva-ico sva-ico-cannot']
      )
    );
    expect(states().filter((state) => state === 'cannot')).toHaveLength(1);
    expect(item('kri0005').title).toBe(LAB_NEEDS);
    expect(item('kri0001').title).toBe('Adverse Event Rate');
    // What the tab holds, for the tests: no metric is chosen in it any more.
    expect(Object.keys(view.state())).toEqual(['phase', 'step', 'up', 'result', 'failure']);
  });

  it('APP-RBQM-056: every item of the row has an address: opening a metric writes #rbqm/ and its id, marks its item as the open one and draws its page, Overview is #rbqm, and an address typed or followed opens the page it names (#279)', () => {
    const { app, $, $$ } = mount();
    app.loadRaw(STUDY);
    app.select('rbqm');
    expect(window.location.hash).toBe('#rbqm');
    expect(app.state.item).toBeNull();
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    item('kri0001').click();
    expect(window.location.hash).toBe('#rbqm/kri0001');
    expect(app.state).toMatchObject({ selected: 'rbqm', item: 'kri0001' });
    expect($$('.sva-view-item[aria-current]').map((node) => node.dataset.item)).toEqual([
      'kri0001'
    ]);
    expect($('.sva-tab[data-tab="rbqm"]').getAttribute('aria-pressed')).toBe('true');
    expect($('.sva-rbqm-page').dataset.page).toBe('metric');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Adverse Event Rate');
    // An address typed, or reached by back and forward.
    follow('#rbqm/kri0012');
    expect(app.state.item).toBe('kri0012');
    expect($$('.sva-view-item[aria-current]').map((node) => node.dataset.item)).toEqual([
      'kri0012'
    ]);
    expect($('.sva-rbqm-metric-name').textContent).toBe('Screen Failure Rate');
    // The app's own way to open one.
    app.select('rbqm', 'kri0003');
    expect(window.location.hash).toBe('#rbqm/kri0003');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Non-Important Protocol Deviation Rate');
    // Overview has the tab's own address.
    item('').click();
    expect(window.location.hash).toBe('#rbqm');
    expect(app.state.item).toBeNull();
    expect($$('.sva-view-item[aria-current]').map((node) => node.dataset.item)).toEqual(['']);
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    // From another tab the address opens the tab and the metric at once.
    app.select('data');
    follow('#rbqm/kri0002');
    expect(app.state).toMatchObject({ selected: 'rbqm', item: 'kri0002' });
    expect($('.sva-rbqm-metric-name').textContent).toBe('Serious Adverse Event Rate');
  });

  it('APP-RBQM-057: an address that names an item the tab does not list opens Overview and is written as #rbqm, and an item named for the Data tab or for a chart is dropped (#279)', () => {
    const { app, $ } = mount();
    app.loadRaw(STUDY);
    app.select('rbqm', 'kri9999');
    expect(app.state).toMatchObject({ selected: 'rbqm', item: null });
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    expect(item('').getAttribute('aria-current')).toBe('page');
    // From a metric's page, an address followed to an item that is not there.
    item('kri0001').click();
    follow('#rbqm/kri0001/more');
    expect(app.state.item).toBeNull();
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    // An id is matched whole, as it is written.
    for (const wrong of ['KRI0001', 'kri0001 ', 'AE', 'Overview']) {
      app.select('rbqm', wrong);
      expect(app.state.item, wrong).toBeNull();
    }
    // Only a view has items.
    app.select('data', 'kri0001');
    expect(app.state).toMatchObject({ selected: 'data', item: null });
    expect(window.location.hash).toBe('#data');
    app.select('histogram', 'kri0001');
    expect(app.state).toMatchObject({ selected: 'histogram', item: null });
    expect(window.location.hash).toBe('#histogram');
  });

  it('APP-RBQM-058: clicking a site’s cell of a metric in the overview opens that metric’s page, at its address; a cell of a metric R’s tables do not hold, and a site’s own name, open nothing (#278, #279)', async () => {
    const { app, calls, connection, $ } = await started();
    const [overview] = calls;
    overview.rest[1].metricClickCallback({ MetricID: 'Analysis_kri0003', GroupID: '0X001' });
    expect(window.location.hash).toBe('#rbqm/kri0003');
    expect(app.state.item).toBe('kri0003');
    expect($('.sva-rbqm-page').dataset.page).toBe('metric');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Non-Important Protocol Deviation Rate');
    expect(item('kri0003').getAttribute('aria-current')).toBe('page');
    const scatter = calls.find((call) => call.name === 'scatterPlot');
    expect(scatter.rest[0]).toEqual(
      whole.Results.filter((row) => row.MetricID === 'Analysis_kri0003')
    );
    // Back on the Overview, a cell the tab cannot place opens nothing.
    item('').click();
    const again = calls.at(-1);
    expect(again.name).toBe('groupOverview');
    for (const datum of [{ MetricID: 'Analysis_kri9999' }, {}, null, undefined]) {
      again.rest[1].metricClickCallback(datum);
      expect(window.location.hash).toBe('#rbqm');
    }
    again.rest[1].groupClickCallback({ GroupID: '0X001' });
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-rbqm-page').dataset.page).toBe('overview');
    // The key beside the table says a cell can be clicked.
    expect($('.sva-rbqm-key p').textContent).toBe(
      'Hover a cell for its numbers. Click one to open that metric.'
    );
    // Opening a page asks R for nothing.
    expect(connection.runs.map((run) => run.name)).toEqual(['Sys.time', 'rbqm_attach', 'rbqm_run']);
  });

  it('APP-RBQM-059: the tab shows one page at a time: the Overview holds the site table, a count of its sites and the key to its flags and no metric’s chart, and a metric’s page holds that metric’s name, its state and its two charts and no table (#278, #279)', async () => {
    const { calls, $, $$ } = await started();
    expect($$('.sva-view .sva-rbqm-page')).toHaveLength(1);
    expect($('section.sva-rbqm-section.sva-rbqm-page.sva-rbqm-overview').dataset.page).toBe(
      'overview'
    );
    expect($('.sva-rbqm-headrow h2.sva-rbqm-heading').textContent).toBe('Site overview');
    // The stand-in table has no rows to measure, so the sites are counted from R's rows.
    const sites = new Set(whole.Results.map((row) => row.GroupID)).size;
    expect(sites).toBe(150);
    expect($('.sva-rbqm-headrow .sva-rbqm-count').textContent).toBe('150 sites, 12 shown here');
    expect($('.sva-rbqm-ov > .sva-rbqm-table.sva-rbqm-fit > table')).not.toBeNull();
    expect(
      $$('.sva-rbqm-ov > aside.sva-rbqm-key li').map((node) => [
        node.querySelector('svg').getAttribute('class'),
        node.querySelector('svg').getAttribute('aria-hidden'),
        node.textContent
      ])
    ).toEqual([
      ['sva-ico sva-ico-flag-ok sva-flag-green', 'true', 'within limits'],
      [
        'sva-ico sva-ico-flag-one sva-flag-amber',
        'true',
        'amber flag: high, or low when it points down'
      ],
      [
        'sva-ico sva-ico-flag-two sva-flag-red',
        'true',
        'red flag: high, or low when it points down'
      ],
      ['sva-ico sva-ico-flag-none sva-flag-none', 'true', 'no score, so no flag']
    ]);
    // No metric's chart, and no buttons in the page to choose one: the row does that.
    expect($('.sva-rbqm-figures')).toBeNull();
    expect($('.sva-rbqm-metric-name')).toBeNull();
    expect($$('.sva-view canvas')).toHaveLength(0);
    expect($('.sva-rbqm-choice')).toBeNull();
    expect(calls.map((call) => call.name)).toEqual(['groupOverview']);

    item('kri0002').click();
    expect($$('.sva-view .sva-rbqm-page')).toHaveLength(1);
    expect($('section.sva-rbqm-section.sva-rbqm-page.sva-rbqm-metric').dataset.page).toBe('metric');
    expect($('h2.sva-rbqm-heading.sva-rbqm-metric-name').textContent).toBe(
      'Serious Adverse Event Rate'
    );
    expect($('.sva-rbqm-count').textContent).toBe('SAE, ran');
    expect($$('.sva-rbqm-metric .sva-rbqm-figures > figure.sva-rbqm-figure canvas')).toHaveLength(
      2
    );
    expect($('.sva-rbqm-scatter canvas')).not.toBeNull();
    expect($('.sva-rbqm-bar canvas')).not.toBeNull();
    expect($('.sva-rbqm-table')).toBeNull();
    expect($('.sva-rbqm-key')).toBeNull();
    expect($('.sva-rbqm-outcome')).toBeNull();
    expect(calls.slice(1).map((call) => call.name)).toEqual(['scatterPlot', 'barChart']);
    // Back on the Overview the metric's charts are torn down, and the table drawn again.
    item('').click();
    expect(calls.slice(1, 3).map((call) => call.destroyed)).toEqual([true, true]);
    expect($$('.sva-view canvas')).toHaveLength(0);
    expect(calls.slice(3).map((call) => call.name)).toEqual(['groupOverview']);
    expect($('.sva-rbqm-table > table')).not.toBeNull();
  });

  it('APP-RBQM-059: the count beside the heading is of the rows gsm.viz drew: a table short enough to show whole says how many sites and no more (#278)', async () => {
    fakeViz();
    const rows = (count) => (element) => {
      const table = document.createElement('table');
      const body = table.createTBody();
      for (let index = 0; index < count; index += 1) body.insertRow();
      element.append(table);
      return null;
    };
    globalThis.gsmViz.default.groupOverview = vi.fn(rows(5));
    const { app, r, $ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    for (let step = 0; step < 3; step += 1) await r.made[0].letGo();
    expect($('.sva-rbqm-count').textContent).toBe('5 sites');
    globalThis.gsmViz.default.groupOverview = vi.fn(rows(1));
    app.select('rbqm');
    expect($('.sva-rbqm-count').textContent).toBe('1 site');
    globalThis.gsmViz.default.groupOverview = vi.fn(rows(13));
    app.select('rbqm');
    expect($('.sva-rbqm-count').textContent).toBe('13 sites, 12 shown here');
  });

  it('APP-RBQM-060: the tab has no place to load a file, on the Overview page or on a metric’s, before, during and after a run; each of its lines that say to change the data opens the Data tab, where every file comes in (#279, #282)', async () => {
    fakeViz();
    const { app, r, view, $ } = mount({
      answers: { rbqm_run: () => ({ status: 'ok', value: noLabs }) }
    });
    app.loadRaw(noLab);
    app.select('rbqm');
    const nowhere = () => {
      for (const id of ['', 'kri0001', 'kri0005']) {
        item(id).click();
        expect($('.sva-rbqm-page').dataset.page).toBe(id ? 'metric' : 'overview');
        expect($('.sva-view .sva-drop')).toBeNull();
        expect($('.sva-view input[type="file"]')).toBeNull();
        expect($('.sva-view details')).toBeNull();
      }
      item('').click();
    };
    // The link leads to the Data tab, with its drop zone and the tab's card.
    const leads = (link) => {
      expect(link.tagName).toBe('BUTTON');
      link.click();
      expect(app.state.selected).toBe('data');
      expect(window.location.hash).toBe('#data');
      expect($('.sva-data .sva-drop')).not.toBeNull();
      expect($('.sva-data .sva-support[data-support="rbqm"]')).not.toBeNull();
      app.select('rbqm');
    };
    nowhere();
    // Before a run, the line that counts the metrics leads there.
    expect($('.sva-rbqm-supports .sva-rbqm-data').textContent).toBe(
      'Change the data on the Data tab.'
    );
    leads($('.sva-rbqm-supports .sva-rbqm-data'));

    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    expect(view.state().phase).toBe('starting');
    nowhere();
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(view.state().phase).toBe('done');
    nowhere();
    // Once R has answered, the line above the table leads there.
    expect($('.sva-rbqm-outcome .sva-rbqm-data').textContent).toBe(
      'change the data on the Data tab'
    );
    leads($('.sva-rbqm-outcome .sva-rbqm-data'));
    // And so does the page of a metric that did not run.
    item('kri0005').click();
    leads($('.sva-rbqm-whybox .sva-rbqm-data'));
    // A file loaded there is taken as it always was: R is up, so it is run at once.
    app.select('data');
    const drop = new Event('drop');
    const lab = STUDY.find((file) => file.name === 'Raw_LB.csv');
    drop.dataTransfer = {
      files: [{ name: lab.name, size: lab.text.length, text: async () => lab.text }]
    };
    $('.sva-data .sva-drop').dispatchEvent(drop);
    await settle();
    expect(app.state.raw.map((file) => file.name)).toContain('Raw_LB.csv');
    app.select('rbqm');
    await settle();
    expect(connection.runs.filter((run) => run.name === 'rbqm_run')).toHaveLength(2);
  });

  it('APP-RBQM-061: while R starts and runs the tab lists six steps, each marked done, under way or to come, and only the fourth is called the long one; the control names the same step; the last begins when the connection says the study’s files are written, and a run in which it never says so still ends in results (#280)', async () => {
    fakeViz();
    const { app, r, view, $, $$ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm');
    expect($('.sva-rbqm-steps')).toBeNull();
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    expect($$('.sva-rbqm-page > ol.sva-rbqm-steps > li').map((node) => node.textContent)).toEqual([
      'Downloading R',
      'Installing R packages',
      'Fetching gsm’s workflow files',
      'Loading gsm’s packages, the long one',
      'Reading the study',
      'Running the workflows'
    ]);
    const marks = () =>
      $$('.sva-rbqm-steps li').map((node) =>
        node.querySelector('svg[aria-hidden="true"]').getAttribute('class')
      );
    const mark = {
      done: 'sva-ico sva-ico-ran',
      now: 'sva-ico sva-ico-running',
      todo: 'sva-ico sva-ico-todo'
    };
    const isAt = (step, said) => {
      expect(stepStates()).toEqual(at(step));
      expect(marks()).toEqual(at(step).map((state) => mark[state]));
      expect($('.sva-r-say').textContent).toBe(said);
      expect($('.sva-segs').getAttribute('aria-label')).toBe(`Step ${step} of 6`);
      expect($$('.sva-segs i').map((node) => node.className)).toEqual(
        at(step).map((state) => ({ done: 'sva-done', now: 'sva-now', todo: '' })[state])
      );
    };
    isAt(1, '1 of 6 · Downloading R');
    connection.options.onStage('packages');
    isAt(2, '2 of 6 · Installing R packages');
    connection.options.onStage('files');
    isAt(3, '3 of 6 · Fetching gsm’s workflow files');
    connection.options.onStage('source');
    isAt(3, '3 of 6 · Fetching gsm’s workflow files');
    await connection.letGo();
    isAt(4, '4 of 6 · Loading gsm’s packages');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is starting. The metrics run by themselves when it is ready.'
    );
    await connection.letGo();
    isAt(5, '5 of 6 · Reading the study');
    expect(view.state().step).toBe('read');
    // R is up: what is left is the run.
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is running the metrics. They appear here when it is done.'
    );
    // The connection says the run's files are written: R is at work on them.
    expect(typeof connection.runs.at(-1).request.onFiles).toBe('function');
    connection.wrote();
    isAt(6, '6 of 6 · Running the workflows');
    expect(view.state().step).toBe('run');
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-steps')).toBeNull();
    expect($('.sva-segs')).toBeNull();
    // Run again: R is up, so the first four are done. This time the connection
    // never says the files are written, and the run ends in results all the same.
    runAgain();
    isAt(5, '5 of 6 · Reading the study');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is running the metrics. They appear here when it is done.'
    );
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-steps')).toBeNull();
    expect($('.sva-rbqm-table > table')).not.toBeNull();
    expect(tabCount()).toBe('8 of 8');
  });

  it('APP-RBQM-063: once R has answered the control is a chip, R ready, and its panel opens under the row with Run details in three columns: the steps and what each cost, what R was handed and what did not run, and the versions and R’s warnings; Run again there runs the metrics on the same R, and the steps then say only the last ran again (#280)', async () => {
    fakeViz();
    const clock = { now: new Date(2026, 9, 7, 9, 0, 0).getTime() };
    const { app, r, view, $, $$ } = mount({
      clock,
      answers: {
        rbqm_run: (request) => {
          clock.now += 4600;
          return byFiles.rbqm_run(request);
        }
      }
    });
    app.loadRaw(noLab);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    // A quiet chip, and no button left in the row.
    expect(control().dataset.phase).toBe('ready');
    const chip = $('.sva-charts > .sva-r .sva-chip.sva-r-ready');
    expect(chip.textContent).toBe('R ready▾');
    expect(chip.getAttribute('aria-label')).toBe('R is running in this browser. Show details');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect($$('.sva-r button')).toEqual([chip]);
    expect($('.sva-rbqm-start')).toBeNull();
    expect(panel()).toBeNull();
    expect($('.sva-r-under').hidden).toBe(true);
    chip.click();
    expect($('.sva-r-under').hidden).toBe(false);
    expect($('.sva-header > .sva-charts').nextElementSibling).toBe($('.sva-r-under'));
    expect(panel().className).toBe('sva-r-panel sva-r-wide');
    expect($('.sva-chip.sva-r-ready').getAttribute('aria-expanded')).toBe('true');
    expect(panel().querySelector('.sva-r-heading').textContent).toBe(
      'R is running in this browser'
    );
    expect(panel().querySelector(':scope > .sva-r-text').textContent).toBe(
      'It ran 7 of 8 metrics on the 8 loaded files. About 55 MB was downloaded, once; the study’s data stays here.'
    );
    expect(
      $$('.sva-r-cols > .sva-r-col').map((column) =>
        [...column.querySelectorAll('.sva-r-title')].map((title) => title.textContent)
      )
    ).toEqual([['Steps'], ['What R was handed', 'Did not run'], ['Versions', 'Warnings from R']]);
    expect(inPanel('Steps')).toEqual({
      steps: [
        ['Downloaded R', '13 MB'],
        ['Installed R packages', '42 MB'],
        ['Fetched gsm’s workflow files'],
        ['Loaded gsm’s packages'],
        ['Ran the workflows', '4.6 s']
      ],
      items: [],
      rows: [],
      text: ['5 seconds from the press to the charts.']
    });
    expect($$('.sva-r-steps li').map((node) => node.dataset.state)).toEqual(Array(5).fill('done'));
    expect(inPanel('What R was handed').items).toEqual([
      'The 8 loaded gsm raw files, each as it is.'
    ]);
    expect(inPanel('Did not run').items).toEqual([LAB_NEEDS]);
    expect(inPanel('Versions').rows.map(([term]) => term)).toEqual([
      'R',
      'gsm',
      'Metric workflows',
      'Charts',
      'Snapshot'
    ]);
    expect(inPanel('Warnings from R').items).toEqual(['None.']);
    // What the tab keeps of a run, for the control to say.
    expect(view.state().result).toMatchObject({ name: null, used: [], said: [], files: 8 });
    expect(view.state().result.support.metrics).toHaveLength(8);

    // Run again: the same R, one more run, and nothing started.
    const again = $$('.sva-r-panel .sva-r-actions .sva-action');
    expect(again.map((node) => node.textContent)).toEqual(['Run again']);
    again[0].click();
    expect(view.state().phase).toBe('running');
    expect(control().dataset.phase).toBe('starting');
    expect(panel()).toBeNull();
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(connection.runs.map((run) => run.name)).toEqual([
      'Sys.time',
      'rbqm_attach',
      'rbqm_run',
      'rbqm_run'
    ]);
    openDetails();
    expect(inPanel('Steps')).toMatchObject({
      steps: [['Ran the workflows', '4.6 s']],
      text: [ONLY_LAST]
    });
    // With every metric run, the panel says so in place of a reason.
    app.loadRaw(STUDY);
    await settle();
    await connection.letGo();
    openDetails();
    expect(inPanel('Did not run').items).toEqual(['Nothing: all 8 ran.']);
    expect(inPanel('What R was handed').items).toEqual([
      'The 9 loaded gsm raw files, each as it is.'
    ]);
  });

  it('APP-RBQM-064: Run details, in the line above the table, opens the panel the chip opens, with the keyboard on its cross, and leaves the page as it is; the cross and Escape close it; where there are no details, and on a tab that is not a view’s, nothing opens (#280)', async () => {
    const { app, calls, $ } = await started();
    expect(panel()).toBeNull();
    const link = $('.sva-rbqm-outcome button.sva-rbqm-details');
    expect(link.textContent).toBe('Run details');
    link.click();
    expect(panel().classList.contains('sva-r-wide')).toBe(true);
    expect($('.sva-chip.sva-r-ready').getAttribute('aria-expanded')).toBe('true');
    expect($('.sva-chip.sva-r-ready').getAttribute('aria-label')).toBe(
      'R is running in this browser. Hide details'
    );
    expect(document.activeElement).toBe($('.sva-r-panel .sva-r-x'));
    // The page under it was not drawn again.
    expect(calls).toHaveLength(1);
    expect(link.isConnected).toBe(true);
    $('.sva-r-x').click();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe($('.sva-chip.sva-r-ready'));
    app.openControl();
    expect(panel()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel()).toBeNull();
    // On a metric's page it is the same panel.
    item('kri0001').click();
    app.openControl();
    expect(inPanel('Steps').steps).toHaveLength(5);
    $('.sva-r-x').click();
    // On the Data tab there is no control to open.
    app.select('data');
    app.openControl();
    expect(panel()).toBeNull();
    expect($('.sva-r')).toBeNull();

    // Before R is started the control has no details, and nothing opens.
    const before = mount();
    before.app.loadRaw(STUDY);
    before.app.select('rbqm');
    before.app.openControl();
    expect(panel()).toBeNull();
    expect(control().dataset.phase).toBe('off');
  });

  it('APP-RBQM-065: once R is ready, files loaded while the tab is open are run at once with no press: the last study’s table goes, the row, the tab and the control say the metrics are running, and the results and Run details that follow are the new study’s (#280)', async () => {
    const { app, r, view, connection, $ } = await started({ files: noLab, answers: byFiles });
    expect(tabCount()).toBe('7 of 8');
    expect(item('kri0005').dataset.state).toBe('cannot');
    // The labs file is loaded while the tab is open.
    app.loadRaw([STUDY.find((file) => file.name === 'Raw_LB.csv')]);
    await settle();
    expect(view.state().phase).toBe('running');
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect($('.sva-rbqm-table')).toBeNull();
    expect($('.sva-rbqm-outcome')).toBeNull();
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is running the metrics. They appear here when it is done.'
    );
    expect(stepStates()).toEqual(at(5));
    expect(control().dataset.phase).toBe('starting');
    expect($('.sva-r-say').textContent).toBe('5 of 6 · Reading the study');
    expect(metricItems().map((node) => node.dataset.state)).toEqual(Array(8).fill('running'));
    expect(tabCount()).toBe('running');
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    const runs = connection.runs.filter((run) => run.name === 'rbqm_run');
    expect(runs.map((run) => Object.keys(run.request.files).length)).toEqual([8, 9]);
    expect(tabCount()).toBe('8 of 8');
    expect(metricItems().map((node) => node.dataset.state)).toEqual(Array(8).fill('ran'));
    expect($('.sva-rbqm-status').textContent).toMatch(
      /^R ran 8 of 8 metrics on the 9 loaded files /
    );
    openDetails();
    expect(inPanel('What R was handed').items).toEqual([
      'The 9 loaded gsm raw files, each as it is.'
    ]);
    expect(inPanel('Steps').text).toEqual([ONLY_LAST]);
    // A metric's page open when the files change is run the same way.
    item('kri0005').click();
    app.reset();
    app.loadRaw(noLab);
    app.select('rbqm', 'kri0005');
    await settle();
    expect(view.state().phase).toBe('running');
    await connection.letGo();
    expect(view.state().phase).toBe('done');
    expect($('.sva-rbqm-count').textContent).toBe('LB, did not run');
    expect($('p.sva-rbqm-why').textContent).toBe(LAB_NEEDS);
  });

  it('APP-RBQM-066: sentences about a load are shown above the tab until a run is done; from then they are in Run details with R’s own notes, where a stand-in for a missing Groups table is said too, and the page does not show them a second time (#280)', async () => {
    fakeViz();
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
    const { app, r, view, $, $$ } = mount({
      answers: { rbqm_run: () => ({ status: 'ok', value: twoFiles }) }
    });
    const note = 'study.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.';
    const above = () => $$('.sva-notes .sva-note').map((node) => node.textContent);
    app.select('rbqm');
    app.loadRaw(
      STUDY.filter((file) => ['Raw_SUBJ.csv', 'Raw_AE.csv'].includes(file.name)),
      { notes: [note] }
    );
    expect(view.ownsNotes(app)).toBe(false);
    expect(above()).toEqual([note]);
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    // While R starts and runs the note is still above the tab.
    expect(view.ownsNotes(app)).toBe(false);
    expect(above()).toEqual([note]);
    for (let step = 0; step < 3; step += 1) await connection.letGo();
    expect(view.ownsNotes(app)).toBe(true);
    expect($('.sva-notes')).toBeNull();
    expect($('.sva-view').textContent).not.toContain(note);
    $('.sva-rbqm-details').click();
    expect(partial['two-files'].notes).toHaveLength(1);
    expect(inPanel('Notes').items).toEqual([
      ...partial['two-files'].notes,
      partial['two-files'].groups.message,
      'With no Groups table, the overview names each site by its ID alone and shows no enrolment.',
      note
    ]);
    $('.sva-r-x').click();
    // On a metric's page too the note is not above the tab.
    item('kri0001').click();
    expect($('.sva-notes')).toBeNull();
    // The Data tab shows it as it always did.
    app.select('data');
    expect(above()).toEqual([note]);
    // A sentence made since the run, as of a file that was refused, is the
    // page's to show: the reader who dropped the file sees it above the tab.
    const refused = 'notes.txt is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.';
    app.select('rbqm');
    app.loadRaw(
      STUDY.filter((file) => ['Raw_SUBJ.csv', 'Raw_AE.csv'].includes(file.name)),
      { notes: [note, refused] }
    );
    // The files are the ones R ran on, so nothing is run again: the run keeps
    // the sentence it had, and the new one is above the tab with it.
    expect(r.made).toHaveLength(1);
    expect(view.ownsNotes(app)).toBe(false);
    expect(above()).toEqual([note, refused]);
    // With the study cleared there is no run to keep notes with.
    app.reset();
    app.select('rbqm');
    expect(view.ownsNotes(app)).toBe(false);
  });

  it('APP-RBQM-069: a metric’s page says the metric’s name and its state beside it: before a run that R is needed and where to start it, while R starts and runs the six steps, which follow R as the Overview’s do, and once R has answered the metric’s charts (#279, #280)', async () => {
    fakeViz();
    const { app, r, view, $, $$ } = mount({ answers: RUN_OK });
    app.loadRaw(STUDY);
    app.select('rbqm', 'kri0001');
    expect($('.sva-rbqm-metric-name').textContent).toBe('Adverse Event Rate');
    expect($('.sva-rbqm-count').textContent).toBe('AE, not started');
    expect($('.sva-rbqm-metric p.sva-rbqm-need.sva-rbqm-status').textContent).toBe(NEED);
    expect($('.sva-rbqm-steps')).toBeNull();
    expect($('.sva-rbqm-figures')).toBeNull();
    // The Overview's own lines are not on it.
    expect($('.sva-rbqm-supports')).toBeNull();
    expect($('.sva-rbqm-placeholder')).toBeNull();
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    expect($('.sva-rbqm-count').textContent).toBe('AE, running');
    expect($('.sva-rbqm-status').textContent).toBe(
      'R is starting. The metrics run by themselves when it is ready.'
    );
    expect(stepStates()).toEqual(at(1));
    connection.options.onStage('packages');
    expect(stepStates()).toEqual(at(2));
    await connection.letGo();
    expect(stepStates()).toEqual(at(4));
    await connection.letGo();
    connection.wrote();
    expect(stepStates()).toEqual(at(6));
    expect($('.sva-rbqm-count').textContent).toBe('AE, running');
    await connection.letGo();
    // R has answered: the page that was open is the metric's, with its charts.
    expect(view.state().phase).toBe('done');
    expect(window.location.hash).toBe('#rbqm/kri0001');
    expect($('.sva-rbqm-count').textContent).toBe('AE, ran');
    expect($('.sva-rbqm-steps')).toBeNull();
    expect($('.sva-rbqm-need')).toBeNull();
    expect($$('.sva-rbqm-metric .sva-rbqm-figures canvas')).toHaveLength(2);
  });
});

// Every file comes in on the Data tab (#281, #282, obot.roadmap#406): the one
// drop zone takes a study's files and gsm's raw files together, and one card
// there says what the loaded data supports. The charts are stand-ins that
// draw, so the workflow's third step has charts to count.
describe('the Data tab: gsm raw files and the RBQM card', () => {
  const charts = () => {
    const made = { portfolio: manifest };
    for (const entry of Object.values(manifest.modules)) {
      made[entry.export] = vi.fn((element) => ({
        init() {
          element.innerHTML = '<canvas></canvas>';
        },
        destroy() {
          element.innerHTML = '';
        }
      }));
    }
    return made;
  };
  const fixture = (directory) => (name) => ({
    name,
    text: readFileSync(path.join(root, directory, name), 'utf8')
  });
  const RENAMED = ['dm.csv', 'ae.csv', 'labs_final.csv', 'ecg.json'].map(
    fixture('tests/e2e/fixtures/app')
  );
  const PILOT = ['adsl.csv', 'adae.csv'].map(fixture('site/data'));
  const raw = (...names) => STUDY.filter((file) => names.includes(file.name));
  const THREE = raw('Raw_SUBJ.csv', 'Raw_AE.csv', 'Raw_PD.csv');
  const three = partial['three-files'];
  const step = () => {
    const node = document.querySelector('.sva-step[data-step="open"]');
    return [
      node.querySelector('.sva-step-title').textContent,
      node.dataset.state,
      node.querySelector('.sva-step-status').textContent,
      [...node.querySelectorAll('button')].map((button) => button.textContent)
    ];
  };
  const tags = () =>
    [...document.querySelectorAll('.sva-file.sva-raw')].map((node) => [
      node.dataset.raw,
      node.querySelector('.sva-tag').textContent
    ]);

  it('APP-RBQM-075: a study’s files and gsm raw files dropped together each go where they belong: the raw files are kept as they are and named with their raw domain, the study’s files are placed and mapped as ever, a demo study gives way once and the page says so once, and a raw file that is not a CSV is refused with its sentence (#282)', async () => {
    // The demo studies as the site serves them, read from where the repository keeps them.
    const fetchText = vi.fn(async (url) => {
      const relative = url.replace('./data/', '');
      const study = DEMO_STUDIES.find((item) => item.dir && relative.startsWith(item.dir)) || {
        dir: '',
        source: 'site/data'
      };
      return readFileSync(path.join(root, study.source, relative.slice(study.dir.length)), 'utf8');
    });
    const { app, $, $$ } = mount({
      page: { charts: charts(), demo: { base: './data/' }, fetchText }
    });
    await app.loadDemo('rbqm');
    expect(app.state.study).toBe('rbqm');
    expect(app.state.raw).toHaveLength(9);
    const deviations = { ...raw('Raw_PD.csv')[0], name: 'deviations_export.csv' };
    const asFile = ({ name, text }) => ({ name, size: text.length, text: async () => text });
    const drop = new Event('drop');
    drop.dataTransfer = {
      files: [
        ...RENAMED,
        ...raw('Raw_SUBJ.csv', 'Raw_AE.csv'),
        deviations,
        { name: 'Raw_LB.json', text: '[{"subjid":"1"}]' }
      ].map(asFile)
    };
    $('.sva-drop').dispatchEvent(drop);
    await settle();
    // The Renamed columns study is read as a study: `ae.csv` is its adverse events file, not Raw_AE.
    expect(
      Object.fromEntries(
        Object.entries(app.state.files).map(([domain, file]) => [domain, file.name])
      )
    ).toEqual({ subject: 'dm.csv', ae: 'ae.csv', bds: 'labs_final.csv', eg: 'ecg.json' });
    expect($$('.sva-file[data-domain] .sva-map')).toHaveLength(4);
    expect(tags()).toEqual([
      ['Raw_SUBJ.csv', 'gsm raw file: Raw_SUBJ, by its name'],
      ['Raw_AE.csv', 'gsm raw file: Raw_AE, by its name'],
      ['deviations_export.csv', 'gsm raw file: Raw_PD, by its columns']
    ]);
    expect(app.state.raw.map((file) => file.text)).toEqual([
      ...raw('Raw_SUBJ.csv', 'Raw_AE.csv').map((file) => file.text),
      deviations.text
    ]);
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.study).toBeNull();
    expect($$('.sva-notes .sva-note').map((note) => note.textContent)).toEqual([
      'The demo study (RBQM study) was cleared to load your files.',
      'Raw_LB.json is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.'
    ]);
    // The raw files are used as they are: what they support is what desktop R ran on the three.
    expect(card().say).toBe('This data supports 4 of 8 metrics.');
    expect(
      card()
        .items.filter(([, state]) => state === 'todo')
        .map(([id]) => id)
    ).toEqual(three.ran.metrics);
    // Raw files alone take a demo study's place too, and files loaded after them join them.
    await app.loadDemo('pilot');
    expect(Object.keys(app.state.files)).toHaveLength(4);
    app.loadFiles(raw('Raw_PD.csv'));
    expect(app.state.files).toEqual({});
    expect(app.state.raw.map((file) => file.name)).toEqual(['Raw_PD.csv']);
    expect($$('.sva-notes .sva-note').map((note) => note.textContent)).toEqual([
      'The demo study (Pilot study) was cleared to load your files.'
    ]);
    app.loadFiles(PILOT);
    expect(app.state.raw.map((file) => file.name)).toEqual(['Raw_PD.csv']);
    expect(Object.keys(app.state.files).sort()).toEqual(['ae', 'subject']);
    // A demo study's own files are taken as the study says: the pilot study's are placed, the RBQM study's kept.
    await app.loadDemo('renamed');
    expect(app.state.raw).toEqual([]);
    expect(Object.keys(app.state.files).sort()).toEqual(['ae', 'bds', 'eg', 'subject']);
  });

  it('APP-RBQM-076: on three raw files the Data tab’s card says what desktop R said after running them: four of the eight metrics, and of each other metric and of the Groups table R’s own sentence, behind "Why 4 cannot run"; on the whole RBQM study it says eight of eight and gives no reasons; its button opens the RBQM tab (#281)', () => {
    const { app, r, $ } = mount({ page: { charts: charts() } });
    app.loadFiles(THREE);
    expect($('.sva-support-title').textContent).toBe('RBQM');
    expect(three.status.filter((line) => line.state === 'ran').map((line) => line.id)).toEqual([
      'kri0001',
      'kri0002',
      'kri0003',
      'kri0004'
    ]);
    const not = three.status.filter((line) => line.state !== 'ran');
    expect(card()).toEqual({
      say: 'This data supports 4 of 8 metrics.',
      items: three.status.map((line) => [
        line.id,
        line.state === 'ran' ? 'todo' : 'cannot',
        line.state === 'ran'
          ? `${line.metric}: not started`
          : `${line.metric}: cannot run: missing data. ${line.message}`
      ]),
      key: ['not started', 'cannot run: missing data'],
      why: {
        title: 'Why 4 cannot run',
        open: false,
        items: [...not.map((line) => line.message), three.groups.message]
      },
      lines: [],
      note: 'Read from the files’ names and columns. R says the same when it runs.'
    });
    // Each mark is the one the tab's own row gives the metric, with its abbreviation.
    expect(
      [...document.querySelectorAll('.sva-support-items li')].map((node) => [
        node.textContent,
        node.querySelector('svg').getAttribute('class')
      ])
    ).toEqual(
      three.status.map((line) => [
        line.abbreviation,
        expect.stringContaining(line.state === 'ran' ? 'todo' : 'cannot')
      ])
    );
    // The whole study: nothing cannot run, so there is nothing to explain.
    app.loadFiles(STUDY);
    expect(card().say).toBe('This data supports 8 of 8 metrics.');
    expect(card().why).toBeNull();
    expect(card().key).toEqual(['not started']);
    expect(card().lines).toEqual([]);
    // The card starts nothing; its one button leads to the tab, where R is started.
    expect(r.createConnection).not.toHaveBeenCalled();
    const open = $('.sva-support [data-action="open-view"]');
    expect(open.textContent).toBe('Open RBQM');
    open.click();
    expect(app.state.selected).toBe('rbqm');
    expect(window.location.hash).toBe('#rbqm');
    expect($('.sva-rbqm-supports').textContent).toBe(
      'The loaded files support 8 of 8 metrics. Change the data on the Data tab.'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
  });

  it('APP-RBQM-076: the card’s marks follow the run while the Data tab is open: turning while R works, and what R said once it has answered, with the rest of the Data tab left as it is (#281)', async () => {
    fakeViz();
    const { app, r, $ } = mount({ answers: RUN_OK, page: { charts: charts() } });
    app.loadFiles(STUDY);
    app.select('rbqm');
    $('.sva-rbqm-start').click();
    const [connection] = r.made;
    app.select('data');
    const main = $('.sva-data-main');
    expect(card().items.map(([, state]) => state)).toEqual(Array(8).fill('running'));
    expect(card().key).toEqual(['running']);
    expect(card().items[0][2]).toBe('Adverse Event Rate: running');
    for (let turn = 0; turn < 3; turn += 1) await connection.letGo();
    expect(card().items.map(([, state]) => state)).toEqual(Array(8).fill('ran'));
    expect(card().key).toEqual(['ran']);
    expect(card().say).toBe('This data supports 8 of 8 metrics.');
    expect($('.sva-data-main')).toBe(main);
    // Other files loaded: what R ran on is no longer what is loaded, and no metric is marked as run.
    app.loadFiles(THREE.slice(0, 1));
    app.reset();
    app.loadFiles(THREE);
    expect(card().items.map(([, state]) => state)).not.toContain('ran');
  });

  it('APP-RBQM-077: with gsm raw files loaded and no chart ready, the workflow’s third step is "Open the RBQM tab": the current step, counting the metrics the files support before the charts, with a button that opens the tab; with a study whose charts are ready the step is "Open a chart" and counts the RBQM metrics beside them (#281)', () => {
    const { app, $ } = mount({ page: { charts: charts() } });
    expect(step()).toEqual(['Open a chart', 'todo', '0 of 13 charts ready', []]);
    app.loadFiles(THREE);
    expect(step()).toEqual([
      'Open the RBQM tab',
      'current',
      '4 of 8 metrics supported · 0 of 13 charts ready',
      ['Open RBQM']
    ]);
    expect($('.sva-step[data-step="open"]').getAttribute('aria-current')).toBe('step');
    expect($('.sva-step[data-step="map"] .sva-step-status').textContent).toBe(
      'Nothing to map: gsm’s raw files are kept as they are'
    );
    app.loadFiles(STUDY);
    expect(step().slice(0, 3)).toEqual([
      'Open the RBQM tab',
      'current',
      '8 of 8 metrics supported · 0 of 13 charts ready'
    ]);
    $('.sva-step[data-step="open"] [data-action="open-view"]').click();
    expect(app.state.selected).toBe('rbqm');
    // A study of standard files: its charts lead, and the metrics it supports are counted beside them.
    app.reset();
    app.select('data');
    app.loadFiles(PILOT);
    const [title, state, status, buttons] = step();
    expect([title, state, buttons]).toEqual(['Open a chart', 'current', ['Open first chart']]);
    expect(status).toMatch(/^[1-9]\d* of 13 charts ready · 3 of 8 RBQM metrics$/);
    // Raw files beside it change the count, not where the step leads.
    app.loadFiles(raw('Raw_PD.csv'));
    expect(step()[0]).toBe('Open a chart');
    expect(step()[2]).toMatch(/^[1-9]\d* of 13 charts ready · 5 of 8 RBQM metrics$/);
  });
});
