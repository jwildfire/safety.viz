// Checks the gsm packages built for R in the browser (#229,
// obot.roadmap#373). The packages are built by scripts/r-wasm/build.R, run by
// .github/workflows/r-wasm.yml whenever site/vendor/r-wasm/pins.json changes,
// and the output is committed; this command only checks.
//
//   node scripts/r-wasm.mjs --check
//       change nothing: fail if the package repository, its record and the
//       pins disagree (no network; `npm test` makes the same check)
//   node scripts/r-wasm.mjs --check-source
//       change nothing: fail if a pin's tag no longer names its commit, or the
//       package's DESCRIPTION at that commit gives another version (a CI step)

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { R_WASM_DIRECTORY, readPins, verifyPins, verifyRWasm } from './r-wasm-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(rootDir, R_WASM_DIRECTORY);
const modes = ['--check', '--check-source'];
const args = process.argv.slice(2);
const unknown = args.filter((arg) => !modes.includes(arg));
if (unknown.length || args.length !== 1) {
  console.error(`Usage: node scripts/r-wasm.mjs ${modes.join(' | ')}`);
  if (unknown.length) console.error(`Not understood: ${unknown.join(' ')}`);
  process.exit(2);
}

// The commit a tag names: for an annotated tag, the commit it points at
// (the `^{}` line), never the tag object.
function commitOfTag(pin) {
  const out = execFileSync(
    'git',
    ['ls-remote', `${pin.repository}.git`, `refs/tags/${pin.tag}`, `refs/tags/${pin.tag}^{}`],
    { encoding: 'utf8' }
  );
  const lines = out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${pin.tag}^{}`);
  const plain = lines.find(([, ref]) => ref === `refs/tags/${pin.tag}`);
  return Promise.resolve((peeled || plain || [null])[0]);
}

async function description(pin) {
  const raw = pin.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/');
  const response = await fetch(`${raw}/${pin.commit}/DESCRIPTION`);
  if (!response.ok) {
    throw new Error(`${pin.package}: DESCRIPTION at ${pin.commit} answered ${response.status}.`);
  }
  return response.text();
}

const problems =
  args[0] === '--check'
    ? verifyRWasm(directory)
    : await verifyPins(readPins(directory), { commitOfTag, description });

if (problems.length) {
  console.error(`✗ ${R_WASM_DIRECTORY}:`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log(
  args[0] === '--check'
    ? `✓ ${R_WASM_DIRECTORY}: the packages, their record and the pins agree.`
    : `✓ ${R_WASM_DIRECTORY}: every pin's tag names its commit, at its pinned version.`
);
