// Emits the API data artifact the docs-site build (#7) consumes:
// _api/histogram.json (gitignored). Exits non-zero when any public surface
// is undocumented, so the docs cannot drift from the code (#21, Pillar 3).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_SETTINGS } from '../../src/histogram/configure.js';
import { extractDoclets, API_SOURCE_FILES } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const schema = JSON.parse(
  readFileSync(path.join(repoRoot, 'src/data/schema/histogram.json'), 'utf8')
);

const model = buildApiModel({
  doclets: extractDoclets(API_SOURCE_FILES),
  schema,
  module: 'histogram',
  settingsKeys: Object.keys(DEFAULT_SETTINGS)
});

if (model.missing.length) {
  console.error('API documentation is incomplete:');
  for (const entry of model.missing) {
    console.error(`  - ${entry.kind} ${entry.name}: ${entry.reason}`);
  }
  process.exit(1);
}

const outFile = path.join(repoRoot, '_api', `${model.module}.json`);
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(model, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(repoRoot, outFile)} ` +
    `(${model.methods.length} methods, ${model.settings.length} settings, ` +
    `${model.dataContract.fields.length} contract fields)`
);
