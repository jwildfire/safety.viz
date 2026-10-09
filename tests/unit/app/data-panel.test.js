// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { MAX_FILE_BYTES, readFiles } from '../../../src/app/data-panel.js';
import { DEMO_STUDIES } from '../../../src/app/studies.js';

// The renamed-column study (scripts/build-app-fixture.mjs): SDTM-style names
// the app can guess, names it cannot, renamed key measures, one JSON file and
// one file that belongs to no domain. jsdom replaces the global URL, so the
// fixture path is built with node:path.
const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/app'
);
const fixture = (name) => ({ name, text: readFileSync(path.join(fixtureDir, name), 'utf8') });
const STUDY = ['labs_final.csv', 'dm.csv', 'ae.csv', 'ecg.json'].map(fixture);

// The demo studies as the site serves them: each study's files under the demo
// base, in the study's own directory, read here from where the repository keeps them.
const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const demoFetch = () =>
  vi.fn(async (url) => {
    const relative = url.replace('./data/', '');
    const study = DEMO_STUDIES.find((item) => item.dir && relative.startsWith(item.dir)) || {
      dir: '',
      source: 'site/data'
    };
    return readFileSync(path.join(repoDir, study.source, relative.slice(study.dir.length)), 'utf8');
  });

function fakeCharts() {
  const charts = { portfolio: manifest };
  for (const entry of Object.values(manifest.modules)) {
    charts[entry.export] = vi.fn((element) => ({
      init() {
        element.innerHTML = '<canvas></canvas>';
      },
      destroy() {
        element.innerHTML = '';
      }
    }));
  }
  return charts;
}

// The six rows the renamed study needs set by hand.
const CORRECTIONS = [
  ['bds', 'column', 'STNRHI', 'ULN'],
  ['bds', 'column', 'ARM', 'TREATMENT'],
  ['bds', 'measure', 'TB', 'Tot. Bilirubin'],
  ['eg', 'column', 'ARM', 'TREATMENT'],
  ['ae', 'column', 'ARM', 'TREATMENT'],
  ['subject', 'column', 'EOSDY', 'LASTDAY']
];

