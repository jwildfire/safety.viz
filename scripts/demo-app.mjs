// The demo app's directory (#150, #152, #214): the one recipe for everything
// the demo app's page needs beside it. The site build writes it to _site/demo/
// and `npm run demo` (scripts/demo.mjs) to build/demo/, so the page a reader
// runs on their own machine is the page the site serves:
//
//   index.html             the app's page (scripts/site-lib.mjs::renderDemoAppPage)
//   safety.viz-app.js      the app bundle, with its source map
//   safety.viz-app.html    the single file, offered as a download
//   *.csv, renamed/        every demo study the app offers (#159)
//   fonts/                 the app's typefaces and their licences (#165)
//   bio.viz.js             each further chart library's vendored bundle (#182)
//   statistics.R           the file R in the browser is given (#183)
//
// The app bundle and the single file are build products written here, not
// committed assets.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { publishDemoAppFonts, renderDemoAppPage } from './site-lib.mjs';
import { APP_BUNDLE, APP_HTML, buildApp } from './build-app.mjs';
import {
  APP_LIBRARIES,
  libraryManifest,
  libraryScript,
  withoutSourceMap
} from './app-libraries.mjs';
import { DEMO_STUDIES } from '../src/app/studies.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The links of a page with no docs site beside it (#214): neither is given an
 * address, so the app's own defaults, the published site, stand.
 */
export const LOCAL_LINKS = Object.freeze({ docs: null, domains: null });

const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty'
];
const counted = (count, noun) => `${WORDS[count] || count} ${noun}${count === 1 ? '' : 's'}`;

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
 * @returns {Promise<{dir: string, page: string}>} The directory and its page.
 */
export async function buildDemoAppDir(outDir, { links } = {}) {
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
  const page = path.join(outDir, 'index.html');
  writeFileSync(
    page,
    renderDemoAppPage({
      bundle: APP_BUNDLE,
      download: APP_HTML,
      repoUrl: config.repoUrl,
      libraries: APP_LIBRARIES,
      charts: chartsCarried(),
      links
    })
  );
  return { dir: outDir, page };
}
