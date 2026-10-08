import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesForR, placeRaw, rawStudy, supportOf } from '../../../src/app/rbqm-files.js';
import { parseFile } from '../../../src/app/parse.js';
import {
  RBQM_NEEDS,
  RBQM_TAB,
  needsDerivedFrom,
  scenarioFiles
} from '../../../scripts/rbqm-lib.mjs';

// A reader's own raw files on the RBQM tab (#236, obot.roadmap#374): each file
// placed in a gsm raw domain by its name or its columns, and what the placed
// files support said before R is started. What a domain's file holds and what
// a metric needs is desktop R's reading of gsm's workflow specs
// (site/rbqm/needs.json); what R then said of the same files is the fixture
// the browser tests hold real R to.

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url));
const { derived_from: derivedFrom, needs } = JSON.parse(read(RBQM_NEEDS.file).toString('utf8'));
const expected = JSON.parse(read(RBQM_TAB.expected).toString('utf8'));
// A scenario's files as the page holds them: name, column names, text.
const loaded = (scenario) =>
  Object.entries(scenarioFiles(scenario, read)).map(([name, text]) => ({
    name,
    text,
    columns: parseFile(name, text.split('\n').slice(0, 3).join('\n')).columns
  }));
const scenario = (id) => RBQM_TAB.scenarios.find((entry) => entry.id === id);
const file = (name, columns) => ({ name, columns, text: '' });
const columnsOf = (table) => needs.raw.find((entry) => entry.table === table).columns;

describe('what each workflow needs, as R reads it from the specs', () => {
  it('APP-RBQM-032: the needs the tab is built with are desktop R’s reading of the workflows as they are now: the pipeline’s R and every copied workflow, by checksum (#236)', () => {
    expect(derivedFrom, 'rerun scripts/rbqm-reference.mjs').toEqual(needsDerivedFrom(read));
    expect(needs.raw.map((entry) => entry.file)).toEqual(
      'AE ENROLL LB PD SDRGCOMP STUDCOMP SUBJ SITE STUDY'.split(' ').map((d) => `Raw_${d}.csv`)
    );
    expect(needs.metrics.map((metric) => metric.id)).toEqual(RBQM_TAB.metrics);
    expect(needs.mappings).toHaveLength(10);
    // A metric's needs are tables the mapping workflows make, each with columns named.
    expect(needs.metrics[0]).toEqual({
      id: 'kri0001',
      metric: 'Adverse Event Rate',
      abbreviation: 'AE',
      needs: [
        { table: 'Mapped_AE', columns: ['subjid'] },
        { table: 'Mapped_SUBJ', columns: ['subjid', 'invid', 'timeonstudy'] }
      ]
    });
    expect(needs.groups.needs.map((need) => need.table)).toEqual([
      'Mapped_STUDY',
      'Mapped_SITE',
      'Mapped_COUNTRY'
    ]);
  });
});

