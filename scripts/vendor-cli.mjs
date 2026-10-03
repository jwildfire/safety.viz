// The command line behind the vendoring scripts (scripts/vendor-*.mjs, #182,
// #183): fetch files from one commit of another repository on GitHub, write
// them unchanged with a record beside them, or check what is there against the
// record or against the source.
//
//   (no flag)                          copy from the head of the source's `dev`
//   --ref <ref> --unmerged "<why>"     copy from a commit not on `dev`, and say why
//   --check                            change nothing: fail if a file and its
//                                      record disagree (no network)
//   --check-source                     change nothing: also fetch the recorded
//                                      commit's files and fail on a difference
//
// Each script passes what it vendors, and how to describe a commit (`describe`).

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRecord,
  readRecord,
  verifyAgainstSource,
  verifyVendored,
  writeVendored
} from './vendor-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Run the vendoring command line for one source.
 * @param {Object} source What is vendored: { name, label, repository, directory, files }.
 * @param {Object} options
 * @param {(context: {commit: string, readAt: Function}) => Promise<{more: Object, files: Object[]}>} options.describe What to record about the commit beside `ref`, `commit` and `merged_to_dev`, and the files to copy with their source paths resolved.
 * @returns {Promise<void>}
 */
export async function runVendorCli(source, { describe }) {
  const directory = path.join(rootDir, source.directory);
  const slug = source.repository.replace('https://github.com/', '');
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  async function readAt(commit, file) {
    const url = `https://raw.githubusercontent.com/${slug}/${commit}/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }

  function resolveCommit(ref) {
    if (/^[0-9a-f]{40}$/.test(ref)) return ref;
    const listed = execFileSync(
      'git',
      ['ls-remote', `${source.repository}.git`, `refs/heads/${ref}`],
      {
        stdio: ['ignore', 'pipe', 'pipe']
      }
    ).toString();
    const commit = listed.split(/\s+/)[0];
    if (!/^[0-9a-f]{40}$/.test(commit))
      throw new Error(`${source.repository} has no branch "${ref}".`);
    return commit;
  }

  function report(problems, passed) {
    if (problems.length) {
      console.error(`✗ ${source.directory} does not match its source record:`);
      problems.forEach((problem) => console.error(`  - ${problem}`));
      process.exit(1);
    }
    console.log(passed);
  }

  try {
    if (flag('--check') || flag('--check-source')) {
      const problems = verifyVendored(directory);
      if (!problems.length && flag('--check-source')) {
        problems.push(...(await verifyAgainstSource(directory, readAt)));
      }
      const record = problems.length ? null : readRecord(directory);
      report(
        problems,
        record &&
          `✓ ${source.directory}: ${record.files.map((entry) => entry.file).join(', ')} ` +
            (flag('--check-source')
              ? `equals ${slug} at ${record.commit.slice(0, 7)}, byte for byte.`
              : `matches its recorded checksum (copied from ${slug} at ${record.commit.slice(0, 7)}).`)
      );
      return;
    }
    const ref = option('--ref') || 'dev';
    const commit = resolveCommit(ref);
    const { more, files } = await describe({ commit, readAt });
    if (flag('--unmerged')) {
      const note = option('--unmerged');
      if (!note || note.startsWith('--')) {
        throw new Error('--unmerged needs a sentence saying why, and what is to be done later.');
      }
      Object.assign(more, { merged_to_dev: false, note });
    } else if (ref !== 'dev') {
      throw new Error(`${ref} is not ${slug}'s dev branch: say why with --unmerged "<why>".`);
    } else {
      more.merged_to_dev = true;
    }
    // Everything is read before anything is written, so a failed fetch leaves the folder as it was.
    const bytes = new Map();
    for (const { source: file } of files) bytes.set(file, await readAt(commit, file));
    const vendored = buildRecord({
      source: { ...source, files },
      ref,
      commit,
      more,
      read: (file) => bytes.get(file)
    });
    writeVendored(directory, vendored);
    for (const entry of vendored.record.files) {
      console.log(`✓ Wrote ${source.directory}/${entry.file} — ${entry.bytes} bytes`);
    }
    console.log(`✓ Wrote ${source.directory}/SOURCE.json — ${slug} at ${commit}`);
    report(verifyVendored(directory), '✓ Every file matches its record.');
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
