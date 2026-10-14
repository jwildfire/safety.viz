// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { DEMO_STUDIES } from '../../../src/app/studies.js';
import { dataTag, tabCount } from '../../../src/app/header.js';

// The first screen says where the reader is (#269, obot.roadmap#402): a tab
// reads one number when every chart draws, and the Data tab names the loaded
// study. The one-line welcome release 1.11.0 showed on first open is gone
// (#321, obot.roadmap#420): the app opens straight on its first chart.

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

describe('the first screen: no line on first open', () => {
  let root;
  const mount = (options = {}) =>
    mountApp(root, { charts, manifest, demo: { base: '/demo/' }, fetchText, ...options });
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('APP-PAGE-044: the app opens straight on its first chart: no line stands between the header and the view on first open, on any view or study, and nothing is written to the browser’s storage (#321)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const app = mount();
    await app.ready;
    const between = () =>
      [...root.querySelector('.sva-main').children].map((child) => child.className);
    // The heading kept for a screen reader, then the view: nothing else.
    expect(app.state.selected).toBe('histogram');
    expect(between()).toEqual(['sva-sechead', 'sva-content']);
    expect(root.querySelector('.sva-welcome')).toBeNull();
    expect(root.querySelector('.sva-main').textContent).not.toContain('You are looking at');
    expect('welcome' in app.state).toBe(false);
    for (const view of ['ae-explorer', 'qt-explorer', 'data', 'histogram']) {
      app.select(view);
      expect(between(), view).toEqual(['sva-sechead', 'sva-content']);
    }
    // The Data tab still says whose data is loaded.
    expect(root.querySelector('.sva-item[data-view="data"] .sva-tag').textContent).toBe(
      'Pilot study'
    );
    // No study carries the phrase the line was built from.
    for (const study of DEMO_STUDIES) expect('whose' in study, study.id).toBe(false);
    // Another study, and a reader's own files: the same.
    await app.loadDemo('liver', { open: true });
    expect(between()).toEqual(['sva-sechead', 'sva-content']);
    app.loadFiles(OWN);
    app.select('histogram');
    expect(between()).toEqual(['sva-sechead', 'sva-content']);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    app.destroy();
    setItem.mockRestore();
  });
});
