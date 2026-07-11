// Doclet extraction for the API reference (#6): shells out to the local
// jsdoc binary in -X mode, which parses the sources and prints raw doclet
// JSON without rendering anything.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A renderer module's documented surface: the factory + lifecycle class in
// src/<module>.js, and the settings typedef next to DEFAULT_SETTINGS in
// src/<module>/configure.js. Every module follows this layout, so the source
// files are derived from the module name rather than enumerated (#14).
export function apiSourceFiles(module) {
  return [`src/${module}.js`, `src/${module}/configure.js`];
}

// The histogram source files, kept as a named export for the API completeness
// unit test that pins the pilot's documented surface.
export const API_SOURCE_FILES = apiSourceFiles('histogram');

export function extractDoclets(files = API_SOURCE_FILES, { cwd = repoRoot } = {}) {
  const jsdoc = require.resolve('jsdoc/jsdoc.js');
  const stdout = execFileSync(process.execPath, [jsdoc, '-X', ...files], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(stdout);
}
