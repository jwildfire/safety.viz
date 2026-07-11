// Emits the API data artifacts the docs-site build (#7) consumes:
// _api/<module>.json (gitignored), one per available renderer. Exits non-zero
// when any public surface is undocumented, so the docs cannot drift from the
// code (#21, Pillar 3).
//
// Config-driven since the v1.0 fan-out (#24): the module universe is
// site/config.json's available renderers, matching the evidence pipeline's
// module discovery, so a new renderer's API page needs no edit here — it just
// needs src/<module>.js + src/<module>/configure.js (DEFAULT_SETTINGS) and
// src/data/schema/<module>.json, exactly like the histogram.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { extractDoclets } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(readFileSync(path.join(repoRoot, 'site/config.json'), 'utf8'));
const modules = config.renderers
  .filter((renderer) => renderer.status === 'available')
  .map((renderer) => renderer.module);

let failed = false;
for (const module of modules) {
  const schema = JSON.parse(
    readFileSync(path.join(repoRoot, `src/data/schema/${module}.json`), 'utf8')
  );
  const { DEFAULT_SETTINGS } = await import(
    pathToFileURL(path.join(repoRoot, `src/${module}/configure.js`)).href
  );
  const sources = [`src/${module}.js`, `src/${module}/configure.js`];

  const model = buildApiModel({
    doclets: extractDoclets(sources),
    schema,
    module,
    settingsKeys: Object.keys(DEFAULT_SETTINGS)
  });

  if (model.missing.length) {
    console.error(`API documentation is incomplete for ${module}:`);
    for (const entry of model.missing) {
      console.error(`  - ${entry.kind} ${entry.name}: ${entry.reason}`);
    }
    failed = true;
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
