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

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const rowsOf = (value) => (Array.isArray(value) ? value.filter(isRecord) : []);

/** A count with its noun: "1 file", "9 files". */
const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "a", "a and b", "a, b and c". */
export function listed(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** A sentence that ends in one full stop, whatever it was handed. */
const sentence = (text) => `${String(text).trim().replace(/\.+$/, '')}.`;

/**
 * Where starting R downloads from, and about how much from each, in words:
 * "R itself from webr.r-wasm.org (about 13 MB), ...".
 * @param {Array<{what: string, host: ?string, megabytes: number}>} downloads Each download; a null host is the page's own address.
 * @returns {string} The phrase.
 */
export function downloadsPhrase(downloads) {
  return listed(
    downloads.map(
      ({ what, host, megabytes }) => `${what} from ${host || 'this page'} (about ${megabytes} MB)`
    )
  );
}

/** The megabytes of every download together. */
export const totalMegabytes = (downloads) =>
  downloads.reduce((sum, { megabytes }) => sum + megabytes, 0);

/**
 * What the tab says before R is started: what starting it downloads, and from
 * where, and that the files stay here.
 * @param {number} files How many raw files are loaded.
 * @param {Array<{what: string, host: ?string, megabytes: number}>} downloads The downloads.
 * @returns {string} The sentences.
 */
export function needSentence(files, downloads) {
  return (
    `Start R to run gsm’s workflows on the ${counted(files, 'loaded raw file')}. ` +
    `It downloads about ${totalMegabytes(downloads)} MB, once: ${downloadsPhrase(downloads)}. ` +
    'The files stay in this browser, and R runs here.'
  );
}

/** What the tab says when no raw file is loaded: there is nothing to run. */
export const NO_FILES =
  'No gsm raw files are loaded. Drop your own here, or choose the RBQM study on the Data tab; the metrics run on those files.';

/** What the tab says when files are loaded and none is a gsm raw file. */
export const NONE_PLACED =
  'None of the loaded files was placed in a gsm raw domain, so there is nothing for R to run.';

/**
 * What the tab says R is doing, for every step from the press to the first
 * result, with how long it has been since the press.
 * @param {string} step `runtime`, `packages`, `files`, `source`, `attach` or `run`.
 * @param {{seconds: number, files: number, downloads: Array<{what: string, host: ?string, megabytes: number}>}} context Whole seconds since the press, how many raw files are loaded, and the downloads.
 * @returns {string} The sentence.
 */
export function stepSentence(step, { seconds, files, downloads }) {
  const from = (index) =>
    `about ${downloads[index].megabytes} MB from ${downloads[index].host || 'this page'}`;
  const packages = downloads.slice(1).map((_, index) => from(index + 1));
  const doing = {
    runtime: `Starting R: downloading R itself, ${from(0)}.`,
    packages: `Starting R: installing its packages, ${listed(packages)}. This is the longest step.`,
    files: 'Starting R: fetching gsm’s workflow files from this page.',
    source: 'Starting R: reading the pipeline’s R.',
    attach:
      'R has started. Loading gsm’s packages in R; the database they query with takes the longest.',
    run: `Running gsm’s workflows on the ${counted(files, 'loaded file')}: the mappings, then each metric, then the reporting tables.`
  }[step];
  return `${doing || 'Starting R.'} ${counted(seconds, 'second')} so far.`;
}

/**
 * What the tab says when R did not start, or stopped.
 * @param {'start'|'attach'|'run'} when What R was doing.
 * @param {?string} message What R or the browser said.
 * @returns {string} The sentences.
 */
export function failureSentence(when, message) {
  const why = message ? sentence(message) : 'No reason was given.';
  if (when === 'run') return `R stopped while running the workflows: ${why}`;
  const what = when === 'attach' ? 'R started, but gsm’s packages did not load' : 'R did not start';
  return `${what}: ${why} Try again; if it fails again, reload the page.`;
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
  const named = groups.some(
    (row) => row.GroupLevel === level && row.Param === 'InvestigatorLastName'
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
 * What the tab says once R has answered: how many metrics ran, on how many
 * files, how long R took, and the versions R reports.
 * @param {Object} answer What `rbqm_run` returned.
 * @param {{files: number, seconds: number, sinceStart: ?number, snapshotDate: string}} run The files the run was given, how long the run took, how long it was from the press that started R to this result (null for a later run), and the snapshot's date.
 * @returns {string} The sentences.
 */
export function doneSentence(answer, { files, seconds, sinceStart, snapshotDate }) {
  const metrics = metricList(answer);
  const ran = metrics.filter((metric) => metric.ran).length;
  const versions = isRecord(answer.versions) ? answer.versions : {};
  const named = ['R', 'gsm.core', 'gsm.mapping', 'gsm.reporting', 'workr']
    .filter((name) => versions[name])
    .map((name) => `${name} ${versions[name]}`);
  return (
    `R ran ${ran} of ${counted(metrics.length, 'metric')} on the ${counted(files, 'loaded file')} ` +
    `in ${counted(seconds, 'second')}` +
    (sinceStart === null || sinceStart === undefined
      ? '.'
      : `, ${counted(sinceStart, 'second')} after Start R was pressed.`) +
    ` The snapshot is dated ${snapshotDate}.` +
    (named.length ? ` ${listed(named)}.` : '')
  );
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
