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
 *   whose        whose data it is, as a phrase, for the welcome line a
 *                first-time visitor reads when the app opens on the study (#269)
 *   files        the file names, in the order they are loaded
 *   dir          the study's directory under the demo base, '' for the base itself
 *   source       where the repository keeps the files, for the site build
 *                and the test harness
 *   raw          true when the files are gsm's raw domains (#233): the app
 *                keeps them as they are and places none in a standard domain
 */
export const DEMO_STUDIES = [
  {
    id: 'pilot',
    label: 'Pilot study',
    whose: 'the CDISC pilot study, a public demo',
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
  },
  {
    id: 'rbqm',
    label: 'RBQM study',
    description:
      '765 enrolled participants at 150 sites, of 1,005 screened, as gsm’s raw domains. The ' +
      'nine files are kept as they are: none is placed in a standard domain or mapped.',
    files: [
      'Raw_SUBJ.csv',
      'Raw_AE.csv',
      'Raw_PD.csv',
      'Raw_LB.csv',
      'Raw_STUDCOMP.csv',
      'Raw_SDRGCOMP.csv',
      'Raw_SITE.csv',
      'Raw_STUDY.csv',
      'Raw_ENROLL.csv'
    ],
    dir: 'rbqm/',
    source: 'site/data/rbqm',
    raw: true
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
