// Doclet extraction for the API reference (#6): shells out to the local
// jsdoc binary in -X mode, which parses the sources and prints raw doclet
// JSON without rendering anything.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The histogram module's documented surface: the factory + lifecycle class,
// and the settings typedef next to DEFAULT_SETTINGS.
export const API_SOURCE_FILES = ['src/histogram.js', 'src/histogram/configure.js'];

export function extractDoclets(files = API_SOURCE_FILES, { cwd = repoRoot } = {}) {
  const jsdoc = require.resolve('jsdoc/jsdoc.js');
  const stdout = execFileSync(process.execPath, [jsdoc, '-X', ...files], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(stdout);
}
