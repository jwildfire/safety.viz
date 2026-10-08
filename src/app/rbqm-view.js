// Demo app: the RBQM tab (#235, obot.roadmap#374). A tab of its own, brought
// by a library through the second-library seam (page.js): gsm.viz's charts take
// the reporting tables R returns, not a study's standard domains, so they are
// not charts in a domain's row but one view.
//
// Before the reader presses Start R the tab says what starting R downloads and
// from where, and nothing is asked of R's hosts. The press makes one connection
// to R in the browser (r-browser.js), and the tab says what R is doing at every
// step until the first result. R then runs gsm's workflows on the loaded raw
// files (site/rbqm/pipeline.R), and the tab draws what R returned with gsm.viz:
// the group overview across every metric, and the scatter plot and bar chart of
// the metric chosen. A metric that did not run shows R's sentence saying why in
// place of its charts.
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
  doneSentence,
  failureSentence,
  isoDay,
  metricInputs,
  metricList,
  needSentence,
  overviewInputs,
  ranOn,
  sameFiles,
  stepSentence,
  warningsSaid
} from './rbqm.js';

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
 * @param {?{text: string, title: string}} [options.badge] The tab's status badge, with what it means.
 * @param {() => Date} [options.now] The clock; used by the tests.
 * @returns {{id: string, title: string, badge: ?Object, tag: Function, render: Function, state: Function}} The view, as page.js takes one.
 */
