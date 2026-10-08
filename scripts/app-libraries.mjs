// The chart libraries the demo app ships with besides safety.viz's own (#182,
// obot.roadmap#366): which vendored bundle each is, the global it defines, and
// where its reference lives. The demo page loads each bundle beside the app,
// the single file inlines it, and both hand it to the app through the
// second-library seam (`libraries` in src/app/page.js::mountApp). The app's own
// source names no library; this file, used only by the builds, does.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIO_VIZ, GSM_BIO_STATISTICS, GSM_VIZ } from './vendor-lib.mjs';
import { RBQM_TAB, pipelineFiles, tabArgs } from './rbqm-lib.mjs';
import { SERVED_AS } from './r-wasm-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The libraries the demo app carries, in the order their tabs follow safety.viz's. */
export const APP_LIBRARIES = [
  {
    name: 'bio.viz',
    global: 'BioViz',
    file: BIO_VIZ.files[0].file,
    path: path.join(BIO_VIZ.directory, BIO_VIZ.files[0].file),
    // What the charts are, in a phrase: "five biomarker charts".
    kind: 'biomarker',
    site: 'https://jwildfire.github.io/bio.viz/dev/',
    repository: BIO_VIZ.repository,
    // R on request (#183): the library's own connection factory, on its global,
    // and the one file R in the browser is given, gsm.bio's statistics
    // functions as vendored. Base R only: no package is installed, so starting
    // R downloads webR alone, about 13 MB, from its public host.
    r: {
      factory: 'r.createConnection',
      statistics: {
        file: GSM_BIO_STATISTICS.files[0].file,
        path: path.join(GSM_BIO_STATISTICS.directory, GSM_BIO_STATISTICS.files[0].file)
      },
      packages: [],
      megabytes: 13,
      host: 'webr.r-wasm.org'
    }
  }
];

/**
 * gsm.viz's bundle, as the demo app's directory serves it (#232,
 * obot.roadmap#374): under a name of its own beside the app, with the licence
 * its repository carries. It is not one of APP_LIBRARIES: its charts take the
 * reporting tables R returns, not a study's domains, so no page loads it with
 * the app. The RBQM tab asks for it when it has tables to draw.
 */
export const RBQM_CHARTS = {
  name: 'gsm.viz',
  global: GSM_VIZ.global,
  file: 'gsm.viz.js',
  path: path.join(GSM_VIZ.directory, 'index.js'),
  license: { file: 'gsm.viz.LICENSE.txt', path: path.join(GSM_VIZ.directory, 'LICENSE') },
  repository: GSM_VIZ.repository
};

/**
 * What the hosted app's footer says happens to the data a reader loads (#196;
 * @jwildfire, 2026-10-03): the files are read here and never uploaded, and
 * starting R downloads R, not the data. APP-LOAD-014 and APP-LOAD-026 hold it.
 */
export const HOSTED_PITCH =
  'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org and, for the RBQM tab, its packages from repo.r-wasm.org; your data stays in the browser, and R runs here.';

/** The same, as the hosted page's description says it to a search engine. */
export const HOSTED_DESCRIPTION =
  'Files you load are read in your browser and never uploaded; starting R downloads R from webr.r-wasm.org and, for the RBQM tab, its packages from repo.r-wasm.org, and your data stays in your browser.';

/** What the single file's footer says (#196). */
export const FILE_PITCH =
  'This file loads nothing; files you add are read here and never leave this computer.';

/** What a statistics line says in the single file, which cannot start R. */
export const FILE_NO_R =
  'Statistics are unavailable in this file: it loads nothing, so it cannot start R. ' +
  'The hosted demo app can start R in your browser.';

/**
 * What a library's statistics lines say when the library on the page has no
 * connection factory where the page looks for one (#193): the page still
 * mounts, and the charts say why they have no statistics.
 * @param {Object} library An entry of APP_LIBRARIES.
 * @returns {string} The sentence.
 */
export const noRFactory = (library) =>
  `Statistics are unavailable: the ${library.name} on this page has no connection to R ` +
  `(${library.name}’s ${library.r.factory} is missing).`;

// ---- The RBQM tab (#235, obot.roadmap#374) ----

