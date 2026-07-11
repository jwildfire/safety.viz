// Emits the API data artifacts the docs-site build (#7) consumes: one
// _api/<module>.json per implemented renderer (gitignored). Exits non-zero
// when any public surface is undocumented, so the docs cannot drift from the
// code (#21, Pillar 3).
//
// Modules are discovered from site/config.json's renderer registry and built
// for every module whose source files exist (src/<module>.js,
// src/<module>/configure.js, src/data/schema/<module>.json) — so a new
// renderer needs no edits here (#27): add its config entry and follow the
// histogram module anatomy, and its _api/<module>.json appears on the next
// run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { extractDoclets, apiSourceFiles } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// kebab-case module → camelCase factory name (results-over-time →
// resultsOverTime), matching the module's default export.
const factoryName = (module) => module.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const config = JSON.parse(readFileSync(path.join(repoRoot, 'site/config.json'), 'utf8'));

// Every registered module with an implemented two-file surface + data schema.
const modules = [...new Set(config.renderers.map((renderer) => renderer.module))].filter((module) =>
  [
    path.join(repoRoot, `src/${module}.js`),
    path.join(repoRoot, `src/${module}/configure.js`),
    path.join(repoRoot, `src/data/schema/${module}.json`)
  ].every(existsSync)
);

let failed = false;
for (const module of modules) {
  const schema = JSON.parse(
    readFileSync(path.join(repoRoot, `src/data/schema/${module}.json`), 'utf8')
  );
  const { DEFAULT_SETTINGS } = await import(
    pathToFileURL(path.join(repoRoot, `src/${module}/configure.js`)).href
  );

  const model = buildApiModel({
    doclets: extractDoclets(apiSourceFiles(module)),
    schema,
    module,
    settingsKeys: Object.keys(DEFAULT_SETTINGS),
    factoryName: factoryName(module)
  });

  if (model.missing.length) {
    failed = true;
    console.error(`API documentation is incomplete for ${module}:`);
    for (const entry of model.missing) {
      console.error(`  - ${entry.kind} ${entry.name}: ${entry.reason}`);
    }
    continue;
  }

  const outFile = path.join(repoRoot, '_api', `${model.module}.json`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(model, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(repoRoot, outFile)} ` +
      `(${model.methods.length} methods, ${model.settings.length} settings, ` +
      `${model.dataContract.fields.length} contract fields)`
  );
}

if (failed) process.exit(1);
