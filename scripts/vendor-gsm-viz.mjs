// Vendors gsm.viz's script-tag bundle for the RBQM tab (#232,
// obot.roadmap#374): copies the built `index.js` from the root of
// Gilead-Public/gsm.viz, and the repository's LICENSE, into
// site/vendor/gsm.viz/ byte for byte from the release tag
// scripts/vendor-lib.mjs names, and writes SOURCE.json beside them with the
// repository, tag, commit, version and licence and each file's checksum and
// size. The bundle is not rebuilt or edited. gsm.viz is public and is only
// ever read.
//
//   node scripts/vendor-gsm-viz.mjs                 copy from the tag
//   node scripts/vendor-gsm-viz.mjs --check         the record check (no network;
//                                                   `npm test` makes the same check)
//   node scripts/vendor-gsm-viz.mjs --check-source  also compare with the tag's
//                                                   commit (a CI step)
//
// Run by hand when the tag in scripts/vendor-lib.mjs is moved to a later
// release; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { GSM_VIZ } from './vendor-lib.mjs';

const args = process.argv.slice(2);
const checking = args.includes('--check') || args.includes('--check-source');

// The bundle is copied from the tag named for it, so there is nothing to say
// on the command line about where to copy from.
if (!checking && args.length) {
  console.error(
    `✗ ${args.join(' ')}: gsm.viz's tag is named in scripts/vendor-lib.mjs. ` +
      'Change it there, and run this with no arguments, --check or --check-source.'
  );
  process.exit(1);
}

await runVendorCli(GSM_VIZ, {
  args: checking ? args : ['--tag', GSM_VIZ.tag],
  // The version and the licence are gsm.viz's own, from its package.json at the commit.
  async describe({ commit, readAt }) {
    const pkg = JSON.parse((await readAt(commit, 'package.json')).toString('utf8'));
    const more = { version: pkg.version };
    if (pkg.license) more.license = pkg.license;
    return { more, files: GSM_VIZ.files };
  }
});