/**
 * What starting R for the RBQM tab downloads, in the order it downloads it:
 * R itself, the packages gsm's depend on from the public index, and gsm's own
 * four from the page. The megabytes are what the tab says; the browser test
 * APP-RBQM-021 measures each as it starts R and fails when one is off by more
 * than a megabyte and a half.
 */
export const RBQM_DOWNLOADS = [
  { what: 'R itself', host: 'webr.r-wasm.org', megabytes: 13 },
  { what: 'its packages', host: new URL(RBQM_TAB.publicIndex).host, megabytes: 40 },
  { what: 'gsm’s packages', host: null, megabytes: 2 }
];

/** What the tab is in the app: its place in site/config.json's `appTabs`. */
export const RBQM_TAB_ID = 'rbqm';

/** What the Experimental pill means, for whoever hovers it; the docs site says the same. */
export const EXPERIMENTAL_MEANING =
  'Still being worked on, and fine to use: its behaviour and settings may change.';

/** What the RBQM tab says in the single file, which cannot start R. */
export const FILE_NO_RBQM =
  'The RBQM tab needs R, and this file loads nothing, so it cannot start R. ' +
  'The hosted demo app can start R in your browser.';

/**
 * The tab's status badge, from site/config.json: the tab ships Experimental
 * while its entry there says so.
 * @returns {?{text: string, title: string}} The badge, or null for a stable tab.
 */
export function rbqmBadge() {
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
  const entry = (config.appTabs || []).find((tab) => tab.id === RBQM_TAB_ID);
  return entry && entry.experimental ? { text: 'Experimental', title: EXPERIMENTAL_MEANING } : null;
}

/**
 * Where the demo app's directory serves a file R is given: under the path R
 * keeps it at, beside the app (`./rbqm/pipeline.R`).
 * @param {{path: string}} entry An entry of pipelineFiles().
 * @returns {string} The address, relative to the page.
 */
export const servedBesideTheApp = (entry) => `.${entry.path}`;

/**
 * The options the RBQM tab is mounted with, as plain values: what R is given
 * and from where, gsm.viz's bundle, what starting R downloads, and the badge.
 * The connection factory is the app's own and is added by the page.
 * @param {Object} [where] Where the page serves each thing; the demo app's directory by default.
 * @param {(entry: {file: string, path: string}) => string} [where.fileUrl] The address of one file R is given.
 * @param {string} [where.repository] The address of gsm's packages, as a package repository.
 * @param {string} [where.chartsUrl] The address of gsm.viz's bundle.
 * @returns {Object} The options, less `createConnection`.
 */
export function rbqmTabOptions({
  fileUrl = servedBesideTheApp,
  repository = `./${SERVED_AS}`,
  chartsUrl = `./${RBQM_CHARTS.file}`
} = {}) {
  const files = pipelineFiles();
  const folder = path.posix.dirname(files[0].path);
  // The data folder and the snapshot's date are set by the tab at each run.
  const { data: _data, snapshot_date: _date, ...args } = tabArgs('');
  return {
    r: {
      packages: RBQM_TAB.packages,
      repos: [repository, RBQM_TAB.publicIndex],
      files: files.map((entry) => ({ path: entry.path, url: fileUrl(entry) })),
      source: [files[0].path],
      attach: RBQM_TAB.attach,
      call: RBQM_TAB.call,
      args,
      data: `${folder}/runs`
    },
    charts: { url: chartsUrl, global: RBQM_CHARTS.global },
    downloads: RBQM_DOWNLOADS,
    badge: rbqmBadge()
  };
}

/**
 * The RBQM tab's entry in the `libraries` option, as source text: a library
 * that brings a view (src/app/page.js). On a page that can start R the view is
 * given the app's own connection to R in the browser; in the single file it
 * says why it cannot start R.
 * @param {{r?: 'request'|'unavailable', where?: Object}} [options]
 * @returns {string} A JavaScript object expression.
 */
export function rbqmTabExpression({ r = 'request', where } = {}) {
  const options =
    r === 'request'
      ? `{ createConnection: SafetyVizApp.createRConnection, ...${JSON.stringify(rbqmTabOptions(where))} }`
      : JSON.stringify({ unavailable: FILE_NO_RBQM, badge: rbqmBadge() });
  return `{ name: ${JSON.stringify(RBQM_CHARTS.name)}, view: SafetyVizApp.rbqmTab(${options}) }`;
}

