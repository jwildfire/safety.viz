// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { MAX_FILE_BYTES, readFiles } from '../../../src/app/data-panel.js';

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
    expect(tag('data')).toBe('4 files');
  });

  it('APP-LOAD-002: a file that belongs to no domain is reported in one sentence, and can be placed by hand (#151)', () => {
    app.loadFiles([...STUDY, fixture('site_notes.csv')]);
    expect(notes()).toEqual([
      'site_notes.csv was not placed in a domain: it matches at most 0 columns of any of them.'
    ]);
    const unplaced = root.querySelector('.sva-file.sva-unplaced');
    expect(unplaced.querySelector('.sva-file-name').textContent).toBe('site_notes.csv');
    expect(tag('data')).toBe('4 files');
    // By hand it goes where the user says, replacing what was there, and says so.
    choose(unplaced.querySelector('.sva-domain'), 'subject');
    expect(card('subject').querySelector('.sva-file-name').textContent).toBe('site_notes.csv');
    expect(card('subject').querySelector('.sva-found').textContent).toBe('0 of 7 columns found');
    expect(notes()).toEqual(['site_notes.csv replaced dm.csv as the Subject-level file.']);
    expect(root.querySelector('.sva-file.sva-unplaced')).toBeNull();
  });

  it('APP-LOAD-003: before any correction the chart list names what each unsupported chart is missing (#151)', () => {
    app.loadFiles(STUDY);
    expect(count()).toBe('7 of 14 charts supported by the loaded data');
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
    expect(count()).toBe('8 of 14 charts supported by the loaded data');
    // The keyboard stays on the row that was changed.
    expect(document.activeElement).toBe(row('eg', 'column', 'ARM').querySelector('select'));
    // Clearing a guess turns the chart off again, by name.
    setRow('eg', 'column', 'BASE', '');
    expect(tag('qt-explorer')).toBe('1 missing');
    expect(row('eg', 'column', 'BASE').querySelector('.sva-tag').textContent).toBe(
      'needed by 1 chart'
    );
  });

  it('APP-LOAD-007: with the six rows corrected by hand, the renamed study supports 13 of 14 charts (#151)', () => {
    app.loadFiles(STUDY);
    for (const [domain, kind, key, value] of CORRECTIONS) setRow(domain, kind, key, value);
    expect(count()).toBe('13 of 14 charts supported by the loaded data');
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
      '13 of 14 charts supported by the loaded data'
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

  it('APP-LOAD-011: a file can be moved to another domain or set aside with its picker (#151)', () => {
    app.loadFiles(STUDY);
    // The ECG file is the same shape as a labs file; a user may know better.
    choose(card('eg').querySelector('.sva-domain'), 'bds');
    expect(card('eg')).toBeNull();
    expect(card('bds').querySelector('.sva-file-name').textContent).toBe('ecg.json');
    expect(notes()).toEqual(['ecg.json replaced labs_final.csv as the Labs and vitals file.']);
    expect(tag('qt-explorer')).toBe('no file');
    // Set aside: kept on the page, read by no chart.
    choose(card('bds').querySelector('.sva-domain'), '');
    expect(card('bds')).toBeNull();
    expect(root.querySelector('.sva-file.sva-unplaced .sva-file-name').textContent).toBe(
      'ecg.json'
    );
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

  it('APP-LOAD-013: an empty page offers the drop zone and says nothing is loaded (#151)', () => {
    expect(root.querySelector('.sva-drop').textContent).toContain(
      'Drop CSV or JSON files here, or Choose files'
    );
    expect(root.querySelector('.sva-drop-note').textContent).toBe(
      'They are read in this browser and sent nowhere.'
    );
    const input = root.querySelector('.sva-file-input');
    expect(input.multiple).toBe(true);
    expect(root.querySelector('.sva-data .sva-message').textContent).toBe('No files are loaded.');
    expect(root.querySelector('[data-action="download-mapping"]')).toBeNull();
  });
});
