import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RBQM_GATE,
  RBQM_METRICS,
  RBQM_PILOT,
  RBQM_TAB,
  RESULT_KEYS,
  RESULT_NUMBERS,
  inRepository,
  pilotDerivedFrom,
  scenarioFiles,
  scenarioFolder,
  tabArgs,
  tabDerivedFrom,
  tabStudyFiles
} from '../../../scripts/rbqm-lib.mjs';
import { GSM_KRI_WORKFLOWS, RBQM_STUDY } from '../../../scripts/vendor-lib.mjs';
import { readPins } from '../../../scripts/r-wasm-lib.mjs';
import { parseFile } from '../../../src/app/parse.js';

// The RBQM tab's run (#234, obot.roadmap#374): every metric workflow in scope,
// on whatever raw files are loaded, with a line of status for each metric. The
// run is written down once in scripts/rbqm-lib.mjs and given alike to R in the
// browser (tests/e2e/rbqm-pipeline.spec.js, APP-RBQM-012) and to desktop R
// (scripts/rbqm-reference.mjs). These tests hold the description of the run,
// desktop R's answers to the files they were derived from, and what desktop R
// said of each metric when something was missing.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file));
const expected = JSON.parse(read(RBQM_TAB.expected).toString('utf8'));
const pipeline = read(RBQM_TAB.pipeline).toString('utf8');
const scenario = (id) => RBQM_TAB.scenarios.find((item) => item.id === id);

