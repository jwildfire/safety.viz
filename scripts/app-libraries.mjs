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
import { SITE } from '../src/app/site.js';

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
  'Files you load are read in this browser and never uploaded. Starting R downloads R from webr.r-wasm.org; your data stays in the browser, and R runs here.';

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
 * @param {{r?: ?('request'|'unavailable'), fromFile?: boolean, statisticsUrl?: (library: Object) => string, createConnection?: (library: Object) => string}} [options]
 * @returns {string} A JavaScript array expression.
 */
export function librariesExpression(
  libraries = APP_LIBRARIES,
  { r = null, fromFile = true, statisticsUrl, createConnection } = {}
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
  return `[${entries.join(', ')}]`;
}

/**
 * A value as the source text of a JavaScript literal an inline script can
 * carry: JSON, with every less-than sign escaped so nothing in it can end the
 * script element.
 * @param {*} value The value.
 * @returns {string} The literal.
 */
export const inlineJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Where each chart's own pages are (#246), for the footnote under a chart in
 * the app: its test evidence, and its clinical guide where it has one.
 *
 * A safety.viz chart has the pages the site build writes for it: test evidence
 * for every available renderer, and a guide where its entry in
 * site/config.json names one, which is where the docs site reads it. A chart
 * the site has no pages for is left out. A further library's charts have test
 * evidence on that library's own site, wherever the app's page is.
 * @param {Object} [options] Options.
 * @param {string} [options.site] The docs site as the app's page reaches it, with its trailing slash: `'../'` for the page the site serves at demo/; by default the published site, for a page with no site beside it.
 * @param {Object[]} [options.libraries] Entries of APP_LIBRARIES.
 * @param {Object} [options.config] The site's configuration; by default site/config.json.
 * @param {Object} [options.manifest] safety.viz's portfolio manifest; by default src/data/portfolio.json.
 * @returns {Object<string, {guide?: string, evidence: string}>} Module name → the addresses of its pages.
 */
export function chartLinks({ site = SITE, libraries = APP_LIBRARIES, config, manifest } = {}) {
  const read = (file) => JSON.parse(readFileSync(path.join(rootDir, file), 'utf8'));
  const { renderers } = config || read('site/config.json');
  const { modules } = manifest || read('src/data/portfolio.json');
  const links = {};
  for (const module of Object.keys(modules)) {
    const renderer = renderers.find((entry) => entry.module === module);
    if (!renderer || renderer.status !== 'available') continue;
    links[module] = {
      ...(renderer.guide ? { guide: `${site}${module}/guide.html` } : {}),
      evidence: `${site}${module}/evidence.html`
    };
  }
  for (const library of libraries) {
    for (const module of Object.keys(libraryManifest(library).modules)) {
      links[module] = { evidence: `${library.site}${module}/evidence.html` };
    }
  }
  return links;
}
