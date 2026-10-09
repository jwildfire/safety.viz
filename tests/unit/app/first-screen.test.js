// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { DEMO_STUDIES } from '../../../src/app/studies.js';
import { dataTag, numberWord, tabCount, welcomeSentence } from '../../../src/app/header.js';

// The first screen says where the reader is (#269, obot.roadmap#402): a tab
// reads one number when every chart draws, the Data tab names the loaded
// study, and a one-line welcome on first open says whose data this is, how
// much is here and where to load your own.

// jsdom replaces the global URL, so the fixture path is built with node:path.
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../site/data');
const text = (file) => readFileSync(path.join(dataDir, file), 'utf8');
const PILOT = DEMO_STUDIES[0];
const files = (study) =>
  Object.fromEntries(study.files.map((name) => [`/demo/${study.dir}${name}`, name]));
// The demo studies, served from the repository's own files.
const served = { ...files(PILOT), ...files(DEMO_STUDIES[2]) };
const fetchText = (url) =>
  url in served ? Promise.resolve(text(served[url])) : Promise.reject(new Error(`no ${url}`));

const charts = Object.fromEntries(
  Object.values(manifest.modules).map((entry) => [
    entry.export,
    (element) => ({
      init() {
        element.innerHTML = '<canvas></canvas>';
      },
      destroy() {}
    })
  ])
);
const OWN = [
  { name: 'adsl.csv', text: 'USUBJID,ARM,SEX\n01,A,F\n02,B,M\n' },
  { name: 'notes.csv', text: 'a,b\n1,2\n' }
];

describe('the first screen: what a tab and the Data tab say', () => {
  let root;
  const tab = (domain) => root.querySelector(`.sva-tab[data-domain="${domain}"]`);
  const count = (domain) => tab(domain).querySelector('.sva-tab-count').textContent;
  const hex = (domain) => tab(domain).querySelector('.sva-hex').className;
  const dataTab = () => root.querySelector('.sva-item[data-view="data"] .sva-tag').textContent;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
  });

  it('APP-PAGE-032: a tab reads one number when every chart of it draws, "5 of 9" when some cannot, and "0" beside a hollow hex when none can (#269)', () => {
    expect(tabCount(9, 9)).toBe('9');
    expect(tabCount(1, 1)).toBe('1');
    expect(tabCount(5, 9)).toBe('5 of 9');
    expect(tabCount(0, 9)).toBe('0');
    expect(tabCount(0, 1)).toBe('0');

    const app = mountApp(root, { charts, manifest });
    // Nothing loaded: no chart can draw.
    expect(['bds', 'eg', 'ae'].map(count)).toEqual(['0', '0', '0']);
    expect(['bds', 'eg', 'ae'].map(hex)).toEqual(Array(3).fill('sva-hex sva-hollow'));
    // The pilot study: every chart draws.
    app.loadFiles(PILOT.files.map((name) => ({ name, text: text(name) })));
    expect(['bds', 'eg', 'ae'].map(count)).toEqual(['9', '1', '3']);
    expect(['bds', 'eg', 'ae'].map(hex)).toEqual(Array(3).fill('sva-hex'));
    // The full count is still said: the tab's tooltip, and the line kept for screen readers.
    expect(tab('bds').title).toBe('9 of 9 charts supported by the loaded data');
    expect(root.querySelector('.sva-count').textContent).toBe(
      '13 of 13 charts supported by the loaded data'
    );
    // The liver cohort's one labs file: some labs charts cannot draw, and no other can.
    app.loadFiles([{ name: 'adbds-abnbl.csv', text: text('adbds-abnbl.csv') }]);
    app.placeFileIn({ domain: 'subject' }, null);
    app.placeFileIn({ domain: 'ae' }, null);
    app.placeFileIn({ domain: 'eg' }, null);
    const status = app.status();
    const ready = Object.entries(manifest.modules).filter(
      ([module, entry]) => entry.domains[0] === 'bds' && status[module].state === 'ready'
    ).length;
    expect(ready).toBeGreaterThan(0);
    expect(ready).toBeLessThan(9);
    expect(count('bds')).toBe(`${ready} of 9`);
    expect(tab('bds').title).toBe(`${ready} of 9 charts supported by the loaded data`);
    expect(['eg', 'ae'].map(count)).toEqual(['0', '0']);
    expect(['eg', 'ae'].map(hex)).toEqual(Array(2).fill('sva-hex sva-hollow'));
    app.destroy();
  });

  it('APP-PAGE-033: the Data tab names the loaded study: a demo study by its name, a reader’s own files as "Your 3 files", and nothing as "no files" (#269)', async () => {
    expect(dataTag({ study: 'pilot', loaded: 4, studies: DEMO_STUDIES })).toBe('Pilot study');
    expect(dataTag({ study: 'rbqm', loaded: 9, studies: DEMO_STUDIES })).toBe('RBQM study');
    expect(dataTag({ study: null, loaded: 3, studies: DEMO_STUDIES })).toBe('Your 3 files');
    expect(dataTag({ study: null, loaded: 1, studies: DEMO_STUDIES })).toBe('Your 1 file');
    expect(dataTag({ study: null, loaded: 0, studies: DEMO_STUDIES })).toBe('no files');
    // A study the page was not handed is not named.
    expect(dataTag({ study: 'pilot', loaded: 4, studies: [] })).toBe('Your 4 files');

    const app = mountApp(root, { charts, manifest, demo: { base: '/demo/' }, fetchText });
    await app.ready;
    expect(dataTab()).toBe('Pilot study');
    await app.loadDemo('liver');
    expect(dataTab()).toBe('Liver cohort, labs only');
    // Files of the reader's own: counted, with the one that was placed in no domain left out.
    app.loadFiles(OWN);
    expect(dataTab()).toBe('Your 1 file');
    app.reset();
    expect(dataTab()).toBe('no files');
    app.destroy();
  });
});

