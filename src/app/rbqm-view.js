// Demo app: the RBQM tab (#235, obot.roadmap#374). A tab of its own, brought
// by a library through the second-library seam (page.js): gsm.viz's charts take
// the reporting tables R returns, not a study's standard domains, so they are
// not charts in a domain's row but one view.
//
// The tab brings the app a row of its own (#279, obot.roadmap#405): Overview,
// then one item for each metric with its state where a chart has its hex, and
// at the row's right end the app's one R control (#280, r-control.js). Before
// the reader presses Start R nothing is asked of R's hosts. The press makes
// one connection to R in the browser (r-browser.js); the control names the
// step and counts, and the body ticks off six steps. R then runs gsm's
// workflows on the loaded files (site/rbqm/pipeline.R) with no second press,
// and the tab draws what R returned with gsm.viz, one page at a time: the
// group overview across every metric, or one metric's scatter plot and bar
// chart. A metric that did not run shows R's sentence saying why in place of
// its charts. What ran, on what and with which versions is in the panel
// behind the control's chip, with Run again.
//
// The tab runs on the study the other charts use (#253, obot.roadmap#398): R
// is handed the loaded study's Subject-level and Adverse events files, under
// the column names the reader mapped on the Data tab, and makes gsm's raw
// tables from them before gsm's own workflows run. There is no second study to
// load. gsm raw files are the other way in, and run every metric:
//
// The files are the RBQM study's, or the reader's own (#236): CSV files dropped
// on the tab are read with the browser's file reader and kept as raw files, not
// passed through the mapping table. Each is placed in a gsm raw domain by its
// name or its columns, and the tab lists, before R is started, which domains
// are loaded and which metrics they support (rbqm-files.js). R is handed the
// one file of each domain under gsm's name for it; a file not placed is named
// and stays out of R.
//
// R computes every rate, score and flag shown. This module decides when R is
// asked, hands R's tables to gsm.viz (rbqm.js says which rows), and writes the
// sentences. gsm.viz counts each site's red and amber flags for its overview.

import { readFiles } from './data-panel.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { WEBR_VERSION } from './r-browser.js';
import { whereSaid } from './r-words.js';
import {
  NOT_CSV,
  filesForR,
  filesSentence,
  rawStudy,
  standardCsv,
  standardSentence,
  standardStudy,
  supportOf
} from './rbqm-files.js';
import {
  NONE_PLACED,
  NO_FILES,
  RUN_STEPS,
  R_LIMITS,
  failureOf,
  isoDay,
  metricInputs,
  metricList,
  outcomeSaid,
  overviewInputs,
  rbqmWords,
  runDetails,
  sameFiles,
  stepLines,
  stepNumber,
  stepSaid
} from './rbqm.js';

/** What waiting on R comes to when R gave no answer in time (#261). */
const SILENT = Symbol('R gave no answer');

/** A metric's state, in the words its item's accessible name and its page's heading say. */
const STATE_WORDS = { ran: 'ran', cannot: 'did not run', running: 'running', todo: 'not started' };
/** A metric's state in words: one the files cannot support has not "not run" until there has been a run. */
const stateSaid = (metric, ran) =>
  metric.state === 'cannot' && !ran ? 'cannot run' : STATE_WORDS[metric.state];

const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);

/**
 * The RBQM tab.
 * @param {Object} options
 * @param {(options: Object) => {run: Function}} [options.createConnection] The connection factory (r-browser.js's). Left out on a page that cannot start R.
 * @param {Object} [options.r] What R is given: `packages` and `repos` to install them from, `files` (each `{ path, url }`) and the `source` among them, the `attach` and `call` functions, the `args` the call takes besides the data folder and the snapshot date, and `data`, the folder of R's file system the raw files of each run go under.
 * @param {{url: string, global: string}} [options.charts] gsm.viz's bundle: where the page serves it and the global it defines. It is loaded when the reader starts R, not before.
 * @param {Array<{what: string, host: ?string, megabytes: number}>} [options.downloads] What starting R downloads: R itself first, then its packages; a null host is the page's own address.
 * @param {?Object} [options.needs] What gsm's workflows need, as desktop R reads it from their specs (site/rbqm/needs.json): the columns of each raw domain's file, and the tables each mapping and metric needs. With it the tab takes a reader's own files; without it the loaded raw files are handed to R as they are named.
 * @param {?{workflows: {name: string, version: string}, charts: {name: string, version: string}}} [options.copies] What is copied in and not installed in R, each with its version: gsm.kri's metric workflows and gsm.viz's charts. The tab names them beside the versions R reports.
 * @param {?string} [options.unavailable] On a page that cannot start R, the sentence that says so; the tab then offers no control.
 * @param {{start: number, attach: number, run: number}} [options.limits] How long R is waited on at each step before the tab gives up, in seconds (#261).
 * @param {?string} [options.webr] The version of the runtime R runs on, for Run details.
 * @param {() => Date} [options.now] The clock; used by the tests.
 * @returns {{id: string, title: string, tag: Function, render: Function, state: Function}} The view, as page.js takes one.
 */
