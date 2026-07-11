// Emits the API data artifact the docs-site build (#7) consumes:
// _api/<module>.json (gitignored), one file per renderer marked `available` in
// site/config.json. Generalized to every module (#14): the module set is data
// (the renderer registry), the source files and schema are derived from the
// module name, and DEFAULT_SETTINGS is imported from the module's configure.js
// — so a new renderer needs no edits here. Exits non-zero when any public
// surface is undocumented, so the docs cannot drift from the code (#21,
// Pillar 3).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { extractDoclets, apiSourceFiles } from './extract.mjs';
import { buildApiModel } from './transform.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// kebab-case module → camelCase factory name (histogram → histogram,
// shift-plot → shiftPlot).
const factoryName = (module) => module.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

const config = JSON.parse(readFileSync(path.join(repoRoot, 'site/config.json'), 'utf8'));
const modules = config.renderers
  .filter((renderer) => renderer.status === 'available')
  .map((renderer) => renderer.module);

let incomplete = false;

for (const module of modules) {
  const schema = JSON.parse(
    readFileSync(path.join(repoRoot, `src/data/schema/${module}.json`), 'utf8')
  );
  const configureUrl = pathToFileURL(path.join(repoRoot, `src/${module}/configure.js`));
  const { DEFAULT_SETTINGS } = await import(configureUrl);

  const model = buildApiModel({
    doclets: extractDoclets(apiSourceFiles(module)),
    schema,
    module,
    settingsKeys: Object.keys(DEFAULT_SETTINGS),
    factoryName: factoryName(module)
  });

  if (model.missing.length) {
    incomplete = true;
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

if (incomplete) process.exit(1);
