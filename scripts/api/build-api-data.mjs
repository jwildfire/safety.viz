// Emits the API data artifacts the docs-site build (#7) consumes:
// _api/<module>.json (gitignored), one per renderer module. Exits non-zero
// when any module's public surface is undocumented, so the docs cannot drift
// from the code (#21, Pillar 3).
//
// Multi-module (#25): modules are discovered from site/config.json — any
// renderer with a `src/<module>.js` entrypoint, a `src/<module>/configure.js`
// exporting DEFAULT_SETTINGS, and a `src/data/schema/<module>.json` contract is
// built by the same convention the histogram established, so a new renderer
// needs no edits here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { extractDoclets } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config = JSON.parse(readFileSync(path.join(repoRoot, 'site/config.json'), 'utf8'));

// A renderer is buildable once its module sources and data contract exist, so
// planned entries in the registry are skipped until their code lands.
const modules = config.renderers
  .map((renderer) => renderer.module)
  .filter((module) => existsSync(path.join(repoRoot, `src/${module}.js`)));

let hadFailure = false;

for (const module of modules) {
  const configurePath = path.join(repoRoot, `src/${module}/configure.js`);
  const schemaPath = path.join(repoRoot, `src/data/schema/${module}.json`);
  if (!existsSync(configurePath) || !existsSync(schemaPath)) {
    console.error(
      `Skipping ${module}: expected src/${module}/configure.js and src/data/schema/${module}.json`
    );
    hadFailure = true;
    continue;
  }

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const { DEFAULT_SETTINGS } = await import(pathToFileURL(configurePath).href);

  const model = buildApiModel({
    doclets: extractDoclets([`src/${module}.js`, `src/${module}/configure.js`]),
    schema,
    module,
    settingsKeys: Object.keys(DEFAULT_SETTINGS)
  });

  if (model.missing.length) {
    hadFailure = true;
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

if (hadFailure) process.exit(1);
