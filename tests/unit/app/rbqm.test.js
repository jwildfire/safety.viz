import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controlState } from '../../../src/app/libraries.js';
import {
  NO_FILES,
  RUN_STEPS,
  R_LIMITS,
  failureOf,
  hostsSaid,
  rbqmWords,
  isoDay,
  listed,
  metricInputs,
  metricList,
  outcomeSaid,
  overviewInputs,
  ranOnSaid,
  rawTag,
  runDetails,
  sameFiles,
  stepLines,
  stepNumber,
  stepSaid,
  supportWords,
  totalMegabytes,
  warningsSaid
} from '../../../src/app/rbqm.js';
import { RBQM_DOWNLOADS } from '../../../scripts/app-libraries.mjs';
import { RBQM_TAB } from '../../../scripts/rbqm-lib.mjs';

// The RBQM tab's words, and the rows of R's tables each of gsm.viz's charts is
// handed (#235, obot.roadmap#374). Desktop R's answer for the whole demo study
// and for three studies with something missing is the fixture the browser
// tests hold real R to (scripts/rbqm-reference.mjs); here it stands in for
// what R returned.

const expected = JSON.parse(
  readFileSync(new URL(`../../../${RBQM_TAB.expected}`, import.meta.url), 'utf8')
);
const { whole, partial } = expected;
// A study with something missing, as R answers one: the metrics that ran keep
// the whole study's rows, and the rest say why they did not run.
function answerFor(id) {
  const scenario = partial[id];
  const ran = new Set(scenario.ran.metrics.map((metric) => `Analysis_${metric}`));
  const kept = (rows) => rows.filter((row) => ran.has(row.MetricID));
  return {
    ...whole,
    Results: kept(whole.Results),
    Bounds: kept(whole.Bounds),
    Metrics: kept(whole.Metrics),
    Groups: scenario.rows.Groups ? whole.Groups : [],
    status: scenario.status,
    groups: scenario.groups,
    notes: scenario.notes,
    thresholds: scenario.thresholds
  };
}