describe('demo app: the data panel', () => {
  let root;
  let app;
  const card = (domain) => root.querySelector(`.sva-file[data-domain="${domain}"]`);
  const row = (domain, kind, key) => card(domain).querySelector(`tr[data-${kind}="${key}"]`);
  const choose = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const setRow = (domain, kind, key, value) =>
    choose(row(domain, kind, key).querySelector('select'), value);
  const tag = (id) => root.querySelector(`.sva-item[data-view="${id}"] .sva-tag`).textContent;
  const count = () => root.querySelector('.sva-count').textContent;
  const notes = () => [...root.querySelectorAll('.sva-note')].map((node) => node.textContent);
  const step = (id) => root.querySelector(`.sva-step[data-step="${id}"]`);
  const steps = () =>
    ['load', 'map', 'open'].map((id) => [
      step(id).querySelector('.sva-step-title').textContent,
      step(id).dataset.state,
      step(id).querySelector('.sva-step-status').textContent
    ]);
  const action = (name) => root.querySelector(`.sva-side [data-action="${name}"]`);
  const loaded = () =>
    [...root.querySelectorAll('.sva-loaded-file')].map((node) => [
      node.querySelector('.sva-loaded-name').textContent,
      node.querySelector('.sva-loaded-detail').textContent,
      [...node.querySelectorAll('.sva-flag')].map((flag) => flag.textContent)
    ]);

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    app = mountApp(root, { charts: fakeCharts(), manifest });
  });

  it('APP-LOAD-001: each file is placed in its domain and shown with how many of the domain’s columns it carries (#151)', () => {
    app.loadFiles(STUDY);
    const shown = Object.fromEntries(
      [...root.querySelectorAll('.sva-file[data-domain]')].map((node) => [
        node.dataset.domain,
        [
          node.querySelector('.sva-file-name').textContent,
          node.querySelector('.sva-domain').value,
          node.querySelector('.sva-found').textContent,
          node.querySelector('.sva-file-rows').textContent
        ]
      ])
    );
    expect(shown).toEqual({
      subject: ['dm.csv', 'subject', '3 of 7 columns found', '24 rows'],
      ae: ['ae.csv', 'ae', '9 of 10 columns found', '136 rows'],
      bds: ['labs_final.csv', 'bds', '7 of 13 columns found', '2,223 rows'],
      eg: ['ecg.json', 'eg', '9 of 10 columns found', '516 rows']
    });
    expect(tag('data')).toBe('Your 4 files');
  });

  it('APP-LOAD-002: a file that belongs to no domain is reported in one sentence, and can be placed by hand (#151)', () => {
    app.loadFiles([...STUDY, fixture('site_notes.csv')]);
    expect(notes()).toEqual([
      'site_notes.csv was not placed in a domain: it matches at most 0 columns of any of them.'
    ]);
    const unplaced = root.querySelector('.sva-file.sva-unplaced');
    expect(unplaced.querySelector('.sva-file-name').textContent).toBe('site_notes.csv');
    expect(tag('data')).toBe('Your 4 files');
    // By hand it goes where the user says, replacing what was there, and says so.
    choose(unplaced.querySelector('.sva-domain'), 'subject');
    expect(card('subject').querySelector('.sva-file-name').textContent).toBe('site_notes.csv');
    expect(card('subject').querySelector('.sva-found').textContent).toBe('0 of 7 columns found');
    expect(notes()).toEqual([
      'site_notes.csv replaced dm.csv as the Subject-level file; dm.csv is set aside.'
    ]);
    // The file it displaced is kept, set aside, where it can be placed again.
    expect(
      [...root.querySelectorAll('.sva-file.sva-unplaced .sva-file-name')].map(
        (node) => node.textContent
      )
    ).toEqual(['dm.csv']);
  });

  it('APP-LOAD-003: before any correction the chart list names what each unsupported chart is missing (#151)', () => {
    app.loadFiles(STUDY);
    expect(count()).toBe('7 of 13 charts supported by the loaded data');
    const missing = Object.fromEntries(
      Object.entries(app.status())
        .filter(([, status]) => status.state === 'missing')
        .map(([module, status]) => [module, status.missing.map((item) => item.label)])
    );
    expect(missing).toEqual({
      'hep-explorer': ['Upper limit of normal', 'Total bilirubin'],
      'hep-waterfall': ['Upper limit of normal', 'Treatment arm'],
      'participant-profile': ['Upper limit of normal'],
      'qt-explorer': ['Treatment arm'],
      'ae-explorer': ['Treatment arm'],
      'time-to-event': ['End-of-study day']
    });
    expect(tag('hep-explorer')).toBe('2 missing');
    app.select('hep-explorer');
    expect(root.querySelector('.sva-message').textContent).toBe(
      'Not mapped yet: Upper limit of normal, Total bilirubin.'
    );
  });

  it('APP-LOAD-004: every row says how it was filled, and an empty row says which charts need it (#151)', () => {
    app.loadFiles(STUDY);
    const cells = (domain, kind, key) => {
      const node = row(domain, kind, key);
      return [
        node.querySelector('td').textContent,
        node.querySelector('select').value,
        node.querySelector('.sva-tag').textContent
      ];
    };
    expect(cells('bds', 'column', 'SEX')).toEqual(['Sex', 'SEX', 'same name']);
    expect(cells('bds', 'column', 'USUBJID')).toEqual(['Participant', 'SUBJID', 'guessed']);
    expect(cells('bds', 'column', 'TEST')).toEqual(['Measure', 'LBTEST', 'guessed']);
    expect(cells('bds', 'column', 'STNRHI')).toEqual([
      'Upper limit of normal',
      '',
      'needed by 3 charts'
    ]);
    expect(row('bds', 'column', 'STNRHI').querySelector('.sva-tag').title).toBe(
      'Hepatic Safety Explorer, Hepatic ALT Waterfall, Participant Profile'
    );
    expect(cells('bds', 'column', 'STRESU')).toEqual(['Unit', '', 'optional']);
    // Every column of the file is offered, plus "not mapped".
    const offered = [...row('bds', 'column', 'ARM').querySelectorAll('option')].map(
      (option) => option.textContent
    );
    expect(offered).toEqual([
      'not mapped',
      ...JSON.parse(JSON.stringify(app.state.files.bds.columns))
    ]);
  });

  it('APP-LOAD-005: key measures are mapped in the same table, from the names in the measure column (#151)', () => {
    app.loadFiles(STUDY);
    const measure = (domain, key) => {
      const node = row(domain, 'measure', key);
      return [
        node.querySelector('td').textContent,
        node.querySelector('select').value,
        node.querySelector('.sva-tag').textContent
      ];
    };
    expect(measure('bds', 'ALT')).toEqual(['ALT is called', 'ALT (SGPT)', 'guessed']);
    expect(measure('bds', 'CREAT')).toEqual(['Creatinine is called', 'Creatinine', 'same name']);
    expect(measure('bds', 'TB')).toEqual(['Total bilirubin is called', '', 'needed by 1 chart']);
    expect(measure('eg', 'QTcF')).toEqual([
      'QTcF is called',
      'QTcF Interval, Aggregate',
      'guessed'
    ]);
    // The names offered are the measure column's own values.
    const offered = [...row('bds', 'measure', 'TB').querySelectorAll('option')].map(
      (option) => option.textContent
    );
    expect(offered).toContain('Tot. Bilirubin');
    expect(offered).toHaveLength(11);
    // A domain with no key measures has no such rows.
    expect(card('subject').querySelector('tr[data-measure]')).toBeNull();
    // With the measure column unmapped there is nothing to choose from, and the table says so.
    setRow('bds', 'column', 'TEST', '');
    expect(card('bds').querySelector('tr[data-measure]')).toBeNull();
    expect(card('bds').querySelector('.sva-map-hint').textContent).toBe(
      'Map the measure column above to choose the key measures.'
    );
  });

  it('APP-LOAD-006: changing a row updates the chart statuses at once and marks the row chosen (#151)', () => {
    app.loadFiles(STUDY);
    expect(tag('qt-explorer')).toBe('1 missing');
    setRow('eg', 'column', 'ARM', 'TREATMENT');
    expect(tag('qt-explorer')).toBe('ready');
    expect(row('eg', 'column', 'ARM').querySelector('.sva-tag').textContent).toBe('chosen');
    expect(count()).toBe('8 of 13 charts supported by the loaded data');
    // The keyboard stays on the row that was changed.
    expect(document.activeElement).toBe(row('eg', 'column', 'ARM').querySelector('select'));
    // Clearing a guess turns the chart off again, by name.
    setRow('eg', 'column', 'BASE', '');
    expect(tag('qt-explorer')).toBe('1 missing');
    expect(row('eg', 'column', 'BASE').querySelector('.sva-tag').textContent).toBe(
      'needed by 1 chart'
    );
  });

  it('APP-LOAD-007: with the six rows corrected by hand, the renamed study supports all 13 charts (#151, #165)', () => {
    app.loadFiles(STUDY);
    for (const [domain, kind, key, value] of CORRECTIONS) setRow(domain, kind, key, value);
    expect(count()).toBe('13 of 13 charts supported by the loaded data');
    expect(Object.values(app.status()).filter((status) => status.state === 'missing')).toHaveLength(
      0
    );
  });

  it('APP-LOAD-008: the mapping file restores the mapping on a fresh page, dropped with the data files (#151)', () => {
    app.loadFiles(STUDY);
    for (const [domain, kind, key, value] of CORRECTIONS) setRow(domain, kind, key, value);
    const before = JSON.parse(JSON.stringify(app.state.mappings));
    const mappingFile = {
      name: 'safety-viz-mapping.json',
      text: JSON.stringify(app.mappingFile())
    };

    document.body.innerHTML = '<div id="again"></div>';
    const again = mountApp(document.querySelector('#again'), { charts: fakeCharts(), manifest });
    again.loadFiles([...STUDY, mappingFile]);
    expect(again.state.mappings).toEqual(before);
    expect(document.querySelector('#again .sva-count').textContent).toBe(
      '13 of 13 charts supported by the loaded data'
    );
    expect(
      [...document.querySelectorAll('#again .sva-note')].map((node) => node.textContent)
    ).toEqual([
      'safety-viz-mapping.json is a saved mapping for: Subject-level (dm.csv), ' +
        'Adverse events (ae.csv), Labs and vitals (labs_final.csv), ECG (ecg.json).'
    ]);
    // The mapping file is not counted or shown as a data file.
    expect(Object.keys(again.state.files)).toHaveLength(4);
  });

  it('APP-LOAD-009: a mapping file dropped first is held and applied as each data file arrives (#151)', () => {
    app.loadFiles(STUDY);
    for (const [domain, kind, key, value] of CORRECTIONS) setRow(domain, kind, key, value);
    const before = JSON.parse(JSON.stringify(app.state.mappings));
    const mappingFile = { name: 'saved.json', text: JSON.stringify(app.mappingFile()) };

    document.body.innerHTML = '<div id="again"></div>';
    const again = mountApp(document.querySelector('#again'), { charts: fakeCharts(), manifest });
    again.loadFiles([mappingFile]);
    expect(Object.keys(again.state.files)).toHaveLength(0);
    again.loadFiles(STUDY);
    expect(again.state.mappings).toEqual(before);
  });

  it('APP-LOAD-010: a saved value the file no longer carries is named and skipped (#151)', () => {
    app.loadFiles(STUDY);
    setRow('subject', 'column', 'EOSDY', 'LASTDAY');
    const mappingFile = { name: 'saved.json', text: JSON.stringify(app.mappingFile()) };
    const dm = fixture('dm.csv');
    const changed = { name: 'dm.csv', text: dm.text.replace('LASTDAY', 'FINALDAY') };

    document.body.innerHTML = '<div id="again"></div>';
    const again = mountApp(document.querySelector('#again'), { charts: fakeCharts(), manifest });
    again.loadFiles([mappingFile, changed]);
    expect(again.state.mappings.subject.columns.EOSDY).toEqual({ value: null, source: null });
    expect(
      [...document.querySelectorAll('#again .sva-note')].map((node) => node.textContent)
    ).toContain(
      'The saved mapping names LASTDAY, which dm.csv does not have; those rows were left as they were.'
    );
  });

  it('APP-LOAD-009: a mapping file dropped after the data moves each file it names to the domain it names (#165)', () => {
    // The labs file moved to ECG by hand, and the ECG file set aside.
    app.loadFiles(STUDY);
    app.placeFileIn({ domain: 'eg' }, null);
    app.placeFileIn({ domain: 'bds' }, 'eg');
    setRow('eg', 'column', 'ARM', 'TREATMENT');
    const before = JSON.parse(JSON.stringify(app.state.mappings));
    const mappingFile = { name: 'saved.json', text: JSON.stringify(app.mappingFile()) };
    expect(app.mappingFile().domains.eg.file).toBe('labs_final.csv');
    const placed = () =>
      Object.fromEntries(Object.entries(app.state.files).map(([id, file]) => [id, file.name]));

    // The data first, placed by its columns; then the mapping file on its own.
    action('reset').click();
    app.loadFiles(STUDY);
    expect(placed()).toMatchObject({ bds: 'labs_final.csv', eg: 'ecg.json' });
    app.loadFiles([mappingFile]);
    expect(placed()).toEqual({ subject: 'dm.csv', ae: 'ae.csv', eg: 'labs_final.csv' });
    expect(app.state.mappings).toEqual(before);
    expect(card('eg').querySelector('.sva-file-name').textContent).toBe('labs_final.csv');
    expect(notes()).toEqual([
      'saved.json is a saved mapping for: Subject-level (dm.csv), Adverse events (ae.csv), ' +
        'ECG (labs_final.csv).',
      'labs_final.csv replaced ecg.json as the ECG file; ecg.json is set aside.'
    ]);
    expect(app.state.unplaced.map((item) => item.file.name)).toEqual(['ecg.json']);

    // Dropped together it lands the same way.
    action('reset').click();
    app.loadFiles([mappingFile, ...STUDY.filter((file) => file.name !== 'ecg.json')]);
    expect(placed()).toEqual({ subject: 'dm.csv', ae: 'ae.csv', eg: 'labs_final.csv' });
    expect(app.state.mappings).toEqual(before);
  });

  it('APP-LOAD-009: a mapping file that swaps two loaded files moves both, and takes one from among the unplaced (#165)', () => {
    const swap = {
      name: 'swap.json',
      text: JSON.stringify({
        safetyVizMapping: 1,
        domains: {
          bds: { file: 'ecg.json', columns: {}, measures: {} },
          eg: { file: 'labs_final.csv', columns: {}, measures: {} },
          subject: { file: 'site_notes.csv', columns: {}, measures: {} }
        }
      })
    };
    app.loadFiles([...STUDY, fixture('site_notes.csv')]);
    app.loadFiles([swap]);
    expect(
      Object.fromEntries(Object.entries(app.state.files).map(([id, f]) => [id, f.name]))
    ).toEqual({
      subject: 'site_notes.csv',
      ae: 'ae.csv',
      bds: 'ecg.json',
      eg: 'labs_final.csv'
    });
    // The two that swapped displaced nothing; the subject-level file that made
    // way for the one taken from among the unplaced is kept, set aside.
    expect(app.state.unplaced.map((item) => item.file.name)).toEqual(['dm.csv']);
  });

  it('APP-LOAD-024: a mapping file that is damaged or names what the app does not know loads the data files anyway, and says what it is (#165)', () => {
    const labs = fixture('labs_final.csv');
    for (const [domains, sentence] of [
      [{ bds: null }, 'm.json is a saved mapping, but it names no domain: nothing was restored.'],
      [
        { toString: { file: 'labs_final.csv' }, visits: { file: 'labs_final.csv' } },
        'm.json is a saved mapping, but it names no domain: nothing was restored.'
      ],
      ['yes', 'm.json is a saved mapping, but it names no domain: nothing was restored.'],
      [
        // Values that are not column names are passed over.
        {
          bds: { file: 'labs_final.csv', columns: { TEST: { a: 1 }, ARM: 7 }, measures: { ALT: 5 } }
        },
        'm.json is a saved mapping for: Labs and vitals (labs_final.csv).'
      ],
      [
        // No file named: the rows are applied to whatever file is placed there.
        { bds: { file: 42, columns: { ARM: 'TREATMENT' } } },
        'm.json is a saved mapping for: Labs and vitals.'
      ]
    ]) {
      action('reset')?.click();
      const text = JSON.stringify({ safetyVizMapping: 1, domains });
      expect(() => app.loadFiles([{ name: 'm.json', text }, labs]), text).not.toThrow();
      expect(Object.keys(app.state.files), text).toEqual(['bds']);
      expect(notes(), text).toEqual([sentence]);
      expect(app.state.mappings.bds.columns.TEST, text).toEqual({
        value: 'LBTEST',
        source: 'guessed'
      });
    }
  });

  it('APP-LOAD-025: a corrected file of the same name takes the place of the one that was not placed (#165)', () => {
    // Semicolons where commas should be: one column, no domain.
    app.loadFiles([{ name: 'dm.csv', text: 'SUBJID;SEX;RACE\n1;F;WHITE\n' }]);
    expect(root.querySelectorAll('.sva-file.sva-unplaced')).toHaveLength(1);
    app.loadFiles([fixture('dm.csv')]);
    expect(card('subject').querySelector('.sva-file-name').textContent).toBe('dm.csv');
    expect(root.querySelectorAll('.sva-file.sva-unplaced')).toHaveLength(0);
    expect(app.state.unplaced).toEqual([]);
    expect(loaded().map(([name]) => name)).toEqual(['dm.csv']);
    // A file of another name that was not placed stays.
    app.loadFiles([fixture('site_notes.csv')]);
    app.loadFiles([fixture('ae.csv')]);
    expect(loaded().map(([name]) => name)).toEqual(['dm.csv', 'ae.csv', 'site_notes.csv']);
  });

  it('APP-LOAD-011: a file can be moved to another domain or set aside with its picker (#151)', () => {
    app.loadFiles(STUDY);
    // The ECG file is the same shape as a labs file; a user may know better.
    choose(card('eg').querySelector('.sva-domain'), 'bds');
    expect(card('eg')).toBeNull();
    expect(card('bds').querySelector('.sva-file-name').textContent).toBe('ecg.json');
    expect(notes()).toEqual([
      'ecg.json replaced labs_final.csv as the Labs and vitals file; labs_final.csv is set aside.'
    ]);
    expect(tag('qt-explorer')).toBe('no file');
    const aside = () =>
      [...root.querySelectorAll('.sva-file.sva-unplaced .sva-file-name')].map(
        (node) => node.textContent
      );
    // The file it displaced is kept on the page, read by no chart.
    expect(aside()).toEqual(['labs_final.csv']);
    // Set aside by hand: the same.
    choose(card('bds').querySelector('.sva-domain'), '');
    expect(card('bds')).toBeNull();
    expect(aside()).toEqual(['labs_final.csv', 'ecg.json']);
    expect(tag('histogram')).toBe('no file');
  });

  it('APP-LOAD-012: a file too large to read in memory, or of another type, is refused in a sentence (#151)', async () => {
    const text = vi.fn(async () => 'A\n1\n');
    const { loaded, refused } = await readFiles([
      { name: 'big.csv', size: MAX_FILE_BYTES + 1, text },
      { name: 'ok.csv', size: 4, text }
    ]);
    expect(refused).toEqual([
      'big.csv is 100 MB. Files over 100 MB are not supported yet: they are read into memory in the browser.'
    ]);
    expect(loaded).toEqual([{ name: 'ok.csv', text: 'A\n1\n' }]);
    // The oversized file is never read.
    expect(text).toHaveBeenCalledTimes(1);
    app.loadFiles([{ name: 'labs.xpt', text: 'x' }], { notes: refused });
    expect(notes()).toEqual([
      refused[0],
      'labs.xpt is not a CSV or JSON file. SAS transport and sas7bdat files are not supported yet.'
    ]);
  });

  it('APP-LOAD-012: a file that cannot be opened, such as a dropped folder, is named in a sentence and the rest of the drop loads (#165)', async () => {
    const { loaded: read, refused } = await readFiles([
      { name: 'dm.csv', size: 10, text: async () => fixture('dm.csv').text },
      {
        name: 'exports',
        size: 96,
        text: async () => {
          throw new DOMException('The requested file could not be read', 'NotFoundError');
        }
      },
      { name: 'ae.csv', size: 10, text: async () => fixture('ae.csv').text }
    ]);
    expect(read.map((file) => file.name)).toEqual(['dm.csv', 'ae.csv']);
    expect(refused).toEqual([
      'exports could not be read: it may be a folder, or a file the browser was not allowed to open.'
    ]);
    app.loadFiles(read, { notes: refused });
    expect(Object.keys(app.state.files)).toEqual(['subject', 'ae']);
    expect(notes()).toEqual(refused);
  });

  it('APP-LOAD-013: an empty page offers the drop zone and a file picker, and says nothing is loaded (#151, #159)', () => {
    expect(root.querySelector('.sva-drop').textContent).toContain('Drop CSV or JSON files here');
    expect(root.querySelector('.sva-drop-note').textContent).toBe(
      'They are read in this browser and sent nowhere.'
    );
    const input = root.querySelector('.sva-file-input');
    expect(input.multiple).toBe(true);
    // The picker is opened from the sidebar's first step.
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    action('choose-files').click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.sva-side .sva-loaded-empty').textContent).toBe(
      'No files are loaded.'
    );
    expect(root.querySelector('[data-action="download-mapping"]')).toBeNull();
  });

  // ---- the sidebar (#159) ----------------------------------------------------

  it('APP-LOAD-017: the sidebar shows the three steps as live status, each with its own actions (#159)', () => {
    // Nothing loaded: the first step is the current one and offers the picker only.
    expect(steps()).toEqual([
      ['Load your files', 'current', 'No files loaded'],
      ['Check the mapping', 'todo', 'Nothing to check yet'],
      ['Open a chart', 'todo', '0 of 13 charts ready']
    ]);
    expect(action('choose-files')).not.toBeNull();
    for (const name of ['reset', 'download-mapping', 'open-chart']) expect(action(name)).toBeNull();

    // The renamed study: loaded, with guesses to check and six rows charts need.
    app.loadFiles(STUDY);
    expect(steps()).toEqual([
      ['Load your files', 'done', '4 files loaded'],
      ['Check the mapping', 'current', '23 guessed, 6 needed by a chart'],
      ['Open a chart', 'todo', '7 of 13 charts ready']
    ]);
    for (const name of ['reset', 'download-mapping', 'open-chart']) {
      expect(action(name)).not.toBeNull();
    }

    // A correction is counted at once.
    setRow('eg', 'column', 'ARM', 'TREATMENT');
    expect(steps()[1]).toEqual(['Check the mapping', 'current', '23 guessed, 5 needed by a chart']);
    expect(steps()[2]).toEqual(['Open a chart', 'todo', '8 of 13 charts ready']);

    // The third step opens the first chart the data supports.
    action('open-chart').click();
    expect(app.state.selected).toBe('histogram');
  });

  it('APP-LOAD-017: the mapping step is done when no chart is waiting on a row; guesses are counted and flagged but do not hold it (#159, #163)', () => {
    app.loadFiles(STUDY);
    for (const [domain, kind, key, value] of CORRECTIONS.slice(1)) setRow(domain, kind, key, value);
    // One row a chart needs is still empty.
    expect(steps().slice(1)).toEqual([
      ['Check the mapping', 'current', '23 guessed, 1 needed by a chart'],
      ['Open a chart', 'todo', '10 of 13 charts ready']
    ]);
    const [domain, kind, key, value] = CORRECTIONS[0];
    setRow(domain, kind, key, value);
    expect(steps()).toEqual([
      ['Load your files', 'done', '4 files loaded'],
      ['Check the mapping', 'done', '23 guessed, 0 needed by a chart'],
      ['Open a chart', 'current', '13 of 13 charts ready']
    ]);
    expect(step('map').getAttribute('aria-current')).toBeNull();
    expect(step('open').getAttribute('aria-current')).toBe('step');
    // The guesses are still there to be checked: each file keeps its flag.
    expect(loaded().map(([, , flags]) => flags)).toEqual([
      ['1 guessed'],
      ['4 guessed'],
      ['8 guessed'],
      ['10 guessed']
    ]);
    // Clearing a row a chart needs reopens the step.
    setRow('eg', 'column', 'ARM', '');
    expect(steps().slice(1)).toEqual([
      ['Check the mapping', 'current', '23 guessed, 1 needed by a chart'],
      ['Open a chart', 'todo', '12 of 13 charts ready']
    ]);
  });

  it('APP-LOAD-018: the sidebar lists each loaded file with its domain and row count, flagged only where a row wants a look (#159)', () => {
    app.loadFiles([...STUDY, fixture('site_notes.csv')]);
    expect(loaded()).toEqual([
      ['dm.csv', 'Subject-level, 24 rows', ['1 guessed', '1 needed']],
      ['ae.csv', 'Adverse events, 136 rows', ['4 guessed', '1 needed']],
      ['labs_final.csv', 'Labs and vitals, 2,223 rows', ['8 guessed', '3 needed']],
      ['ecg.json', 'ECG, 516 rows', ['10 guessed', '1 needed']],
      ['site_notes.csv', 'Not placed, 3 rows', []]
    ]);
    // A settled file carries no flag.
    setRow('subject', 'column', 'EOSDY', 'LASTDAY');
    setRow('subject', 'column', 'USUBJID', 'SUBJID');
    expect(loaded()[0]).toEqual(['dm.csv', 'Subject-level, 24 rows', []]);
    // Choosing an entry moves to that file's card.
    root.querySelector('.sva-loaded-file[data-domain="bds"]').click();
    expect(document.activeElement).toBe(card('bds'));
    root.querySelector('.sva-loaded-file[data-unplaced="site_notes.csv"]').click();
    expect(document.activeElement).toBe(root.querySelector('.sva-file.sva-unplaced'));
  });

  it('APP-LOAD-019: Reset clears every file, mapping, held mapping file and note, back to the empty drop zone (#159)', () => {
    app.loadFiles([
      ...STUDY,
      fixture('site_notes.csv'),
      { name: 'saved.json', text: JSON.stringify({ safetyVizMapping: 1, domains: {} }) }
    ]);
    setRow('eg', 'column', 'ARM', 'TREATMENT');
    expect(notes().length).toBeGreaterThan(0);
    action('reset').click();
    expect(app.state.files).toEqual({});
    expect(app.state.mappings).toEqual({});
    expect(app.state.placements).toEqual({});
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.saved).toBeNull();
    expect(notes()).toEqual([]);
    expect(root.querySelectorAll('.sva-file')).toHaveLength(0);
    expect(tag('data')).toBe('no files');
    expect(count()).toBe('0 of 13 charts supported by the loaded data');
    expect(steps()[0]).toEqual(['Load your files', 'current', 'No files loaded']);
    expect(action('reset')).toBeNull();
    // A file loaded afterwards takes no row from the mapping file that was held.
    app.loadFiles(STUDY);
    expect(app.state.mappings.eg.columns.ARM).toEqual({ value: null, source: null });
  });

  it('APP-LOAD-020: served with demo studies, the sidebar offers each by name, and choosing one replaces what is loaded (#159)', async () => {
    const fetchText = demoFetch();
    document.body.innerHTML = '<div id="demo"></div>';
    root = document.querySelector('#demo');
    app = mountApp(root, { charts: fakeCharts(), manifest, demo: { base: './data/' }, fetchText });
    await app.ready;
    app.select('data');
    const menu = () => root.querySelector('.sva-side select.sva-study');
    const names = () => Object.values(app.state.files).map((file) => file.name);
    expect([...menu().options].map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Choose a demo study'],
      ['pilot', 'Pilot study'],
      ['renamed', 'Renamed columns'],
      ['liver', 'Liver cohort, labs only'],
      ['rbqm', 'RBQM study']
    ]);
    // The page opens on the first study, and says what is in it.
    expect(menu().value).toBe('pilot');
    expect(names()).toEqual(['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv']);
    expect(root.querySelector('.sva-study-note').textContent).toContain(
      '110 synthetic liver and kidney participants who are in no other file'
    );
    // Every row a chart needs is filled, so the mapping step is done; its guesses are still counted.
    expect(steps().slice(1)).toEqual([
      ['Check the mapping', 'done', '4 guessed, 0 needed by a chart'],
      ['Open a chart', 'current', '13 of 13 charts ready']
    ]);

    // Another study replaces it, from its own directory, and the data view stays open.
    setRow('bds', 'measure', 'ALT', 'Albumin');
    choose(menu(), 'renamed');
    await app.ready;
    expect(fetchText.mock.calls.slice(-4).map(([url]) => url)).toEqual([
      './data/renamed/dm.csv',
      './data/renamed/ae.csv',
      './data/renamed/labs_final.csv',
      './data/renamed/ecg.json'
    ]);
    expect(names()).toEqual(['dm.csv', 'ae.csv', 'labs_final.csv', 'ecg.json']);
    expect(app.state.selected).toBe('data');
    expect(menu().value).toBe('renamed');
    expect(root.querySelector('.sva-study-note').textContent).toContain('six rows');
    expect(steps()[1][2]).toBe('23 guessed, 6 needed by a chart');

    // One file: the other domains have none, and the charts say so.
    choose(menu(), 'liver');
    await app.ready;
    expect(names()).toEqual(['adbds-abnbl.csv']);
    expect(Object.keys(app.state.files)).toEqual(['bds']);
    expect(tag('qt-explorer')).toBe('no file');
    expect(steps()).toEqual([
      ['Load your files', 'done', '1 file loaded'],
      ['Check the mapping', 'current', '4 guessed, 1 needed by a chart'],
      ['Open a chart', 'todo', '8 of 13 charts ready']
    ]);

    // Files of the user's own are no demo study: they replace it whole, rather
    // than displacing its files one by one and leaving them set aside (#165).
    app.loadFiles([fixture('labs_final.csv')]);
    expect(menu().value).toBe('');
    expect(root.querySelector('.sva-study-note')).toBeNull();
    expect(names()).toEqual(['labs_final.csv']);
    expect(app.state.unplaced).toEqual([]);
    expect(notes()).toEqual([
      'The demo study (Liver cohort, labs only) was cleared to load your files.'
    ]);
    app.loadFiles(STUDY);
    expect(names().sort()).toEqual(['ae.csv', 'dm.csv', 'ecg.json', 'labs_final.csv']);
    expect(app.state.unplaced).toEqual([]);
    expect(notes()).toEqual([]);
    // Reset leaves the menu, with no study chosen.
    action('reset').click();
    expect(menu().value).toBe('');
    expect(names()).toEqual([]);
  });

  it('APP-LOAD-020: with no demo studies served, no menu is offered (#159)', () => {
    expect(root.querySelector('.sva-study')).toBeNull();
    app.loadFiles(STUDY);
    expect(root.querySelector('.sva-study')).toBeNull();
  });

  it('APP-LOAD-020: a demo study that cannot be fetched is reported in a sentence and loads nothing (#159)', async () => {
    document.body.innerHTML = '<div id="demo"></div>';
    root = document.querySelector('#demo');
    app = mountApp(root, {
      charts: fakeCharts(),
      manifest,
      demo: { base: './data/' },
      fetchText: async () => {
        throw new Error('offline');
      }
    });
    await app.ready;
    expect(notes()).toEqual(['The demo study could not be loaded: offline']);
    expect(app.state.files).toEqual({});
    expect(app.state.selected).toBe('data');
    expect(root.querySelector('.sva-side select.sva-study').value).toBe('');
  });

  it('APP-LOAD-020: a demo study answered with an error page is not read as data: it is reported and changes nothing (#165)', async () => {
    // The page's own fetch: a missing file is answered with a 404 and an HTML body.
    const fetch = vi.fn(async (url) => ({
      ok: !url.endsWith('adbds.csv'),
      status: url.endsWith('adbds.csv') ? 404 : 200,
      text: async () =>
        url.endsWith('adbds.csv')
          ? '<!DOCTYPE html><html><head><title>404</title></head><body>Not found</body></html>'
          : readFileSync(path.join(repoDir, 'site/data', url.split('/').pop()), 'utf8')
    }));
    vi.stubGlobal('fetch', fetch);
    try {
      document.body.innerHTML = '<div id="demo"></div>';
      root = document.querySelector('#demo');
      app = mountApp(root, { charts: fakeCharts(), manifest, demo: { base: './data/' } });
      await app.ready;
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(notes()).toEqual([
      'The demo study could not be loaded: ./data/adbds.csv was answered with HTTP 404.'
    ]);
    expect(app.state.files).toEqual({});
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.study).toBeNull();
    expect(app.state.selected).toBe('data');
    expect(root.querySelector('.sva-side select.sva-study').value).toBe('');
  });

  it('APP-LOAD-023: files loaded while a demo study is still being fetched are kept: the study is dropped when it arrives (#165)', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const serve = demoFetch();
    document.body.innerHTML = '<div id="demo"></div>';
    root = document.querySelector('#demo');
    app = mountApp(root, {
      charts: fakeCharts(),
      manifest,
      demo: { base: './data/' },
      fetchText: async (url) => {
        await gate;
        return serve(url);
      }
    });
    expect(root.querySelector('.sva-busy').textContent).toBe('Loading the demo study…');
    app.loadFiles(STUDY);
    // The user's files are on the page, and the page no longer says it is loading.
    expect(root.querySelector('.sva-busy')).toBeNull();
    release();
    await app.ready;
    expect(loaded().map(([name]) => name)).toEqual([
      'dm.csv',
      'ae.csv',
      'labs_final.csv',
      'ecg.json'
    ]);
    expect(app.state.study).toBeNull();
    expect(app.state.selected).toBe('data');
    expect(root.querySelector('.sva-side select.sva-study').value).toBe('');
    // A study chosen afterwards still loads.
    await app.loadDemo('liver');
    expect(Object.values(app.state.files).map((file) => file.name)).toEqual(['adbds-abnbl.csv']);
  });

  it('APP-RBQM-007: the RBQM study’s nine files are kept as they are: none is placed in a standard domain or mapped, each is listed with its rows and columns, and no safety chart reads them (#233)', async () => {
    const fetchText = demoFetch();
    document.body.innerHTML = '<div id="demo"></div>';
    root = document.querySelector('#demo');
    app = mountApp(root, { charts: fakeCharts(), manifest, demo: { base: './data/' }, fetchText });
    await app.ready;
    app.select('data');
    const menu = root.querySelector('.sva-side select.sva-study');
    choose(menu, 'rbqm');
    await app.ready;
    const rbqm = DEMO_STUDIES.find((study) => study.id === 'rbqm');
    expect(fetchText.mock.calls.slice(-9).map(([url]) => url)).toEqual(
      rbqm.files.map((file) => `./data/rbqm/${file}`)
    );
    // Kept, with their text, and nothing placed, mapped or set aside.
    expect(app.state.study).toBe('rbqm');
    expect(app.state.raw.map((file) => file.name)).toEqual(rbqm.files);
    expect(app.state.files).toEqual({});
    expect(app.state.mappings).toEqual({});
    expect(app.state.unplaced).toEqual([]);
    expect(notes()).toEqual([]);
    const subjects = app.state.raw[0];
    expect(subjects.rows).toBe(1005);
    expect(subjects.columns.slice(0, 2)).toEqual(['studyid', 'invid']);
    expect(subjects.text).toBe(
      readFileSync(path.join(repoDir, 'site/data/rbqm/Raw_SUBJ.csv'), 'utf8')
    );
    // The data view lists each, and says there is nothing to map.
    expect(root.querySelector('.sva-side select.sva-study').value).toBe('rbqm');
    expect(root.querySelector('.sva-study-note').textContent).toContain(
      '765 enrolled participants at 150 sites'
    );
    expect(loaded().map(([name, detail]) => [name, detail])).toEqual([
      ['Raw_SUBJ.csv', 'gsm raw file, 1,005 rows'],
      ['Raw_AE.csv', 'gsm raw file, 2,583 rows'],
      ['Raw_PD.csv', 'gsm raw file, 3,000 rows'],
      ['Raw_LB.csv', 'gsm raw file, 57,200 rows'],
      ['Raw_STUDCOMP.csv', 'gsm raw file, 765 rows'],
      ['Raw_SDRGCOMP.csv', 'gsm raw file, 765 rows'],
      ['Raw_SITE.csv', 'gsm raw file, 150 rows'],
      ['Raw_STUDY.csv', 'gsm raw file, 1 row'],
      ['Raw_ENROLL.csv', 'gsm raw file, 1,005 rows']
    ]);
    const cards = [...root.querySelectorAll('.sva-file.sva-raw')];
    expect(cards.map((node) => node.dataset.raw)).toEqual(rbqm.files);
    expect(cards[3].querySelector('.sva-file-rows').textContent).toBe('57,200 rows, 4 columns');
    expect(cards[3].querySelector('.sva-tag').textContent).toBe('gsm raw file, kept as it is');
    expect(root.querySelectorAll('.sva-file[data-domain]')).toHaveLength(0);
    expect(root.querySelector('.sva-map')).toBeNull();
    expect(tag('data')).toBe('RBQM study');
    expect(steps()).toEqual([
      ['Load your files', 'done', '9 files loaded'],
      ['Check the mapping', 'todo', 'Nothing to map: gsm’s raw files are kept as they are'],
      ['Open a chart', 'todo', '0 of 13 charts ready']
    ]);
    expect(tag('histogram')).toBe('no file');
    expect(action('download-mapping')).toBeNull();

    // Another study replaces it whole, and so do files of the reader's own.
    choose(root.querySelector('.sva-side select.sva-study'), 'liver');
    await app.ready;
    expect(app.state.raw).toEqual([]);
    expect(Object.keys(app.state.files)).toEqual(['bds']);
    await app.loadDemo('rbqm');
    expect(app.state.raw).toHaveLength(9);
    app.loadFiles(STUDY);
    expect(app.state.raw).toEqual([]);
    expect(notes()).toEqual(['The demo study (RBQM study) was cleared to load your files.']);
    await app.loadDemo('rbqm');
    action('reset').click();
    expect(app.state.raw).toEqual([]);
    expect(steps()[0]).toEqual(['Load your files', 'current', 'No files loaded']);
  });

  it('APP-RBQM-007: a raw file that cannot be read is refused in a sentence, and one loaded again replaces itself (#233)', () => {
    app.loadRaw([
      { name: 'Raw_SITE.csv', text: 'studyid,invid\nA,S1\nA,S2\n' },
      { name: 'Raw_AE.csv', text: '' }
    ]);
    expect(app.state.raw.map((file) => [file.name, file.rows])).toEqual([['Raw_SITE.csv', 2]]);
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatch(/^Raw_AE\.csv /);
    app.loadRaw([{ name: 'Raw_SITE.csv', text: 'studyid,invid\nA,S1\n' }]);
    expect(app.state.raw.map((file) => [file.name, file.rows])).toEqual([['Raw_SITE.csv', 1]]);
    expect(notes()).toEqual([]);
    // They are no demo study, and files of the standard domains sit beside them.
    expect(app.state.study).toBeNull();
    app.loadFiles(STUDY);
    expect(app.state.raw).toHaveLength(1);
    expect(tag('data')).toBe('Your 5 files');
  });

  it('APP-LOAD-021: the sidebar belongs to the data view: a chart view has none (#159)', () => {
    app.loadFiles(STUDY);
    expect(root.querySelector('.sva-data > .sva-side')).not.toBeNull();
    expect(root.querySelector('.sva-data > .sva-data-main .sva-drop')).not.toBeNull();
    app.select('histogram');
    expect(root.querySelector('.sva-side')).toBeNull();
    expect(root.querySelector('.sva-chart')).not.toBeNull();
  });
});