/**
 * A library's vendored bundle, as text.
 * @param {Object} library An entry of APP_LIBRARIES.
 * @returns {string} The script.
 */
export const libraryScript = (library) => readFileSync(path.join(rootDir, library.path), 'utf8');

/**
 * A script without its source-map comment line: a page that serves or inlines
 * a vendored bundle serves no map beside it, so the comment would point at
 * nothing. Nothing else of the script is changed.
 * @param {string} script The script.
 * @returns {string} The script, less any `//# sourceMappingURL=` line.
 */
export const withoutSourceMap = (script) => script.replace(/^\/\/# sourceMappingURL=.*$\n?/gm, '');

/**
 * A library's chart list, read from its vendored bundle: the bundle is run, as
 * a page runs it, and its `portfolio` is taken. Nothing else of it is used.
 * @param {Object} library An entry of APP_LIBRARIES.
 * @returns {Object} The chart list, in the portfolio manifest's format.
 */
export function libraryManifest(library) {
  const exports = new Function(`${libraryScript(library)}\nreturn ${library.global};`)();
  return exports.portfolio;
}

/**
 * The `libraries` option a page passes `SafetyVizApp.mount`, as source text: one
 * entry per library, its factories and chart list read from its global.
 *
 * With `r` (#183), a library that has an R connection is also handed its
 * statistics settings: `'request'` for a page that can start R, with the
 * statistics file at `statisticsUrl`, which gives the library's charts the
 * connection that waits for the reader and the control that starts it;
 * `'unavailable'` for the single file, whose charts say why they have no
 * statistics.
 *
 * Nothing in the expression throws when a library is missing or is not what
 * the page expects (#193): on a page that loads each library from a file
 * (`fromFile`, the default), each entry names that file, so a library whose
 * script did not load is named on the page with it; the single file, whose
 * libraries are inline, names none. A
 * library with no connection factory where the page looks for one is handed
 * the sentence that says so rather than stopping the mount.
 * @param {Object[]} [libraries] Entries of APP_LIBRARIES.
 * @param {{r?: ?('request'|'unavailable'), fromFile?: boolean, statisticsUrl?: (library: Object) => string, createConnection?: (library: Object) => string, more?: string[]}} [options] `more` is further entries, each as source text, listed after the libraries': the RBQM tab's (rbqmTabExpression).
 * @returns {string} A JavaScript array expression.
 */
export function librariesExpression(
  libraries = APP_LIBRARIES,
  { r = null, fromFile = true, statisticsUrl, createConnection, more = [] } = {}
) {
  const entries = libraries.map((library) => {
    const global = `window.${library.global}`;
    let statistics = '';
    if (r && library.r) {
      // Read with optional chaining: a library without it reads as no factory.
      const factory = createConnection
        ? createConnection(library)
        : `${global}?.${library.r.factory.split('.').join('?.')}`;
      const options =
        `{ createConnection: ${factory}, browser: { sourceUrl: ${JSON.stringify(
          statisticsUrl ? statisticsUrl(library) : `./${library.r.statistics.file}`
        )}, packages: ${JSON.stringify(library.r.packages)} }, megabytes: ${library.r.megabytes}, ` +
        `host: ${JSON.stringify(library.r.host)} }`;
      statistics =
        r === 'request'
          ? `, ...(${global} ? (typeof (${factory}) === 'function' ? SafetyVizApp.rOnRequest(${options}) ` +
            `: SafetyVizApp.rUnavailable(${JSON.stringify(noRFactory(library))})) : {})`
          : `, ...SafetyVizApp.rUnavailable(${JSON.stringify(FILE_NO_R)})`;
    }
    return (
      `{ name: ${JSON.stringify(library.name)}, ` +
      (fromFile ? `file: ${JSON.stringify(library.file)}, ` : '') +
      `charts: ${global}, manifest: ${global} && ${global}.portfolio${statistics} }`
    );
  });
  return `[${[...entries, ...more].join(', ')}]`;
}
