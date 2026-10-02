// Demo app: the demo studies the hosted page offers (#159, obot.roadmap#352).
// A study is a name, one sentence saying what is in it, and a list of files.
// Only the list is bundled: the files are kept in the repository and copied
// beside the app by the site build, so the single file carries no demo data
// and offers no menu.

/**
 * The demo studies, the first being the one a hosted page opens on.
 *
 *   id           what the menu's option is keyed by
 *   label        its name in the menu
 *   description  one sentence shown under the menu while the study is loaded
 *   files        the file names, in the order they are loaded
 *   dir          the study's directory under the demo base, '' for the base itself
 *   source       where the repository keeps the files, for the site build
 *                and the test harness
 */
export const DEMO_STUDIES = [
  {
    id: 'pilot',
    label: 'Pilot study',
    description:
      '254 participants from the CDISC pilot study, with standard column names. The labs file ' +
      'also carries 110 synthetic liver and kidney participants who are in no other file.',
    files: ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'],
    dir: '',
    source: 'site/data'
  },
  {
    id: 'renamed',
    label: 'Renamed columns',
    description:
      '24 pilot participants with non-standard column and measure names: six rows of the ' +
      'mapping need setting by hand.',
    files: ['dm.csv', 'ae.csv', 'labs_final.csv', 'ecg.json'],
    dir: 'renamed/',
    source: 'tests/e2e/fixtures/app'
  },
  {
    id: 'liver',
    label: 'Liver cohort, labs only',
    description:
      '80 synthetic participants with abnormal liver tests at baseline. One labs file of liver ' +
      'tests: the charts of the other domains have no file.',
    files: ['adbds-abnbl.csv'],
    dir: '',
    source: 'site/data'
  }
];

/**
 * Where a study's files are fetched from: its own directory under the demo
 * base, or a base of its own when the host page gives it one.
 * @param {{files: string[], dir?: string, base?: string}} study The study.
 * @param {string} base Where the demo studies are served from.
 * @returns {string[]} One URL per file, in the study's order.
 */
export function studyUrls(study, base) {
  const from = study.base || `${base}${study.dir || ''}`;
  return study.files.map((file) => `${from}${file}`);
}