describe('placing a raw file in a gsm raw domain', () => {
  it('APP-RBQM-033: a file is placed by its name, with or without `Raw_` and in any case, whatever its columns; else by its columns, when every column of exactly one raw domain is there (#236)', () => {
    expect(placeRaw(file('Raw_AE.csv', []), needs)).toMatchObject({ table: 'Raw_AE', by: 'name' });
    expect(placeRaw(file('raw_ae.CSV', []), needs)).toMatchObject({ table: 'Raw_AE', by: 'name' });
    expect(placeRaw(file('subj.csv', ['x']), needs)).toMatchObject({
      table: 'Raw_SUBJ',
      by: 'name'
    });
    expect(placeRaw(file('C:\\study\\Raw_PD.csv', []), needs).table).toBe('Raw_PD');
    // Named for nothing gsm knows, but holding every column of the labs domain and one more.
    expect(
      placeRaw(file('central_lab.csv', [...columnsOf('Raw_LB'), 'visit']), needs)
    ).toMatchObject({ table: 'Raw_LB', by: 'columns' });
    // Every demo study file is placed by its name, and by its columns alone too.
    for (const entry of loaded(scenario('whole'))) {
      expect(placeRaw(entry, needs)).toMatchObject({
        table: entry.name.replace('.csv', ''),
        by: 'name'
      });
      const renamed = { ...entry, name: 'export.csv' };
      expect(placeRaw(renamed, needs), entry.name).toMatchObject({
        table: entry.name.replace('.csv', ''),
        by: 'columns'
      });
    }
  });

  it('APP-RBQM-033: a file whose name and columns match no raw domain is named as not recognised; one whose columns match more than one is named with the domains it could be; a file of a domain already loaded replaces the earlier one, and the tab says so (#236)', () => {
    const notes = file('site_notes.csv', ['SITE', 'NOTE']);
    const both = file('export.csv', [...columnsOf('Raw_LB'), ...columnsOf('Raw_PD')]);
    const first = file('Raw_AE.csv', columnsOf('Raw_AE'));
    const second = file('ae.csv', columnsOf('Raw_AE'));
    const study = rawStudy([notes, both, first, second], needs);
    expect(study.files.map((entry) => entry.sentence)).toEqual([
      'site_notes.csv is not recognised: its name and its columns match no gsm raw domain.',
      'export.csv is not recognised: its columns match more than one gsm raw domain (Raw_LB and Raw_PD), and its name says which of none. Name it for the one it is.',
      'Raw_AE.csv is Raw_AE, by its name; ae.csv, loaded after it, is used in its place.',
      'ae.csv is Raw_AE, by its name.'
    ]);
    expect(study.files.map((entry) => entry.used)).toEqual([false, false, false, true]);
    expect([...study.tables]).toEqual([['Raw_AE', second]]);
    // R is handed the one file of each domain, under gsm's name for it.
    expect(filesForR(new Map([['Raw_AE', { name: 'ae.csv', text: 'a,b\n1,2' }]]))).toEqual([
      { name: 'Raw_AE.csv', text: 'a,b\n1,2' }
    ]);
  });

  it('APP-RBQM-034: a file placed by its name that lacks a column its domain’s workflow names is listed with the column (#236)', () => {
    const [ae] = rawStudy(loaded(scenario('no-column')), needs).files.filter(
      (entry) => entry.table === 'Raw_AE'
    );
    expect(ae.lacks).toEqual(['aeser']);
    expect(ae.sentence).toBe('Raw_AE.csv is Raw_AE, by its name. It lacks the column aeser.');
    const bare = rawStudy([file('Raw_LB.csv', ['studyid', 'subjid'])], needs).files[0];
    expect(bare.sentence).toBe(
      'Raw_LB.csv is Raw_LB, by its name. It lacks the columns toxgrg_nsv and lb_dt.'
    );
  });
});

describe('what the loaded files support, said before R is started', () => {
  it('APP-RBQM-035: for the demo study whole, with its labs file left out, with a column taken out of its adverse events file, and for two of its files alone, what the tab says of each metric and of the Groups table before R starts is what desktop R said after running: the same metrics supported, and of each other the same sentence, word for word (#236)', () => {
    for (const entry of RBQM_TAB.scenarios) {
      const said =
        entry.id === 'whole'
          ? { status: expected.whole.status, groups: expected.whole.groups }
          : expected.partial[entry.id];
      const support = supportOf(rawStudy(loaded(entry), needs).tables, needs);
      expect(
        support.metrics.map(({ id, name, abbreviation }) => ({ id, name, abbreviation })),
        entry.id
      ).toEqual(
        said.status.map(({ id, metric, abbreviation }) => ({ id, name: metric, abbreviation }))
      );
      expect(
        support.metrics.map((metric) => [metric.id, metric.supported, metric.message]),
        entry.id
      ).toEqual(said.status.map((line) => [line.id, line.state === 'ran', line.message]));
      expect(support.groups, entry.id).toEqual({
        supported: said.groups.state === 'ran',
        message: said.groups.message
      });
    }
    // The task's own case: subjects and adverse events alone.
    const two = supportOf(rawStudy(loaded(scenario('two-files')), needs).tables, needs);
    expect(two.metrics.filter((metric) => metric.supported).map((metric) => metric.id)).toEqual([
      'kri0001',
      'kri0002'
    ]);
    expect(two.metrics.at(-1).message).toBe(
      'Screen Failure Rate needs Raw_ENROLL.csv, which is not loaded.'
    );
  });

  it('APP-RBQM-035: with nothing loaded every metric names the files it needs, and a file not placed supports nothing (#236)', () => {
    const none = supportOf(new Map(), needs);
    expect(none.metrics.every((metric) => !metric.supported)).toBe(true);
    expect(none.metrics[0].message).toBe(
      'Adverse Event Rate needs Raw_AE.csv and Raw_SUBJ.csv, which are not loaded.'
    );
    expect(none.groups.message).toBe(
      'The Groups table needs Raw_STUDY.csv, Raw_SUBJ.csv and Raw_SITE.csv, which are not loaded.'
    );
    const study = rawStudy([file('site_notes.csv', ['SITE', 'NOTE'])], needs);
    expect(supportOf(study.tables, needs).metrics.some((metric) => metric.supported)).toBe(false);
  });
});
