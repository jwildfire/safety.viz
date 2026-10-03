// Demo app build (#150, #152, obot.roadmap#352): bundles src/app/main.js —
// the charts and the page that hosts them — two ways:
//
//   safety.viz-app.js     one IIFE script with the global `SafetyVizApp`, for
//                         the site's demo app page and the browser tests
//   safety.viz-app.html   the same script inlined into one HTML file that opens
//                         from disk with no network and no demo study, with
//                         the vendored bundle of every chart library the app
//                         ships with (scripts/app-libraries.mjs, #182) inlined
//                         beside it
//
// Unlike dist/, both are build products and are not committed: the site build
// writes them into _site/demo/, and `npm run build:app` writes them to
// build/app/.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_LIBRARIES, FILE_PITCH, librariesExpression, libraryScript } from './app-libraries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const APP_BUNDLE = 'safety.viz-app.js';
export const APP_HTML = 'safety.viz-app.html';

// A script made safe to inline: any source-map comment dropped, and a closing
// script tag inside it escaped so it cannot end the inline script.
const inlineScript = (script) =>
  script
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/<\/script/gi, '<\\/script')
    .trim();

/**
 * Wrap the app script in the single file's HTML. The file makes no request of
 * any kind: the scripts are inline, the app draws its own header and injects
 * its own styles, and any source-map comment is dropped. Each further chart
 * library's bundle is inlined after the app's and handed to it when it mounts.
 * @param {Object} options Wrapper options.
 * @param {string} options.script The bundled app script.
 * @param {Array<{name: string, global: string, script: string}>} [options.libraries] Further libraries: name, the global their bundle defines, and the bundle.
 * @returns {string} The HTML document.
 */
export function renderAppHtml({ script, libraries = [] }) {
  const inline = inlineScript(script);
  const others = libraries
    .map((library) => `<script>${inlineScript(library.script)}</script>\n`)
    .join('');
  // The file loads nothing, so its biomarker charts cannot start R: each
  // statistics line says so, and there is no control (#183).
  const mount = libraries.length
    ? `SafetyVizApp.mount('#app', { libraries: ${librariesExpression(libraries, { r: 'unavailable' })}, pitch: ${JSON.stringify(FILE_PITCH)} })`
    : `SafetyVizApp.mount('#app')`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="The safety.viz demo app in one file: load a study, map its columns and review it in the safety and biomarker charts. It runs in this browser with no network; nothing is sent anywhere.">
<title>safety.viz demo</title>
<style>body{margin:0;background:#fafaf8}</style>
</head>
<body>
<div id="app"></div>
<script>${inline}</script>
${others}<script>window.__safetyVizApp = ${mount};</script>
</body>
</html>
`;
}

const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const bundleOptions = {
  entryPoints: [path.join(rootDir, 'src/app/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'SafetyVizApp',
  // The version shown in the app's footer.
  define: { __SAFETY_VIZ_VERSION__: JSON.stringify(version) },
  absWorkingDir: rootDir
};

/**
 * Build the app bundle and the single file into a directory.
 * @param {string} outDir The directory to write `safety.viz-app.js` (with its source map) and `safety.viz-app.html` into.
 * @returns {Promise<{file: string, bytes: number, html: {file: string, bytes: number}}>} Each output's path and size.
 */
export async function buildApp(outDir) {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, APP_BUNDLE);
  await build({ ...bundleOptions, sourcemap: true, outfile: file });

  // The single file inlines a build with no source map: a map reference would
  // be the one thing in the file that points somewhere else.
  const { outputFiles } = await build({ ...bundleOptions, sourcemap: false, write: false });
  const htmlFile = path.join(outDir, APP_HTML);
  const libraries = APP_LIBRARIES.map((library) => ({
    ...library,
    script: libraryScript(library)
  }));
  writeFileSync(htmlFile, renderAppHtml({ script: outputFiles[0].text, libraries }));

  return {
    file,
    bytes: statSync(file).size,
    html: { file: htmlFile, bytes: statSync(htmlFile).size }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { file, bytes, html } = await buildApp(path.join(rootDir, 'build/app'));
  const size = (count) => `${count.toLocaleString('en-US')} bytes`;
  console.log(`Built ${path.relative(rootDir, file)} (${size(bytes)}).`);
  console.log(`Built ${path.relative(rootDir, html.file)} (${size(html.bytes)}), the single file.`);
}
