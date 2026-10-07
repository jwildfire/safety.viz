// The gsm packages built for R in the browser (#229, obot.roadmap#373): the
// pins that say what is built, the record of what was built, and the checks
// that hold one to the other. gsm.core, gsm.mapping, gsm.reporting and workr
// have no WebAssembly build anywhere, so safety.viz builds one of each from a
// pinned release tag (scripts/r-wasm/build.R, run by
// .github/workflows/r-wasm.yml) and serves them as a package repository beside
// the demo app; R in the browser installs them from the page's own address and
// their dependencies from the public index.
//
// A build is not reproducible byte for byte, so unlike a vendored bundle the
// files cannot be compared with their source. What is held instead: the record
// names, for each file, the repository, tag and commit it was built from and
// the run that built it; `verifyRWasm` fails when the files, the record and
// the pins disagree; and `verifyPins` fails when a pin's tag no longer names
// its commit or the package's own DESCRIPTION gives another version.
//
// Pure functions over a folder and what a caller fetched; scripts/r-wasm.mjs
// is the command line.

import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from './vendor-lib.mjs';

/** Where the pins, the record and the package repository are kept. */
export const R_WASM_DIRECTORY = 'site/vendor/r-wasm';
export const PINS_FILE = 'pins.json';
export const RECORD_FILE = 'SOURCE.json';
/** The package repository, as R reads one: bin/emscripten/contrib/{R version}/ under it. */
export const REPOSITORY_DIRECTORY = 'repo';
/** The directory the site serves the repository from, beside the demo app. */
export const SERVED_AS = 'r-wasm';

const COMMIT = /^[0-9a-f]{40}$/;
const isText = (value) => typeof value === 'string' && value !== '';

/**
 * Read the pins.
 * @param {string} directory The folder that holds them.
 * @returns {Object} The pins.
 */
export const readPins = (directory) =>
  JSON.parse(readFileSync(path.join(directory, PINS_FILE), 'utf8'));

/**
 * Every way the pins are not something a build can be made from; an empty list
 * means each names a package, its repository, a tag, the full commit and a
 * version, and no package is pinned twice.
 * @param {Object} pins The pins.
 * @returns {string[]} The problems, each a sentence.
 */
export function pinProblems(pins) {
  const problems = [];
  if (!pins || typeof pins !== 'object') return [`${PINS_FILE} is not an object.`];
  if (!isText(pins.webr)) problems.push(`${PINS_FILE} does not name the version of webR.`);
  if (!isText(pins.image)) problems.push(`${PINS_FILE} does not name the build image.`);
  const packages = Array.isArray(pins.packages) ? pins.packages : [];
  if (!packages.length) problems.push(`${PINS_FILE} pins no packages.`);
  const seen = new Set();
  for (const pin of packages) {
    const name = pin && isText(pin.package) ? pin.package : null;
    if (!name) {
      problems.push(`${PINS_FILE} has a pin that names no package.`);
      continue;
    }
    if (seen.has(name)) problems.push(`${name} is pinned twice.`);
    seen.add(name);
    if (!isText(pin.repository) || !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(pin.repository)) {
      problems.push(`${name}: its pin does not name a GitHub repository.`);
    }
    if (!isText(pin.tag)) problems.push(`${name}: its pin names no tag.`);
    if (!COMMIT.test(pin.commit || '')) {
      problems.push(`${name}: its pin does not name the full 40-character commit.`);
    }
    if (!isText(pin.version)) problems.push(`${name}: its pin names no version.`);
  }
  return problems;
}

/**
 * The packages an R package index lists, as R writes one (PACKAGES: blocks of
 * `Field: value` lines separated by blank lines).
 * @param {string} text The index.
 * @returns {Array<{package: string, version: string}>} One entry per package.
 */
export function parsePackagesIndex(text) {
  return String(text)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => ({
      package: (block.match(/^Package:\s*(.+)$/m) || [])[1],
      version: (block.match(/^Version:\s*(.+)$/m) || [])[1]
    }))
    .filter((entry) => entry.package)
    .map((entry) => ({ package: entry.package.trim(), version: String(entry.version).trim() }));
}

/**
 * Every way the package repository, its record and the pins disagree; an empty
 * list means the record was made from these pins, every pinned package was
 * built at its pinned version from its pinned commit, every recorded file is
 * present and unchanged, nothing else is served, and the repository's index
 * lists exactly the pinned packages. It never passes by comparing nothing.
 * @param {string} directory The folder: R_WASM_DIRECTORY under the repository root.
 * @returns {string[]} The problems, each a sentence.
 */