describe('the RBQM tab’s run, as R is given it (#234)', () => {
  it('APP-RBQM-013: the tab’s run is the gate’s with every metric workflow there is: the same R function, packages and workflow folders, no metric named, and the raw files from a folder of the study’s own; the eight metrics in scope are the eight copied workflows (#234)', () => {
    expect(RBQM_METRICS).toEqual([
      'kri0001',
      'kri0002',
      'kri0003',
      'kri0004',
      'kri0005',
      'kri0006',
      'kri0007',
      'kri0012'
    ]);
    expect(RBQM_TAB.metrics).toBe(RBQM_METRICS);
    expect(
      GSM_KRI_WORKFLOWS.files
        .filter((entry) => entry.file.endsWith('.yaml'))
        .map((entry) => path.basename(entry.file, '.yaml'))
    ).toEqual(RBQM_METRICS);
    expect(RBQM_TAB).toMatchObject({
      call: 'rbqm_run',
      attach: 'rbqm_attach',
      pipeline: RBQM_GATE.pipeline,
      packages: RBQM_GATE.packages,
      repository: RBQM_GATE.repository,
      publicIndex: 'https://repo.r-wasm.org'
    });
    expect(pipeline).toMatch(/^rbqm_run <- function\(/m);
    expect(pipeline).toMatch(/^rbqm_attach <- function\(\)/m);
    // The packages are the pinned ones, and the one list of them is R's own.
    expect([...RBQM_TAB.packages].sort()).toEqual(
      readPins(path.join(root, 'site/vendor/r-wasm'))
        .packages.map((pin) => pin.package)
        .sort()
    );
    expect(pipeline).toContain(
      `rbqm_packages <- c(${RBQM_TAB.packages.map((name) => `"${name}"`).join(', ')})`
    );
    const args = tabArgs('/rbqm/scenarios/whole');
    expect(args).toEqual({
      data: '/rbqm/scenarios/whole',
      mappings: '/rbqm/gsm.mapping/workflow/1_mappings',
      metrics: '/rbqm/gsm.kri/workflow/2_metrics',
      reporting: '/rbqm/gsm.reporting/workflow/3_reporting',
      helpers: '/rbqm/gsm.kri/R/util-Report.R',
      standard: '/rbqm/standard',
      snapshot_date: '2026-10-07'
    });
    expect(Object.keys(args)).not.toContain('metric_ids');
    expect(tabArgs('/somewhere', inRepository).mappings).toBe(
      'site/vendor/gsm.mapping/workflow/1_mappings'
    );
    expect(tabStudyFiles().map((entry) => entry.file)).toEqual(
      RBQM_STUDY.files.map((entry) => `${RBQM_STUDY.directory}/${entry.file}`)
    );
    for (const { file } of tabStudyFiles()) expect(existsSync(path.join(root, file))).toBe(true);
  });

  it('APP-RBQM-013: four studies are run, each from a folder of its own: the demo study whole, without its labs file, with the seriousness column taken out of its adverse events file and nothing else changed, and its subjects and adverse events files alone (#234)', () => {
    expect(RBQM_TAB.scenarios.map((item) => item.id)).toEqual([
      'whole',
      'no-labs',
      'no-column',
      'two-files'
    ]);
    const folders = RBQM_TAB.scenarios.map(scenarioFolder);
    expect(new Set(folders).size).toBe(4);
    expect(folders[0]).toBe('/rbqm/scenarios/whole');
    const names = RBQM_STUDY.files.map((entry) => entry.file);
    const whole = scenarioFiles(scenario('whole'), read);
    expect(Object.keys(whole)).toEqual(names);
    for (const name of names) {
      expect(whole[name], name).toBe(read(`${RBQM_STUDY.directory}/${name}`).toString('utf8'));
    }
    const noLabs = scenarioFiles(scenario('no-labs'), read);
    expect(Object.keys(noLabs)).toEqual(names.filter((name) => name !== 'Raw_LB.csv'));
    const noColumn = scenarioFiles(scenario('no-column'), read);
    expect(Object.keys(noColumn)).toEqual(names);
    for (const name of names.filter((item) => item !== 'Raw_AE.csv')) {
      expect(noColumn[name], name).toBe(whole[name]);
    }
    // The adverse events file has every row and every column but the one taken out.
    const header = (text) => text.slice(0, text.indexOf('\n')).split(',');
    expect(header(whole['Raw_AE.csv'])).toContain('"aeser"');
    expect(header(noColumn['Raw_AE.csv'])).toEqual(
      header(whole['Raw_AE.csv']).filter((name) => name !== '"aeser"')
    );
    expect(noColumn['Raw_AE.csv'].split('\n')).toHaveLength(whole['Raw_AE.csv'].split('\n').length);
    expect(Object.keys(scenarioFiles(scenario('two-files'), read))).toEqual([
      'Raw_SUBJ.csv',
      'Raw_AE.csv'
    ]);
    // A column that is not there to take out is said, not passed over.
    expect(() =>
      scenarioFiles({ id: 'x', dropColumn: { file: 'Raw_AE.csv', column: 'nope' } }, read)
    ).toThrow(/Raw_AE\.csv has no column nope to take out/);
  });
});

describe('the one R function behind the tab (#234)', () => {
  // The R that is run, without its comments.
  const code = pipeline
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('APP-RBQM-014: the R function names no raw domain and no column of one: what a workflow needs is read from its own spec, and a raw file is any file named Raw_<DOMAIN>.csv; the one mapped table it names is the study’s, which the Results workflow reads the study’s ID from (#234)', () => {
    const domains = RBQM_STUDY.files.map((entry) => path.basename(entry.file, '.csv'));
    for (const domain of domains) expect(code, domain).not.toContain(domain);
    expect(code).toContain('pattern = "^Raw_.+\\\\.csv$"');
    expect([...new Set(code.match(/Mapped_\w+/g))]).toEqual(['Mapped_STUDY']);
    expect(code).toContain('names(workflow$spec)');
    // The one column named is the study ID's, read when no study table was made.
    expect([...new Set(code.match(/"studyid"/g))]).toEqual(['"studyid"']);
    for (const column of ['subjid', 'invid', 'aeser', 'toxgrg_nsv', 'enrollyn']) {
      expect(code, column).not.toContain(column);
    }
  });

  it('APP-RBQM-014: it computes nothing itself: every workflow is run through workr, it calls no statistical or arithmetic function on the data, and the one gsm function it names parses a metric’s thresholds from text to numbers (#234)', () => {
    expect(code).toContain('workr::RunWorkflows(');
    expect(code).toContain('workr::MakeWorkflowList(');
    for (const call of [
      'mean(',
      'sum(',
      'sd(',
      'qnorm(',
      'pnorm(',
      'glm(',
      'aggregate(',
      'tapply('
    ]) {
      expect(code, call).not.toContain(call);
    }
    // One gsm function is called by name, the one gsm's own bar chart binding
    // parses a metric's thresholds with: every other is a workflow's step.
    expect([...new Set(code.match(/gsm\.(core|mapping|reporting)::\w+/g))]).toEqual([
      'gsm.core::ParseThreshold'
    ]);
  });
});

describe('desktop R’s answers for the RBQM tab (#234)', () => {
  it('APP-RBQM-015: desktop R’s answers are derived from the pipeline’s R, the copied workflows and the demo study’s nine raw files as they are now, by checksum of every one (#234)', () => {
    // Rerun `node scripts/rbqm-reference.mjs` when this fails.
    expect(expected.derived_from).toEqual(tabDerivedFrom(read));
    expect(expected.derived_from).toHaveLength(1 + 5 + 10 + 9 + 4 + 9);
    expect(expected.metrics).toEqual(RBQM_METRICS);
    expect(expected.snapshot_date).toBe(RBQM_TAB.snapshotDate);
  });

  it('APP-RBQM-015: on the whole study all eight metrics ran: 1,186 Results rows, a row for each of 148 sites for seven metrics and 150 for the screen failure rate, each with its site, numerator, denominator, metric, score and flag, beside the Bounds, Groups and Metrics tables, with nothing warned of (#234)', () => {
    const {
      Results,
      Bounds,
      Groups,
      Metrics,
      status,
      groups,
      thresholds,
      notes,
      ran,
      versions,
      warnings
    } = expected.whole;
    expect(Results).toHaveLength(1186);
    const sites = {};
    for (const row of Results) {
      for (const column of [...RESULT_KEYS, ...RESULT_NUMBERS]) {
        expect(Object.prototype.hasOwnProperty.call(row, column), column).toBe(true);
      }
      expect(row.GroupLevel).toBe('Site');
      expect(row.SnapshotDate).toBe(RBQM_TAB.snapshotDate);
      sites[row.MetricID] = (sites[row.MetricID] || new Set()).add(row.GroupID);
    }
    expect(Object.fromEntries(Object.entries(sites).map(([id, set]) => [id, set.size]))).toEqual({
      Analysis_kri0001: 148,
      Analysis_kri0002: 148,
      Analysis_kri0003: 148,
      Analysis_kri0004: 148,
      Analysis_kri0005: 148,
      Analysis_kri0006: 148,
      Analysis_kri0007: 148,
      Analysis_kri0012: 150
    });
    // The metric's ID is gsm's own: the workflow's type and ID, in every table.
    expect(Metrics.map((row) => [row.MetricID, row.ID, row.Abbreviation, row.Metric])).toEqual([
      ['Analysis_kri0001', 'kri0001', 'AE', 'Adverse Event Rate'],
      ['Analysis_kri0002', 'kri0002', 'SAE', 'Serious Adverse Event Rate'],
      ['Analysis_kri0003', 'kri0003', 'PD', 'Non-Important Protocol Deviation Rate'],
      ['Analysis_kri0004', 'kri0004', 'IPD', 'Important Protocol Deviation Rate'],
      ['Analysis_kri0005', 'kri0005', 'LB', 'Grade 3+ Lab Abnormality Rate'],
      ['Analysis_kri0006', 'kri0006', 'SDSC', 'Study Discontinuation Rate'],
      ['Analysis_kri0007', 'kri0007', 'TDSC', 'Treatment Discontinuation Rate'],
      ['Analysis_kri0012', 'kri0012', 'SF', 'Screen Failure Rate']
    ]);
    expect(new Set(Bounds.map((row) => row.MetricID))).toEqual(new Set(Object.keys(sites)));
    expect(Bounds.length).toBeGreaterThan(7000);
    expect(new Set(Groups.map((row) => row.GroupLevel))).toEqual(
      new Set(['Study', 'Site', 'Country'])
    );
    expect(status).toEqual(
      Metrics.map((row) => ({
        id: row.ID,
        metric: row.Metric,
        abbreviation: row.Abbreviation,
        state: 'ran',
        files: [],
        columns: [],
        unmapped: [],
        message: ''
      }))
    );
    expect(groups).toEqual({ state: 'ran', files: [], columns: [], unmapped: [], message: '' });
    // Each metric's thresholds as numbers, in the order its workflow writes them.
    expect(thresholds).toEqual(
      Object.fromEntries(Metrics.map((row) => [row.MetricID, row.Threshold.split(',').map(Number)]))
    );
    expect(thresholds.Analysis_kri0001).toEqual([-2, -1, 2, 3]);
    expect(thresholds.Analysis_kri0012).toEqual([-3, -2, 2, 3]);
    expect(notes).toEqual([]);
    expect(ran.metrics).toEqual(RBQM_METRICS);
    expect(ran.mappings).toHaveLength(10);
    expect(warnings).toEqual([]);
    const pins = readPins(path.join(root, 'site/vendor/r-wasm')).packages;
    for (const pin of pins) expect(versions[pin.package], pin.package).toBe(pin.version);
  });

  it('APP-RBQM-016: with the labs file left out seven metrics ran and the lab metric says it needs the labs file; with the seriousness column taken out of the adverse events file six ran and the two adverse event metrics name the column and the file; every metric that ran gave the rows it gives on the whole study (#234)', () => {
    const noLabs = expected.partial['no-labs'];
    expect(noLabs.ran.metrics).toEqual(RBQM_METRICS.filter((id) => id !== 'kri0005'));
    expect(noLabs.status.filter((line) => line.state !== 'ran')).toEqual([
      {
        id: 'kri0005',
        metric: 'Grade 3+ Lab Abnormality Rate',
        abbreviation: 'LB',
        state: 'no file',
        files: ['Raw_LB.csv'],
        columns: [],
        unmapped: [],
        message: 'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.'
      }
    ]);
    expect(noLabs.rows.Results).toBe(1186 - 148);
    expect(noLabs.rows.Metrics).toBe(7);
    expect(noLabs.groups.state).toBe('ran');

    const noColumn = expected.partial['no-column'];
    expect(noColumn.ran.metrics).toEqual(
      RBQM_METRICS.filter((id) => !['kri0001', 'kri0002'].includes(id))
    );
    expect(noColumn.status.filter((line) => line.state !== 'ran')).toEqual([
      {
        id: 'kri0001',
        metric: 'Adverse Event Rate',
        abbreviation: 'AE',
        state: 'no column',
        files: [],
        columns: [{ file: 'Raw_AE.csv', columns: ['aeser'] }],
        unmapped: [],
        message: 'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
      },
      {
        id: 'kri0002',
        metric: 'Serious Adverse Event Rate',
        abbreviation: 'SAE',
        state: 'no column',
        files: [],
        columns: [{ file: 'Raw_AE.csv', columns: ['aeser'] }],
        unmapped: [],
        message:
          'Serious Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
      }
    ]);
    expect(noColumn.rows.Results).toBe(1186 - 2 * 148);
    for (const item of Object.values(expected.partial)) expect(item.warnings).toEqual([]);
    // scripts/rbqm-reference.mjs stops unless every row of these runs is the
    // whole study's row, so the fixture keeps the whole study's rows once.
    expect(read('scripts/rbqm-reference.mjs').toString('utf8')).toContain(
      "is not the whole study's row."
    );
  });

  it('APP-RBQM-016: with the subjects and adverse events files alone the two adverse event metrics ran, each other metric names the file it needs, the Groups table says which files it needs, and the run says the study’s ID was read from the loaded files (#234)', () => {
    const two = expected.partial['two-files'];
    expect(two.ran.metrics).toEqual(['kri0001', 'kri0002']);
    expect(two.ran.mappings).toEqual(['Mapped_AE', 'Mapped_SUBJ', 'Mapped_COUNTRY']);
    expect(two.status.map((line) => [line.id, line.state, line.files])).toEqual([
      ['kri0001', 'ran', []],
      ['kri0002', 'ran', []],
      ['kri0003', 'no file', ['Raw_PD.csv']],
      ['kri0004', 'no file', ['Raw_PD.csv']],
      ['kri0005', 'no file', ['Raw_LB.csv']],
      ['kri0006', 'no file', ['Raw_STUDCOMP.csv']],
      ['kri0007', 'no file', ['Raw_SDRGCOMP.csv']],
      ['kri0012', 'no file', ['Raw_ENROLL.csv']]
    ]);
    expect(two.groups).toEqual({
      state: 'no file',
      files: ['Raw_STUDY.csv', 'Raw_SITE.csv'],
      columns: [],
      unmapped: [],
      message: 'The Groups table needs Raw_STUDY.csv and Raw_SITE.csv, which are not loaded.'
    });
    expect(two.rows).toMatchObject({ Results: 296, Groups: 0, Metrics: 2 });
    expect(Object.keys(two.thresholds)).toEqual(['Analysis_kri0001', 'Analysis_kri0002']);
    expect(two.notes).toEqual([
      "No study table was made, so the study's ID, AA-AA-000-0000, is read from the study ID column of the loaded files."
    ]);
  });
});

describe('desktop R’s answer for the pilot study, the one the other charts use (#253)', () => {
  const pilot = JSON.parse(read(RBQM_PILOT.expected).toString('utf8'));
  const { answer } = pilot;
  const rows = (file) => parseFile(file, read(`site/data/${file}`).toString('utf8')).rows;
  const of = (id) => answer.Results.filter((row) => row.MetricID === `Analysis_${id}`);
  const total = (id, column) => of(id).reduce((sum, row) => sum + row[column], 0);

  it('APP-RBQM-044: desktop R’s answer for the pilot study is derived from the pipeline’s R, every workflow and the study’s two files as they are now, by checksum; R made the five raw tables from the two files and ran the adverse event, serious adverse event and study discontinuation metrics, a row for each of 17 sites, with nothing warned (#253)', () => {
    expect(pilot.derived_from, 'rerun scripts/rbqm-reference.mjs').toEqual(pilotDerivedFrom(read));
    expect(pilot.derived_from).toHaveLength(1 + 5 + 10 + 9 + 4 + 2);
    expect(pilot.snapshot_date).toBe(RBQM_TAB.snapshotDate);
    expect(answer.ran).toEqual({
      standard: ['Raw_AE', 'Raw_SITE', 'Raw_STUDCOMP', 'Raw_STUDY', 'Raw_SUBJ'],
      mappings: [
        'Mapped_AE',
        'Mapped_STUDCOMP',
        'Mapped_SUBJ',
        'Mapped_COUNTRY',
        'Mapped_SITE',
        'Mapped_STUDY'
      ],
      metrics: RBQM_PILOT.metrics
    });
    expect(answer.Results).toHaveLength(3 * 17);
    for (const id of RBQM_PILOT.metrics) {
      expect(new Set(of(id).map((row) => row.GroupID)).size, id).toBe(17);
    }
    expect(answer.Metrics.map((row) => row.ID)).toEqual(RBQM_PILOT.metrics);
    expect(answer.warnings).toEqual([]);
    expect(answer.notes).toEqual([]);
    // The versions are the ones the browser is given.
    const pins = readPins(path.join(root, 'site/vendor/r-wasm')).packages;
    for (const pin of pins) expect(answer.versions[pin.package], pin.package).toBe(pin.version);
  });

  it('APP-RBQM-044: what R counted is what the study’s files hold, counted here from the files by another route: 1,122 adverse events and 3 serious ones over the days on study of 254 participants, and 144 of the 254 who left the study early; each site’s participants in the Groups table are the file’s (#253)', () => {
    const subjects = rows('adsl.csv');
    // The app's charts drop the placeholder rows of a participant with no event, and so does R's query.
    const events = rows('adae.csv').filter((row) => row.AEDECOD.trim() !== '');
    const days = subjects.reduce((sum, row) => sum + Number(row.EOSDY), 0);
    expect(subjects).toHaveLength(254);
    expect(events).toHaveLength(1122);
    expect(total('kri0001', 'Numerator')).toBe(events.length);
    expect(total('kri0001', 'Denominator')).toBe(days);
    expect(total('kri0002', 'Numerator')).toBe(events.filter((row) => row.AESER === 'Y').length);
    expect(total('kri0002', 'Numerator')).toBe(3);
    expect(total('kri0002', 'Denominator')).toBe(days);
    const left = subjects.filter((row) => row.EOSSTT === 'DISCONTINUED');
    expect(left).toHaveLength(144);
    expect(total('kri0006', 'Numerator')).toBe(left.length);
    expect(total('kri0006', 'Denominator')).toBe(subjects.length);
    // Site by site: the events, the days and the participants.
    const siteOf = new Map(subjects.map((row) => [row.USUBJID, row.SITEID]));
    for (const row of of('kri0001')) {
      const here = subjects.filter((subject) => subject.SITEID === row.GroupID);
      expect(row.Numerator, row.GroupID).toBe(
        events.filter((event) => siteOf.get(event.USUBJID) === row.GroupID).length
      );
      expect(row.Denominator, row.GroupID).toBe(
        here.reduce((sum, subject) => sum + Number(subject.EOSDY), 0)
      );
      const count = answer.Groups.find(
        (group) =>
          group.GroupLevel === 'Site' &&
          group.GroupID === row.GroupID &&
          group.Param === 'ParticipantCount'
      );
      expect(count.Value, row.GroupID).toBe(String(here.length));
    }
    const study = (param) =>
      answer.Groups.find((group) => group.GroupLevel === 'Study' && group.Param === param).Value;
    expect(study('ParticipantCount')).toBe('254');
    expect(study('SiteCount')).toBe('17');
  });
});