describe('the RBQM tab: what it says', () => {
  it('APP-RBQM-018: before R is started the tab says what starting R downloads, how much and from where, and that the files stay in the browser (#235)', () => {
    expect(RBQM_DOWNLOADS).toEqual([
      { what: 'R itself', host: 'webr.r-wasm.org', megabytes: 13 },
      { what: 'its packages', host: 'repo.r-wasm.org', megabytes: 40 },
      { what: 'gsm’s packages', host: null, megabytes: 2 }
    ]);
    expect(totalMegabytes(RBQM_DOWNLOADS)).toBe(55);
    // The body's one line, what the control says beside Start R, and what it says on hover (#280).
    const words = rbqmWords(RBQM_DOWNLOADS);
    expect(words.viewNeed()).toBe('Site metrics need R. Start R, at the top right.');
    expect([words.need, words.cost]).toEqual(['Site metrics need R', '55 MB, once']);
    expect(words.needTitle).toBe(
      'Site metrics need R. Start R to run them: about 55 MB, downloaded once from webr.r-wasm.org, repo.r-wasm.org and this page. The study’s data stays in this browser.'
    );
    // With nothing loaded there is nothing to run, and it says where a study is.
    expect(NO_FILES).toBe(
      'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or load gsm raw files there.'
    );
    expect(listed([])).toBe('');
    expect(listed(['a'])).toBe('a');
    expect(listed(['a', 'b'])).toBe('a and b');
    expect(listed(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('APP-RBQM-024: R that did not start, packages that did not load and a run that stopped each say which it was in a few words, with one plain reason and what was said kept for a reader who asks (#235, #277)', () => {
    const context = { downloads: RBQM_DOWNLOADS };
    // R itself could not be downloaded: the words every tab says, and the address it comes from.
    expect(failureOf('start', 'Failed to fetch', { ...context, step: 'runtime' })).toEqual({
      say: 'R did not start',
      label: 'Try again',
      why: 'Why',
      details: {
        heading: 'R did not start',
        text: [
          'The browser could not download R from webr.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. No metric was run.'
        ],
        more: ['The browser said: Failed to fetch.'],
        moreTitle: 'What the browser said'
      }
    });
    // Its packages could not be: the same words, and the addresses they come from.
    expect(failureOf('start', 'x', { ...context, step: 'packages' }).details.text).toEqual([
      'The browser could not download R’s packages from repo.r-wasm.org and this page. Check the connection, or whether this network blocks that address, and try again. No metric was run.'
    ]);
    expect(failureOf('start', 'x', { ...context, step: 'files' }).details.text[0]).toMatch(
      /^The browser could not download gsm’s workflow files from this page\. /
    );
    // Nothing was being downloaded.
    expect(failureOf('start', 'x', { ...context, step: 'source' }).details.text).toEqual([
      'R could not be started on this page. Try again; if it fails again, reload the page. No metric was run.'
    ]);
    const attach = failureOf('attach', 'there is no package called ‘duckdb’.', context);
    expect(attach).toMatchObject({ say: 'R did not start', label: 'Try again' });
    expect(attach.details).toEqual({
      heading: 'R did not start',
      text: [
        'R started, but gsm’s packages did not load in it. Try again; if it fails again, reload the page. No metric was run.'
      ],
      more: ['R said: there is no package called ‘duckdb’.'],
      moreTitle: 'What R said'
    });
    expect(failureOf('run', 'Error in rbqm_run: something gave way', context)).toEqual({
      say: 'R stopped',
      label: 'Run again',
      why: 'Why',
      details: {
        heading: 'R stopped',
        text: [
          'R stopped while it was running gsm’s workflows, so there are no results. Run again; if it stops again, reload the page.'
        ],
        more: ['R said: Error in rbqm_run: something gave way.'],
        moreTitle: 'What R said'
      }
    });
    // No reason given: the first line is the same, and the disclosure says so.
    const silent = failureOf('start', null, { ...context, step: 'runtime' });
    expect(silent.say).toBe('R did not start');
    expect(silent.details.more).toEqual(['The browser gave no reason.']);
    // Nothing R or the browser said is in the words a reader is shown first.
    for (const failure of [attach, silent, failureOf('run', 'Error: boom', context)]) {
      expect(failure.say).not.toMatch(/Error|fetch|package/);
    }
  });

  it('APP-R-044: the RBQM tab says R is needed, starting, ready and did not start in the words the Biomarkers tab uses; only what needs R and what starting it downloads differ (#277)', () => {
    const words = rbqmWords(RBQM_DOWNLOADS);
    expect(hostsSaid(RBQM_DOWNLOADS)).toBe('webr.r-wasm.org, repo.r-wasm.org and this page');
    expect(words.need).toBe('Site metrics need R');
    expect(words.cost).toBe('55 MB, once');
    expect(words.needTitle).toBe(
      'Site metrics need R. Start R to run them: about 55 MB, downloaded once from webr.r-wasm.org, repo.r-wasm.org and this page. The study’s data stays in this browser.'
    );
    for (const [key, said] of Object.entries({
      start: 'Start R',
      starting: 'Starting R',
      ready: 'R ready',
      readyHeading: 'R is running in this browser',
      failed: 'R did not start',
      again: 'Try again',
      why: 'Why',
      stopped: 'R stopped answering'
    })) {
      expect(words[key], key).toBe(said);
    }
  });

  it('APP-R-045: an R that gave no answer is said to have stopped answering, with how long it was waited on and what it was doing, and Try again; the limits are minutes, far above what each step was measured to take (#261)', () => {
    expect(R_LIMITS).toEqual({ start: 600, attach: 180, run: 300 });
    const doing = {
      start: 'it was starting',
      attach: 'it was loading gsm’s packages',
      run: 'it was running the workflows'
    };
    for (const [when, what] of Object.entries(doing)) {
      const failure = failureOf(when, null, { downloads: RBQM_DOWNLOADS, silent: R_LIMITS[when] });
      expect(failure).toEqual({
        say: 'R stopped answering',
        label: 'Try again',
        why: 'Why',
        details: {
          heading: 'R stopped answering',
          text: [
            `R gave no answer for ${R_LIMITS[when] / 60} minutes while ${what}, so it was closed. Try again; if it stops again, reload the page. No metric was run.`
          ]
        }
      });
    }
    expect(
      failureOf('run', null, { downloads: RBQM_DOWNLOADS, silent: 90 }).details.text[0]
    ).toMatch(/^R gave no answer for 90 seconds while /);
  });

  it('APP-RBQM-020: once R has answered the tab says in one line how many metrics ran, on what and how long R took; the snapshot’s date is the reader’s own day (#235, #280)', () => {
    expect(outcomeSaid(whole, { files: 9, seconds: 4.6 })).toEqual({
      ran: 'R ran 8 of 8 metrics on the 9 loaded files in 4.6 seconds.',
      rest: 'To use other files, '
    });
    expect(outcomeSaid(answerFor('two-files'), { files: 2, seconds: 1 })).toEqual({
      ran: 'R ran 2 of 8 metrics on the 2 loaded files in 1 second.',
      rest: 'The other 6 need data it does not have: '
    });
    expect(isoDay(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(isoDay(new Date(2027, 0, 3, 0, 0))).toBe('2027-01-03');
  });
});

// The six steps, the line above the site table and Run details (#280,
// obot.roadmap#405): what the control, the body and the chip's panel say of a
// run. The tab draws them; these are the words.
describe('the RBQM tab: the steps of a run and what is said of it', () => {
  const copies = {
    workflows: { name: 'gsm.kri', version: '1.7.0' },
    charts: { name: 'gsm.viz', version: '2.4.1' }
  };

  it('APP-RBQM-061: from a press to the first result there are six steps, each with what the control says while it runs and what Run details says once it is done; the control numbers the step it is on, and only loading gsm’s packages is called the long one (#280)', () => {
    expect(RUN_STEPS.map(({ id, say, done }) => [id, say, done])).toEqual([
      ['runtime', 'Downloading R', 'Downloaded R'],
      ['packages', 'Installing R packages', 'Installed R packages'],
      ['files', 'Fetching gsm’s workflow files', 'Fetched gsm’s workflow files'],
      ['attach', 'Loading gsm’s packages', 'Loaded gsm’s packages'],
      ['read', 'Reading the study', 'Read the study'],
      ['run', 'Running the workflows', 'Ran the workflows']
    ]);
    expect(Object.isFrozen(RUN_STEPS)).toBe(true);
    // One step is called the long one, and it is the one measured to be (#277).
    expect(RUN_STEPS.filter((step) => step.long).map((step) => step.id)).toEqual(['attach']);
    // Every moment the connection and the tab name belongs to one step, and to no other.
    const moments = ['runtime', 'packages', 'files', 'source', 'attach', 'read', 'run'];
    expect(RUN_STEPS.flatMap((step) => step.from)).toEqual(moments);
    expect(moments.map(stepNumber)).toEqual([1, 2, 3, 3, 4, 5, 6]);
    // A moment it was not told of is the first step, not a step past the end.
    for (const unknown of ['something else', '', null, undefined]) {
      expect(stepNumber(unknown)).toBe(1);
      expect(stepSaid(unknown)).toBe('1 of 6 · Downloading R');
    }
    expect(moments.map(stepSaid)).toEqual([
      '1 of 6 · Downloading R',
      '2 of 6 · Installing R packages',
      '3 of 6 · Fetching gsm’s workflow files',
      '3 of 6 · Fetching gsm’s workflow files',
      '4 of 6 · Loading gsm’s packages',
      '5 of 6 · Reading the study',
      '6 of 6 · Running the workflows'
    ]);
    expect(stepLines()).toEqual([
      'Downloading R',
      'Installing R packages',
      'Fetching gsm’s workflow files',
      'Loading gsm’s packages, the long one',
      'Reading the study',
      'Running the workflows'
    ]);
    expect(stepLines().filter((line) => /long/.test(line))).toHaveLength(1);
  });

  it('APP-RBQM-062: the line above the site table says how many metrics ran, on what and in how long, and then how many need data the study does not have, or how to use other files; a loaded demo study is named by its name, and raw files or a reader’s own study by what they are (#280)', () => {
    expect(ranOnSaid(9)).toBe('the 9 loaded files');
    expect(ranOnSaid(1)).toBe('the 1 loaded file');
    expect(ranOnSaid(0, ['adsl.csv', 'adae.csv'])).toBe('the loaded study’s adsl.csv and adae.csv');
    expect(ranOnSaid(0, ['adsl.csv', 'adae.csv'], 'Pilot study')).toBe('the Pilot study');
    // A demo study whose name does not end in "study" is said as one (#309).
    expect(ranOnSaid(0, ['adsl.csv', 'adae.csv'], 'Renamed columns')).toBe(
      'the “Renamed columns” study'
    );
    expect(ranOnSaid(0, ['adlb.csv'], 'Liver cohort, labs only')).toBe(
      'the “Liver cohort, labs only” study'
    );
    expect(ranOnSaid(0, ['adsl.csv'], 'RBQM study')).toBe('the RBQM study');
    // With raw files beside the study the name alone would leave them out.
    expect(ranOnSaid(1, ['adsl.csv'], 'Pilot study')).toBe(
      'the 1 loaded file and the loaded study’s adsl.csv'
    );
    // A name is for a study whose own files R was handed.
    expect(ranOnSaid(9, [], 'RBQM study')).toBe('the 9 loaded files');
    expect(ranOnSaid(0, ['adsl.csv'], null)).toBe('the loaded study’s adsl.csv');

    expect(outcomeSaid(whole, { files: 9, seconds: 4.6 })).toEqual({
      ran: 'R ran 8 of 8 metrics on the 9 loaded files in 4.6 seconds.',
      rest: 'To use other files, '
    });
    expect(outcomeSaid(answerFor('no-labs'), { files: 8, seconds: 1 })).toEqual({
      ran: 'R ran 7 of 8 metrics on the 8 loaded files in 1 second.',
      rest: 'The other 1 needs data it does not have: '
    });
    expect(
      outcomeSaid(answerFor('two-files'), {
        files: 0,
        study: ['adsl.csv', 'adae.csv'],
        seconds: 3.1,
        name: 'Pilot study'
      })
    ).toEqual({
      ran: 'R ran 2 of 8 metrics on the Pilot study in 3.1 seconds.',
      rest: 'The other 6 need data it does not have: '
    });
    // It is one line: the versions, the date and how long since the press are in Run details.
    const line = outcomeSaid(whole, {
      files: 9,
      seconds: 4.6,
      sinceStart: 68,
      snapshotDate: '2026-10-07',
      copies
    });
    expect(`${line.ran} ${line.rest}`).not.toMatch(/gsm\.|2026|68|Start R/);
  });

  it('APP-RBQM-063: Run details says in one sentence what ran and what was downloaded, then the steps with what each cost, what R was handed, what did not run and why, the versions with what is copied in, and R’s warnings (#280)', () => {
    const run = {
      files: 9,
      study: [],
      name: null,
      webr: '0.6.0',
      seconds: 4.6,
      sinceStart: 68,
      snapshotDate: '2026-10-07',
      handed: ['The 9 loaded gsm raw files, each as it is.'],
      notes: [],
      copies
    };
    const { versions } = whole;
    expect(runDetails(whole, run, RBQM_DOWNLOADS)).toEqual({
      text: [
        'It ran 8 of 8 metrics on the 9 loaded files. About 55 MB was downloaded, once; the study’s data stays here.'
      ],
      columns: [
        [
          {
            title: 'Steps',
            // Reading the study is part of the run's own time, and has no line of its own.
            steps: [
              { say: 'Downloaded R', note: '13 MB', state: 'done' },
              { say: 'Installed R packages', note: '42 MB', state: 'done' },
              { say: 'Fetched gsm’s workflow files', note: null, state: 'done' },
              { say: 'Loaded gsm’s packages', note: null, state: 'done' },
              { say: 'Ran the workflows', note: '4.6 s', state: 'done' }
            ],
            text: ['68 seconds from the press to the charts.']
          }
        ],
        [
          { title: 'What R was handed', items: ['The 9 loaded gsm raw files, each as it is.'] },
          { title: 'Did not run', items: ['Nothing: all 8 ran.'] }
        ],
        [
          {
            title: 'Versions',
            rows: [
              ['R', `${versions.R}, on webR 0.6.0`],
              [
                'gsm',
                `gsm.core ${versions['gsm.core']}, gsm.mapping ${versions['gsm.mapping']}, ` +
                  `gsm.reporting ${versions['gsm.reporting']}, workr ${versions.workr}`
              ],
              ['Metric workflows', 'gsm.kri 1.7.0'],
              ['Charts', 'gsm.viz 2.4.1'],
              ['Snapshot', '2026-10-07']
            ]
          },
          { title: 'Warnings from R', items: ['None.'] }
        ]
      ]
    });
    // The megabytes are the downloads': R itself, and its packages with gsm's.
    expect(RBQM_DOWNLOADS.map((one) => one.megabytes)).toEqual([13, 40, 2]);
    // A demo study is named by its name, as in the line above the table.
    expect(
      runDetails(
        answerFor('two-files'),
        { ...run, files: 0, study: ['adsl.csv', 'adae.csv'], name: 'Pilot study' },
        RBQM_DOWNLOADS
      ).text
    ).toEqual([
      'It ran 2 of 8 metrics on the Pilot study. About 55 MB was downloaded, once; the study’s data stays here.'
    ]);
    expect(runDetails(whole, { ...run, sinceStart: 1 }, RBQM_DOWNLOADS).columns[0][0].text).toEqual(
      ['1 second from the press to the charts.']
    );
  });

  it('APP-RBQM-063: Run details of a later run, which started nothing, lists only the last step and says R was already running; what did not run is listed in R’s own sentences, and R’s notes, a missing Groups table, the notes of the load and R’s warnings are each said (#280)', () => {
    const answer = {
      ...answerFor('two-files'),
      warnings: ['NA’s in GroupID, cases are removed in output']
    };
    const later = runDetails(
      answer,
      {
        files: 2,
        study: [],
        seconds: 1,
        sinceStart: null,
        snapshotDate: '2026-10-08',
        handed: ['The 2 loaded gsm raw files, each as it is.'],
        notes: ['study.json is not a CSV file.']
      },
      RBQM_DOWNLOADS
    );
    expect(later.text).toEqual([
      'It ran 2 of 8 metrics on the 2 loaded files. About 55 MB was downloaded, once; the study’s data stays here.'
    ]);
    const [[steps], middle, [versions, warnings]] = later.columns;
    expect(steps).toEqual({
      title: 'Steps',
      steps: [{ say: 'Ran the workflows', note: '1 s', state: 'done' }],
      text: ['R was already running, so only the last step ran again.']
    });
    const said = partial['two-files'];
    expect(middle.map((section) => section.title)).toEqual([
      'What R was handed',
      'Did not run',
      'Notes'
    ]);
    expect(middle[1].items).toEqual(
      said.status.filter((line) => line.state !== 'ran').map((line) => line.message)
    );
    expect(middle[1].items).toHaveLength(6);
    expect(said.notes).toHaveLength(1);
    expect(said.groups.state).not.toBe('ran');
    expect(middle[2].items).toEqual([
      ...said.notes,
      said.groups.message,
      'study.json is not a CSV file.'
    ]);
    expect(warnings).toEqual({
      title: 'Warnings from R',
      items: ['R warned: NA’s in GroupID, cases are removed in output.']
    });
    // What is not known is left for the control to pass over: no runtime's version, no copies.
    expect(versions.rows).toEqual([
      ['R', whole.versions.R],
      ['gsm', expect.stringMatching(/^gsm\.core /)],
      ['Metric workflows', null],
      ['Charts', null],
      ['Snapshot', '2026-10-08']
    ]);
    const drawn = controlState({
      state: () => ({
        phase: 'ready',
        details: { heading: 'R is running in this browser', ...later }
      })
    }).details;
    expect(drawn.columns[2][0].rows.map(([term]) => term)).toEqual(['R', 'gsm', 'Snapshot']);
    expect(drawn.columns[0][0].steps).toEqual(steps.steps);
    // A press that started R and found the charts at once still counts as the one that started it.
    expect(
      runDetails(whole, { files: 9, seconds: 0, sinceStart: 0 }, RBQM_DOWNLOADS).columns[0][0]
    ).toMatchObject({
      steps: expect.objectContaining({ length: 5 }),
      text: ['0 seconds from the press to the charts.']
    });
    // An answer with nothing in it still gives the panel its three columns, and does not throw.
    const empty = runDetails({}, { files: 0, seconds: 0, sinceStart: null }, RBQM_DOWNLOADS);
    expect(empty.columns.map((column) => column.map((section) => section.title))).toEqual([
      ['Steps'],
      ['What R was handed', 'Did not run'],
      ['Versions', 'Warnings from R']
    ]);
  });
});

describe('the RBQM tab: what gsm.viz is handed', () => {
  it('APP-RBQM-020: the metrics are listed as R reports them, each with the ID its rows carry in R’s tables, read from R’s Metrics table and not put together by the app (#234, #235)', () => {
    const metrics = metricList(whole);
    expect(metrics.map((metric) => metric.id)).toEqual(RBQM_TAB.metrics);
    expect(metrics.map((metric) => metric.abbreviation)).toEqual([
      'AE',
      'SAE',
      'PD',
      'IPD',
      'LB',
      'SDSC',
      'TDSC',
      'SF'
    ]);
    expect(metrics.every((metric) => metric.ran && metric.message === '')).toBe(true);
    for (const metric of metrics) {
      const row = whole.Metrics.find((candidate) => candidate.ID === metric.id);
      expect(metric.metricId).toBe(row.MetricID);
      expect(metric.name).toBe(row.Metric);
    }
    expect(metrics[0]).toMatchObject({ metricId: 'Analysis_kri0001', name: 'Adverse Event Rate' });
    // The module assembles no ID of its own.
    const source = readFileSync(new URL('../../../src/app/rbqm.js', import.meta.url), 'utf8');
    expect(source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')).not.toMatch(/Analysis_|kri\d/);
  });

  it('APP-RBQM-022: a metric that did not run is listed with R’s sentence saying why and no ID, since R’s tables hold no row of it (#235)', () => {
    const metrics = metricList(answerFor('no-labs'));
    expect(metrics.filter((metric) => !metric.ran)).toEqual([
      {
        id: 'kri0005',
        metricId: null,
        name: 'Grade 3+ Lab Abnormality Rate',
        abbreviation: 'LB',
        ran: false,
        message: 'Grade 3+ Lab Abnormality Rate needs Raw_LB.csv, which is not loaded.'
      }
    ]);
    expect(metrics.filter((metric) => metric.ran)).toHaveLength(7);
    const column = metricList(answerFor('no-column')).filter((metric) => !metric.ran);
    expect(column.map((metric) => metric.message)).toEqual([
      'Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.',
      'Serious Adverse Event Rate needs the column aeser, which Raw_AE.csv does not have.'
    ]);
    expect(metricInputs(answerFor('no-labs'), 'Analysis_kri0005')).toBeNull();
    expect(metricList(null)).toEqual([]);
  });

  it('APP-RBQM-020: the overview is handed every Results row, the Groups table and the Metrics table as R returned them, and each chart copies of the rows, so drawing changes nothing R returned (#235)', () => {
    const before = JSON.stringify(whole);
    const overview = overviewInputs(whole);
    expect(overview.results).toEqual(whole.Results);
    expect(overview.groups).toEqual(whole.Groups);
    expect(overview.metrics).toEqual(whole.Metrics);
    expect(overview.config).toEqual({ GroupLevel: 'Site', groupLabelKey: 'InvestigatorLastName' });
    expect(overview.standIn).toBe(false);
    // gsm.viz writes to the rows it is given: they are copies.
    overview.results[0].Score = 'changed';
    overview.groups[0].Value = 'changed';
    overview.metrics[0].Metric = 'changed';
    expect(JSON.stringify(whole)).toBe(before);
  });

  it('APP-RBQM-020: a metric’s scatter plot and bar chart are handed its own Results rows, its row of the Metrics table, R’s Bounds rows for it and its thresholds as the numbers R parsed (#235)', () => {
    const before = JSON.stringify(whole);
    for (const { metricId } of metricList(whole)) {
      const inputs = metricInputs(whole, metricId);
      expect(inputs.results).toEqual(whole.Results.filter((row) => row.MetricID === metricId));
      expect(inputs.results.length).toBeGreaterThan(100);
      expect(inputs.metric).toEqual(whole.Metrics.find((row) => row.MetricID === metricId));
      // The bounds are R's, always: handed none, gsm.viz would work its own out in JavaScript.
      expect(inputs.bounds).toEqual(whole.Bounds.filter((row) => row.MetricID === metricId));
      expect(inputs.bounds.length).toBeGreaterThan(100);
      expect(inputs.thresholds).toEqual(whole.thresholds[metricId]);
      expect(inputs.groups).toEqual(whole.Groups);
      inputs.results[0].Score = 'changed';
      inputs.bounds[0].Numerator = 'changed';
      inputs.thresholds.push(99);
      inputs.metric.Threshold = 'changed';
    }
    expect(metricInputs(whole, 'Analysis_kri0001').thresholds).toEqual([-2, -1, 2, 3]);
    expect(metricInputs(whole, 'Analysis_kri0005').thresholds).toEqual([2, 3]);
    expect(JSON.stringify(whole)).toBe(before);
    expect(metricInputs(whole, 'Analysis_kri9999')).toBeNull();
  });

  it('APP-RBQM-022: with no Groups table the overview is handed one row per site R scored, naming the site and nothing else, and the charts no group table; the tab is told so (#235)', () => {
    const answer = answerFor('two-files');
    expect(answer.Groups).toEqual([]);
    const overview = overviewInputs(answer);
    expect(overview.standIn).toBe(true);
    const sites = [...new Set(answer.Results.map((row) => row.GroupID))];
    expect(sites.length).toBe(148);
    expect(overview.groups).toEqual(
      sites.map((id) => ({ GroupID: id, GroupLevel: 'Site', Param: 'GroupID', Value: id }))
    );
    // No name to label a site with, so none is asked for.
    expect(overview.config).toEqual({ GroupLevel: 'Site', groupLabelKey: null });
    expect(metricInputs(answer, 'Analysis_kri0001').groups).toBeNull();
    expect(metricInputs(answer, 'Analysis_kri0001').results).toHaveLength(148);
  });

  it('APP-RBQM-028: a study is the one that was run only when it is the same loaded files, each the very one, in the same order (#235)', () => {
    const [a, b] = [{ name: 'Raw_AE.csv' }, { name: 'Raw_SUBJ.csv' }];
    expect(sameFiles([a, b], [a, b])).toBe(true);
    expect(sameFiles([a, b], [b, a])).toBe(false);
    expect(sameFiles([a], [a, b])).toBe(false);
    // A file loaded again is another file, whatever its name.
    expect(sameFiles([a], [{ name: 'Raw_AE.csv' }])).toBe(false);
    expect(sameFiles([], [])).toBe(true);
  });
});

describe('the RBQM tab: what R warned of (#258)', () => {
  it('APP-RBQM-049: each warning R raised along the way is a sentence the tab shows, in R’s words and R’s order; a run with none says nothing, and so does an answer with no warnings in it', () => {
    expect(
      warningsSaid({
        warnings: [
          'NA’s in GroupID, cases are removed in output',
          '1 values of [ GroupID ] with a [ Denominator ] value of 0 removed.',
          '  two\n lines  '
        ]
      })
    ).toEqual([
      'R warned: NA’s in GroupID, cases are removed in output.',
      'R warned: 1 values of [ GroupID ] with a [ Denominator ] value of 0 removed.',
      'R warned: two lines.'
    ]);
    // One warning leaves R as a single value, not a list of one.
    expect(warningsSaid({ warnings: 'only this' })).toEqual(['R warned: only this.']);
    expect(warningsSaid({ warnings: [] })).toEqual([]);
    expect(warningsSaid({ warnings: ['', '  '] })).toEqual([]);
    expect(warningsSaid({})).toEqual([]);
    expect(warningsSaid(null)).toEqual([]);
    expect(warningsSaid(whole)).toEqual([]);
  });
});

describe('the Data tab’s card, in the tab’s words (#281)', () => {
  it('APP-RBQM-076: the card counts the metrics the loaded data supports in a sentence, and the workflow’s third step counts them in a few words; each state a metric’s mark shows has its words; a kept raw file’s tag names its raw domain and how it was told', () => {
    const words = supportWords(4, 8);
    expect(words.say).toBe('This data supports 4 of 8 metrics.');
    expect(words.lead).toBe('4 of 8 metrics supported');
    expect(words.also).toBe('4 of 8 RBQM metrics');
    expect(words.why(4)).toBe('Why 4 cannot run');
    expect(words.states).toEqual({
      ran: 'ran',
      running: 'running',
      todo: 'not started',
      cannot: 'cannot run: missing data'
    });
    expect(supportWords(0, 8).say).toBe('This data supports 0 of 8 metrics.');
    expect(supportWords(1, 1)).toMatchObject({
      say: 'This data supports 1 of 1 metric.',
      lead: '1 of 1 metric supported',
      also: '1 of 1 RBQM metric'
    });
    expect(rawTag({ table: 'Raw_AE', by: 'name' })).toBe('gsm raw file: Raw_AE, by its name');
    expect(rawTag({ table: 'Raw_LB', by: 'columns' })).toBe('gsm raw file: Raw_LB, by its columns');
    expect(rawTag({ table: null, by: null })).toBe('gsm raw file: not recognised');
  });
});
