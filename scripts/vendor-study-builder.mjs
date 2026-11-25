// Vendors study.builder for the demo app's Build a study source: copies its built
// bundle and the files its R reads, as scripts/vendor-lib.mjs lists them, into
// site/vendor/study.builder/, byte for byte, and writes SOURCE.json beside
// them with the repository, the commit, the version and the licence and every
// file's checksum and size. study.builder is public, under jwildfire, and is
// only ever read.
//
//   node scripts/vendor-study-builder.mjs                   copy from the release tag
//                                                           scripts/vendor-lib.mjs names
//   node scripts/vendor-study-builder.mjs --ref main --unmerged "<why>"
//                                                           copy from the head of main
//   node scripts/vendor-study-builder.mjs --check           the record check (no network)
//   node scripts/vendor-study-builder.mjs --check-source    also compare with the commit
//
// study.builder has one branch, main, and no dev: a copy that is not from a
// tag says so in its record. Run with no argument when the tag in
// scripts/vendor-lib.mjs is moved to a later release; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { STUDY_BUILDER } from './vendor-lib.mjs';

const args = process.argv.slice(2);
const checking = args.includes('--check') || args.includes('--check-source');

await runVendorCli(STUDY_BUILDER, {
  // With no argument, the copy is from the release tag scripts/vendor-lib.mjs names.
  args: checking || args.length ? args : ['--tag', STUDY_BUILDER.tag],
  async describe({ commit, readAt }) {
    const pkg = JSON.parse((await readAt(commit, 'package.json')).toString('utf8'));
    return { more: { version: pkg.version, license: pkg.license }, files: STUDY_BUILDER.files };
  }
});
