// The RBQM pipeline's run, written down once (#231, obot.roadmap#373): the
// files R is given, where each goes in R's own file system, and the one call
// made. The browser test hands this to the connection to R in the browser
// (src/app/r-browser.js), and scripts/rbqm-reference.mjs hands the same to
// desktop R, so the two runs differ only in the R that runs them.
//
// What R is given:
//   site/rbqm/pipeline.R            the one R function, `rbqm_run`
//   site/vendor/gsm.mapping/...     the mapping workflows, as copied from the tag
//   site/vendor/gsm.kri/...         the metric workflows, and the one R file of
//                                   gsm.kri's the Results workflow needs
//   site/vendor/gsm.reporting/...   the reporting workflows
//   site/data/rbqm/Raw_*.csv        the demo study's raw files
//
// The packages are the four built for R in the browser (#229), installed from
// the page's own address, with their dependencies from the public index.

import {
  GSM_KRI_WORKFLOWS,
  GSM_MAPPING_WORKFLOWS,
  GSM_REPORTING_WORKFLOWS,
  RBQM_STUDY,
  keepColumns,
  sha256
} from './vendor-lib.mjs';
import { R_WASM_DIRECTORY, REPOSITORY_DIRECTORY } from './r-wasm-lib.mjs';

/** Where everything goes in R's file system. */
const ROOT = '/rbqm';
const PIPELINE = 'site/rbqm/pipeline.R';
const inR = (source, file) => `${ROOT}/${source.directory.split('/').pop()}/${file}`;

/** The gate's one metric: adverse event rate by site. */
export const RBQM_GATE = {
  /** The R function called, and the file that defines it. */
  call: 'rbqm_run',
  pipeline: PIPELINE,
  /** The metric workflows run. */
  metrics: ['kri0001'],
  /**
   * The raw files it is given, of the demo study's nine (#233): subjects and
   * adverse events for the metric, and sites, the study and enrolment for the
   * Groups table.
   */
  domains: ['SUBJ', 'AE', 'SITE', 'STUDY', 'ENROLL'],
  /** One snapshot, on a date that is given so two runs give the same rows. */
  snapshotDate: '2026-10-07',
  /** The packages R installs, and the public index their dependencies come from. */
  packages: ['workr', 'gsm.core', 'gsm.mapping', 'gsm.reporting'],
  repository: `${R_WASM_DIRECTORY}/${REPOSITORY_DIRECTORY}`,
  publicIndex: 'https://repo.r-wasm.org',
  /** Desktop R's rows, written by scripts/rbqm-reference.mjs. */
  expected: 'tests/fixtures/rbqm/expected.json'
};

/**
 * Every file R is given before the run, with where it goes in R's file system.
 * @returns {Array<{file: string, path: string}>} The repository's path and R's.
 */
export function pipelineFiles() {
  return [
    { file: PIPELINE, path: `${ROOT}/pipeline.R` },
    ...[GSM_MAPPING_WORKFLOWS, GSM_KRI_WORKFLOWS, GSM_REPORTING_WORKFLOWS].flatMap((source) =>
      source.files.map((entry) => ({
        file: `${source.directory}/${entry.file}`,
        path: inR(source, entry.file)
      }))
    )
  ];
}

/**
 * The demo study's raw files the run is given, with where each goes in R's
 * file system.
 * @returns {Array<{file: string, path: string}>} The repository's path and R's.
 */
export const studyFiles = () =>
  RBQM_GATE.domains.map((domain) => {
    const entry = RBQM_STUDY.files.find((candidate) => candidate.file === `Raw_${domain}.csv`);
    return { file: `${RBQM_STUDY.directory}/${entry.file}`, path: `${ROOT}/data/${entry.file}` };
  });

/**
 * The arguments `rbqm_run` is called with: where in R's file system the raw
 * files and each stage's workflows are, the metrics to run and the snapshot's
 * date.
 * @param {(path: string) => string} [place] Where a path of R's file system is, for a run that keeps the files elsewhere: desktop R reads them from the repository.
 * @returns {Object} The named arguments.
 */
export function pipelineArgs(place = (path) => path) {
  return {
    data: place(`${ROOT}/data`),
    mappings: place(inR(GSM_MAPPING_WORKFLOWS, 'workflow/1_mappings')),
    metrics: place(inR(GSM_KRI_WORKFLOWS, 'workflow/2_metrics')),
    reporting: place(inR(GSM_REPORTING_WORKFLOWS, 'workflow/3_reporting')),
    helpers: place(inR(GSM_KRI_WORKFLOWS, 'R/util-Report.R')),
    metric_ids: RBQM_GATE.metrics,
    snapshot_date: RBQM_GATE.snapshotDate
  };
}

/**
 * Where a path of R's file system is in the repository: desktop R reads the
 * same files from where the repository keeps them.
 * @param {string} path A path under R's root, as pipelineArgs gives it.
 * @returns {string} The repository's path.
 */
export function inRepository(path) {
  const rest = path.slice(ROOT.length + 1);
  if (rest === 'data') return RBQM_STUDY.directory;
  const source = [GSM_MAPPING_WORKFLOWS, GSM_KRI_WORKFLOWS, GSM_REPORTING_WORKFLOWS].find(
    (candidate) => rest.startsWith(`${candidate.directory.split('/').pop()}/`)
  );
  if (!source) throw new Error(`${path} is not a place the pipeline's files are kept.`);
  return `${source.directory}/${rest.slice(rest.indexOf('/') + 1)}`;
}

/**
 * What desktop R's rows are derived from: every file R is given, by checksum.
 * A test fails when one changes and the reference has not been written again.
 * @param {(file: string) => Uint8Array} read The bytes of one repository file.
 * @returns {Array<{file: string, sha256: string}>} One entry per file.
 */