export function verifyRWasm(directory) {
  if (!existsSync(path.join(directory, PINS_FILE))) return [`${PINS_FILE} is missing.`];
  let pins;
  try {
    pins = readPins(directory);
  } catch (error) {
    return [`${PINS_FILE} cannot be read: ${error.message}`];
  }
  const problems = pinProblems(pins);
  if (problems.length) return problems;
  if (!existsSync(path.join(directory, RECORD_FILE))) {
    return [`${RECORD_FILE} is missing: nothing has been built from the pins.`];
  }
  let record;
  try {
    record = JSON.parse(readFileSync(path.join(directory, RECORD_FILE), 'utf8'));
  } catch (error) {
    return [`${RECORD_FILE} cannot be read: ${error.message}`];
  }

  if (record.pins_sha256 !== sha256(readFileSync(path.join(directory, PINS_FILE)))) {
    problems.push(
      `${RECORD_FILE} was not made from this ${PINS_FILE}: the pins have changed since the build.`
    );
  }
  const built = Array.isArray(record.built) ? record.built : [];
  for (const pin of pins.packages) {
    const entry = built.find((candidate) => candidate && candidate.package === pin.package);
    if (!entry) {
      problems.push(`${pin.package}: pinned, but ${RECORD_FILE} records no build of it.`);
      continue;
    }
    for (const key of ['repository', 'tag', 'commit', 'version']) {
      if (entry[key] !== pin[key]) {
        problems.push(
          `${pin.package}: built from ${key} ${entry[key]}, but its pin says ${pin[key]}.`
        );
      }
    }
  }
  for (const entry of built) {
    if (!pins.packages.some((pin) => entry && pin.package === entry.package)) {
      problems.push(`${entry && entry.package}: built, but not pinned.`);
    }
  }

  if (!isText(record.contrib) || !/^bin\/emscripten\/contrib\/\d+\.\d+$/.test(record.contrib)) {
    problems.push(`${RECORD_FILE} does not say where in the repository the packages are.`);
    return problems;
  }
  const contrib = path.join(directory, REPOSITORY_DIRECTORY, record.contrib);
  const recorded = [...built, ...(Array.isArray(record.index) ? record.index : [])];
  if (!recorded.length) problems.push(`${RECORD_FILE} records no files.`);
  for (const entry of recorded) {
    const file = path.join(contrib, String(entry.file));
    if (!existsSync(file)) {
      problems.push(`${entry.file}: recorded, but the file is missing.`);
      continue;
    }
    const bytes = readFileSync(file);
    if (sha256(bytes) !== entry.sha256) {
      problems.push(`${entry.file}: the file no longer matches its recorded checksum.`);
    }
    if (bytes.length !== entry.bytes) {
      problems.push(`${entry.file}: ${bytes.length} bytes, but ${entry.bytes} are recorded.`);
    }
  }
  if (existsSync(contrib)) {
    const names = new Set(recorded.map((entry) => String(entry.file)));
    for (const file of readdirSync(contrib)) {
      if (!names.has(file)) problems.push(`${file}: served, but not in ${RECORD_FILE}.`);
    }
    const others = readdirSync(
      path.join(directory, REPOSITORY_DIRECTORY, 'bin/emscripten/contrib')
    );
    for (const other of others) {
      if (other !== path.basename(record.contrib)) {
        problems.push(`bin/emscripten/contrib/${other}: served, but not in ${RECORD_FILE}.`);
      }
    }
    const indexFile = path.join(contrib, 'PACKAGES');
    if (!existsSync(indexFile)) {
      problems.push('PACKAGES: the repository has no index, so R could install nothing from it.');
    } else {
      const listed = parsePackagesIndex(readFileSync(indexFile, 'utf8'));
      const want = pins.packages.map((pin) => `${pin.package} ${pin.version}`).sort();
      const have = listed.map((entry) => `${entry.package} ${entry.version}`).sort();
      if (want.join(', ') !== have.join(', ')) {
        problems.push(
          `PACKAGES lists ${have.join(', ') || 'nothing'}, but the pins name ${want.join(', ')}.`
        );
      }
    }
  }
  return problems;
}

/**
 * Every way the pins disagree with the repositories they name: a tag that no
 * longer names its pinned commit, or a package whose own DESCRIPTION at that
 * commit gives another name or version.
 * @param {Object} pins The pins.
 * @param {Object} source What was fetched.
 * @param {(pin: Object) => Promise<?string>} source.commitOfTag The commit a pin's tag names now, or null when the tag is gone.
 * @param {(pin: Object) => Promise<string>} source.description The package's DESCRIPTION at the pinned commit.
 * @returns {Promise<string[]>} The problems, each a sentence.
 */
export async function verifyPins(pins, { commitOfTag, description }) {
  const problems = pinProblems(pins);
  if (problems.length) return problems;
  for (const pin of pins.packages) {
    const commit = await commitOfTag(pin);
    if (!commit) {
      problems.push(`${pin.package}: ${pin.repository} has no tag ${pin.tag}.`);
    } else if (commit !== pin.commit) {
      problems.push(
        `${pin.package}: tag ${pin.tag} names commit ${commit}, but its pin says ${pin.commit}.`
      );
    }
    const text = await description(pin);
    const name = (text.match(/^Package:\s*(.+)$/m) || [])[1];
    const version = (text.match(/^Version:\s*(.+)$/m) || [])[1];
    if (!name || name.trim() !== pin.package) {
      problems.push(`${pin.package}: the commit's DESCRIPTION names the package ${name}.`);
    }
    if (!version || version.trim() !== pin.version) {
      problems.push(
        `${pin.package}: the commit's DESCRIPTION gives version ${version}, but its pin says ${pin.version}.`
      );
    }
  }
  return problems;
}

/**
 * Serve the package repository beside the demo app: the repository as R reads
 * one, and the record of what each file was built from. Refused when the
 * packages, their record and the pins disagree, so a site is never built on
 * packages nothing vouches for.
 * @param {string} directory The folder: R_WASM_DIRECTORY under the repository root.
 * @param {string} outDir The demo app's directory.
 * @returns {void}
 */
export function publishRWasm(directory, outDir) {
  const problems = verifyRWasm(directory);
  if (problems.length) {
    throw new Error(
      `The gsm packages for R in the browser cannot be served: ${problems.join(' ')}`
    );
  }
  const served = path.join(outDir, SERVED_AS);
  mkdirSync(served, { recursive: true });
  cpSync(path.join(directory, REPOSITORY_DIRECTORY), served, { recursive: true });
  copyFileSync(path.join(directory, RECORD_FILE), path.join(served, RECORD_FILE));
}
