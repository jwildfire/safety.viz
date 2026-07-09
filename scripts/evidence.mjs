// Evidence pipeline CLI (#5). Runs the suites with JSON reporters and
// (re)builds docs/evidence/histogram/evidence.json from the results.
//
//   node scripts/evidence.mjs            regenerate evidence.json from a fresh run
//   node scripts/evidence.mjs --check    freshness guard: compare a fresh run's
//                                        test IDs + statuses against the committed
//                                        evidence.json; exit 1 on drift
//   node scripts/evidence.mjs --update   canonical-environment baseline refresh:
//                                        also reruns Playwright with
//                                        --update-snapshots (Linux only unless
//                                        FORCE_EVIDENCE_UPDATE=1), then rebuilds
//                                        evidence.json
//
// Baselines are canonical to the Linux CI runner (see tests/e2e/evidence.js);
// the evidence-update workflow is the authoritative way to refresh them.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidence, compareEvidence } from './evidence-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(rootDir, 'docs', 'evidence', 'histogram');
const evidencePath = path.join(evidenceDir, 'evidence.json');

const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--update')
    ? 'update'
    : 'run';

if (mode === 'update' && process.platform !== 'linux' && !process.env.FORCE_EVIDENCE_UPDATE) {
  console.error(
    'evidence:update refreshes canonical baselines and must run on the Linux CI environment\n' +
      '(use the evidence-update workflow, or a matching container with FORCE_EVIDENCE_UPDATE=1).'
  );
  process.exit(1);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'evidence-'));
const vitestOut = path.join(tmp, 'vitest.json');
const playwrightOut = path.join(tmp, 'playwright.json');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  return result.status;
}

console.log('▸ Vitest (json reporter)…');
run('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${vitestOut}`]);

console.log('▸ Playwright (json reporter)…');
const playwrightArgs = ['playwright', 'test', '--reporter=json'];
if (mode === 'update') playwrightArgs.push('--update-snapshots');
run('npx', playwrightArgs, { PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightOut });

const fresh = buildEvidence({
  module: 'histogram',
  vitest: JSON.parse(readFileSync(vitestOut, 'utf8')),
  playwright: JSON.parse(readFileSync(playwrightOut, 'utf8')),
  screenshots: existsSync(evidenceDir)
    ? readdirSync(evidenceDir)
        .filter((file) => file.endsWith('.png'))
        .sort()
    : []
});

if (mode === 'check') {
  if (!existsSync(evidencePath)) {
    console.error(
      `✗ ${path.relative(rootDir, evidencePath)} is missing — run npm run evidence and commit.`
    );
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const { stale, differences } = compareEvidence(committed, fresh);
  if (stale) {
    console.error('✗ Committed evidence is stale — run npm run evidence:update and commit:');
    differences.forEach((d) => console.error(`  - ${d}`));
    process.exit(1);
  }
  console.log(
    `✓ Evidence fresh: ${fresh.records.length} records match the committed evidence.json.`
  );
} else {
  writeFileSync(evidencePath, JSON.stringify(fresh, null, 2) + '\n');
  // Keep the committed artifact Prettier-clean (CI checks formatting).
  run('npx', ['prettier', '--log-level=warn', '--write', evidencePath]);
  const failures = fresh.records.filter((r) => r.status === 'fail');
  console.log(
    `✓ Wrote ${path.relative(rootDir, evidencePath)} — ${fresh.records.length} records` +
      (failures.length ? `, ${failures.length} FAILING` : ', all passing')
  );
  if (failures.length) process.exit(1);
}
