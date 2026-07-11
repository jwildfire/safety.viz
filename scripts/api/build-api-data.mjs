// Emits the API data artifacts the docs-site build (#7) consumes:
// _api/<module>.json (gitignored) for every available renderer in
// site/config.json (#26 generalized the histogram-only build). Each module
// follows the framework layout — src/<module>.js + src/<module>/configure.js
// (factory named by camelCasing the module) and a data contract at
// src/data/schema/<module>.json. Exits non-zero when any public surface is
// undocumented, so the docs cannot drift from the code (#21, Pillar 3).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { extractDoclets } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(readFileSync(path.join(repoRoot, 'site/config.json'), 'utf8'));
const camelCase = (name) => name.replace(/-([a-z])/g, (match, char) => char.toUpperCase());

let failed = false;
for (const renderer of config.renderers.filter((entry) => entry.status === 'available')) {
  const module = renderer.module;
  const schema = JSON.parse(
    readFileSync(path.join(repoRoot, `src/data/schema/${module}.json`), 'utf8')
  );
  const { DEFAULT_SETTINGS } = await import(
    pathToFileURL(path.join(repoRoot, `src/${module}/configure.js`)).href
  );

  const model = buildApiModel({
    doclets: extractDoclets([`src/${module}.js`, `src/${module}/configure.js`]),
    schema,
    module,
    settingsKeys: Object.keys(DEFAULT_SETTINGS),
    factoryName: camelCase(module)
  });

  if (model.missing.length) {
    console.error(`API documentation is incomplete for ${module}:`);
    for (const entry of model.missing) {
      console.error(`  - ${entry.kind} ${entry.name}: ${entry.reason}`);
    }
    failed = true;
    continue;
  }

  const outFile = path.join(repoRoot, '_api', `${module}.json`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(model, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(repoRoot, outFile)} ` +
      `(${model.methods.length} methods, ${model.settings.length} settings, ` +
      `${model.dataContract.fields.length} contract fields)`
  );
}

if (failed) process.exit(1);
