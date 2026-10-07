// Vendors the RBQM demo study's raw files (#231, obot.roadmap#373): copies
// them byte for byte from jwildfire/demo-301's `input/` folder into
// site/data/rbqm/, and writes SOURCE.json beside them with the demo-301 commit
// and each file's checksum and size. The pipeline's browser test and the
// desktop-R reference both run on these copies.
//
//   node scripts/vendor-rbqm-study.mjs --ref <commit> --unmerged "<why>"
//       copy from a commit of demo-301's `main`, and record why it is not from
//       a `dev` branch: demo-301 has none
//   node scripts/vendor-rbqm-study.mjs --check
//       change nothing: fail if a file and its record disagree (no network;
//       `npm test` makes the same check)
//   node scripts/vendor-rbqm-study.mjs --check-source
//       change nothing: also fetch the recorded commit's files from demo-301
//       and fail if a copy differs (a CI step)
//
// Run by hand when the study changes in demo-301; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { RBQM_STUDY } from './vendor-lib.mjs';

await runVendorCli(RBQM_STUDY, {
  // Nothing to add about the commit: demo-301 is a study, with no version.
  describe: async () => ({ more: {}, files: RBQM_STUDY.files })
});
