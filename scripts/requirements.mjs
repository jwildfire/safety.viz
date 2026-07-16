// Requirement-text sync CLI (#63): extracts the reviewed requirement text from
// the obot.agent matrices into docs/requirements/<module>.json so the evidence
// pages can show what each test evidences. Mirrors scripts/evidence.mjs.
//
//   node scripts/requirements.mjs           regenerate the JSON extracts from
//                                           the matrices
//   node scripts/requirements.mjs --check   freshness guard: when the matrix
//                                           source is available, re-extract and
//                                           compare against every committed
//                                           extract (exit 1 on drift); with no
//                                           source present, validate that the
//                                           committed extracts are well-formed
//
// The matrix source root is REQUIREMENTS_SRC (default the sibling checkout
// ../obot.agent/docs/requirements), so it is not pinned to one machine — CI
// checks out the public obot.agent and points this at it. Each renderer's
// matrix filename comes from site/config.json, so a new module needs no edits
// here: add the config entry with its `matrix`, and its extract appears on the
// next run. Modules whose matrix is not present at the source (a renderer whose
// matrix has not been harvested yet) are reported and skipped, and their
// evidence page degrades to IDs-only.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRequirementSet, compareRequirements } from './requirements-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(rootDir, 'docs', 'requirements');
const outputPathFor = (module) => path.join(outputRoot, `${module}.json`);

const sourceRoot = path.resolve(
  rootDir,
  process.env.REQUIREMENTS_SRC || '../obot.agent/docs/requirements'
);
const matrixPathFor = (matrix) => path.join(sourceRoot, matrix);

const mode = process.argv.includes('--check') ? 'check' : 'run';

const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
// Evidence pages — and therefore requirement text — are built for the
// available renderers; that is the meaningful scope for the extract.
const renderers = config.renderers.filter((renderer) => renderer.status === 'available');

const sourceAvailable = existsSync(sourceRoot);
const rel = (p) => path.relative(rootDir, p);

if (mode === 'check') {
  let stale = false;
  if (!sourceAvailable) {
    console.log(
      `⚠ matrix source ${rel(sourceRoot)} not found — skipping drift comparison; ` +
        'validating committed extracts only (set REQUIREMENTS_SRC to enable the full guard).'
    );
  }
  for (const renderer of renderers) {
    const { module, matrix } = renderer;
    const outputPath = outputPathFor(module);
    const hasCommitted = existsSync(outputPath);
    const hasSource = sourceAvailable && existsSync(matrixPathFor(matrix));

    if (hasSource) {
      const fresh = buildRequirementSet({
        module,
        matrix,
        markdown: readFileSync(matrixPathFor(matrix), 'utf8')
      });
      if (!hasCommitted) {
        stale = true;
        console.error(`✗ ${rel(outputPath)} is missing — run npm run requirements and commit.`);
        continue;
      }
      const committed = JSON.parse(readFileSync(outputPath, 'utf8'));
      const { stale: moduleStale, differences } = compareRequirements(committed, fresh);
      if (moduleStale) {
        stale = true;
        console.error(`✗ ${rel(outputPath)} is stale — run npm run requirements and commit:`);
        differences.forEach((d) => console.error(`  - ${d}`));
      } else {
        console.log(`✓ ${rel(outputPath)} fresh: ${Object.keys(fresh.requirements).length} rows.`);
      }
    } else if (hasCommitted) {
      // No source to diff against — assert the committed extract is well-formed.
      const committed = JSON.parse(readFileSync(outputPath, 'utf8'));
      const entries = Object.entries(committed.requirements || {});
      const bad = entries.filter(([, text]) => typeof text !== 'string' || !text.trim());
      if (!entries.length || bad.length) {
        stale = true;
        console.error(
          `✗ ${rel(outputPath)} is malformed — ${
            entries.length ? `${bad.length} empty/invalid entries` : 'no requirement text'
          }.`
        );
      } else {
        console.log(
          `✓ ${rel(outputPath)} well-formed: ${entries.length} rows (source not checked).`
        );
      }
    } else {
      console.log(
        `· ${module}: no matrix at source and no committed extract — evidence page shows IDs only.`
      );
    }
  }
  if (stale) process.exit(1);
} else {
  if (!sourceAvailable) {
    console.error(
      `✗ matrix source ${rel(sourceRoot)} not found. Clone obot.agent as a sibling of this repo, ` +
        'or set REQUIREMENTS_SRC to its docs/requirements directory.'
    );
    process.exit(1);
  }
  mkdirSync(outputRoot, { recursive: true });
  const written = [];
  for (const renderer of renderers) {
    const { module, matrix } = renderer;
    if (!existsSync(matrixPathFor(matrix))) {
      console.warn(
        `⚠ ${module}: no matrix ${matrix} at ${rel(sourceRoot)} — skipping; ` +
          'its evidence page will show requirement IDs only.'
      );
      continue;
    }
    const set = buildRequirementSet({
      module,
      matrix,
      markdown: readFileSync(matrixPathFor(matrix), 'utf8')
    });
    const outputPath = outputPathFor(module);
    writeFileSync(outputPath, JSON.stringify(set, null, 2) + '\n');
    written.push(outputPath);
    console.log(
      `✓ Wrote ${rel(outputPath)} — ${Object.keys(set.requirements).length} requirements`
    );
  }
  // Keep the committed artifacts Prettier-clean (CI checks formatting).
  if (written.length) {
    spawnSync('npx', ['prettier', '--log-level=warn', '--write', ...written], {
      cwd: rootDir,
      stdio: ['ignore', 'inherit', 'inherit']
    });
  }
}
