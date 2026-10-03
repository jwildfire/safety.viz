// Vendors bio.viz's script-tag bundle (#182, obot.roadmap#366): copies
// dist/bio.viz-{version}/bio.viz.js from bio.viz into site/vendor/bio.viz/
// byte for byte, and writes SOURCE.json beside it with the bio.viz commit, its
// version, whether the commit is on bio.viz's `dev` branch, and the file's
// checksum and size. The demo page loads the copy beside the app and the
// single file inlines it; nothing of bio.viz's source is imported or rebuilt.
//
//   node scripts/vendor-bio-viz.mjs
//       copy from the head of bio.viz's `dev` branch on GitHub
//   node scripts/vendor-bio-viz.mjs --ref <branch or commit> --unmerged "<why, and what to do later>"
//       copy from a commit not on bio.viz's `dev`, and record why
//   node scripts/vendor-bio-viz.mjs --check
//       change nothing: fail if the file and its record disagree (no network;
//       `npm test` makes the same check)
//   node scripts/vendor-bio-viz.mjs --check-source
//       change nothing: also fetch the recorded commit's file from bio.viz and
//       fail if the copy differs from it (a CI step)
//
// Run by hand when bio.viz's charts change; the output is committed.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIO_VIZ,
  buildRecord,
  readRecord,
  verifyAgainstSource,
  verifyVendored,
  writeVendored
} from './vendor-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(rootDir, BIO_VIZ.directory);
const slug = BIO_VIZ.repository.replace('https://github.com/', '');
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
    ['ls-remote', `${BIO_VIZ.repository}.git`, `refs/heads/${ref}`],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).toString();
  const commit = listed.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error(`${BIO_VIZ.repository} has no branch "${ref}".`);
  return commit;
}

function report(problems, passed) {
  if (problems.length) {
    console.error(`✗ ${BIO_VIZ.directory} does not match its source record:`);
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
        `✓ ${BIO_VIZ.directory}: ${record.files.map((entry) => entry.file).join(', ')} ` +
          (flag('--check-source')
            ? `equals ${slug} at ${record.commit.slice(0, 7)}, byte for byte.`
            : `matches its recorded checksum (copied from ${slug} at ${record.commit.slice(0, 7)}).`)
    );
  } else {
    const ref = option('--ref') || 'dev';
    const commit = resolveCommit(ref);
    const pkg = JSON.parse((await readAt(commit, 'package.json')).toString('utf8'));
    const more = { version: pkg.version };
    if (pkg.license) more.license = pkg.license;
    if (flag('--unmerged')) {
      const note = option('--unmerged');
      if (!note || note.startsWith('--')) {
        throw new Error('--unmerged needs a sentence saying why, and what is to be done later.');
      }
      more.merged_to_dev = false;
      more.note = note;
    } else if (ref !== 'dev') {
      throw new Error(`${ref} is not bio.viz's dev branch: say why with --unmerged "<why>".`);
    } else {
      more.merged_to_dev = true;
    }
    const source = {
      ...BIO_VIZ,
      files: BIO_VIZ.files.map((entry) => ({
        ...entry,
        source: entry.source.replace('{version}', pkg.version)
      }))
    };
    // Everything is read before anything is written, so a failed fetch leaves the folder as it was.
    const bytes = new Map();
    for (const { source: file } of source.files) bytes.set(file, await readAt(commit, file));
    const vendored = buildRecord({ source, ref, commit, more, read: (file) => bytes.get(file) });
    writeVendored(directory, vendored);
    for (const entry of vendored.record.files) {
      console.log(`✓ Wrote ${BIO_VIZ.directory}/${entry.file} — ${entry.bytes} bytes`);
    }
    console.log(`✓ Wrote ${BIO_VIZ.directory}/SOURCE.json — ${slug} at ${commit}`);
    report(verifyVendored(directory), '✓ Every file matches its record.');
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
