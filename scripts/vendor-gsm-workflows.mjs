// Vendors the gsm pipeline's workflow files for R in the browser (#230,
// obot.roadmap#373): copies the mapping workflows from gsm.mapping, the metric
// workflows and one R file from gsm.kri, and the reporting workflows from
// gsm.reporting, each from the release tag scripts/vendor-lib.mjs names for it,
// into site/vendor/<package>/ byte for byte, and writes SOURCE.json beside each
// with the package's repository, tag, commit, version and licence and every
// file's checksum and size. The three packages are public, in the
// Gilead-Public organisation, and are only ever read.
//
// One line of one file is changed, and its record lists it: the reporting
// Results workflow names FilterByLatestSnapshotDate without `gsm.kri::`,
// because gsm.kri is not installed in browser R. The run sources the copy of
// gsm.kri's R/util-Report.R instead. Both checks hold that file to its tag with
// that one line changed, and every other file to its tag as it is.
//
//   node scripts/vendor-gsm-workflows.mjs                 copy all three from their tags
//   node scripts/vendor-gsm-workflows.mjs --check         the record check (no network;
//                                                         `npm test` makes the same check)
//   node scripts/vendor-gsm-workflows.mjs --check-source  also compare with each tag's
//                                                         commit (a CI step)
//
// Run by hand when a tag in scripts/vendor-lib.mjs is moved to a later release;
// the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { GSM_WORKFLOWS, descriptionField } from './vendor-lib.mjs';

const args = process.argv.slice(2);
const checking = args.includes('--check') || args.includes('--check-source');

// Each package is copied from the tag named for it, so there is nothing to
// say on the command line about where to copy from.
if (!checking && args.length) {
  console.error(
    `✗ ${args.join(' ')}: each package's tag is named in scripts/vendor-lib.mjs. ` +
      'Change it there, and run this with no arguments, --check or --check-source.'
  );
  process.exit(1);
}

// Every source is run, so a failure in one does not hide another's.
for (const source of GSM_WORKFLOWS) {
  await runVendorCli(source, {
    args: checking ? args : ['--tag', source.tag],
    async describe({ commit, readAt }) {
      const description = (await readAt(commit, 'DESCRIPTION')).toString('utf8');
      const more = { version: descriptionField(description, 'Version') };
      const license = descriptionField(description, 'License');
      if (license) more.license = license;
      return { more, files: source.files };
    }
  });
}