export function rbqmTab({
  createConnection,
  r = {},
  charts = null,
  downloads = [],
  needs = null,
  copies = null,
  unavailable = null,
  badge = null,
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
  let failure = '';
  let result = null; // { answer, files, seconds, sinceStart, snapshotDate }
  let chosen = null; // the id of the metric whose charts are shown
  let runs = 0;
  let kept = null; // the folder of R's file system the last run's files are in
  let library = null; // the promise of gsm.viz
  let libraryProblem = '';
  let shown = null; // { app, status } of the view as it is on the page now
  let ticking = null;

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

  function statusText(app) {
    if (unavailable) return unavailable;
    const given = handed(app);
    const files = given.files.length;
    if (busy()) {
      return stepSentence(phase === 'starting' ? step : phase === 'attaching' ? 'attach' : 'run', {
        seconds: seconds(),
        files: given.count,
        study: given.study,
        downloads
      });
    }
    if (phase === 'failed' || phase === 'stopped') return failure;
    if (phase === 'done' && result) return doneSentence(result.answer, { ...result, copies });
    if (!files) {
      const any = loaded(app).length || Object.keys((app && app.state.files) || {}).length;
      return any ? NONE_PLACED : NO_FILES;
    }
    return up
      ? `R is running in this browser. Its workflows run on ${ranOn(given.count, given.study, 'loaded raw file')}.`
      : needSentence(given.count, downloads, given.study);
  }

  /** Say what is true now, where the view is on the page, without drawing it again. */
  function say() {
    if (!shown || !shown.status.isConnected) return;
    shown.status.textContent = statusText(shown.app);
  }

  function tick(on) {
    if (ticking) clearInterval(ticking);
    ticking = on ? setInterval(say, 1000) : null;
  }

  /** Draw the view again where it is on the page, and its tab. */
  function redraw() {
    if (!shown) return;
    shown.app.redrawView(view.id);
  }

  async function run(app, startedR = false) {
    const { sources, files, count, study, labels } = handed(app);
    if (!files.length) {
      phase = 'idle';
      result = null;
      return;
    }
    phase = 'running';
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
    const answer = await connection.run(r.call, {
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
      }
    });
    if (!answer || answer.status !== 'ok' || !answer.value || !answer.value.status) {
      phase = 'stopped';
      result = null;
      failure = failureSentence('run', answer && answer.message);
      return;
    }
    const took = Math.round((now().getTime() - since) / 100) / 10;
    result = {
      answer: answer.value,
      files: count,
      study,
      loaded: sources,
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
    failure = '';
    tick(true);
    const starting = !up;
    try {
      if (!up) {
        phase = 'starting';
        step = 'runtime';
        redraw();
        loadLibrary();
        // An R that did not come up is closed before another is started.
        if (connection && typeof connection.close === 'function') await connection.close();
        kept = null;
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
        const started = await connection.run('Sys.time');
        if (!started || started.status !== 'ok') {
          phase = 'failed';
          failure = failureSentence('start', started && started.message);
          return;
        }
        phase = 'attaching';
        redraw();
        const attached = await connection.run(r.attach);
        if (!attached || attached.status !== 'ok') {
          phase = 'failed';
          failure = failureSentence('attach', attached && attached.message);
          return;
        }
        up = true;
      }
      await run(app, starting);
    } catch (error) {
      phase = up ? 'stopped' : 'failed';
      failure = failureSentence(up ? 'run' : 'start', messageOf(error));
    } finally {
      tick(false);
      redraw();
    }
  }

  /** The control: what pressing it does now, in a word or two. */
  function control(app) {
    if (unavailable) return null;
    const button = el('button', 'sva-button sva-rbqm-start');
    button.type = 'button';
    const files = handed(app).files.length;
    const label = {
      idle: up ? 'Run the metrics' : 'Start R',
      starting: 'Starting R…',
      attaching: 'Starting R…',
      running: 'Running…',
      done: 'Run again',
      failed: 'Try R again',
      stopped: 'Run again'
    }[phase];
    button.textContent = label;
    button.disabled = busy() || !files;
    button.onclick = () => press(app);
    return button;
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

  function drawResults(viz, container, app) {
    const drawn = [];
    const { answer } = result;
    const metrics = metricList(answer);
    if (!metrics.some((metric) => metric.id === chosen)) {
      chosen = (metrics.find((metric) => metric.ran) || metrics[0] || {}).id || null;
    }

    // What R said beside its tables: a note, and why no Groups table was made.
    const said = [
      ...(Array.isArray(answer.notes) ? answer.notes : []),
      ...warningsSaid(answer),
      ...(answer.groups && answer.groups.state !== 'ran' && answer.groups.message
        ? [answer.groups.message]
        : [])
    ];
    const overview = overviewInputs(answer);
    if (overview.standIn && overview.results.length) {
      said.push(
        'With no Groups table, the overview names each site by its ID alone and shows no enrolment.'
      );
    }
    if (said.length) {
      const notes = el('ul', 'sva-notes sva-rbqm-notes');
      for (const note of said) notes.append(el('li', 'sva-note', note));
      container.append(notes);
    }

    // The overview: a row per site, a column per metric.
    const overviewSection = el('section', 'sva-rbqm-section sva-rbqm-overview');
    overviewSection.append(el('h2', 'sva-rbqm-heading', 'Site overview'));
    if (!overview.results.length) {
      overviewSection.append(
        el('p', 'sva-message sva-problem', 'No metric ran, so there is no overview to draw.')
      );
    } else if (viz) {
      const box = el('div', 'sva-rbqm-table');
      overviewSection.append(box);
      const idOf = (metricId) =>
        (metrics.find((metric) => metric.metricId === metricId) || {}).id || null;
      viz.groupOverview(
        box,
        overview.results,
        {
          ...overview.config,
          // Choosing a site's cell of a metric shows that metric's charts.
          metricClickCallback(datum) {
            const id = datum && idOf(datum.MetricID);
            if (!id || id === chosen) return;
            chosen = id;
            app.redrawView(view.id);
          },
          groupClickCallback() {}
        },
        overview.groups,
        overview.metrics
      );
    }
    container.append(overviewSection);

    // The metrics: each a button, the chosen one's charts beneath.
    const metricSection = el('section', 'sva-rbqm-section sva-rbqm-metric');
    const chooser = el('div', 'sva-rbqm-metrics');
    chooser.setAttribute('role', 'group');
    chooser.setAttribute('aria-label', 'Metric');
    for (const metric of metrics) {
      const button = el('button', 'sva-item sva-rbqm-choice');
      button.type = 'button';
      button.dataset.metric = metric.id;
      button.title = metric.ran ? metric.name : metric.message;
      button.setAttribute('aria-pressed', String(metric.id === chosen));
      button.append(
        el('span', metric.ran ? 'sva-hex' : 'sva-hex sva-alarm'),
        el('span', 'sva-item-title', metric.abbreviation),
        el(
          'span',
          metric.ran ? 'sva-tag' : 'sva-tag sva-missing',
          metric.ran ? 'ran' : 'did not run'
        )
      );
      button.onclick = () => {
        if (metric.id === chosen) return;
        chosen = metric.id;
        app.redrawView(view.id);
      };
      chooser.append(button);
    }
    metricSection.append(chooser);
    const open = metrics.find((metric) => metric.id === chosen);
    if (open) {
      metricSection.append(el('h2', 'sva-rbqm-heading sva-rbqm-metric-name', open.name));
      if (!open.ran) {
        metricSection.append(el('p', 'sva-message sva-problem sva-rbqm-why', open.message));
      } else if (viz) {
        const figures = el('div', 'sva-rbqm-figures');
        metricSection.append(figures);
        drawn.push(...drawCharts(viz, figures, open));
      }
    }
    container.append(metricSection);
    return drawn;
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
    badge,

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

    /** What the tab holds now, for the tests: the phase, and what R returned. */
    state: () => ({ phase, step, up, chosen, result, failure }),

    /**
     * Draw the tab into a container, as it stands now.
     * @param {Element} container The element to draw into.
     * @param {Object} app The app handle.
     * @returns {{destroy: Function}} What tears its charts down.
     */
    render(container, app) {
      const drawn = [];
      let live = true;
      // A study loaded since the last run is run at once when R is up; until
      // R is up its results are simply not there. Settled before anything is
      // drawn, so the control and the list of files say what is true now.
      const files = handed(app);
      const changed = phase === 'done' && result && !sameFiles(files.sources, result.loaded);
      if (changed) {
        result = null;
        phase = 'idle';
      }
      const root = el('div', 'sva-rbqm');
      const lede = el('p', 'sva-rbqm-lede');
      lede.append(
        'Risk-based quality monitoring: gsm’s site metrics, worked out by R in this browser on the loaded study and drawn with gsm.viz.'
      );
      if (badge) {
        const pill = el('span', 'sva-badge', badge.text);
        pill.title = badge.title;
        lede.append(' ', pill);
      }
      const runBox = el('div', 'sva-rbqm-run');
      const status = el('p', 'sva-rbqm-status');
      status.setAttribute('role', 'status');
      const button = control(app);
      if (button) runBox.append(button);
      runBox.append(status);
      root.append(lede, runBox);
      if (needs && !unavailable) root.append(filesSection(app));
      container.append(root);
      shown = { app, status };
      status.textContent = statusText(app);
      if (phase === 'failed' || phase === 'stopped') status.classList.add('sva-rbqm-problem');

      if (changed) {
        if (up && files.files.length) queueMicrotask(() => press(app));
        else app.retag();
      }

      if (phase === 'done' && result) {
        const results = el('div', 'sva-rbqm-results');
        root.append(results);
        const draw = (viz) => {
          if (!live) return;
          results.innerHTML = '';
          if (!viz && libraryProblem) {
            results.append(el('p', 'sva-message sva-problem', libraryProblem));
          }
          try {
            drawn.push(...drawResults(viz, results, app));
          } catch (error) {
            results.append(
              el('p', 'sva-message sva-problem', `The charts did not draw: ${messageOf(error)}`)
            );
          }
        };
        const ready = charts && globalThis[charts.global] && globalThis[charts.global].default;
        if (ready) draw(ready);
        else loadLibrary().then(draw);
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