describe('the first screen: the welcome line', () => {
  let root;
  const welcome = () => root.querySelector('.sva-welcome');
  const shown = () => Boolean(welcome()) && !welcome().hidden;
  const mount = (options = {}) =>
    mountApp(root, { charts, manifest, demo: { base: '/demo/' }, fetchText, ...options });
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('APP-PAGE-034: on first open one line says whose data this is, how much is here and where to load your own (#269)', async () => {
    expect(numberWord(5)).toBe('five');
    expect(numberWord(1)).toBe('one');
    expect(numberWord(12)).toBe('twelve');
    expect(numberWord(13)).toBe('13');
    expect(welcomeSentence({ whose: 'a study', participants: 254, charts: 18, tabs: 5 })).toEqual([
      'You are looking at a study: 254 participants, 18 charts on five tabs. To use your own files, open ',
      '. They are read in this browser and never leave it.'
    ]);
    // A count that is not known is left out, and one of anything is not plural.
    expect(welcomeSentence({ whose: 'a study', participants: null, charts: 1, tabs: 1 })[0]).toBe(
      'You are looking at a study: 1 chart on one tab. To use your own files, open '
    );
    expect(
      welcomeSentence({ whose: 'a study', participants: 1254, charts: 3, tabs: 2 })[0]
    ).toContain('1,254 participants, 3 charts on two tabs.');

    const app = mount();
    // Not while the study is still on its way.
    expect(shown()).toBe(false);
    await app.ready;
    expect(app.state.selected).toBe('histogram');
    expect(shown()).toBe(true);
    // 254 participants in the pilot study's subject-level file; thirteen charts on three tabs here.
    expect(welcome().querySelector('p').textContent).toBe(
      'You are looking at the CDISC pilot study, a public demo: 254 participants, 13 charts on three tabs. ' +
        'To use your own files, open Data. They are read in this browser and never leave it.'
    );
    const link = welcome().querySelector('a');
    expect(link.textContent).toBe('Data');
    expect(link.getAttribute('href')).toBe('#data');
    // It is the first thing of the main area, above the chart.
    expect(welcome().parentElement).toBe(root.querySelector('.sva-main'));
    expect(
      welcome().compareDocumentPosition(root.querySelector('.sva-content')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // On another chart it is still there; on the data view, where the files are loaded, it is not.
    app.select('ae-explorer');
    expect(shown()).toBe(true);
    app.select('data');
    expect(shown()).toBe(false);
    app.select('histogram');
    expect(shown()).toBe(true);
    app.destroy();
  });

  it('APP-PAGE-035: the welcome line closes with a cross, does not come back in that visit, and nothing is written to the browser’s storage (#269)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const app = mount();
    await app.ready;
    const close = welcome().querySelector('button');
    expect(close.getAttribute('aria-label')).toBe('Dismiss');
    expect(close.type).toBe('button');
    close.click();
    expect(shown()).toBe(false);
    // Not on another chart, not after the data view, not after the study is loaded again.
    app.select('ae-explorer');
    expect(shown()).toBe(false);
    app.select('data');
    app.select('histogram');
    expect(shown()).toBe(false);
    await app.loadDemo('pilot', { open: true });
    expect(shown()).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    app.destroy();
    setItem.mockRestore();
  });

  it('APP-PAGE-036: the welcome line is for the study the app opens on: it goes when another study or a reader’s own files are loaded, and a page with no demo study has none (#269)', async () => {
    const app = mount();
    await app.ready;
    expect(shown()).toBe(true);
    await app.loadDemo('liver', { open: true });
    expect(shown()).toBe(false);
    // And it does not come back with the first study.
    await app.loadDemo('pilot', { open: true });
    expect(shown()).toBe(false);
    app.destroy();

    const own = mount();
    await own.ready;
    own.loadFiles(OWN);
    own.select('histogram');
    expect(shown()).toBe(false);
    own.destroy();

    // The single file opens with no demo study: nothing to welcome a reader to.
    const empty = mountApp(root, { charts, manifest });
    expect(shown()).toBe(false);
    empty.loadFiles(PILOT.files.map((name) => ({ name, text: text(name) })));
    empty.select('histogram');
    expect(shown()).toBe(false);
    empty.destroy();
    // A first study that does not say whose it is has no line either.
    const [first, ...rest] = DEMO_STUDIES;
    const { whose: _whose, ...unnamed } = first;
    const plain = mount({ demo: { base: '/demo/', studies: [unnamed, ...rest] } });
    await plain.ready;
    expect(shown()).toBe(false);
    plain.destroy();
  });
});
