// What the app's desktop-R comparison is made of (#183): which chart and
// measure, where the requests and desktop R's answers are kept, and the files
// they are derived from, held by checksum so a change to any of them makes the
// comparison stale rather than silently wrong.

import { sha256 } from './vendor-lib.mjs';

export const APP_STATISTICS = {
  chart: 'group-comparison',
  measure: 'Alanine Aminotransferase',
  directory: 'tests/fixtures/app-statistics',
  // What the recorded requests depend on: the study, the charts that ask, the
  // app that hands them their rows, and the R that answers.
  sources: [
    'site/data/adbds.csv',
    'site/data/adsl.csv',
    'site/vendor/bio.viz/bio.viz.js',
    'site/vendor/gsm.bio/statistics.R'
  ]
};

/**
 * The checksum of each file the comparison is derived from.
 * @param {(file: string) => Uint8Array} read A file's bytes, by its path in the repository.
 * @returns {Array<{file: string, sha256: string}>} One entry per source.
 */
export const derivedFrom = (read) =>
  APP_STATISTICS.sources.map((file) => ({ file, sha256: sha256(read(file)) }));
