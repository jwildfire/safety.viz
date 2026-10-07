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
//   node scripts/vendor-bio-viz.mjs --tag v0.3.0
//       copy from one of bio.viz's release tags, and record the tag (#212)
//   node scripts/vendor-bio-viz.mjs --check
//       change nothing: fail if the file and its record disagree (no network;
//       `npm test` makes the same check)
//   node scripts/vendor-bio-viz.mjs --check-source
//       change nothing: also fetch the recorded commit's file from bio.viz and
//       fail if the copy differs from it (a CI step)
//
// Run by hand when bio.viz's charts change; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { BIO_VIZ } from './vendor-lib.mjs';

await runVendorCli(BIO_VIZ, {
  // The version, and so the path of the bundle, is bio.viz's own at the commit.
  async describe({ commit, readAt }) {
    const pkg = JSON.parse((await readAt(commit, 'package.json')).toString('utf8'));
    const more = { version: pkg.version };
    if (pkg.license) more.license = pkg.license;
    return {
      more,
      files: BIO_VIZ.files.map((entry) => ({
        ...entry,
        source: entry.source.replace('{version}', pkg.version)
      }))
    };
  }
});
