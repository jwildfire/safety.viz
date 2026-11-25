// The study builder (the demo app's Build a study tab): what R in the browser
// is given to simulate a study with gsm.datasim, and the tab's entry in the
// page's `libraries` option. gsm.datasim is not installed in browser R: its
// own R source, copied from a release tag (site/vendor/gsm.datasim), is
// served beside the app and evaluated as it is by site/builder/builder.R.

import { GSM_DATASIM, GSM_MAPPING_VITALS } from './vendor-lib.mjs';
import { SERVED_AS } from './r-wasm-lib.mjs';
import { RBQM_TAB } from './rbqm-lib.mjs';

/** Where R keeps the builder's files, and what it is asked to call. */
export const BUILDER = {
  /** The R source of the builder, in the repository. */
  source: 'site/builder/builder.R',
  /** The folder of R's file system the builder's files are under. */
  root: '/builder',
  /** The folder gsm.datasim's copied files are under, in R's file system. */
  simulator: '/builder/gsm.datasim',
  /** gsm.mapping's vital signs workflow, in R's file system. */
  vitals: '/builder/gsm.mapping/VS.yaml',
  call: 'builder_run',
  /**
   * The packages R installs: the ones gsm.datasim's code calls, from the
   * public index, and three of gsm's own, from the page's own address.
   */
  packages: [
    'dplyr',
    'lubridate',
    'purrr',
    'glue',
    'logger',
    'magrittr',
    'rlang',
    'stringr',
    'tictoc',
    'yaml',
    'workr',
    'gsm.core',
    'gsm.mapping'
  ]
};

/** The tab's address in the app: its place in site/config.json's `appTabs`. */
export const BUILDER_TAB_ID = 'build';

/** The tab names no colour, so the app gives it the first no other tab uses (#268). */
export const BUILDER_COLOUR = null;

/**
 * What starting R for a build downloads, as the tab says it. The megabytes are
 * those the RBQM tab states for the same hosts; gsm.datasim's own source is
 * under half a megabyte, from the page's own address.
 */
export const BUILDER_DOWNLOADS = [
  { what: 'R itself', host: 'webr.r-wasm.org', megabytes: 13 },
  { what: 'its packages', host: new URL(RBQM_TAB.publicIndex).host, megabytes: 40 },
  { what: 'gsm’s packages and gsm.datasim', host: null, megabytes: 2 }
];

/** What the tab says in the single file, which cannot start R. */
export const FILE_NO_BUILDER =
  'Building a study needs R, and this file loads nothing, so it cannot start R. ' +
  'The hosted demo app can start R in your browser.';

/**
 * The files R is given for a build: the builder's own R, then every copied
 * gsm.datasim file that R reads (its R source, its two templates and its
 * DESCRIPTION), then gsm.mapping's vital signs workflow, each with the path R
 * keeps it at.
 * @returns {Array<{file: string, path: string}>} `file` is the path in the repository, `path` the one in R's file system.
 */
export function builderFiles() {
  return [
    { file: BUILDER.source, path: `${BUILDER.root}/builder.R` },
    ...GSM_DATASIM.files
      .filter((entry) => entry.file !== 'LICENSE.md')
      .map((entry) => ({
        file: `${GSM_DATASIM.directory}/${entry.file}`,
        path: `${BUILDER.simulator}/${entry.file}`
      })),
    {
      file: `${GSM_MAPPING_VITALS.directory}/${GSM_MAPPING_VITALS.files[0].file}`,
      path: BUILDER.vitals
    }
  ];
}

/**
 * The options the tab is mounted with, as plain values. The connection
 * factory is the app's own and is added by the page.
 * @param {Object} [where] Where the page serves each thing; the demo app's directory by default.
 * @param {(entry: {file: string, path: string}) => string} [where.fileUrl] The address of one file R is given.
 * @param {string} [where.repository] The address of gsm's packages, as a package repository.
 * @param {?string} [where.open] The tab offered once a study is built.
 * @returns {Object} The options, less `createConnection`.
 */
export function builderTabOptions({
  fileUrl = (entry) => `.${entry.path}`,
  repository = `./${SERVED_AS}`,
  open = 'rbqm'
} = {}) {
  const files = builderFiles();
  return {
    r: {
      packages: BUILDER.packages,
      repos: [repository, RBQM_TAB.publicIndex],
      files: files.map((entry) => ({ path: entry.path, url: fileUrl(entry) })),
      source: [files[0].path],
      call: BUILDER.call,
      simulator: BUILDER.simulator,
      vitals: BUILDER.vitals
    },
    downloads: BUILDER_DOWNLOADS,
    open
  };
}

/**
 * The tab's entry in the `libraries` option, as source text: a library that
 * brings a view (src/app/page.js). On a page that can start R the view is
 * given the app's own connection to R in the browser; in the single file it
 * says why it cannot start R.
 * @param {{r?: 'request'|'unavailable', where?: Object, colour?: string}} [options]
 * @returns {string} A JavaScript object expression.
 */
export function builderTabExpression({ r = 'request', where, colour = BUILDER_COLOUR } = {}) {
  const options =
    r === 'request'
      ? `{ createConnection: SafetyVizApp.createRConnection, ...${JSON.stringify(builderTabOptions(where))} }`
      : JSON.stringify({ unavailable: FILE_NO_BUILDER });
  return (
    `{ name: 'gsm.datasim', ` +
    (colour ? `colour: ${JSON.stringify(colour)}, ` : '') +
    `view: SafetyVizApp.builderTab(${options}) }`
  );
}
