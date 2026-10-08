// The command line behind the vendoring scripts (scripts/vendor-*.mjs, #182,
// #183): fetch files from one commit of another repository on GitHub, write
// them unchanged with a record beside them, or check what is there against the
// record or against the source. A file the source object lists a change for
// (#230) is written with that one line changed, and the record lists it.
//
//   (no flag)                          copy from the head of the source's `dev`
//   --ref <ref> --unmerged "<why>"     copy from a commit not on `dev`, and say why
//   --tag <tag>                        copy from a release tag, such as v0.3.0,
//                                      and record the tag (#212)
//   --check                            change nothing: fail if a file and its
//                                      record disagree, or the record lists a
//                                      change the script does not (no network)
//   --check-source                     change nothing: also fetch the recorded
//                                      commit's files and fail on a difference,
//                                      and ask GitHub whether a commit recorded
//                                      as on dev is on dev (#193), and whether
//                                      a recorded tag points at the recorded
//                                      commit (#212); a token in GITHUB_TOKEN or
//                                      GH_TOKEN is used if set
//
// Each script passes what it vendors, and how to describe a commit (`describe`).
// A script that vendors from several sources (#230) runs this once for each,
// passing the arguments itself; a failure sets the exit code and returns, so
// every source is reported.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRecord,
  compareWithDev,
  readRecord,
  tagCommitFrom,
  verifyAgainstSource,
  verifyDeclaredChanges,
  verifyOnDev,
  verifyTag,
  verifyVendored,
  writeVendored
} from './vendor-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Run the vendoring command line for one source.
 * @param {Object} source What is vendored: { name, label, repository, directory, files }.
 * @param {Object} options
 * @param {(context: {commit: string, readAt: Function}) => Promise<{more: Object, files: Object[]}>} options.describe What to record about the commit beside `ref`, `commit` and `merged_to_dev`, and the files to copy with their source paths resolved.
 * @param {string[]} [options.args] The command line's arguments, when they are not the process's own.
 * @returns {Promise<boolean>} Whether it passed; when it did not, the process's exit code is set to 1.
 */
export async function runVendorCli(source, { describe, args = process.argv.slice(2) }) {
  const directory = path.join(rootDir, source.directory);
  const slug = source.repository.replace('https://github.com/', '');
  const flag = (name) => args.includes(name);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  async function readAt(commit, file) {
    const url = `https://raw.githubusercontent.com/${slug}/${commit}/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }

  // How dev stands to a commit, from GitHub's compare API (vendor-lib.mjs).
  const compare = (commit) =>
    compareWithDev({ slug, commit, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN });

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

  // The commit one of the source's tags points at, or null when it has none of that name.
  async function tagCommit(tag) {
    const listed = execFileSync(
      'git',
      ['ls-remote', `${source.repository}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    ).toString();
    return tagCommitFrom(listed, tag);
  }

  function report(problems, passed) {
    if (problems.length) {
      console.error(`✗ ${source.directory} does not match its source record:`);
      problems.forEach((problem) => console.error(`  - ${problem}`));
      process.exitCode = 1;
      return false;
    }
    console.log(passed);
    return true;
  }

  // Which of a record's files differ from the source by a recorded line (#230), in words.
  function recordedChanges(record) {
    const changed = record.files.filter((entry) => entry.patches !== undefined);
    const lines = changed.reduce((count, entry) => count + entry.patches.length, 0);
    return changed.length
      ? ` but for the ${lines === 1 ? 'one line' : `${lines} lines`} the record lists as changed in ` +
          changed.map((entry) => entry.file).join(', ')
      : '';
  }

  try {
    if (flag('--check') || flag('--check-source')) {
      const problems = verifyVendored(directory);
      // A change the record lists must be one this script declares (#230).
      if (!problems.length) problems.push(...verifyDeclaredChanges(readRecord(directory), source));
      if (!problems.length && flag('--check-source')) {
        problems.push(...(await verifyAgainstSource(directory, readAt)));
        problems.push(...(await verifyOnDev(readRecord(directory), compare)));
        problems.push(...(await verifyTag(readRecord(directory), tagCommit)));
      }
      const record = problems.length ? null : readRecord(directory);
      return report(
        problems,
        record &&
          `✓ ${source.directory}: ${record.files.map((entry) => entry.file).join(', ')} ` +
            (flag('--check-source')
              ? `equals ${slug} at ${record.commit.slice(0, 7)}, byte for byte` +
                recordedChanges(record) +
                (record.merged_to_dev
                  ? ', and that commit is on dev.'
                  : record.tag
                    ? `, and that commit is its tag ${record.tag}.`
                    : ', a commit not on dev.')
              : `matches its recorded checksum (copied from ${slug} at ${record.commit.slice(0, 7)}` +
                `${recordedChanges(record)}).`)
      );
    }
    const tag = option('--tag');
    if (flag('--tag') && (!tag || tag.startsWith('--'))) {
      throw new Error('--tag needs the name of a release tag, such as v0.3.0.');
    }
    if (tag && (flag('--ref') || flag('--unmerged'))) {
      throw new Error('--tag names what to copy by itself: leave out --ref and --unmerged.');
    }
    const ref = tag || option('--ref') || 'dev';
    const commit = tag ? await tagCommit(tag) : resolveCommit(ref);
    if (!commit) throw new Error(`${source.repository} has no tag "${tag}".`);
    const { more, files } = await describe({ commit, readAt });
    if (tag) {
      // A release is cut on the source's main branch, so its commit is not on dev.
      if (more.version !== undefined && tag !== `v${more.version}`) {
        throw new Error(`${slug}'s tag ${tag} is of version ${more.version}, not of its own name.`);
      }
      Object.assign(more, { tag, merged_to_dev: false });
    } else if (flag('--unmerged')) {
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
    return report(verifyVendored(directory), '✓ Every file matches its record.');
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
    return false;
  }
}
