import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NO_FILES,
  doneSentence,
  downloadsPhrase,
  R_LIMITS,
  failureOf,
  hostsSaid,
  rbqmWords,
  isoDay,
  listed,
  metricInputs,
  metricList,
  needSentence,
  overviewInputs,
  sameFiles,
  stepSentence,
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
    expect(downloadsPhrase(RBQM_DOWNLOADS)).toBe(
      'R itself from webr.r-wasm.org (about 13 MB), its packages from repo.r-wasm.org (about 40 MB) and gsm’s packages from this page (about 2 MB)'
    );
    expect(needSentence(9, RBQM_DOWNLOADS)).toBe(
      'Start R to run gsm’s workflows on the 9 loaded raw files. It downloads about 55 MB, once: ' +
        'R itself from webr.r-wasm.org (about 13 MB), its packages from repo.r-wasm.org (about 40 MB) ' +
        'and gsm’s packages from this page (about 2 MB). The files stay in this browser, and R runs here.'
    );
    expect(needSentence(1, RBQM_DOWNLOADS)).toContain('on the 1 loaded raw file.');
    // With nothing loaded there is nothing to run, and it says where a study is.
    expect(NO_FILES).toBe(
      'Nothing the metrics can run on is loaded. Load a study on the Data tab: the metrics run on its subject-level and adverse events files. Or drop gsm raw files here.'
    );
    expect(listed([])).toBe('');
    expect(listed(['a'])).toBe('a');
    expect(listed(['a', 'b'])).toBe('a and b');
    expect(listed(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('APP-RBQM-019: from the press to the first result the tab says what R is doing at every step, with where each download comes from and how long it has been (#235)', () => {
    const context = { seconds: 12, files: 9, downloads: RBQM_DOWNLOADS };
    expect(stepSentence('runtime', context)).toBe(
      'Starting R: downloading R itself, about 13 MB from webr.r-wasm.org. 12 seconds so far.'
    );
    expect(stepSentence('packages', context)).toBe(
      'Starting R: installing its packages, about 40 MB from repo.r-wasm.org and about 2 MB from this page. 12 seconds so far.'
    );
    expect(stepSentence('files', context)).toBe(
      'Starting R: fetching gsm’s workflow files from this page. 12 seconds so far.'
    );
    expect(stepSentence('source', context)).toBe(
      'Starting R: reading the pipeline’s R. 12 seconds so far.'
    );
    expect(stepSentence('attach', context)).toBe(
      'R has started. Loading gsm’s packages in R: this is the longest step, and the database they query with is most of it. 12 seconds so far.'
    );
    // One step is called the long one, and it is the one measured to be (#277).
    const steps = ['runtime', 'packages', 'files', 'source', 'attach', 'run'];
    expect(steps.filter((step) => /longest/.test(stepSentence(step, context)))).toEqual(['attach']);
    expect(stepSentence('run', { ...context, seconds: 1 })).toBe(
      'Running gsm’s workflows on the 9 loaded files: the mappings, then each metric, then the reporting tables. 1 second so far.'
    );
    // A step it was not told of still says R is starting, and for how long.
    expect(stepSentence('something else', context)).toBe('Starting R. 12 seconds so far.');
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

  it('APP-RBQM-020: once R has answered the tab says how many metrics ran, on how many files, how long R took and the versions R reports; the snapshot’s date is the reader’s own day (#235)', () => {
    expect(
      doneSentence(whole, { files: 9, seconds: 4.6, sinceStart: 68, snapshotDate: '2026-10-07' })
    ).toBe(
      `R ran 8 of 8 metrics on the 9 loaded files in 4.6 seconds, 68 seconds after Start R was pressed. ` +
        `The snapshot is dated 2026-10-07. R ${whole.versions.R}, gsm.core ${whole.versions['gsm.core']}, ` +
        `gsm.mapping ${whole.versions['gsm.mapping']}, gsm.reporting ${whole.versions['gsm.reporting']} and workr ${whole.versions.workr}.`
    );
    // A later run was not started by the press: it says only how long it took.
    expect(
      doneSentence(answerFor('two-files'), {
        files: 2,
        seconds: 1,
        sinceStart: null,
        snapshotDate: '2026-10-07'
      })
    ).toMatch(/^R ran 2 of 8 metrics on the 2 loaded files in 1 second\. The snapshot is dated/);
    expect(isoDay(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(isoDay(new Date(2027, 0, 3, 0, 0))).toBe('2027-01-03');
  });

  it('APP-RBQM-048: beside the versions R reports the tab names what is copied in and not installed in R, which R cannot report: whose the metric workflows are and whose the charts are, each with its version (#255)', () => {
    const run = { files: 9, seconds: 4.6, sinceStart: null, snapshotDate: '2026-10-07' };
    const copies = {
      workflows: { name: 'gsm.kri', version: '1.7.0' },
      charts: { name: 'gsm.viz', version: '2.4.1' }
    };
    const plain = doneSentence(whole, run);
    // R's own versions name no gsm.kri: the package is not installed in the browser.
    expect(Object.keys(whole.versions)).not.toContain('gsm.kri');
    expect(plain).not.toMatch(/gsm\.kri|gsm\.viz/);
    expect(doneSentence(whole, { ...run, copies })).toBe(
      `${plain} The metric workflows are gsm.kri 1.7.0’s and the charts gsm.viz 2.4.1’s.`
    );
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
