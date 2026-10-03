// The chart libraries the demo app ships with besides safety.viz's own (#182,
// obot.roadmap#366): which vendored bundle each is, the global it defines, and
// where its reference lives. The demo page loads each bundle beside the app,
// the single file inlines it, and both hand it to the app through the
// second-library seam (`libraries` in src/app/page.js::mountApp). The app's own
// source names no library; this file, used only by the builds, does.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIO_VIZ, GSM_BIO_STATISTICS } from './vendor-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The libraries the demo app carries, in the order their tabs follow safety.viz's. */
export const APP_LIBRARIES = [
  {
    name: 'bio.viz',
    global: 'BioViz',
    file: BIO_VIZ.files[0].file,
    path: path.join(BIO_VIZ.directory, BIO_VIZ.files[0].file),
    // What the charts are, in a phrase: "four biomarker charts".
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

/** What the hosted app's footer says it does with a study (#183; amended at @jwildfire's word, 2026-10-02). */
export const HOSTED_PITCH =
  'The study’s data never leaves this browser. No request leaves the page unless you start R.';

/** What the single file's footer says. */
export const FILE_PITCH = 'Everything runs in this browser, and this file loads nothing.';

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
 * the page expects (#193): each entry names the file the library is loaded
 * from, so a library whose script did not load is named on the page, and a
 * library with no connection factory where the page looks for one is handed
 * the sentence that says so rather than stopping the mount.
 * @param {Object[]} [libraries] Entries of APP_LIBRARIES.
 * @param {{r?: ?('request'|'unavailable'), statisticsUrl?: (library: Object) => string, createConnection?: (library: Object) => string}} [options]
 * @returns {string} A JavaScript array expression.
 */
export function librariesExpression(
  libraries = APP_LIBRARIES,
  { r = null, statisticsUrl, createConnection } = {}
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
      `{ name: ${JSON.stringify(library.name)}, file: ${JSON.stringify(library.file)}, ` +
      `charts: ${global}, manifest: ${global} && ${global}.portfolio${statistics} }`
    );
  });
  return `[${entries.join(', ')}]`;
}
