// check-demo-data.mjs — drift guard for the vendored demo extracts (#140).
//
// Every CSV under site/data/ is generated (docs/DATA_SOURCES.md), but until this
// check nothing proved the committed files were still what the generators produce:
// a cell edited by hand, a generator changed without a rebuild, or a moved upstream
// source would all pass CI. This reruns the whole rebuild into a temporary
// directory —
//
//   build-demo-data.mjs           the pharmaverse extracts (adbds, adae, adeg, adsl,
//                                 pje-*)
//   build-hep-composite-cohort    appends the synthetic CLD-* cohort to adbds.csv
//   build-nep-aki-cohort          appends the synthetic AKI-* cohort to adbds.csv
//   build-hep-abnbl-cohort        the fully synthetic adbds-abnbl.csv
//
// — in that order, the one the committed adbds.csv was built in, then compares the
// result byte for byte with site/data/. The committed files are never written.
// Mirrors scripts/check-dist-drift.mjs.
//
// Usage:  node scripts/check-demo-data.mjs [--source-dir <dir>]
//   --source-dir is passed through to build-demo-data.mjs, which otherwise fetches
//   the pharmaverse source (~200 MB, cached under node's tmp after the first run).
//
// Exit status: 0 when every file matches; 1 on drift, naming each drifted file and
// its first differing row (row 1 is the header, so the number is the line an editor
// shows); 2 when a generator could not be run at all, which is not a verdict on the
// data either way.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoDataDrift } from './demo-data-lib.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const committedDir = path.join(rootDir, 'site', 'data');

const sourceDirFlag = process.argv.indexOf('--source-dir');
const sourceArgs = sourceDirFlag === -1 ? [] : ['--source-dir', process.argv[sourceDirFlag + 1]];

// Order matters: both injectors append to the adbds.csv the first step writes, and
// each strips only its own rows, so swapping them would reorder the file.
const STEPS = [
  { script: 'build-demo-data.mjs', args: sourceArgs },
  { script: 'build-hep-composite-cohort.mjs', args: [] },
  { script: 'build-nep-aki-cohort.mjs', args: [] },
  { script: 'build-hep-abnbl-cohort.mjs', args: [] }
];

// file name → text for every CSV in a directory.
const readCsvs = (dir) =>
  Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.csv'))
      .map((file) => [file, readFileSync(path.join(dir, file), 'utf8')])
  );

const tmpDir = mkdtempSync(path.join(tmpdir(), 'safety-viz-demo-data-check-'));
let failedStep = null;
let committed = {};
let drift = [];

try {
  for (const { script, args } of STEPS) {
    console.log(`▸ node scripts/${script}`);
    const result = spawnSync(
      process.execPath,
      [path.join(scriptsDir, script), '--out-dir', tmpDir, ...args],
      { stdio: 'inherit' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      failedStep = script;
      break;
    }
  }
  if (!failedStep) {
    committed = existsSync(committedDir) ? readCsvs(committedDir) : {};
    drift = demoDataDrift(committed, readCsvs(tmpDir));
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failedStep) {
  console.error(
    `\nscripts/${failedStep} did not complete, so the demo data could not be checked — ` +
      'this says nothing about whether site/data/ has drifted.'
  );
  process.exit(2);
}

const rel = (file) => `site/data/${file}`;
const drifted = new Set(drift.map((d) => d.file));
const rowCount = (text) => text.split('\n').length - 1;

console.log('');
for (const [file, text] of Object.entries(committed)) {
  if (!drifted.has(file)) console.log(`✓ ${rel(file)} — ${rowCount(text)} rows match`);
}

if (drift.length > 0) {
  // A missing row prints as a label; a real one is JSON-quoted so a stray space,
  // carriage return or lost closing newline is visible rather than implied.
  const show = (row) =>
    row === null ? '(no such row — the file ends first)' : JSON.stringify(row);
  for (const d of drift) {
    if (d.reason === 'not-committed') {
      console.error(`✗ ${rel(d.file)} is written by the generators but is not committed.`);
    } else if (d.reason === 'not-generated') {
      console.error(
        `✗ ${rel(d.file)} is committed but no generator writes it — nothing can vouch for it.`
      );
    } else {
      console.error(`✗ ${rel(d.file)} differs from the generators' output at row ${d.row}:`);
      console.error(`    committed: ${show(d.committed)}`);
      console.error(`    generated: ${show(d.generated)}`);
    }
  }
  console.error(
    `\nDemo data drift detected in ${drift.length} file(s), first ${rel(drift[0].file)}.\n` +
      'The CSVs under site/data/ are generated, never edited by hand. Either a file was\n' +
      'edited, a generator changed without a rebuild, or the pharmaverse source moved —\n' +
      'see docs/DATA_SOURCES.md. To rebuild:\n\n' +
      STEPS.map(({ script }) => `  node scripts/${script}`).join('\n')
  );
  process.exit(1);
}

console.log(`\n${Object.keys(committed).length} files under site/data/ match a fresh rebuild.`);
