// Portfolio app build (#150, obot.roadmap#352): bundles src/app/main.js — the
// charts and the page that hosts them — into one IIFE script with the global
// `SafetyVizApp`. Unlike dist/, the output is a build product and is not
// committed: the site build writes it into _site/portfolio/, and
// `npm run build:app` writes it to build/app/ for the browser tests.

import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSkillsModule } from './narratives/build-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const APP_BUNDLE = 'safety.viz-app.js';

/**
 * Build the app bundle into a directory.
 * @param {string} outDir The directory to write `safety.viz-app.js` (and its source map) into.
 * @returns {Promise<{file: string, bytes: number}>} The bundle's path and size.
 */
export async function buildApp(outDir) {
  buildSkillsModule();
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, APP_BUNDLE);
  await build({
    entryPoints: [path.join(rootDir, 'src/app/main.js')],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: 'iife',
    globalName: 'SafetyVizApp',
    absWorkingDir: rootDir,
    outfile: file
  });
  return { file, bytes: statSync(file).size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { file, bytes } = await buildApp(path.join(rootDir, 'build/app'));
  console.log(`Built ${path.relative(rootDir, file)} (${bytes.toLocaleString('en-US')} bytes).`);
}
