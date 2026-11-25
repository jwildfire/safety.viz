// Vendors gsm.datasim's R source for the demo app's Build a study tab: copies
// every file scripts/vendor-lib.mjs lists for it from the release tag named
// there into site/vendor/gsm.datasim/, byte for byte, and writes SOURCE.json
// beside them with the repository, tag, commit, version and licence and every
// file's checksum and size. gsm.datasim is public, in the Gilead-Public
// organisation, and is only ever read.
//
//   node scripts/vendor-gsm-datasim.mjs                 copy from the tag
//   node scripts/vendor-gsm-datasim.mjs --check         the record check (no network)
//   node scripts/vendor-gsm-datasim.mjs --check-source  also compare with the tag's commit
//
// Run by hand when the tag in scripts/vendor-lib.mjs is moved to a later
// release; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { GSM_DATASIM, descriptionField } from './vendor-lib.mjs';

const args = process.argv.slice(2);
const checking = args.includes('--check') || args.includes('--check-source');

if (!checking && args.length) {
  console.error(
    `✗ ${args.join(' ')}: gsm.datasim's tag is named in scripts/vendor-lib.mjs. ` +
      'Change it there, and run this with no arguments, --check or --check-source.'
  );
  process.exit(1);
}

await runVendorCli(GSM_DATASIM, {
  args: checking ? args : ['--tag', GSM_DATASIM.tag],
  async describe({ commit, readAt }) {
    const description = (await readAt(commit, 'DESCRIPTION')).toString('utf8');
    const more = { version: descriptionField(description, 'Version') };
    const license = descriptionField(description, 'License');
    if (license) more.license = license;
    return { more, files: GSM_DATASIM.files };
  }
});
