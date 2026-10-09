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

/**
 * The licence a LICENSE file states, by its SPDX name. Only the one gsm.viz has
 * is known here: any other text stops the copy, to be read by a person.
 */
function licenceOf(text) {
  const head = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/^Apache License Version 2\.0, January 2004/.test(head)) return 'Apache-2.0';
  throw new Error(
    `gsm.viz's LICENSE is not the Apache-2.0 text it was: it begins "${head.slice(0, 60)}".`
  );
}

await runVendorCli(GSM_VIZ, {
  args: checking ? args : ['--tag', GSM_VIZ.tag],
  // The version is gsm.viz's own, from its package.json at the commit. The
  // licence is the one its LICENSE file states, which is the file copied beside
  // the bundle: at v2.4.1 package.json still names another (ISC), and the
  // record says so rather than repeat it (#258).
  async describe({ commit, readAt }) {
    const pkg = JSON.parse((await readAt(commit, 'package.json')).toString('utf8'));
    const text = (await readAt(commit, 'LICENSE')).toString('utf8');
    const more = { version: pkg.version, license: licenceOf(text) };
    if (pkg.license && pkg.license !== more.license) more.license_in_package_json = pkg.license;
    return { more, files: GSM_VIZ.files };
  }
});
