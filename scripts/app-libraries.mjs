// The chart libraries the demo app ships with besides safety.viz's own (#182,
// obot.roadmap#366): which vendored bundle each is, the global it defines, and
// where its reference lives. The demo page loads each bundle beside the app,
// the single file inlines it, and both hand it to the app through the
// second-library seam (`libraries` in src/app/page.js::mountApp). The app's own
// source names no library; this file, used only by the builds, does.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIO_VIZ } from './vendor-lib.mjs';

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
    repository: BIO_VIZ.repository
  }
];

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
 * @param {Object[]} [libraries] Entries of APP_LIBRARIES.
 * @returns {string} A JavaScript array expression.
 */
export function librariesExpression(libraries = APP_LIBRARIES) {
  const entries = libraries.map(
    (library) =>
      `{ name: ${JSON.stringify(library.name)}, charts: window.${library.global}, ` +
      `manifest: window.${library.global} && window.${library.global}.portfolio }`
  );
  return `[${entries.join(', ')}]`;
}