export function rbqmTab({
  createConnection,
  r = {},
  charts = null,
  downloads = [],
  needs = null,
  copies = null,
  unavailable = null,
  limits = R_LIMITS,
  webr = WEBR_VERSION,
  now = () => new Date()
} = {}) {
  // idle → starting → attaching → running → done, or → failed (R is not up)
  // or → stopped (R is up and the run stopped). Once R is up a later study is
  // run without starting it again.
  let phase = 'idle';
  let step = 'runtime';
  let up = false;
  let connection = null;
  let pressedAt = 0;
  let failure = null; // what the control says of an R that did not start, or stopped (rbqm.js::failureOf)
  const words = rbqmWords(downloads);
  let result = null; // { answer, files, study, name, used, support, said, seconds, sinceStart, snapshotDate }
  let runStep = 'read'; // while a run is going: reading the study, then running the workflows
  let wantFiles = false; // the file box is to be opened and brought into view when next drawn
  let runs = 0;
  let kept = null; // the folder of R's file system the last run's files are in
  let library = null; // the promise of gsm.viz
  let libraryProblem = '';
  let shown = null; // { app, steps } of the view as it is on the page now

  const busy = () => ['starting', 'attaching', 'running'].includes(phase);
  const seconds = () => Math.max(0, Math.round((now().getTime() - pressedAt) / 1000));
  const loaded = (app) => (app && Array.isArray(app.state.raw) ? app.state.raw : []);

  /**
   * What R is handed for what is loaded, and the loaded things it is made of:
   * the one file of each raw domain, under gsm's name for it, and each file of
   * the loaded study that a raw table can be made from, with the reader's
   * mapping of it. `count` is the raw files, `study` the study's files by name.
   */
  function handed(app) {
    const all = loaded(app);
    if (!needs) {
      return {
        sources: [...all],
        files: all.map(({ name, text }) => ({ name, text })),
        count: all.length,
        study: [],
        labels: {},
        used: []
      };
    }
    const raw = rawStudy(all, needs);
    const standard = standardStudy(app && app.state.files, app && app.state.mappings, needs);
    const support = supportOf(raw.tables, needs, standard);
    const used = [...standard.values()].filter((entry) => support.reads.has(entry.table));
    return {
      raw,
      standard,
      support,
      used,
      sources: [...raw.tables.values(), ...used.flatMap((entry) => [entry.file, entry.mapping])],
      files: [
        ...filesForR(raw.tables),
        ...used.map((entry) => ({ name: `${entry.table}.csv`, entry }))
      ],
      count: raw.tables.size,
      study: used.map((entry) => entry.name),
      labels: Object.fromEntries(used.map((entry) => [entry.table, entry.name]))
    };
  }

  /** gsm.viz, loaded once from the page's own address when it is first needed. */
  function loadLibrary() {
    if (library) return library;
    const found = () => {
      const global = charts && globalThis[charts.global];
      return global && global.default ? global.default : null;
    };
    library = new Promise((resolve, reject) => {
      if (found()) return resolve(found());
      if (!charts || !charts.url) return reject(new Error('this page serves no gsm.viz'));
      const script = el('script');
      script.src = charts.url;
      script.onload = () =>
        found() ? resolve(found()) : reject(new Error(`${charts.url} did not define its charts`));
      script.onerror = () => reject(new Error(`${charts.url} did not load on this page`));
      document.head.append(script);
      return undefined;
    }).catch((error) => {
      libraryProblem = `The charts are not drawn: ${messageOf(error)}.`;
      library = null;
      return null;
    });
    return library;
  }

  /** The loaded demo study's name ("Pilot study"), when what is loaded is one. */
  const studyName = (app) => {
    const id = app && app.state.study;
    const demo = id && (app.studies || []).find((study) => study.id === id);
    return demo ? demo.label : null;
  };

  /** The moment of the six steps the tab is at, while it is busy (rbqm.js::RUN_STEPS). */
  const moment = () =>
    phase === 'starting'
      ? step
      : phase === 'attaching'
        ? 'attach'
        : phase === 'running'
          ? runStep
          : null;

  /**
   * The metrics, as the row lists them (#279): once R has answered, R's own
   * list and what became of each; before that, what the loaded files' names
   * and columns say each can expect.
   */
  function metricsNow(app) {
    if (phase === 'done' && result) {
      return metricList(result.answer).map((metric) => ({
        ...metric,
        state: metric.ran ? 'ran' : 'cannot'
      }));
    }
    const { support } = handed(app);
    if (!support) return [];
    return support.metrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      abbreviation: metric.abbreviation,
      ran: false,
      message: metric.supported ? '' : metric.message,
      state: !metric.supported ? 'cannot' : busy() ? 'running' : 'todo'
    }));
  }

  /** The one line the body opens on, for every state but a finished run. */
  function bodyLine(app) {
    if (unavailable) return unavailable;
    if (busy()) {
      return up && phase === 'running'
        ? 'R is running the metrics. They appear here when it is done.'
        : 'R is starting. The metrics run by themselves when it is ready.';
    }
    if (phase === 'failed') {
      return failure.say === words.stopped
        ? `R stopped answering, so no metric was run. Try again, ${whereSaid()}.`
        : words.viewFailed();
    }
    if (phase === 'stopped')
      return `R stopped, so there are no results. Run again, ${whereSaid()}.`;
    const given = handed(app);
    if (!given.files.length) {
      const any = loaded(app).length || Object.keys((app && app.state.files) || {}).length;
      return any ? NONE_PLACED : NO_FILES;
    }
    return up ? `R is ready. Run the metrics from the R chip, ${whereSaid()}.` : words.viewNeed();
  }

  /** The six steps, as the body lists them while R starts and runs: done, the one it is on, and to come. */
  function stepList() {
    const list = el('ol', 'sva-rbqm-steps');
    const now = stepNumber(moment());
    stepLines().forEach((line, index) => {
      const item = el('li');
      const state = index + 1 < now ? 'done' : index + 1 === now ? 'now' : 'todo';
      item.dataset.state = state;
      item.append(
        icon({ done: 'ran', now: 'running', todo: 'todo' }[state]),
        el('span', null, line)
      );
      list.append(item);
    });
    return list;
  }

  /** Say where the run has got to, where the view is on the page, without drawing it again. */
  function say() {
    if (!shown) return;
    if (shown.steps && shown.steps.isConnected && busy()) {
      const fresh = stepList();
      shown.steps.replaceWith(fresh);
      shown.steps = fresh;
    }
    // The control names the step too, and the row's marks follow.
    shown.app.retag();
  }

  /** Draw the view again where it is on the page, and its tab. */
  function redraw() {
    if (!shown) return;
    shown.app.redrawView(view.id);
  }

  /**
   * Wait on R for one step, and no longer than its limit (#261). An R that
   * gives no answer in that time is closed, and the tab says that it stopped
   * answering and offers to start it again; nothing waits on it after that.
   * @returns {Promise<*>} R's answer, or SILENT when R gave none in time.
   */
  function within(when, answer) {
    const limit = limits[when];
    if (!Number.isFinite(limit) || limit <= 0) return answer;
    let timer;
    const asked = connection;
    const gaveUp = new Promise((resolve) => {
      timer = setTimeout(() => resolve(SILENT), limit * 1000);
    });
    return Promise.race([answer, gaveUp])
      .then((first) => {
        if (first !== SILENT) return first;
        phase = 'failed';
        up = false;
        result = null;
        // R's memory goes with it: the next run has no earlier folder to remove.
        kept = null;
        failure = failureOf(when, null, { downloads, silent: limit });
        if (connection === asked) connection = null;
        // Closed without waiting on it: it is not answering.
        if (asked && typeof asked.close === 'function') {
          Promise.resolve()
            .then(() => asked.close())
            .catch(() => {});
        }
        return SILENT;
      })
      .finally(() => clearTimeout(timer));
  }

  async function run(app, startedR = false) {
    const { sources, files, count, study, labels, used = [], support = null } = handed(app);
    if (!files.length) {
      phase = 'idle';
      result = null;
      return;
    }
    phase = 'running';
    runStep = 'read';
    redraw();
    runs += 1;
    // Each run's files go in a folder of their own: a file of an earlier study
    // must not be read as one of this study's.
    const folder = `${r.data}/${runs}`;
    // The run before this one left its files in R's memory: R removes them as
    // this run begins, so a reader who runs again and again fills nothing up.
    const earlier = kept;
    kept = folder;
    const snapshotDate = isoDay(now());
    const since = now().getTime();
    const answer = await within(
      'run',
      connection.run(r.call, {
        files: Object.fromEntries(
          files.map((file) => [
            `${folder}/${file.name}`,
            // A file of the loaded study goes as text under the standard names.
            file.entry ? standardCsv(file.entry) : file.text
          ])
        ),
        args: {
          ...r.args,
          data: folder,
          snapshot_date: snapshotDate,
          // What R calls each of the study's files when it names a column one lacks.
          ...(Object.keys(labels).length ? { labels } : {}),
          ...(earlier ? { forget: earlier } : {})
        },
        // The study's files are in R: what is left is R's own work.
        onFiles() {
          runStep = 'run';
          say();
        }
      })
    );
    if (answer === SILENT) return;
    if (!answer || answer.status !== 'ok' || !answer.value || !answer.value.status) {
      phase = 'stopped';
      result = null;
      failure = failureOf('run', answer && answer.message, { downloads });
      return;
    }
    const took = Math.round((now().getTime() - since) / 100) / 10;
    const overview = overviewInputs(answer.value);
    result = {
      answer: answer.value,
      files: count,
      study,
      name: studyName(app),
      // What R was handed and what it made of it, as they stood when it ran.
      used,
      support,
      // What is said beside the tables: with no Groups table the overview stands in for one.
      said:
        overview.standIn && overview.results.length
          ? [
              'With no Groups table, the overview names each site by its ID alone and shows no enrolment.'
            ]
          : [],
      loaded: sources,
      // What the page said of the load when R ran: Run details lists these with R's own.
      notes: [...(app.state.notes || [])],
      seconds: took,
      // Said only of the press that started R: a later press started nothing.
      sinceStart: startedR ? seconds() : null,
      snapshotDate
    };
    phase = 'done';
    // The reader loaded other files while R ran: those are the ones to show.
    if (!sameFiles(handed(app).sources, sources)) await run(app, startedR);
  }

  async function press(app) {
    if (busy() || unavailable) return;
    pressedAt = now().getTime();
    failure = null;
    const starting = !up;
    try {
      if (!up) {
        phase = 'starting';
        step = 'runtime';
        redraw();
        loadLibrary();
        // An R that did not come up is closed before another is started.
        if (connection && typeof connection.close === 'function') await connection.close();
        connection = createConnection({
          packages: r.packages,
          repos: r.repos,
          files: r.files,
          source: r.source,
          onStage(name) {
            step = name;
            say();
          }
        });
        // One call every R has: R is fetched, its packages installed and the
        // pipeline's R read on this call, so each can be said as it happens.
        const started = await within('start', connection.run('Sys.time'));
        if (started === SILENT) return;
        if (!started || started.status !== 'ok') {
          phase = 'failed';
          failure = failureOf('start', started && started.message, { downloads, step });
          return;
        }
        phase = 'attaching';
        redraw();
        const attached = await within('attach', connection.run(r.attach));
        if (attached === SILENT) return;
        if (!attached || attached.status !== 'ok') {
          phase = 'failed';
          failure = failureOf('attach', attached && attached.message, { downloads });
          return;
        }
        up = true;
      }
      await run(app, starting);
    } catch (error) {
      phase = up ? 'stopped' : 'failed';
      failure = failureOf(up ? 'run' : 'start', messageOf(error), { downloads, step });
    } finally {
      redraw();
    }
  }

  /**
   * The tab's control, as the app's one R control takes it (#280,
   * src/app/libraries.js::controlState): off, starting with the step it is on,
   * ready as a chip whose panel holds Run details and Run again, or failed.
   */
  function action(app) {
    if (unavailable) return null;
    const files = handed(app).files.length;
    return {
      state() {
        if ((phase === 'failed' || phase === 'stopped') && failure) {
          return { phase: 'failed', ...failure, className: 'sva-rbqm-start', disabled: !files };
        }
        if (busy()) {
          const at = moment();
          return {
            phase: 'starting',
            say: words.starting,
            since: pressedAt,
            now: () => now().getTime(),
            step: { say: stepSaid(at), index: stepNumber(at), of: RUN_STEPS.length }
          };
        }
        if (phase === 'done' && result) {
          const given = handed(app);
          const details = runDetails(
            result.answer,
            {
              ...result,
              copies,
              webr,
              handed: [
                ...result.used.map((entry) =>
                  standardSentence(entry, app.manifest.domains[entry.domain].label, result.support)
                ),
                ...(result.files
                  ? [
                      `The ${result.files} loaded gsm raw ${result.files === 1 ? 'file' : 'files'}, each as it is.`
                    ]
                  : [])
              ].filter(Boolean),
              notes: [...result.said, ...result.notes]
            },
            downloads
          );
          return {
            phase: 'ready',
            say: words.ready,
            title: words.readyHeading,
            details: {
              heading: words.readyHeading,
              ...details,
              actions: given.files.length ? [{ label: 'Run again', press: () => press(app) }] : []
            }
          };
        }
        if (up) {
          return {
            phase: 'ready',
            say: words.ready,
            title: words.readyHeading,
            details: {
              heading: words.readyHeading,
              text: ['R is running, and nothing has been run on what is loaded now.'],
              actions: files ? [{ label: 'Run the metrics', press: () => press(app) }] : []
            }
          };
        }
        return {
          phase: 'off',
          say: words.need,
          meta: words.cost,
          title: words.needTitle,
          label: words.start,
          className: 'sva-rbqm-start',
          disabled: !files
        };
      },
      press: () => press(app)
    };
  }

  function drawCharts(viz, container, metric) {
    const inputs = metricInputs(result.answer, metric.metricId);
    if (!inputs) return [];
    const drawn = [];
    const scatterBox = el('div', 'sva-rbqm-chart sva-rbqm-scatter');
    const barBox = el('div', 'sva-rbqm-chart sva-rbqm-bar');
    const scatter = el('figure', 'sva-rbqm-figure');
    scatter.append(scatterBox);
    if (inputs.groups) {
      // What gsm's own R binding prints beneath its scatter plot.
      scatter.append(
        el(
          'figcaption',
          'sva-rbqm-caption',
          'Point size is relative to the number of enrolled participants.'
        )
      );
    }
    const bar = el('figure', 'sva-rbqm-figure');
    bar.append(barBox);
    container.append(scatter, bar);
    drawn.push(
      viz.scatterPlot(
        scatterBox,
        inputs.results.map((row) => ({ ...row })),
        { ...inputs.metric },
        inputs.bounds,
        inputs.groups
      )
    );
    drawn.push(
      viz.barChart(
        barBox,
        inputs.results.map((row) => ({ ...row })),
        { ...inputs.metric, y: 'Score' },
        inputs.thresholds,
        inputs.groups && inputs.groups.map((row) => ({ ...row }))
      )
    );
    return drawn;
  }

  /** Go to where the data is changed: for now the file box at the foot of the Overview page (#279). */
  function toFiles(app) {
    wantFiles = true;
    app.select(view.id);
  }

  /** A link that leads to where the data is changed. */
  function dataLink(app, text) {
    const link = el('button', 'sva-link sva-rbqm-data', text);
    link.type = 'button';
    link.onclick = () => toFiles(app);
    return link;
  }

  /** A page's heading, with a few words beside it. */
  function headRow(heading, beside, className = '') {
    const row = el('div', 'sva-rbqm-headrow');
    row.append(
      el('h2', className ? `sva-rbqm-heading ${className}` : 'sva-rbqm-heading', heading),
      el('span', 'sva-rbqm-count', beside)
    );
    return row;
  }

  /** The key to the overview's flags, in the shapes and colours gsm.viz draws them. */
  function flagKey() {
    const key = el('aside', 'sva-rbqm-key');
    key.append(el('h3', 'sva-rbqm-subheading', 'Reading the table'));
    const list = el('ul');
    for (const [mark, tone, text] of [
      ['flag-ok', 'green', 'within limits'],
      ['flag-one', 'amber', 'amber flag: high, or low when it points down'],
      ['flag-two', 'red', 'red flag: high, or low when it points down'],
      ['flag-none', 'none', 'no score, so no flag']
    ]) {
      const item = el('li');
      item.append(icon(mark, `sva-flag-${tone}`), el('span', null, text));
      list.append(item);
    }
    key.append(list, el('p', null, 'Hover a cell for its numbers. Click one to open that metric.'));
    return key;
  }

  /** How many of the overview's rows its window shows whole. */
  const ROWS_SHOWN = 12;

  /**
   * The site overview once R has answered (#278, #280): the heading with a
   * count of the sites, the one line that says what ran, the table gsm.viz
   * draws, fitted to its numbers, and the key to its flags.
   */
  function drawOverview(viz, card, app) {
    const { answer } = result;
    const metrics = metricList(answer);
    const overview = overviewInputs(answer);
    const head = headRow('Site overview', '');
    const outcome = el('p', 'sva-rbqm-outcome sva-rbqm-status');
    outcome.setAttribute('role', 'status');
    const said = outcomeSaid(answer, result);
    const details = el('button', 'sva-link sva-rbqm-details', 'Run details');
    details.type = 'button';
    details.onclick = () => app.openControl();
    outcome.append(
      `${said.ran} ${said.rest}`,
      dataLink(app, 'change the data below'),
      '. ',
      details
    );
    card.append(head, outcome);
    if (!overview.results.length) {
      card.append(
        el('p', 'sva-message sva-problem', 'No metric ran, so there is no overview to draw.')
      );
      return;
    }
    if (!viz) return;
    const layout = el('div', 'sva-rbqm-ov');
    const box = el('div', 'sva-rbqm-table sva-rbqm-fit');
    layout.append(box, flagKey());
    card.append(layout);
    const idOf = (metricId) =>
      (metrics.find((metric) => metric.metricId === metricId) || {}).id || null;
    viz.groupOverview(
      box,
      overview.results,
      {
        ...overview.config,
        // Choosing a site's cell of a metric opens that metric's page.
        metricClickCallback(datum) {
          const id = datum && idOf(datum.MetricID);
          if (id) app.select(view.id, id);
        },
        groupClickCallback() {}
      },
      overview.groups,
      overview.metrics
    );
    // The sites, counted, and a window that ends on a whole row.
    const rows = [...box.querySelectorAll('tbody tr')];
    const sites = rows.length || new Set(overview.results.map((row) => row.GroupID)).size;
    const shown = Math.min(sites, ROWS_SHOWN);
    head.querySelector('.sva-rbqm-count').textContent =
      sites > shown
        ? `${sites} ${sites === 1 ? 'site' : 'sites'}, ${shown} shown here`
        : `${sites} ${sites === 1 ? 'site' : 'sites'}`;
    const next = rows[ROWS_SHOWN];
    if (next) {
      // From the box's own top edge to the top of the first row left out, and its bottom edge.
      const edges = box.offsetHeight - box.clientHeight;
      const to = next.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      if (to > 0) box.style.maxHeight = `${Math.round((to + edges / 2) * 100) / 100}px`;
    }
  }

  /** One metric's page (#279): its two charts, or R's sentence saying why there are none. */
  function drawMetric(viz, card, app, metric, drawn) {
    card.append(
      headRow(
        metric.name,
        `${metric.abbreviation}, ${stateSaid(metric, phase === 'done' && Boolean(result))}`,
        'sva-rbqm-metric-name'
      )
    );
    if (metric.state === 'cannot') {
      // R's own sentence, and the way to the data.
      const why = el('div', 'sva-rbqm-whybox');
      why.append(
        el('p', 'sva-rbqm-why', metric.message),
        ' ',
        dataLink(app, 'Change the data on the Overview page.')
      );
      card.append(why);
      return;
    }
    if (metric.state !== 'ran') {
      const line = el('p', 'sva-rbqm-need sva-rbqm-status', bodyLine(app));
      line.setAttribute('role', 'status');
      card.append(line);
      if (busy()) {
        const steps = stepList();
        card.append(steps);
        shown.steps = steps;
      }
      return;
    }
    if (!viz) return;
    const figures = el('div', 'sva-rbqm-figures');
    card.append(figures);
    drawn.push(...drawCharts(viz, figures, metric));
  }

  /**
   * What the metrics run on: which metrics the loaded study and the loaded raw
   * files support, each file of the study that stands in for raw tables, each
   * raw file with the domain it was placed in, and where to drop raw files.
   * All of it is said from the files' names and columns, before R is started.
   */
  function filesSection(app) {
    const { raw: study, support, standard, used } = handed(app);
    const section = el('details', 'sva-rbqm-files');
    // Once R has answered, the metrics below say the same with R's own words.
    // And a study that runs as it is needs nothing of the reader here: the
    // list opens when raw files are loaded, or when there is nothing to run.
    section.open = !(phase === 'done' && result) && (study.files.length > 0 || !used.length);
    section.append(
      el('summary', 'sva-rbqm-files-summary', filesSentence(study, support, standard))
    );

    const drop = el('div', 'sva-drop sva-rbqm-drop');
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.csv,text/csv';
    input.hidden = true;
    input.className = 'sva-rbqm-input';
    const take = async (fileList) => {
      const { loaded: read, refused } = await readFiles(fileList);
      const isCsv = (file) => /\.csv$/i.test(file.name);
      app.loadRaw(read.filter(isCsv), {
        notes: [
          ...refused,
          ...read.filter((file) => !isCsv(file)).map((file) => NOT_CSV(file.name))
        ]
      });
    };
    input.onchange = () => take(input.files);
    drop.ondragover = (event) => {
      event.preventDefault();
      drop.classList.add('sva-over');
    };
    drop.ondragleave = () => drop.classList.remove('sva-over');
    drop.ondrop = (event) => {
      event.preventDefault();
      drop.classList.remove('sva-over');
      if (event.dataTransfer && event.dataTransfer.files.length) take(event.dataTransfer.files);
    };
    const choose = el('button', 'sva-button sva-rbqm-choose', 'Choose files');
    choose.type = 'button';
    choose.onclick = () => input.click();
    drop.append(
      el('p', null, 'Drop your own gsm raw files here, as CSV'),
      choose,
      el('p', 'sva-drop-note', 'They are read in this browser and sent nowhere.'),
      input
    );
    section.append(drop);

    if (used.length) {
      const fromStudy = el('ul', 'sva-rbqm-loaded sva-rbqm-standard');
      for (const entry of used) {
        const label = app.manifest.domains[entry.domain].label;
        const item = el('li', 'sva-rbqm-study-file', standardSentence(entry, label, support));
        item.dataset.table = entry.table;
        fromStudy.append(item);
      }
      section.append(el('h3', 'sva-rbqm-subheading', 'From the loaded study'), fromStudy);
    }
    if (study.files.length) {
      const files = el('ul', 'sva-rbqm-loaded');
      for (const entry of study.files) {
        const item = el(
          'li',
          entry.used ? 'sva-rbqm-file' : 'sva-rbqm-file sva-rbqm-unused',
          entry.sentence
        );
        if (entry.table) item.dataset.table = entry.table;
        files.append(item);
      }
      section.append(el('h3', 'sva-rbqm-subheading', 'Loaded files'), files);
    }
    if (study.files.length || used.length) {
      section.append(
        el('h3', 'sva-rbqm-subheading', 'What they support'),
        el(
          'p',
          'sva-rbqm-aside',
          'Read from the files’ names and columns, before R is started. R says the same when it runs.'
        )
      );
      const list = el('ul', 'sva-rbqm-support');
      for (const metric of support.metrics) {
        const item = el('li', metric.supported ? 'sva-rbqm-can' : 'sva-rbqm-cannot');
        item.dataset.metric = metric.id;
        item.append(
          el('span', metric.supported ? 'sva-tag' : 'sva-tag sva-missing', metric.abbreviation),
          ' ',
          metric.supported
            ? `${metric.name}: the files and columns it needs are loaded.`
            : metric.message
        );
        list.append(item);
      }
      if (!support.groups.supported) {
        const item = el('li', 'sva-rbqm-cannot sva-rbqm-groups', support.groups.message);
        list.append(item);
      }
      section.append(list);
    }
    return section;
  }

  const view = {
    id: 'rbqm',
    title: 'RBQM',

    /**
     * What the tab's own count says, in a word or two: the header keeps to one
     * line, so there is no room for a sentence. The view says the rest.
     */
    tag(app) {
      if (unavailable) return 'needs R';
      // Results of a study that is no longer the one loaded are not this study's.
      if (phase === 'done' && result && app && !sameFiles(handed(app).sources, result.loaded)) {
        return 'not run';
      }
      if (phase === 'done' && result) {
        const metrics = metricList(result.answer);
        return `${metrics.filter((metric) => metric.ran).length} of ${metrics.length}`;
      }
      if (phase === 'failed') return 'no R';
      if (phase === 'stopped') return 'stopped';
      if (busy()) return phase === 'running' ? 'running' : 'starting';
      return 'not run';
    },

    /**
     * The tab's row (#279): Overview, then one item for each metric in scope,
     * with its state where a chart has its hex and in its accessible name.
     */
    items(app) {
      if (unavailable) return [];
      return [
        { id: '', label: 'Overview' },
        ...metricsNow(app).map((metric) => ({
          id: metric.id,
          label: metric.abbreviation,
          title: metric.state === 'cannot' && metric.message ? metric.message : metric.name,
          name: `${metric.name}: ${stateSaid(metric, phase === 'done' && Boolean(result))}`,
          icon: metric.state,
          state: metric.state
        }))
      ];
    },

    /** The tab's R control, for the row's right end (#280). */
    control: (app) => action(app),

    /** Once a run is done the notes about a load are in Run details, with R's own. */
    ownsNotes: (app) =>
      phase === 'done' &&
      Boolean(result) &&
      sameFiles(handed(app).sources, result.loaded) &&
      // A note made since the run, as of a file refused, is the page's to show.
      (app.state.notes || []).every((note) => result.notes.includes(note)),

    /** What the tab holds now, for the tests: the phase, and what R returned. */
    state: () => ({ phase, step: moment() || step, up, result, failure }),

    /**
     * Draw the tab into a container, as it stands now: the Overview page, or
     * the page of the metric the app's address names.
     * @param {Element} container The element to draw into.
     * @param {Object} app The app handle.
     * @returns {{destroy: Function}} What tears its charts down.
     */
    render(container, app) {
      const drawn = [];
      let live = true;
      // A study loaded since the last run is run at once when R is up; until
      // R is up its results are simply not there. Settled before anything is
      // drawn, so the row and the list of files say what is true now.
      const files = handed(app);
      const changed = phase === 'done' && result && !sameFiles(files.sources, result.loaded);
      if (changed) {
        result = null;
        phase = 'idle';
      }
      const root = el('div', 'sva-rbqm');
      container.append(root);
      shown = { app, steps: null };
      const card = el('section', 'sva-rbqm-section sva-rbqm-page');
      root.append(card);
      const open = app.state.item
        ? metricsNow(app).find((metric) => metric.id === app.state.item)
        : null;
      card.dataset.page = open ? 'metric' : 'overview';
      card.classList.add(open ? 'sva-rbqm-metric' : 'sva-rbqm-overview');
      const done = phase === 'done' && result;

      const withCharts = (draw) => {
        const ready = charts && globalThis[charts.global] && globalThis[charts.global].default;
        const go = (viz) => {
          if (!live) return;
          try {
            draw(viz);
          } catch (error) {
            card.append(
              el('p', 'sva-message sva-problem', `The charts did not draw: ${messageOf(error)}`)
            );
          }
          // Under the page's heading, where the charts would be.
          if (!viz && libraryProblem)
            card.append(el('p', 'sva-message sva-problem', libraryProblem));
        };
        if (ready) go(ready);
        else loadLibrary().then(go);
      };

      if (open) {
        if (open.state === 'ran') withCharts((viz) => drawMetric(viz, card, app, open, drawn));
        else drawMetric(null, card, app, open, drawn);
      } else if (done) {
        withCharts((viz) => drawOverview(viz, card, app));
      } else {
        // Before R, while it starts and runs, and when it did not start.
        const line = el('p', 'sva-rbqm-need sva-rbqm-status', bodyLine(app));
        line.setAttribute('role', 'status');
        if (phase === 'failed' || phase === 'stopped') line.classList.add('sva-rbqm-problem');
        card.append(line);
        if (busy()) {
          shown.steps = stepList();
          card.append(shown.steps);
        } else if (!unavailable && phase === 'idle') {
          const { support } = files;
          if (support && files.files.length) {
            const can = support.metrics.filter((metric) => metric.supported).length;
            const supports = el('p', 'sva-rbqm-supports');
            supports.append(
              // A demo study is a study, and so are a study's own files; gsm raw files a reader loaded are files.
              `The loaded ${app.state.study || !files.raw.files.length ? 'study supports' : 'files support'} ${can} of ${support.metrics.length} metrics. `,
              dataLink(app, 'Change the data below.')
            );
            card.append(supports);
          }
          card.append(
            el(
              'p',
              'sva-rbqm-placeholder',
              'Risk-based quality monitoring: gsm’s metrics for every site of the loaded study, worked out by R in this browser. The site overview and each metric’s two charts appear here, usually 20 to 45 seconds after Start R the first time.'
            )
          );
        }
      }

      // Until the Data tab takes raw files (#282) the file box is here, at
      // the foot of the Overview page and of no other.
      if (!open && needs && !unavailable) {
        const box = filesSection(app);
        root.append(box);
        if (wantFiles) {
          wantFiles = false;
          box.open = true;
          queueMicrotask(() => {
            if (box.isConnected && typeof box.scrollIntoView === 'function') {
              box.scrollIntoView({ block: 'start' });
            }
            const choose = box.querySelector('.sva-rbqm-choose');
            if (choose) choose.focus({ preventScroll: true });
          });
        }
      }

      if (changed) {
        if (up && files.files.length) queueMicrotask(() => press(app));
        else app.retag();
      }

      return {
        destroy() {
          live = false;
          for (const chart of drawn) {
            if (chart && typeof chart.destroy === 'function') chart.destroy();
          }
        }
      };
    }
  };
  return view;
}