export const derivedFrom = (read) =>
  [...pipelineFiles(), ...studyFiles()].map(({ file }) => ({ file, sha256: sha256(read(file)) }));

/**
 * The columns of a Results row that are R's numbers, compared to eight decimal
 * places, and the ones that say which row it is, compared exactly.
 */
export const RESULT_NUMBERS = ['Numerator', 'Denominator', 'Metric', 'Score', 'Flag'];
export const RESULT_KEYS = ['GroupID', 'GroupLevel', 'MetricID', 'SnapshotDate', 'StudyID'];

// ---- The tab's run: every metric in scope, on the whole study (#234) ----

/** The eight site-level metrics in scope (obot.roadmap#374), by workflow ID. */
export const RBQM_METRICS = [1, 2, 3, 4, 5, 6, 7, 12].map(
  (number) => `kri${String(number).padStart(4, '0')}`
);

/**
 * The run the RBQM tab makes: the gate's, with every metric workflow there is
 * and whatever raw files are loaded. Three studies are run in the browser test
 * and in desktop R alike: the demo study whole, the demo study with its labs
 * file left out, the demo study with one column its adverse events file needs
 * taken out, and two of its files alone, as a reader might load them.
 */
export const RBQM_TAB = {
  call: RBQM_GATE.call,
  /** Attaches the packages; called first, so a page can say what R is doing. */
  attach: 'rbqm_attach',
  pipeline: PIPELINE,
  metrics: RBQM_METRICS,
  snapshotDate: RBQM_GATE.snapshotDate,
  packages: RBQM_GATE.packages,
  repository: RBQM_GATE.repository,
  publicIndex: RBQM_GATE.publicIndex,
  /** Desktop R's answers, written by scripts/rbqm-reference.mjs. */
  expected: 'tests/fixtures/rbqm/expected-tab.json',
  scenarios: [
    { id: 'whole', label: 'the demo study, whole' },
    { id: 'no-labs', label: 'the demo study with its labs file left out', without: ['Raw_LB.csv'] },
    {
      id: 'no-column',
      label: 'the demo study with the seriousness column taken out of its adverse events file',
      dropColumn: { file: 'Raw_AE.csv', column: 'aeser' }
    },
    {
      id: 'two-files',
      label: 'the demo study’s subjects and adverse events files alone',
      only: ['Raw_SUBJ.csv', 'Raw_AE.csv']
    }
  ]
};

/**
 * The whole demo study's raw files, with where each goes in R's file system.
 * @returns {Array<{file: string, path: string}>} The repository's path and R's.
 */
export const tabStudyFiles = () =>
  RBQM_STUDY.files.map((entry) => ({
    file: `${RBQM_STUDY.directory}/${entry.file}`,
    path: `${ROOT}/data/${entry.file}`
  }));

/** The folder of R's file system a scenario's raw files go in: each scenario has its own. */
export const scenarioFolder = (scenario) => `${ROOT}/scenarios/${scenario.id}`;

/**
 * A scenario's raw files, as text by file name: the demo study's, less any the
 * scenario leaves out or all but the ones it names, and with the one column it
 * drops taken out of its file.
 * The browser test and the desktop reference both make them here, so R is
 * given the same bytes in both.
 * @param {Object} scenario An entry of RBQM_TAB.scenarios.
 * @param {(file: string) => Uint8Array} read The bytes of one repository file.
 * @returns {Object<string, string>} Each file's text, by its name.
 */
export function scenarioFiles(scenario, read) {
  const files = {};
  for (const entry of RBQM_STUDY.files) {
    if ((scenario.without || []).includes(entry.file)) continue;
    if (scenario.only && !scenario.only.includes(entry.file)) continue;
    let bytes = Buffer.from(read(`${RBQM_STUDY.directory}/${entry.file}`));
    if (scenario.dropColumn && scenario.dropColumn.file === entry.file) {
      const header = bytes
        .subarray(0, bytes.indexOf(10))
        .toString('utf8')
        .split(',')
        .map((name) => name.replace(/\r$/, '').replace(/^"(.*)"$/, '$1'));
      if (!header.includes(scenario.dropColumn.column)) {
        throw new Error(`${entry.file} has no column ${scenario.dropColumn.column} to take out.`);
      }
      bytes = keepColumns(bytes, {
        keep: header.filter((name) => name !== scenario.dropColumn.column),
        reason: 'A scenario of the pipeline’s test.'
      });
    }
    files[entry.file] = bytes.toString('utf8');
  }
  return files;
}

/**
 * The arguments `rbqm_run` is called with for the tab's run: the gate's, with
 * no metric named, so every metric workflow there is is tried, and the raw
 * files where the scenario's are.
 * @param {string} data The folder the raw files are in.
 * @param {(path: string) => string} [place] Where a path of R's file system is, for desktop R.
 * @returns {Object} The named arguments.
 */
export function tabArgs(data, place = (path) => path) {
  // metric_ids is left out: R's default is every workflow in the folder.
  const { metric_ids: _gate, ...rest } = pipelineArgs(place);
  return { ...rest, data, snapshot_date: RBQM_TAB.snapshotDate };
}

/**
 * What desktop R's answers for the tab are derived from: the pipeline's R,
 * every copied workflow and all nine raw files, by checksum.
 * @param {(file: string) => Uint8Array} read The bytes of one repository file.
 * @returns {Array<{file: string, sha256: string}>} One entry per file.
 */
export const tabDerivedFrom = (read) =>
  [...pipelineFiles(), ...tabStudyFiles()].map(({ file }) => ({
    file,
    sha256: sha256(read(file))
  }));
