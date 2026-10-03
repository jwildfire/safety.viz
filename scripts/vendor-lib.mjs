// Vendoring, as a copy with a record (#182, obot.roadmap#366). The demo app
// carries a second chart library's script-tag bundle, made in that library's
// own repository and copied here byte for byte: nothing of its source is
// imported or rebuilt in safety.viz. Beside the copy sits a record,
// SOURCE.json, naming the repository and the commit it came from, whether that
// commit is on the library's `dev` branch, and the file's checksum and size.
// `verifyVendored` is the check that fails when the file and its record no
// longer agree; `verifyAgainstSource` compares the file with the commit itself.
// The record's shape is the one bio.viz keeps for its copy of safety.viz's
// bundle, so the two repositories describe their copies of each other alike.
//
// Pure functions over bytes and a folder; scripts/vendor-bio-viz.mjs is the
// command line that fetches the bytes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RECORD_FILE = 'SOURCE.json';

/**
 * bio.viz's script-tag bundle: the global `BioViz`, its chart factories and its
 * chart list (`BioViz.portfolio`). The demo page loads it beside the app and
 * the single file inlines it; it is never bundled into safety.viz. The path it
 * is copied from carries bio.viz's version, read from bio.viz's own
 * package.json at the commit; here it has one name whatever the version.
 */
export const BIO_VIZ = {
  name: 'bio.viz script-tag bundle',
  label: 'bundle',
  repository: 'https://github.com/jwildfire/bio.viz',
  directory: 'site/vendor/bio.viz',
  files: [{ file: 'bio.viz.js', source: 'dist/bio.viz-{version}/bio.viz.js' }]
};

/**
 * A file's checksum.
 * @param {Uint8Array} bytes The file's bytes.
 * @returns {string} Its SHA-256, in hex.
 */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The record for files as they were read from one commit.
 * @param {Object} options
 * @param {Object} options.source What is vendored: BIO_VIZ, with its files' source paths resolved.
 * @param {string} options.ref The branch or commit the files were asked for at.
 * @param {string} options.commit The full commit they were read from.
 * @param {(file: string) => Uint8Array} options.read The bytes of one source path at that commit.
 * @param {Object} [options.more] What else to record, after the commit: a version, whether it is on dev, a note.
 * @returns {{record: Object, contents: Array<{entry: Object, bytes: Buffer}>}} The record, and the bytes to write.
 */
export function buildRecord({ source, ref, commit, read, more = {} }) {
  if (!/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new Error(`A source record needs the full 40-character commit, not "${commit}".`);
  }
  const contents = source.files.map((entry) => ({ entry, bytes: Buffer.from(read(entry.source)) }));
  return {
    record: {
      [source.label]: source.name,
      repository: source.repository,
      ref,
      commit,
      ...more,
      files: contents.map(({ entry, bytes }) => ({
        file: entry.file,
        source: entry.source,
        sha256: sha256(bytes),
        bytes: bytes.length
      }))
    },
    contents
  };
}

/**
 * Write the files exactly as given, and the record beside them.
 * @param {string} directory The vendor folder.
 * @param {{record: Object, contents: Array}} vendored What buildRecord returned.
 * @returns {void}
 */
export function writeVendored(directory, { record, contents }) {
  mkdirSync(directory, { recursive: true });
  for (const { entry, bytes } of contents) writeFileSync(path.join(directory, entry.file), bytes);
  writeFileSync(path.join(directory, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Read a vendor folder's record.
 * @param {string} directory The vendor folder.
 * @returns {Object} The record.
 */
export function readRecord(directory) {
  return JSON.parse(readFileSync(path.join(directory, RECORD_FILE), 'utf8'));
}

/**
 * Every way a vendor folder and its record disagree; an empty list means every
 * recorded file is present and unchanged and nothing else is there. It never
 * passes by comparing nothing.
 * @param {string} directory The vendor folder.
 * @returns {string[]} The problems, each a sentence.
 */
export function verifyVendored(directory) {
  if (!existsSync(path.join(directory, RECORD_FILE))) {
    return [`${RECORD_FILE} is missing: the files have no source record.`];
  }
  let record;
  try {
    record = readRecord(directory);
  } catch (error) {
    return [`${RECORD_FILE} cannot be read: ${error.message}`];
  }
  const problems = [];
  if (!/^[0-9a-f]{40}$/.test(record.commit || '')) {
    problems.push(`${RECORD_FILE} does not name the full commit the files were copied from.`);
  }
  if (typeof record.repository !== 'string' || !record.repository) {
    problems.push(`${RECORD_FILE} does not name the repository the files were copied from.`);
  }
  const files = Array.isArray(record.files) ? record.files : [];
  if (!files.length) problems.push(`${RECORD_FILE} records no files.`);
  for (const entry of files) {
    const file = path.join(directory, String(entry.file));
    if (!existsSync(file)) {
      problems.push(`${entry.file}: recorded, but the file is missing.`);
      continue;
    }
    const bytes = readFileSync(file);
    if (sha256(bytes) !== entry.sha256) {
      problems.push(
        `${entry.file}: the file no longer matches its recorded checksum ` +
          `(recorded ${String(entry.sha256).slice(0, 12)}…, found ${sha256(bytes).slice(0, 12)}…).`
      );
    } else if (bytes.length !== entry.bytes) {
      problems.push(`${entry.file}: ${bytes.length} bytes, and the record says ${entry.bytes}.`);
    }
  }
  const recorded = new Set(files.map((entry) => entry.file));
  for (const file of readdirSync(directory).filter((name) => name !== RECORD_FILE)) {
    if (!recorded.has(file)) problems.push(`${file}: present, but not in ${RECORD_FILE}.`);
  }
  return problems;
}

/**
 * The second check, against the source itself: every recorded file equals the
 * bytes the library holds at the recorded commit.
 * @param {string} directory The vendor folder.
 * @param {(commit: string, file: string) => Promise<Uint8Array>} read The bytes of one source path at one commit.
 * @returns {Promise<string[]>} The problems, each a sentence.
 */
export async function verifyAgainstSource(directory, read) {
  const record = readRecord(directory);
  const problems = [];
  for (const entry of record.files || []) {
    const theirs = Buffer.from(await read(record.commit, entry.source));
    const file = path.join(directory, entry.file);
    const ours = existsSync(file) ? readFileSync(file) : null;
    if (!ours || !ours.equals(theirs)) {
      problems.push(
        `${entry.file}: differs from ${entry.source} at ${record.commit.slice(0, 7)} of ${record.repository}.`
      );
    }
  }
  if (!(record.files || []).length) problems.push(`${RECORD_FILE} records no files.`);
  return problems;
}
