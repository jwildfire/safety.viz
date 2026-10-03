// Vendors gsm.bio's statistics functions (#183, obot.roadmap#366): copies
// inst/statistics/statistics.R from gsm.bio into site/vendor/gsm.bio/ byte for
// byte, and writes SOURCE.json beside it with the gsm.bio commit, the package's
// version and licence, whether the commit is on gsm.bio's `dev` branch, and the
// file's checksum and size. It is the one file R in the browser is given when
// the reader starts R in the demo app, and the file the desktop-R script
// (scripts/app-statistics.R) sources to write the expected results.
//
//   node scripts/vendor-statistics.mjs                 copy from gsm.bio `dev`
//   node scripts/vendor-statistics.mjs --check         the record check (no network)
//   node scripts/vendor-statistics.mjs --check-source  also compare with the commit
//
// Run by hand when gsm.bio's statistics change; the output is committed.

import { runVendorCli } from './vendor-cli.mjs';
import { GSM_BIO_STATISTICS } from './vendor-lib.mjs';

// One field of an R package's DESCRIPTION file.
const field = (text, name) => {
  const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : undefined;
};

await runVendorCli(GSM_BIO_STATISTICS, {
  async describe({ commit, readAt }) {
    const description = (await readAt(commit, 'DESCRIPTION')).toString('utf8');
    const more = { version: field(description, 'Version') };
    const license = field(description, 'License');
    if (license) more.license = license;
    return { more, files: GSM_BIO_STATISTICS.files };
  }
});
