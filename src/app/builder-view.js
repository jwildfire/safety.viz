// Demo app: the Build a study tab. A tab of its own, brought by a library
// through the second-library seam (page.js), as the RBQM tab is. The reader
// says a few facts about a trial, presses Build, and R in the browser has
// gsm.datasim simulate the study (site/builder/builder.R). What R returns is
// gsm's raw files, which the app loads as it loads a reader's own raw files,
// so the RBQM tab runs gsm's workflows on the study that was just made.
//
// Before the reader presses Build nothing is asked of R's hosts. The press
// makes one connection to R in the browser (r-browser.js) and keeps it, so a
// second study is built without starting R again. The RBQM tab starts an R of
// its own when the reader asks it to.
//
// R makes every row. This module draws the form, decides when R is asked,
// hands the files to the app and writes the sentences (builder.js says them).

import { el } from './dom.js';
import { note } from './note.js';
import {
  BUILDER_AREAS,
  BUILDER_CAVEATS,
  BUILDER_DEFAULTS,
  BUILDER_LIMITS,
  BUILDER_OUTLIERS,
  BUILDER_PHASES,
  BUILDER_TAB_ID,
  builtFiles,
  builtSaid,
  downloadsSaid,
  readForm,
  withPhase
} from './builder.js';

/** What waiting on R comes to when R gave no answer in time. */
const SILENT = Symbol('R gave no answer');

/** What R is doing while it starts, by the step r-browser.js names. */
const STAGE_WORDS = {
  runtime: 'Starting R in this browser…',
  packages: 'Installing R’s packages…',
  files: 'Fetching gsm.datasim…',
  source: 'Reading the builder…'
};

const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);

/**
 * The Build a study tab.
 * @param {Object} options
 * @param {(options: Object) => {run: Function, close: Function}} [options.createConnection] The connection factory (r-browser.js's). Left out on a page that cannot start R.
 * @param {Object} [options.r] What R is given: `packages` and `repos` to install them from, `files` (each `{ path, url }`) and the `source` among them, the `call` function, and `simulator`, the folder of R's file system gsm.datasim's files are under.
 * @param {Array<{what: string, host: ?string, megabytes: number}>} [options.downloads] What starting R downloads; a null host is the page's own address.
 * @param {?string} [options.unavailable] On a page that cannot start R, the sentence that says so; the tab then offers no form.
 * @param {?string} [options.open] The tab to offer once a study is built: the RBQM tab's address.
 * @param {number} [options.limit] How long R is waited on, in seconds, before the tab gives up.
 * @returns {{id: string, title: string, tag: Function, render: Function, state: Function}} The view, as page.js takes one.
 */
