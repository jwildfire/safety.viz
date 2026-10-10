// Demo app: the RBQM tab's words and the tables it hands to gsm.viz (#235,
// obot.roadmap#374). The tab runs gsm's workflows in R in this browser on the
// loaded raw files (site/rbqm/pipeline.R) and draws what R returns with
// gsm.viz's own charts. This module is the part of that with no document in
// it: what the tab says before, while and after R runs, and which of R's rows
// each chart is given.
//
// Nothing here computes a number the tab shows. R's tables are passed on as R
// returned them: a chart is given the rows of its metric, picked out by the
// metric's ID, and nothing in a row is changed. The seconds a step has taken
// and the megabytes a download is said to be are not statistics of the study.
//
// What is said of R starting, of R being ready and of R not starting is said
// in the words every tab that starts R uses (r-words.js, #277).
import { browserSaid, rWords, waitSaid } from './r-words.js';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const rowsOf = (value) => (Array.isArray(value) ? value.filter(isRecord) : []);

/** A count with its noun: "1 file", "9 files". */
const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "a", "a and b", "a, b and c". */
export function listed(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The megabytes of every download together. */
export const totalMegabytes = (downloads) =>
  downloads.reduce((sum, { megabytes }) => sum + megabytes, 0);

/**
 * What the workflows run on, in a phrase: the raw files that are loaded, the
 * files of the loaded study that stand in for raw tables (#253), or both.
 * @param {number} files How many raw files R is handed.
 * @param {string[]} [study] The loaded study's files R is handed, by name.
 * @param {string} [word] What a raw file is called here.
 * @returns {string} "the 9 loaded files", "the loaded study’s adsl.csv and adae.csv", or the two joined.
 */
export function ranOn(files, study = [], word = 'loaded file') {
  const parts = [];
  if (files || !study.length) parts.push(`the ${counted(files, word)}`);
  if (study.length) parts.push(`the loaded study’s ${listed(study)}`);
  return parts.join(' and ');
}

/**
 * The tab's footnote (#271): one link, to gsm's own documentation of the
 * metrics the tab runs (@jwildfire, 2026-10-10). The docs site builds no page
 * for the tab, so there is no link to one, nor to test evidence. The address is
 * followed only when the reader clicks it: the app asks nothing of that host.
 */
export const RBQM_DOCS = Object.freeze({
  key: 'docs',
  label: 'gsm.kri documentation',
  href: 'https://gilead-public.github.io/gsm.kri/'
});

/** What the tab says when nothing the metrics can run on is loaded. */
export const NO_FILES =
  'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or load gsm raw files there.';

/** What the tab says when files are loaded and none is one the metrics can run on. */
export const NONE_PLACED =
  'None of the loaded files is a subject-level or adverse events file, or a gsm raw file, so there is nothing for R to run.';

/**
 * What the Data tab's card says of the loaded data (#281, obot.roadmap#406):
 * how many metrics it supports, as the card's sentence and as the workflow's
 * third step counts them; what the card says of a metric's state, under the
 * key to its marks and in the metric's full name; the title over the reasons;
 * and the small print. Nothing here says why a metric cannot run: those
 * sentences are R's (rbqm-files.js).
 * @param {number} can How many metrics the loaded data supports.
 * @param {number} of How many metrics there are.
 * @returns {{say: string, lead: string, also: string, states: Object<string, string>, why: function(number): string, note: string}} The words.
 */
export function supportWords(can, of) {
  const count = `${can} of ${counted(of, 'metric')}`;
  return {
    say: `This data supports ${count}.`,
    lead: `${count} supported`,
    also: `${can} of ${of} RBQM ${of === 1 ? 'metric' : 'metrics'}`,
    // In the order the key lists them.
    states: {
      ran: 'ran',
      running: 'running',
      todo: 'not started',
      cannot: 'cannot run: missing data'
    },
    why: (count) => `Why ${count} cannot run`,
    note: 'Read from the files’ names and columns. R says the same when it runs.'
  };
}

/**
 * What a kept raw file's card says of it on the Data tab (#281): the raw
 * domain it was placed in and how that was told, or that it was placed in none.
 * @param {{table: ?string, by: ?string}} entry One file of rawStudy's (rbqm-files.js).
 * @returns {string} The few words of the card's tag.
 */
export const rawTag = (entry) =>
  entry.table
    ? `gsm raw file: ${entry.table}, by its ${entry.by === 'name' ? 'name' : 'columns'}`
    : 'gsm raw file: not recognised';

/** Every address starting R downloads from, in words: "webr.r-wasm.org, repo.r-wasm.org and this page". */
export const hostsSaid = (downloads) =>
  listed([...new Set(downloads.map(({ host }) => host || 'this page'))]);

/**
 * The sentences the tab shares with every tab that starts R (r-words.js).
 * @param {Array<{what: string, host: ?string, megabytes: number}>} downloads The downloads.
 * @returns {Object} The sentences.
 */
export const rbqmWords = (downloads) =>
  rWords({
    needs: 'Site metrics',
    verb: 'run them',
    megabytes: totalMegabytes(downloads),
    from: hostsSaid(downloads),
    appears: 'The metrics',
    missing: 'no metric was run',
    still: 'No metric was run.'
  });

/**
 * How long the tab waits on R at each step before it gives up, in seconds
 * (#261). Each is many times the longest that step was measured to take: the
 * start downloads about 55 MB, which a slow connection takes minutes over;
 * loading gsm's packages took 16 seconds by hand and the workflows 3.
 */
export const R_LIMITS = Object.freeze({ start: 600, attach: 180, run: 300 });

/** What R was doing at each step, as the sentence for an R that stopped answering names it. */
const DOING = {
  start: 'it was starting',
  attach: 'it was loading gsm’s packages',
  run: 'it was running the workflows'
};

/**
 * What the tab says when R did not start, or stopped: a few words for the
 * control, what its button does, one plain reason, and what the browser or R
 * said, which is shown only when a reader asks for it.
 * @param {'start'|'attach'|'run'} when What R was doing.
 * @param {?string} message What R or the browser said.
 * @param {Object} [context]
 * @param {Array<{what: string, host: ?string, megabytes: number}>} [context.downloads] The downloads.
 * @param {?string} [context.step] The step of starting R that failed: `runtime`, `packages`, `files` or `source`.
 * @param {?number} [context.silent] When R gave no answer, the seconds it was waited on.
 * @returns {{say: string, label: string, why: string, details: Object}} What the control is handed (src/app/libraries.js::controlState).
 */
export function failureOf(when, message, { downloads = [], step = null, silent = null } = {}) {
  const words = rbqmWords(downloads);
  const details = (heading, reason, more = null, moreTitle = 'What the browser said') => ({
    heading,
    text: [reason],
    ...(more ? { more: [more], moreTitle } : {})
  });
  if (silent !== null) {
    return {
      say: words.stopped,
      label: words.again,
      why: words.why,
      details: details(words.stopped, words.stoppedReason(waitSaid(silent), DOING[when]))
    };
  }
  if (when === 'run') {
    return {
      say: 'R stopped',
      label: 'Run again',
      why: words.why,
      details: details(
        'R stopped',
        'R stopped while it was running gsm’s workflows, so there are no results. Run again; if it stops again, reload the page.',
        browserSaid(message, 'R'),
        'What R said'
      )
    };
  }
  // What was being downloaded when R did not start, and from where.
  const from = (index) => (downloads[index] && downloads[index].host) || 'this page';
  const fetching = {
    runtime: () => words.failedReason('R', from(0)),
    packages: () =>
      words.failedReason(
        'R’s packages',
        listed([...new Set(downloads.slice(1).map((_, index) => from(index + 1)))])
      ),
    files: () => words.failedReason('gsm’s workflow files', 'this page')
  };
  const reason =
    when === 'attach'
      ? 'R started, but gsm’s packages did not load in it. Try again; if it fails again, reload the page. No metric was run.'
      : fetching[step]
        ? fetching[step]()
        : words.failedOther;
  return {
    say: words.failed,
    label: words.again,
    why: words.why,
    details: details(
      words.failed,
      reason,
      browserSaid(message, when === 'attach' ? 'R' : 'The browser'),
      when === 'attach' ? 'What R said' : 'What the browser said'
    )
  };
}

/**
 * The six steps from a press to the first result, as the tab names them (#280):
 * what the control says while each runs, what the body's list says, and what
 * Run details says once it is done. `from` are the names the connection and
 * the tab give the moments that make up the step.
 */
export const RUN_STEPS = Object.freeze([
  { id: 'runtime', from: ['runtime'], say: 'Downloading R', done: 'Downloaded R' },
  {
    id: 'packages',
    from: ['packages'],
    say: 'Installing R packages',
    done: 'Installed R packages'
  },
  {
    id: 'files',
    from: ['files', 'source'],
    say: 'Fetching gsm’s workflow files',
    done: 'Fetched gsm’s workflow files'
  },
  {
    id: 'attach',
    from: ['attach'],
    say: 'Loading gsm’s packages',
    // The one step called the long one (#277): 16 of 23 seconds, by hand.
    long: true,
    done: 'Loaded gsm’s packages'
  },
  { id: 'read', from: ['read'], say: 'Reading the study', done: 'Read the study' },
  { id: 'run', from: ['run'], say: 'Running the workflows', done: 'Ran the workflows' }
]);

/** Which of the six steps a moment belongs to, from 1; 1 for one it does not know. */
export const stepNumber = (moment) =>
  Math.max(1, RUN_STEPS.findIndex((step) => step.from.includes(moment)) + 1);

/** What the control says of a step: "2 of 6 · Installing R packages". */
export const stepSaid = (moment) => {
  const index = stepNumber(moment);
  return `${index} of ${RUN_STEPS.length} · ${RUN_STEPS[index - 1].say}`;
};

/** What the body's list says of each step: the long one is called so, and no other. */
export const stepLines = () =>
  RUN_STEPS.map((step) => (step.long ? `${step.say}, the long one` : step.say));

/**
 * What a run was on, as the line above the table names it: the loaded demo
 * study by its name ("the Pilot study", "the “Renamed columns” study"), or the
 * files as `ranOn` says them.
 * @param {number} files How many raw files R was handed.
 * @param {string[]} study The loaded study's files R was handed, by name.
 * @param {?string} [name] The loaded demo study's name ("Pilot study"), when what is loaded is one.
 * @returns {string} The phrase.
 */
export const ranOnSaid = (files, study = [], name = null) => {
  if (!(name && study.length && !files)) return ranOn(files, study);
  // A name that does not end in "study" is said as one (#309): "the Renamed
  // columns" reads as columns, not as a study.
  return /\bstudy$/i.test(name) ? `the ${name}` : `the “${name}” study`;
};

/** Seconds, as a result line says them: "3.1 seconds", "1 second". */
const secondsSaid = (seconds) => counted(seconds, 'second');

/**
 * The one line above the site overview (#280): what ran, on what and how
 * long it took, and then what a reader can do about the rest, which ends in a
 * link the tab adds.
 * @param {Object} answer What `rbqm_run` returned.
 * @param {{files: number, study?: string[], seconds: number, name?: ?string}} run The run.
 * @returns {{ran: string, rest: string}} The sentence, and the words that lead to the link.
 */
export function outcomeSaid(answer, { files, study = [], seconds, name = null }) {
  const metrics = metricList(answer);
  const ran = metrics.filter((metric) => metric.ran).length;
  const others = metrics.length - ran;
  return {
    ran:
      `R ran ${ran} of ${counted(metrics.length, 'metric')} on ${ranOnSaid(files, study, name)} ` +
      `in ${secondsSaid(seconds)}.`,
    rest: others
      ? `The other ${others} ${others === 1 ? 'needs' : 'need'} data it does not have: `
      : 'To use other files, '
  };
}

/**
 * What the chip's panel holds once R has run (#280): the steps, what R was
 * handed, why any metric did not run, the versions, and R's warnings.
 * @param {Object} answer What `rbqm_run` returned.
 * @param {Object} run The run: `files`, `study`, `name`, `webr` (the runtime's version), `seconds`, `sinceStart` (null for a run that started nothing), `snapshotDate`, `handed` (a sentence for each thing R was handed), `notes` (sentences about the load) and `copies`.
 * @param {Array<{what: string, host: ?string, megabytes: number}>} downloads The downloads.
 * @returns {{text: string[], columns: Array<Array<Object>>}} The panel's opening sentence and its three columns.
 */
export function runDetails(answer, run, downloads) {
  const metrics = metricList(answer);
  const ran = metrics.filter((metric) => metric.ran);
  const not = metrics.filter((metric) => !metric.ran);
  const versions = isRecord(answer.versions) ? answer.versions : {};
  const started = run.sinceStart !== null && run.sinceStart !== undefined;
  const megabytes = (from) => downloads.slice(...from).reduce((sum, one) => sum + one.megabytes, 0);
  // What each step is known to have cost: the downloads' sizes, and the run's time.
  const notes = { runtime: `${megabytes([0, 1])} MB`, packages: `${megabytes([1])} MB` };
  const steps = RUN_STEPS.filter(
    (step) => step.id !== 'read' && (started || step.id === 'run')
  ).map((step) => ({
    say: step.done,
    note: step.id === 'run' ? `${run.seconds} s` : notes[step.id] || null,
    state: 'done'
  }));
  const gsm = ['gsm.core', 'gsm.mapping', 'gsm.reporting', 'workr']
    .filter((name) => versions[name])
    .map((name) => `${name} ${versions[name]}`);
  const said = [
    ...(Array.isArray(answer.notes) ? answer.notes : []),
    ...(answer.groups && answer.groups.state !== 'ran' && answer.groups.message
      ? [answer.groups.message]
      : []),
    ...(run.notes || [])
  ];
  const warnings = warningsSaid(answer);
  return {
    text: [
      `It ran ${ran.length} of ${counted(metrics.length, 'metric')} on ` +
        `${ranOnSaid(run.files, run.study, run.name)}. About ${totalMegabytes(downloads)} MB ` +
        'was downloaded, once; the study’s data stays here.'
    ],
    columns: [
      [
        {
          title: 'Steps',
          steps,
          text: [
            started
              ? `${secondsSaid(run.sinceStart)} from the press to the charts.`
              : 'R was already running, so only the last step ran again.'
          ]
        }
      ],
      [
        { title: 'What R was handed', items: run.handed || [] },
        {
          title: 'Did not run',
          items: not.length
            ? not.map((metric) => metric.message)
            : [`Nothing: all ${metrics.length} ran.`]
        },
        ...(said.length ? [{ title: 'Notes', items: said }] : [])
      ],
      [
        {
          title: 'Versions',
          rows: [
            ['R', versions.R ? `${versions.R}${run.webr ? `, on webR ${run.webr}` : ''}` : null],
            ['gsm', gsm.length ? gsm.join(', ') : null],
            [
              'Metric workflows',
              run.copies ? `${run.copies.workflows.name} ${run.copies.workflows.version}` : null
            ],
            [
              'Charts',
              run.copies ? `${run.copies.charts.name} ${run.copies.charts.version}` : null
            ],
            ['Snapshot', run.snapshotDate]
          ]
        },
        { title: 'Warnings from R', items: warnings.length ? warnings : ['None.'] }
      ]
    ]
  };
}

/**
 * The metrics R was asked for, as the tab lists them: each with the ID its
 * rows carry in R's tables when it ran. That ID is gsm's own, the workflow's
 * type and ID as R joins them (`Analysis_kri0001`); it is read from R's
 * Metrics table and never assembled here, and a reader is shown the metric's
 * name and abbreviation instead.
 * @param {Object} answer What `rbqm_run` returned.
 * @returns {Array<{id: string, metricId: ?string, name: string, abbreviation: string, ran: boolean, message: string}>} One entry per metric, in R's order.
 */
export function metricList(answer) {
  const metrics = rowsOf(answer && answer.Metrics);
  return rowsOf(answer && answer.status).map((entry) => {
    const row = metrics.find((metric) => metric.ID === entry.id);
    const ran = entry.state === 'ran' && Boolean(row);
    return {
      id: String(entry.id),
      metricId: ran ? row.MetricID : null,
      name: String(entry.metric || entry.id),
      abbreviation: String(entry.abbreviation || entry.id),
      ran,
      message: ran ? '' : String(entry.message || `${entry.metric || entry.id} did not run.`)
    };
  });
}

/** A copy of each row: gsm.viz writes to the rows it is given. */
const copies = (rows) => rows.map((row) => ({ ...row }));

/**
 * What gsm.viz's group overview is handed: every Results row, the Groups table
 * and the Metrics table, as R returned them.
 *
 * gsm.viz cannot draw the table with no group table at all. When R made none
 * (the study's site and study files are not loaded) it is handed one row per
 * site that names the site and nothing else, so the table still has a row for
 * each site R scored; `standIn` says so, and the tab says so in words.
 * @param {Object} answer What `rbqm_run` returned.
 * @returns {{results: Object[], groups: Object[], metrics: Object[], config: Object, standIn: boolean}} The chart's arguments.
 */
export function overviewInputs(answer) {
  const results = rowsOf(answer.Results);
  const metrics = rowsOf(answer.Metrics);
  const groups = rowsOf(answer.Groups);
  const level = metrics.length ? metrics[0].GroupLevel : 'Site';
  const standIn = !groups.some((row) => row.GroupLevel === level);
  // A site is labelled with its investigator's name only when R's Groups table
  // has one: a table made from a study's subject-level file names no one.
  const named = groups.some(
    (row) =>
      row.GroupLevel === level &&
      row.Param === 'InvestigatorLastName' &&
      row.Value !== null &&
      row.Value !== undefined &&
      row.Value !== ''
  );
  return {
    results: copies(results),
    groups: standIn
      ? [...new Set(results.map((row) => row.GroupID))].map((id) => ({
          GroupID: id,
          GroupLevel: level,
          Param: 'GroupID',
          Value: id
        }))
      : copies(groups),
    metrics: copies(metrics),
    config: { GroupLevel: level, groupLabelKey: named ? 'InvestigatorLastName' : null },
    standIn
  };
}

/**
 * What gsm.viz's scatter plot and bar chart are handed for one metric: its
 * Results rows, its row of the Metrics table, its Bounds rows, its thresholds
 * as the numbers R parsed, and the Groups table. The bounds are always R's:
 * handed none, gsm.viz would work bounds out itself, in JavaScript.
 * @param {Object} answer What `rbqm_run` returned.
 * @param {string} metricId The metric's ID in R's tables.
 * @returns {?{results: Object[], metric: Object, bounds: Object[], thresholds: number[], groups: ?Object[]}} The charts' arguments, or null when R returned no such metric.
 */
export function metricInputs(answer, metricId) {
  const metric = rowsOf(answer.Metrics).find((row) => row.MetricID === metricId);
  if (!metric) return null;
  const of = (rows) => copies(rowsOf(rows).filter((row) => row.MetricID === metricId));
  const groups = rowsOf(answer.Groups);
  const thresholds = isRecord(answer.thresholds) ? answer.thresholds[metricId] : null;
  return {
    results: of(answer.Results),
    metric: { ...metric },
    bounds: of(answer.Bounds),
    thresholds: Array.isArray(thresholds) ? [...thresholds] : [thresholds].filter(Number.isFinite),
    groups: groups.length ? copies(groups) : null
  };
}

/**
 * What R warned of along the way, each as a sentence the tab shows beside the
 * run's notes: gsm says in a warning when it leaves a participant or a site
 * out of a metric, and the reader is owed that. The words are R's.
 * @param {{warnings?: string[]|string}} answer What R returned.
 * @returns {string[]} One sentence per warning, in R's order.
 */
export function warningsSaid(answer) {
  const given = answer && answer.warnings;
  const warnings = Array.isArray(given) ? given : typeof given === 'string' ? [given] : [];
  return warnings
    .map((warning) => String(warning).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((warning) => `R warned: ${warning.replace(/[.]*$/, '.')}`);
}

/**
 * A date as R reads one: the reader's own calendar day, `2026-10-07`.
 * @param {Date} date The moment.
 * @returns {string} The day.
 */
export function isoDay(date) {
  const two = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Whether two lists hold the same loaded files, in the same order. */
export const sameFiles = (left, right) =>
  left.length === right.length && left.every((file, index) => file === right[index]);
