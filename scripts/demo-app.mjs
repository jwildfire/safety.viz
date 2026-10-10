// The demo app's directory (#150, #152, #214): the one recipe for everything
// the demo app's page needs beside it. The site build writes it to _site/demo/
// and `npm run demo` (scripts/demo.mjs) to build/demo/, so the page a reader
// runs on their own machine is the page the site serves:
//
//   index.html             the app's page (scripts/site-lib.mjs::renderDemoAppPage)
//   safety.viz-app.js      the app bundle, with its source map
//   safety.viz-app.html    the single file, offered as a download
//   *.csv, renamed/, rbqm/ every demo study the app offers (#159, #233)
//   fonts/                 the app's typefaces and their licences (#165)
//   bio.viz.js             each further chart library's vendored bundle (#182)
//   statistics.R           the file R in the browser is given (#183)
//   gsm.viz.js             gsm.viz's vendored bundle, for the RBQM tab, and
//                          its licence (#232)
//   rbqm/pipeline.R,       what R is given to run the RBQM tab's metrics
//   rbqm/gsm.*/            (#235): the pipeline's R and gsm's own workflow
//                          files, each under the path R keeps it at
//   r-wasm/                the gsm packages built for R in the browser, as a
//                          package repository, and their record (#229)
//
// The app bundle and the single file are build products written here, not
// committed assets.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { countWord, publishDemoAppFonts, renderDemoAppPage } from './site-lib.mjs';
import { APP_BUNDLE, APP_HTML, buildApp } from './build-app.mjs';
import {
  APP_LIBRARIES,
  RBQM_CHARTS,
  chartLinks,
  chartTiers,
  libraryManifest,
  libraryScript,
  servedBesideTheApp,
  withoutSourceMap
} from './app-libraries.mjs';
import { pipelineFiles } from './rbqm-lib.mjs';
import { R_WASM_DIRECTORY, publishRWasm } from './r-wasm-lib.mjs';
import { DEMO_STUDIES } from '../src/app/studies.js';
import { SITE } from '../src/app/site.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The links of a page with no docs site beside it (#214): neither is given an
 * address, so the app's own defaults, the published site, stand.
 */
export const LOCAL_LINKS = Object.freeze({ docs: null, domains: null });

/**
 * Where a page with no docs site beside it finds each chart's own pages
 * (#246): on the published site.
 */
export const LOCAL_SITE = SITE;

const counted = (count, noun) => `${countWord(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What the app reviews a study in, for its page's description: every chart it
 * carries, counted by library, as "thirteen clinical safety charts and five
 * biomarker charts".
 * @returns {string} The phrase.
 */
export function chartsCarried() {
  const ownManifest = JSON.parse(
    readFileSync(path.join(rootDir, 'src/data/portfolio.json'), 'utf8')
  );
  return [
    counted(Object.keys(ownManifest.modules).length, 'clinical safety chart'),
    ...APP_LIBRARIES.map((library) =>
      counted(Object.keys(libraryManifest(library).modules).length, `${library.kind} chart`)
    )
  ].join(' and ');
}

/**
 * Build the demo app's directory: the page and everything it loads from
 * beside itself.
 * @param {string} outDir The directory to write into; created if absent.
 * @param {Object} [options] Build options.
 * @param {{docs?: ?string, domains?: ?string}} [options.links] Where the app's links to the docs site and the Domains page lead; by default into the site the directory is part of. `LOCAL_LINKS` for a directory served on its own.
 * @param {string} [options.site] The docs site as the page reaches it, for each chart's own pages (#246): by default `'../'`, the site the directory is part of. `LOCAL_SITE` for a directory served on its own.
 * @returns {Promise<{dir: string, page: string}>} The directory and its page.
 */
export async function buildDemoAppDir(outDir, { links, site = '../' } = {}) {
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
  await buildApp(outDir);
  // Every demo study the app offers (#159) is copied from where the repository
  // keeps it into the study's own directory beside the app.
  for (const study of DEMO_STUDIES) {
    mkdirSync(path.join(outDir, study.dir), { recursive: true });
    for (const file of study.files) {
      copyFileSync(path.join(rootDir, study.source, file), path.join(outDir, study.dir, file));
    }
  }
  // The app's typefaces (#165) are served from beside it, with their licences,
  // so its page asks no other host for anything.
  publishDemoAppFonts(rootDir, outDir);
  // Each further chart library's vendored bundle (#182) is served beside the app
  // and loaded after it; the page's description counts every chart it carries.
  // The copy served drops the bundle's source-map comment line, since no map is
  // served beside it; the vendored file itself stays bio.viz's, byte for byte.
  for (const library of APP_LIBRARIES) {
    writeFileSync(path.join(outDir, library.file), withoutSourceMap(libraryScript(library)));
    // The statistics file R in the browser is given when the reader starts R (#183).
    if (library.r) {
      copyFileSync(
        path.join(rootDir, library.r.statistics.path),
        path.join(outDir, library.r.statistics.file)
      );
    }
  }
  // gsm.viz's vendored bundle (#232) is served beside the app with its licence,
  // for the RBQM tab. Like the libraries' bundles, the copy served drops the
  // source-map comment line; the vendored file stays gsm.viz's, byte for byte.
  writeFileSync(path.join(outDir, RBQM_CHARTS.file), withoutSourceMap(libraryScript(RBQM_CHARTS)));
  copyFileSync(
    path.join(rootDir, RBQM_CHARTS.license.path),
    path.join(outDir, RBQM_CHARTS.license.file)
  );
  // What R is given for the RBQM tab (#235): the pipeline's R and gsm's
  // workflow files, each served under the path R keeps it at, so the page asks
  // its own address for them when the reader starts R.
  for (const entry of pipelineFiles()) {
    const served = path.join(outDir, servedBesideTheApp(entry));
    mkdirSync(path.dirname(served), { recursive: true });
    copyFileSync(path.join(rootDir, entry.file), served);
  }
  // The gsm packages built for R in the browser (#229) are served beside the
  // app as a package repository, so R installs them from the page's own address.
  publishRWasm(path.join(rootDir, R_WASM_DIRECTORY), outDir);
  const page = path.join(outDir, 'index.html');
  writeFileSync(
    page,
    renderDemoAppPage({
      bundle: APP_BUNDLE,
      download: APP_HTML,
      repoUrl: config.repoUrl,
      libraries: APP_LIBRARIES,
      charts: chartsCarried(),
      links,
      chartLinks: chartLinks({ site }),
      tiers: chartTiers()
    })
  );
  return { dir: outDir, page };
}