export function builderTab({
  createConnection,
  r = {},
  downloads = [],
  unavailable = null,
  open = null,
  limit = 600
} = {}) {
  // idle → building → done, or → failed.
  let phase = 'idle';
  let stage = '';
  let form = { ...BUILDER_DEFAULTS };
  let problems = [];
  let failure = '';
  let built = null; // { said, files } of the last study built
  let connection = null;
  let shown = null; // { container, app } of the view as it is on the page now
  let builds = 0;

  const canBuild = typeof createConnection === 'function' && !unavailable;

  /** Draw the view again where it is on the page, and say again what its tab says. */
  function redraw() {
    if (!shown) return;
    if (typeof shown.app.redrawView === 'function') shown.app.redrawView(BUILDER_TAB_ID);
    else draw(shown.container, shown.app);
  }

  /** Wait on R, but not for ever: an R that stops answering is given up on. */
  function within(promise) {
    let timer;
    const silent = new Promise((resolve) => {
      timer = setTimeout(() => resolve(SILENT), limit * 1000);
    });
    return Promise.race([promise, silent]).finally(() => clearTimeout(timer));
  }

  async function build(app) {
    const read = readForm(form);
    problems = read.problems;
    if (!read.args || phase === 'building') {
      redraw();
      return;
    }
    const mine = ++builds;
    phase = 'building';
    failure = '';
    stage = connection ? 'Simulating the study…' : STAGE_WORDS.runtime;
    redraw();
    if (!connection) {
      connection = createConnection({
        packages: r.packages || [],
        repos: r.repos || [],
        files: r.files || [],
        source: r.source || [],
        onStage: (name) => {
          if (mine !== builds || phase !== 'building') return;
          stage = STAGE_WORDS[name] || stage;
          redraw();
        }
      });
    }
    let answer;
    try {
      answer = await within(
        connection.run(r.call, {
          args: { simulator: r.simulator, ...read.args },
          onFiles: () => {
            if (mine !== builds || phase !== 'building') return;
            stage = 'Simulating the study…';
            redraw();
          }
        })
      );
    } catch (error) {
      answer = { status: 'error', message: messageOf(error) };
    }
    if (mine !== builds) return;
    if (answer === SILENT) {
      // An R that gave no answer is let go of: the next build starts another.
      const stale = connection;
      connection = null;
      if (stale && typeof stale.close === 'function') stale.close();
      phase = 'failed';
      failure = `R gave no answer in ${limit} seconds, so the build was stopped. Press Build to try again.`;
      redraw();
      return;
    }
    if (!answer || answer.status !== 'ok') {
      phase = 'failed';
      failure =
        answer && answer.status === 'unavailable'
          ? `R could not be started in this browser: ${answer.message}`
          : `The study was not built. R said: ${answer ? answer.message : 'nothing'}`;
      redraw();
      return;
    }
    const files = builtFiles(answer.value);
    if (!files) {
      phase = 'failed';
      failure = 'The study was not built: R returned no files that can be read.';
      redraw();
      return;
    }
    const said = builtSaid(answer.value, read.args);
    built = { said, files: files.map(({ name, rows }) => ({ name, rows })) };
    phase = 'done';
    // The app loads the files as it loads a reader's own raw files, and draws
    // the open view again: this one, which now says what was built. The
    // sentence is said here and not as a note of the load, which is amber.
    app.loadRaw(files.map(({ name, text }) => ({ name, text })));
    redraw();
  }

  function field(labelText, control, hint) {
    const wrap = el('label', 'sva-build-field');
    wrap.append(el('span', 'sva-build-label', labelText), control);
    if (hint) wrap.append(el('span', 'sva-build-hint', hint));
    return wrap;
  }

  function select(name, options, app) {
    const control = el('select', 'sva-select');
    control.name = name;
    for (const [value, label] of options) {
      const option = el('option', null, label);
      option.value = value;
      control.append(option);
    }
    control.value = form[name];
    control.disabled = phase === 'building';
    control.onchange = () => {
      // A phase fills in a typical size; every other choice is its own.
      form = name === 'phase' ? withPhase(form, control.value) : { ...form, [name]: control.value };
      if (name === 'phase') redraw();
    };
    return control;
  }

  function input(name, { type = 'text', min, max } = {}) {
    const control = el('input', 'sva-select sva-build-input');
    control.name = name;
    control.type = type;
    if (type === 'number') {
      control.inputMode = 'numeric';
      control.step = '1';
      if (min !== undefined) control.min = String(min);
      if (max !== undefined) control.max = String(max);
    }
    control.value = form[name];
    control.disabled = phase === 'building';
    control.oninput = () => {
      form = { ...form, [name]: control.value };
    };
    return control;
  }

  function draw(container, app) {
    container.textContent = '';
    container.classList.add('sva-build');
    container.append(el('h2', 'sva-rbqm-heading', 'Build a study'));
    container.append(
      el(
        'p',
        'sva-message',
        'Describe a trial, and gsm.datasim simulates it in this browser. The study is loaded as ' +
          'gsm’s raw files, ready for the RBQM tab.'
      )
    );
    if (!canBuild) {
      container.append(
        note({
          kind: 'warning',
          say: unavailable || 'This page cannot start R, so it cannot build a study.'
        })
      );
      return;
    }

    const body = el('form', 'sva-build-form');
    body.noValidate = true;
    body.onsubmit = (event) => {
      event.preventDefault();
      build(app);
    };
    const { participants, sites, months } = BUILDER_LIMITS;
    body.append(
      field('Study name', input('name')),
      field(
        'Phase',
        select(
          'phase',
          BUILDER_PHASES.map((entry) => [entry.id, entry.label]),
          app
        ),
        'Fills in a typical size.'
      ),
      field(
        'Therapeutic area',
        select(
          'area',
          BUILDER_AREAS.map((area) => [area, area]),
          app
        )
      ),
      field(
        'Participants',
        input('participants', { type: 'number', ...participants }),
        `${participants.min} to ${participants.max}`
      ),
      field('Sites', input('sites', { type: 'number', ...sites }), `${sites.min} to ${sites.max}`),
      field(
        'Months',
        input('months', { type: 'number', ...months }),
        `${months.min} to ${months.max}`
      ),
      field(
        'Outliers',
        select(
          'outliers',
          BUILDER_OUTLIERS.map((entry) => [entry.id, entry.label]),
          app
        )
      ),
      field(
        'Seed',
        input('seed', { type: 'number', min: 0 }),
        'Optional: the same seed builds the same study.'
      )
    );
    const actions = el('div', 'sva-build-actions');
    const press = el(
      'button',
      'sva-button sva-build-go',
      phase === 'building' ? 'Building…' : 'Build'
    );
    press.type = 'submit';
    press.disabled = phase === 'building';
    actions.append(press);
    body.append(actions);
    container.append(body);

    if (problems.length) {
      const list = el('ul', 'sva-build-problems');
      for (const problem of problems) list.append(el('li', null, problem));
      const box = el('div', 'sva-message sva-problem');
      box.setAttribute('role', 'alert');
      box.append(list);
      container.append(box);
    }
    if (phase === 'building') {
      const status = note({ say: stage, busy: true, role: 'status' });
      status.classList.add('sva-build-status');
      container.append(status);
    }
    if (phase === 'failed') {
      const box = el('p', 'sva-message sva-problem', failure);
      box.setAttribute('role', 'alert');
      container.append(box);
    }
    if (phase === 'done' && built) {
      const done = el('div', 'sva-build-done');
      done.setAttribute('role', 'status');
      done.append(el('p', 'sva-message', built.said));
      const list = el('ul', 'sva-build-files');
      for (const file of built.files) {
        list.append(
          el(
            'li',
            null,
            `${file.name}: ${file.rows.toLocaleString('en-US')} row${file.rows === 1 ? '' : 's'}`
          )
        );
      }
      done.append(list);
      if (open) {
        const go = el('button', 'sva-button sva-build-open', 'Open the RBQM tab');
        go.type = 'button';
        go.onclick = () => app.select(open);
        done.append(go);
      }
      container.append(done);
    }

    const said = downloadsSaid(downloads);
    if (said && !connection) container.append(note({ say: said }));
    const caveats = el('ul', 'sva-build-caveats');
    for (const caveat of BUILDER_CAVEATS) caveats.append(el('li', null, caveat));
    container.append(el('h3', 'sva-build-subheading', 'What this study is, and is not'), caveats);
  }

  return {
    id: BUILDER_TAB_ID,
    title: 'Build a study',
    /** What the tab's count says: nothing until a study is being built or was. */
    tag: () => ({ building: 'building', done: 'built', failed: 'failed' })[phase] || '',
    /** The tab's state, for the tests and the page. */
    state: () => ({ phase, stage, form: { ...form }, problems: [...problems], failure, built }),
    render(container, app) {
      shown = { container, app };
      draw(container, app);
      return {
        destroy() {
          if (shown && shown.container === container) shown = null;
        }
      };
    }
  };
}
