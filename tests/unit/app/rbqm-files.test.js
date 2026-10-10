import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filesForR,
  isRawFile,
  placeRaw,
  rawStudy,
  standardCsv,
  standardSentence,
  standardStudy,
  supportOf
} from '../../../src/app/rbqm-files.js';
import { parseFile } from '../../../src/app/parse.js';
import { buildMapping, setColumn } from '../../../src/app/mapping.js';
import { DEMO_STUDIES } from '../../../src/app/studies.js';
import manifest from '../../../src/data/portfolio.json';
import {
  RBQM_NEEDS,
  RBQM_PILOT,
  RBQM_STANDARD,
  RBQM_TAB,
  needsDerivedFrom,
  pipelineFiles,
  scenarioFiles,
  standardFiles
} from '../../../scripts/rbqm-lib.mjs';

// A reader's own raw files (#236, obot.roadmap#374), which come in on the Data
// tab (#282): which files are raw files at all, each raw file placed in a gsm
// raw domain by its name or its columns, and what the placed files support,
// said before R is started. What a domain's file holds and what a metric
// needs is desktop R's reading of gsm's workflow specs (site/rbqm/needs.json);
// what R then said of the same files is the fixture the browser tests hold
// real R to.

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
    expect(placeRaw(file('study\\Raw_PD.csv', []), needs).table).toBe('Raw_PD');
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

  it('APP-RBQM-074: among the files that come in on the Data tab, one is a gsm raw file only when its name starts with `Raw_`, in any case, or its columns are those of exactly one raw domain; a file named for a domain without `Raw_` is a study file, as every file of the three demo studies of standard domains is (#282)', () => {
    expect(isRawFile(file('Raw_AE.csv', []), needs)).toBe(true);
    expect(isRawFile(file('raw_ae.CSV', ['x']), needs)).toBe(true);
    expect(isRawFile(file('study\\Raw_PD.csv', []), needs)).toBe(true);
    expect(isRawFile(file('study/RAW_anything.json', []), needs)).toBe(true);
    // Named for nothing gsm knows, but holding every column of the labs domain and one more.
    expect(isRawFile(file('central_lab.csv', [...columnsOf('Raw_LB'), 'visit']), needs)).toBe(true);
    // A name gsm would place is not enough here: `ae.csv` is a study's adverse events file.
    expect(placeRaw(file('ae.csv', ['USUBJID', 'AETERM']), needs).table).toBe('Raw_AE');
    expect(isRawFile(file('ae.csv', ['USUBJID', 'AETERM']), needs)).toBe(false);
    expect(isRawFile(file('subj.csv', ['x']), needs)).toBe(false);
    expect(isRawFile(file('draw_ae.csv', []), needs)).toBe(false);
    // Columns of two raw domains say which of neither; columns of none say nothing.
    const both = [...columnsOf('Raw_LB'), ...columnsOf('Raw_PD')];
    expect(isRawFile(file('export.csv', both), needs)).toBe(false);
    expect(isRawFile(file('site_notes.csv', ['SITE', 'NOTE']), needs)).toBe(false);
    expect(isRawFile(file('empty.csv', []), needs)).toBe(false);
    expect(isRawFile(file('Raw_AE.csv', []), undefined)).toBe(true);
    expect(isRawFile(file('export.csv', columnsOf('Raw_AE')), undefined)).toBe(false);
    // Every demo study file: the RBQM study's nine are raw files, by name and by columns, and no other study's is.
    for (const study of DEMO_STUDIES) {
      for (const name of study.files) {
        const text = read(`${study.source}/${name}`).toString('utf8');
        const head = name.endsWith('.csv') ? text.split('\n').slice(0, 3).join('\n') : text;
        const { columns } = parseFile(name, head);
        expect(columns.length, name).toBeGreaterThan(0);
        expect(isRawFile({ name, columns }, needs), `${study.id}: ${name}`).toBe(
          Boolean(study.raw)
        );
        expect(isRawFile({ name: 'export.csv', columns }, needs), `${study.id}: ${name}`).toBe(
          Boolean(study.raw)
        );
      }
    }
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
  it('APP-RBQM-035: for the demo study whole, with its labs file left out, with a column taken out of its adverse events file, for two of its files alone and for three, what the tab says of each metric and of the Groups table before R starts is what desktop R said after running: the same metrics supported, and of each other the same sentence, word for word (#236)', () => {
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

// ---- The study the other charts use (#253, obot.roadmap#398) ----

const pilot = JSON.parse(read(RBQM_PILOT.expected).toString('utf8'));
// A study's files as the page holds them once loaded: parsed, each with the
// mapping the page fills in for it.
function study(entries, unmap = {}) {
  const files = {};
  const mappings = {};
  for (const { domain, file: source } of entries) {
    files[domain] = parseFile(source.split('/').pop(), read(source).toString('utf8'));
    mappings[domain] = buildMapping(domain, files[domain], manifest);
    for (const column of unmap[domain] || []) {
      mappings[domain] = setColumn(mappings[domain], column, null, files[domain]);
    }
  }
  return { files, mappings };
}
const NO_RAW = { files: [], tables: new Map() };
const spoken = (support) => support.metrics.map((m) => [m.id, m.supported, m.message]);
const said = (status) => status.map((line) => [line.id, line.state === 'ran', line.message]);

describe('the loaded study’s standard domains, as gsm’s raw tables', () => {
  it('APP-RBQM-041: five workflows of the repository’s own make gsm’s raw tables from the standard subject-level and adverse events domains; R reads from their specs which standard columns each needs, and each gives every column gsm’s mapping workflow names for its raw table; they are served beside the app with the pipeline’s R (#253)', () => {
    expect(needs.standard.map((workflow) => [workflow.output, workflow.needs])).toEqual([
      ['Raw_AE', [{ table: 'Standard_ae', columns: ['USUBJID', 'AEDECOD', 'AESER'] }]],
      ['Raw_SITE', [{ table: 'Standard_subject', columns: ['SITEID'] }]],
      ['Raw_STUDCOMP', [{ table: 'Standard_subject', columns: ['USUBJID', 'SITEID', 'EOSSTT'] }]],
      ['Raw_STUDY', [{ table: 'Standard_subject', columns: ['USUBJID'] }]],
      ['Raw_SUBJ', [{ table: 'Standard_subject', columns: ['USUBJID', 'SITEID', 'EOSDY'] }]]
    ]);
    // What R learned each workflow gives, by running it: no less than gsm's mapping reads.
    for (const workflow of needs.standard) {
      expect(workflow.provides, workflow.output).toEqual(
        expect.arrayContaining(columnsOf(workflow.output))
      );
    }
    // Every standard column asked for is one the app's mapping table has for that domain.
    for (const workflow of needs.standard) {
      for (const need of workflow.needs) {
        const domain = manifest.domains[need.table.replace('Standard_', '')];
        expect(Object.keys(domain.columns), need.table).toEqual(
          expect.arrayContaining(need.columns)
        );
      }
    }
    const served = pipelineFiles().map((entry) => entry.file);
    expect(served.filter((file) => file.startsWith(`${RBQM_STANDARD.directory}/`))).toEqual(
      RBQM_STANDARD.files.map((file) => `${RBQM_STANDARD.directory}/${file}`)
    );
    expect(derivedFrom.map((entry) => entry.file)).toEqual(expect.arrayContaining(served));
  });

  it('APP-RBQM-042: R is handed each standard domain the workflows read as CSV: the reader’s rows, only the columns the workflows ask for, each under its standard name whatever the reader’s file calls it, and nothing of a value changed; a domain no workflow reads is not handed over (#253)', () => {
    const { files, mappings } = study([
      { domain: 'subject', file: 'site/data/adsl.csv' },
      { domain: 'ae', file: 'site/data/adae.csv' },
      { domain: 'bds', file: 'site/data/adbds.csv' }
    ]);
    const standard = standardStudy(files, mappings, needs);
    expect([...standard.keys()]).toEqual(['Standard_subject', 'Standard_ae']);
    const subject = standard.get('Standard_subject');
    expect(subject).toMatchObject({ domain: 'subject', name: 'adsl.csv' });
    const lines = standardCsv(subject).trimEnd().split('\n');
    expect(lines[0]).toBe('SITEID,USUBJID,EOSSTT,EOSDY');
    expect(lines).toHaveLength(1 + files.subject.rows.length);
    files.subject.rows.forEach((row, index) => {
      expect(lines[index + 1]).toBe([row.SITEID, row.USUBJID, row.EOSSTT, row.EOSDY].join(','));
    });
    // The treatment arm is in the file, no workflow asks for it, and R is not handed it.
    expect(files.subject.columns).toContain('ARM');
    expect(lines[0]).not.toContain('ARM');
    // The same bytes desktop R was given for the reference.
    const handed = standardFiles(RBQM_PILOT.files, needs, manifest, read);
    expect(handed.files).toEqual({
      'Standard_subject.csv': standardCsv(subject),
      'Standard_ae.csv': standardCsv(standard.get('Standard_ae'))
    });
    expect(handed.labels).toEqual({ Standard_subject: 'adsl.csv', Standard_ae: 'adae.csv' });
    expect(handed.labels).toEqual(pilot.labels);

    // A file with its own column names, mapped by the reader: the standard names go to R.
    const renamed = study([{ domain: 'subject', file: 'tests/e2e/fixtures/app/dm.csv' }]);
    expect(renamed.files.subject.columns).toEqual(
      'SUBJID TREATMENT CENTRE SEX RACE LASTDAY STATUS'.split(' ')
    );
    let mapping = renamed.mappings.subject;
    for (const [standardName, own] of [
      ['SITEID', 'CENTRE'],
      ['EOSDY', 'LASTDAY'],
      ['EOSSTT', 'STATUS']
    ]) {
      mapping = setColumn(mapping, standardName, own, renamed.files.subject);
    }
    const mapped = standardStudy(renamed.files, { subject: mapping }, needs).get(
      'Standard_subject'
    );
    expect(mapped.from).toEqual({
      SITEID: 'CENTRE',
      USUBJID: 'SUBJID',
      EOSSTT: 'STATUS',
      EOSDY: 'LASTDAY'
    });
    const [header, first] = standardCsv(mapped).split('\n');
    const [row] = renamed.files.subject.rows;
    expect(header).toBe('SITEID,USUBJID,EOSSTT,EOSDY');
    expect(first).toBe([row.CENTRE, row.SUBJID, row.STATUS, row.LASTDAY].join(','));

    // A value with a comma, a quote or a line break is quoted, as CSV asks.
    const odd = {
      file: {
        rows: [
          { a: 'x, y', b: 'said "no"' },
          { a: null, b: 'two\nlines' }
        ]
      },
      columns: ['A', 'B'],
      from: { A: 'a', B: 'b' }
    };
    expect(standardCsv(odd)).toBe('A,B\n"x, y","said ""no"""\n,"two\nlines"\n');
  });

  it('APP-RBQM-043: before R is started the tab says what the loaded study supports in the words R then says: for the pilot study three of the eight metrics and the Groups table, and of each other metric the file it needs, word for word what desktop R said after running; with the site not mapped, every sentence names the column and the reader’s file, as desktop R’s do (#253)', () => {
    const { files, mappings } = study(RBQM_PILOT.files);
    const standard = standardStudy(files, mappings, needs);
    const support = supportOf(new Map(), needs, standard);
    expect(spoken(support)).toEqual(said(pilot.answer.status));
    expect(support.metrics.filter((m) => m.supported).map((m) => m.id)).toEqual(RBQM_PILOT.metrics);
    expect(pilot.answer.ran.metrics).toEqual(RBQM_PILOT.metrics);
    expect(support.groups).toEqual({ supported: true, message: '' });
    expect(pilot.answer.groups.state).toBe('ran');
    // The raw tables R made are the ones the tab said it would.
    expect([...support.made.keys()]).toEqual(pilot.answer.ran.standard);
    expect(standardSentence(standard.get('Standard_subject'), 'Subject-level', support)).toBe(
      'adsl.csv, the Subject-level file, gives Raw_SITE, Raw_STUDCOMP, Raw_STUDY and Raw_SUBJ.'
    );
    expect(standardSentence(standard.get('Standard_ae'), 'Adverse events', support)).toBe(
      'adae.csv, the Adverse events file, gives Raw_AE.'
    );

    // The site's mapping cleared, as when a file's site column is not recognised.
    const noSite = study(RBQM_PILOT.files, RBQM_PILOT.noSite.unmap);
    const lacking = standardStudy(noSite.files, noSite.mappings, needs);
    const less = supportOf(new Map(), needs, lacking);
    expect(spoken(less)).toEqual(said(pilot.no_site.status));
    expect(less.metrics[0].message).toBe(
      'Adverse Event Rate needs the column SITEID, which no column of adsl.csv is mapped to.'
    );
    expect(less.groups).toEqual({ supported: false, message: pilot.no_site.groups.message });
    expect([...less.made.keys()]).toEqual(pilot.no_site.ran.standard);
    expect(pilot.no_site.rows).toBe(0);
    expect(standardSentence(lacking.get('Standard_subject'), 'Subject-level', less)).toBe(
      'adsl.csv, the Subject-level file, gives Raw_STUDY. It has no column mapped to SITEID, ' +
        'so Raw_SITE, Raw_STUDCOMP and Raw_SUBJ are not made. Map it on the Data tab.'
    );
  });

  it('APP-RBQM-043: a raw file that is loaded is used as it is and the study’s file is not read for that table; a study with no subject-level or adverse events file gives R nothing, and each metric names the raw files it needs (#253)', () => {
    const { files, mappings } = study(RBQM_PILOT.files);
    const standard = standardStudy(files, mappings, needs);
    // gsm's own adverse events file beside the pilot study: Raw_AE is the file's.
    const raw = rawStudy(
      loaded(scenario('two-files')).filter((entry) => entry.name === 'Raw_AE.csv'),
      needs
    );
    const mixed = supportOf(raw.tables, needs, standard);
    expect([...mixed.made.keys()]).toEqual(['Raw_SITE', 'Raw_STUDCOMP', 'Raw_STUDY', 'Raw_SUBJ']);
    expect([...mixed.reads]).toEqual(['Standard_subject']);
    // With every raw table loaded nothing of the study is read.
    const whole = rawStudy(loaded(scenario('whole')), needs);
    const all = supportOf(whole.tables, needs, standard);
    expect(all.made.size).toBe(0);
    expect(all.reads.size).toBe(0);
    expect(spoken(all)).toEqual(spoken(supportOf(whole.tables, needs)));
    // A study of labs alone has no domain a workflow reads.
    const labs = study([{ domain: 'bds', file: 'site/data/adbds-abnbl.csv' }]);
    const none = standardStudy(labs.files, labs.mappings, needs);
    expect(none.size).toBe(0);
    expect(spoken(supportOf(new Map(), needs, none))).toEqual(spoken(supportOf(new Map(), needs)));
  });
});

describe('a study the reader’s mapping gives R little of (#258)', () => {
  it('APP-RBQM-050: with none of the subject-level file’s columns mapped the tab says before R is started what desktop R then says, word for word, of every metric and of the Groups table; R is handed that file with no column and no cell', () => {
    const none = study(RBQM_PILOT.files, RBQM_PILOT.noColumns.unmap);
    const standard = standardStudy(none.files, none.mappings, needs);
    const support = supportOf(new Map(), needs, standard);
    expect(spoken(support)).toEqual(said(pilot.no_columns.status));
    expect(support.groups).toEqual({ supported: false, message: pilot.no_columns.groups.message });
    expect([...support.made.keys()]).toEqual(pilot.no_columns.ran.standard);
    const subject = standard.get('Standard_subject');
    expect(subject.columns).toEqual([]);
    expect(standardCsv(subject).trim()).toBe('');
  });

  it('APP-RBQM-042: a column the mapping names that the file does not have is not handed to R, which then says the column is not mapped (#258)', () => {
    const { files, mappings } = study(RBQM_PILOT.files);
    // The mapping kept from a file that had the column, over a file that lacks it.
    const stale = {
      ...mappings,
      subject: {
        ...mappings.subject,
        columns: {
          ...mappings.subject.columns,
          SITEID: { ...mappings.subject.columns.SITEID, value: 'CENTRE' }
        }
      }
    };
    expect(files.subject.columns).not.toContain('CENTRE');
    const standard = standardStudy(files, stale, needs);
    const subject = standard.get('Standard_subject');
    expect(subject.columns).not.toContain('SITEID');
    expect(subject.from.SITEID).toBeUndefined();
    expect(standardCsv(subject).split('\n')[0]).not.toMatch(/SITEID|CENTRE/);
    const support = supportOf(new Map(), needs, standard);
    expect(support.metrics[0].message).toBe(
      'Adverse Event Rate needs the column SITEID, which no column of adsl.csv is mapped to.'
    );
  });
});
