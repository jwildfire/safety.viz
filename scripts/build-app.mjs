// Portfolio app build (#150, #152, obot.roadmap#352): bundles src/app/main.js —
// the charts and the page that hosts them — two ways:
//
//   safety.viz-app.js     one IIFE script with the global `SafetyVizApp`, for
//                         the site's portfolio page and the browser tests
//   safety.viz-app.html   the same script inlined into one HTML file that opens
//                         from disk with no network and no demo study
//
// Unlike dist/, both are build products and are not committed: the site build
// writes them into _site/portfolio/, and `npm run build:app` writes them to
// build/app/.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSkillsModule } from './narratives/build-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const APP_BUNDLE = 'safety.viz-app.js';
export const APP_HTML = 'safety.viz-app.html';

/**
 * Wrap the app script in the single file's HTML. The file makes no request of
 * any kind: the script is inline, the app injects its own styles, and any
 * source-map comment is dropped. A closing script tag inside the bundle is
 * escaped so it cannot end the inline script.
 * @param {Object} options Wrapper options.
 * @param {string} options.script The bundled app script.
 * @param {string} options.version The package version, shown on the page.
 * @returns {string} The HTML document.
 */
export function renderAppHtml({ script, version }) {
  const inline = script
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/<\/script/gi, '<\\/script')
    .trim();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>safety.viz portfolio</title>
<style>
body{margin:0;padding:1rem;background:#fff;color:#1f2933;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.svf-head{margin:0 0 1rem}
.svf-head h1{margin:0 0 .25rem;font-size:1.3rem}
.svf-head p{margin:0;color:#52616f;font-size:.9rem}
</style>
</head>
<body>
<header class="svf-head">
<h1>safety.viz portfolio</h1>
<p>safety.viz ${version}. Load your own study files below. They are read and drawn in this browser. Nothing is sent anywhere, and this file works with no network.</p>
</header>
<div id="app"></div>
<script>${inline}</script>
<script>window.__safetyVizApp = SafetyVizApp.mount('#app');</script>
</body>
</html>
`;
}

const bundleOptions = {
  entryPoints: [path.join(rootDir, 'src/app/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'SafetyVizApp',
  absWorkingDir: rootDir
};

/**
 * Build the app bundle and the single file into a directory.
 * @param {string} outDir The directory to write `safety.viz-app.js` (with its source map) and `safety.viz-app.html` into.
 * @returns {Promise<{file: string, bytes: number, html: {file: string, bytes: number}}>} Each output's path and size.
 */
export async function buildApp(outDir) {
  buildSkillsModule();
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, APP_BUNDLE);
  await build({ ...bundleOptions, sourcemap: true, outfile: file });

  // The single file inlines a build with no source map: a map reference would
  // be the one thing in the file that points somewhere else.
  const { outputFiles } = await build({ ...bundleOptions, sourcemap: false, write: false });
  const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const htmlFile = path.join(outDir, APP_HTML);
  writeFileSync(htmlFile, renderAppHtml({ script: outputFiles[0].text, version }));

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
