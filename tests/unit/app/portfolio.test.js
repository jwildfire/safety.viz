// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { STUDIES_VIEW_ID } from '../../../src/app/portfolio.js';
import { loadedStudy } from '../../../src/app/viewer-view.js';

// The studies a reader has: a chip in the header naming the one in use, the
// list under it, the i beside it, the Studies view, and the data view's second
// face, where study.viewer looks through the loaded study. All of it is asked
// for by the page (`portfolio: true`, `viewer`); a page that asks for none of
// it is as it was.

const DM = { name: 'dm.csv', text: 'USUBJID,ARM,SEX\nS1,A,F\nS2,B,M\n' };
const DEMO = [
  { id: 'one', label: 'Study one', description: 'The first.', files: ['dm.csv'], dir: '' },
  { id: 'two', label: 'Study two', description: 'The second.', files: ['dm.csv'], dir: 'two/' }
];

let app = null;
afterEach(() => {
  if (app) app.destroy();
  app = null;
  document.body.innerHTML = '';
  delete globalThis.StudyViewer;
  delete globalThis.StudyBuilder;
});

function mounted(options = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  app = mountApp('#app', {
    charts: {},
    manifest,
    portfolio: true,
    demo: { base: './', studies: DEMO },
    fetchText: async () => DM.text,
    ...options
  });
  return app;
}
const q = (selector) => document.querySelector(selector);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a page that does not ask', () => {
  it('has no chip, no Studies tab and no second face of the data view', () => {
    mounted({ portfolio: false });
    app.loadFiles([DM]);
    expect(q('.sva-chip-slot')).toBeNull();
    expect(q(`[data-tab="${STUDIES_VIEW_ID}"]`)).toBeNull();
    expect(q('.sva-faces')).toBeNull();
  });
});

describe('the study chip', () => {
  it('names the study in use, and lists every study under it: the one in use ticked, another opened by a press', async () => {
    mounted();
    await app.loadDemo('one');
    const chip = q('[data-action="study-chip"]');
    expect(chip.textContent).toBe('Study one▾');
    expect(q('.sva-chip-pop')).toBeNull();
    chip.click();
    expect(q('[data-action="study-chip"]').getAttribute('aria-expanded')).toBe('true');
    const items = [...document.querySelectorAll('.sva-chip-item')];
    expect(items.map((item) => item.dataset.study)).toEqual(['demo:one', 'demo:two']);
    expect(items[0].getAttribute('aria-current')).toBe('true');
    items[1].click();
    await app.ready;
    expect(app.state.study).toBe('two');
    expect(q('[data-action="study-chip"]').textContent).toBe('Study two▾');
    expect(q('.sva-chip-pop')).toBeNull();
  });

  it('calls a reader’s own files Your files, and a study that says its name by it', () => {
    mounted({ demo: null });
    expect(q('[data-action="study-chip"]').textContent).toBe('No study▾');
    expect(q('[data-action="study-info"]')).toBeNull();
    app.loadFiles([DM]);
    expect(q('[data-action="study-chip"]').textContent).toBe('Your files▾');
    app.loadFiles([DM], {
      as: { id: 'x', name: 'READY-P2', kind: 'Simulated', facts: [{ label: 'Phase', value: 'P2' }] }
    });
    expect(q('[data-action="study-chip"]').textContent).toBe('READY-P2▾');
    // The tab beside the chip does not say the study's name again.
    expect(q('.sva-item[data-view="data"]').textContent).toBe('Overview');
    // Files of the reader's own are no longer that study.
    app.loadFiles([DM]);
    expect(app.state.named).toBeNull();
    expect(q('[data-action="study-chip"]').textContent).toBe('Your files▾');
  });

  it('the i beside it says what the study is, and Escape closes what is open', () => {
    mounted({ demo: null });
    app.loadFiles([DM], {
      as: {
        id: 'x',
        name: 'READY-P2',
        kind: 'Simulated',
        about: 'Every row is synthetic.',
        facts: [{ label: 'Phase', value: 'P2' }]
      }
    });
    q('[data-action="study-info"]').click();
    const card = q('.sva-chip-card');
    expect(card.getAttribute('aria-label')).toBe('About READY-P2');
    expect([...card.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Phase',
      'Files',
      'Supports'
    ]);
    expect(card.textContent).toContain('Every row is synthetic.');
    q('.sva-chip-slot').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(q('.sva-chip-pop')).toBeNull();
  });

  it('Add a study and All studies both open the Studies view', async () => {
    mounted();
    await app.loadDemo('one');
    q('[data-action="study-chip"]').click();
    q('[data-action="add-study"]').click();
    expect(app.state.selected).toBe(STUDIES_VIEW_ID);
  });

  /** A source whose one study says what the test tells it to while it opens. */
  function saying() {
    const said = { busy: '', problem: '' };
    const library = {
      name: 'sim',
      source: {
        id: 'sim',
        label: 'Simulate',
        render() {},
        studies: {
          list: () => ({
            studies: [{ id: 'preset:a', name: 'READY-A', kind: 'Simulated', open: () => {} }],
            ...said
          })
        }
      }
    };
    return { said, library };
  }
  const under = () => q('.sva-chip-slot .sva-chip-said');

  it('APP-PAGE-045: a study that does not open is said under the chip, where the reader is, until they close it; while a study chosen from the list opens, the chip says so; the Studies view says both in its own list (#407)', async () => {
    const { said, library } = saying();
    mounted({ libraries: [library] });
    await app.loadDemo('one');
    expect(under()).toBeNull();
    // A sentence said while nothing was asked of the list stays in the list.
    said.busy = 'Looking for studies…';
    app.retag();
    expect(under()).toBeNull();
    q('[data-action="study-chip"]').click();
    expect(q('.sva-chip-menu [role="status"]').textContent).toBe('Looking for studies…');
    said.busy = '';
    app.retag();
    // The reader chooses the study: while it opens the chip says so.
    said.busy = 'Opening READY-A…';
    q('.sva-chip-item[data-study="preset:a"]').click();
    app.retag();
    expect(q('.sva-chip-menu')).toBeNull();
    expect(under().textContent).toBe('Opening READY-A…');
    expect(under().getAttribute('role')).toBe('status');
    // It does not open: the sentence is under the chip, on the tab the reader is on.
    said.busy = '';
    said.problem = 'READY-A could not be fetched.';
    app.retag();
    expect(app.state.selected).not.toBe(STUDIES_VIEW_ID);
    expect(under().textContent).toBe('READY-A could not be fetched.');
    expect(under().getAttribute('role')).toBe('alert');
    // Closed, it is not said again; the next one is.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(under()).toBeNull();
    app.retag();
    expect(under()).toBeNull();
    said.problem = '';
    app.retag();
    said.problem = 'READY-A could not be fetched.';
    app.retag();
    expect(under().textContent).toBe('READY-A could not be fetched.');
    // On the Studies view the list says it, and the chip does not say it twice.
    app.select(STUDIES_VIEW_ID);
    expect(under()).toBeNull();
    expect(q('.sva-studies [role="alert"]').textContent).toBe('READY-A could not be fetched.');
  });

  it('APP-PAGE-047: the list and the i’s card close on a click anywhere else on the page, on Escape wherever the keyboard is, and when the reader moves to another tab; a click inside leaves them open (#407)', async () => {
    mounted();
    await app.loadDemo('one');
    const open = (action) => {
      q(`[data-action="${action}"]`).click();
      expect(q('.sva-chip-pop')).not.toBeNull();
    };
    for (const action of ['study-chip', 'study-info']) {
      // A click inside what is open leaves it open.
      open(action);
      q('.sva-chip-pop').click();
      expect(q('.sva-chip-pop')).not.toBeNull();
      // A click anywhere else closes it.
      q('.sva-main').click();
      expect(q('.sva-chip-pop')).toBeNull();
      expect(app.state.chip).toBeNull();
      // Escape closes it with the keyboard outside the chip.
      open(action);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(q('.sva-chip-pop')).toBeNull();
      // So does moving to another tab.
      open(action);
      app.select(STUDIES_VIEW_ID);
      expect(q('.sva-chip-pop')).toBeNull();
      expect(q('[data-action="study-chip"]').getAttribute('aria-expanded')).toBe('false');
      app.select('data');
    }
    // The chip itself still opens and closes its list.
    open('study-chip');
    q('[data-action="study-chip"]').click();
    expect(q('.sva-chip-pop')).toBeNull();
  });
});

describe('the Studies view', () => {
  it('lists every study with the one in use marked, opens another, and offers the ways to add one, a source’s among them', async () => {
    const open = vi.fn();
    const remove = vi.fn();
    const run = vi.fn();
    mounted({
      libraries: [
        {
          name: 'sim',
          source: {
            id: 'sim',
            label: 'Simulate',
            render() {},
            studies: {
              list: () => ({
                studies: [
                  {
                    id: 'preset:a',
                    name: 'READY-A',
                    kind: 'Simulated',
                    size: '40 participants',
                    open,
                    remove
                  }
                ]
              }),
              add: [
                {
                  id: 'describe',
                  label: 'Describe a simulated study',
                  about: 'Phase and size.',
                  action: 'Describe a study',
                  run
                }
              ]
            }
          }
        }
      ]
    });
    await app.loadDemo('one');
    app.select(STUDIES_VIEW_ID);
    // The Studies view has no tab of its own: the chip leads to it.
    expect(q(`[data-tab="${STUDIES_VIEW_ID}"]`)).toBeNull();
    const rows = [...document.querySelectorAll('.sva-studies-row[data-study]')];
    expect(rows.map((row) => row.dataset.study)).toEqual(['demo:one', 'demo:two', 'preset:a']);
    expect(rows[0].dataset.current).toBe('true');
    expect(rows[0].querySelector('[data-action="open"]')).toBeNull();
    rows[2].querySelector('[data-action="remove"]').click();
    rows[2].querySelector('[data-action="open"]').click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect([...document.querySelectorAll('[data-add]')].map((way) => way.dataset.add)).toEqual([
      'files',
      'describe'
    ]);
    q('[data-add="describe"]').click();
    expect(run).toHaveBeenCalledWith(app);
    // A source's study that is the one loaded is the one in use.
    app.loadFiles([DM], { as: { id: 'preset:a', name: 'READY-A', kind: 'Simulated' } });
    app.select(STUDIES_VIEW_ID);
    expect(q('.sva-studies-row[data-current]').dataset.study).toBe('preset:a');
    expect(document.querySelectorAll('.sva-studies-row[data-study]')).toHaveLength(3);
  });
});

// A study replaces the one before it, whatever kind either is (#405). Each
// test reads what is loaded from the app's own state: the files placed in a
// domain, the files set aside and gsm's raw files, each with its rows.
describe('a study in place of the one before it', () => {
  const fixture = (name) => ({
    name,
    text: readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/app', name),
      'utf8'
    )
  });
  const NOTES = fixture('site_notes.csv');
  const RAW_SUBJ = { name: 'Raw_SUBJ.csv', text: 'studyid,subjid,invid\nA,S1,SITE1\nA,S2,SITE1\n' };
  const RAW_SITE = { name: 'Raw_SITE.csv', text: 'studyid,invid\nA,SITE1\n' };
  const MAPPING = {
    name: 'safety-viz-mapping.json',
    text: JSON.stringify({ safetyVizMapping: 1, domains: { subject: { file: 'dm.csv' } } })
  };
  // Two simulated studies. The second has fewer files than the first, and a
  // participants file of the same name with other rows.
  const A = {
    as: () => ({ id: 'preset:a', name: 'READY-A', kind: 'Simulated' }),
    raw: [RAW_SUBJ, RAW_SITE],
    standard: [fixture('dm.csv'), fixture('ae.csv')]
  };
  const B = {
    as: () => ({ id: 'preset:b', name: 'READY-B', kind: 'Simulated' }),
    raw: [],
    standard: [DM]
  };
  /** Hand a study over as study.builder's source does: its raw files, then its standard files, under one name. */
  const hand = (study) => {
    const as = study.as();
    app.loadRaw(study.raw, { as });
    app.loadFiles(study.standard, { as });
  };
  const loaded = () => ({
    chip: q('.sva-chip-name').textContent,
    placed: Object.fromEntries(
      Object.entries(app.state.files).map(([domain, file]) => [
        domain,
        `${file.name}: ${file.rows.length}`
      ])
    ),
    setAside: app.state.unplaced.map((item) => item.file.name),
    raw: app.state.raw.map((file) => `${file.name}: ${file.rows}`)
  });
  const notes = () => [...document.querySelectorAll('.sva-note')].map((node) => node.textContent);
  const READY_A = {
    chip: 'READY-A',
    placed: { subject: 'dm.csv: 24', ae: 'ae.csv: 136' },
    setAside: [],
    raw: ['Raw_SUBJ.csv: 2', 'Raw_SITE.csv: 1']
  };
  const READY_B = { chip: 'READY-B', placed: { subject: 'dm.csv: 2' }, setAside: [], raw: [] };

  it('APP-LOAD-029: a study that says what it is replaces a reader’s own files, placed and set aside, and the mapping file held for them; both parts of it stay, its raw files and its standard files (#405)', () => {
    mounted({ demo: null });
    app.loadFiles([MAPPING, DM, NOTES]);
    expect(loaded()).toEqual({
      chip: 'Your files',
      placed: { subject: 'dm.csv: 2' },
      setAside: ['site_notes.csv'],
      raw: []
    });
    expect(app.state.saved).not.toBeNull();
    hand(A);
    expect(loaded()).toEqual(READY_A);
    expect(app.state.saved).toBeNull();
    expect(notes()).toEqual([]);
  });

  it('APP-LOAD-029: a simulated study replaces the study before it, a demo study or a simulated one, with its raw files and the files the next one does not have; so does the same study handed over again; and a demo study replaces a simulated one (#405)', async () => {
    mounted();
    await app.loadDemo('one');
    const demo = (chip) => ({ chip, placed: { subject: 'dm.csv: 2' }, setAside: [], raw: [] });
    expect(loaded()).toEqual(demo('Study one'));
    hand(A);
    expect(loaded()).toEqual(READY_A);
    expect(app.state.study).toBeNull();
    hand(B);
    expect(loaded()).toEqual(READY_B);
    hand(A);
    expect(loaded()).toEqual(READY_A);
    // Handed over again under the same name with fewer files, it is what was handed over last.
    hand({ ...A, raw: [RAW_SUBJ], standard: [DM] });
    expect(loaded()).toEqual({
      chip: 'READY-A',
      placed: { subject: 'dm.csv: 2' },
      setAside: [],
      raw: ['Raw_SUBJ.csv: 2']
    });
    await app.loadDemo('two');
    expect(loaded()).toEqual(demo('Study two'));
    expect(app.state.named).toBeNull();
  });

  it('APP-LOAD-029: files of a reader’s own replace a simulated study whole and say so, and join files of the reader’s own; a mapping file alone leaves the study what it was (#405)', () => {
    mounted({ demo: null });
    hand(A);
    // A mapping file brings no data: the study in use is still the study.
    app.loadFiles([MAPPING]);
    expect(loaded()).toEqual(READY_A);
    app.loadFiles([DM]);
    expect(loaded()).toEqual({
      chip: 'Your files',
      placed: { subject: 'dm.csv: 2' },
      setAside: [],
      raw: []
    });
    expect(notes()).toContain('READY-A was cleared to load your files.');
    // A second file of the reader's own joins the first, and nothing is cleared for it.
    app.loadFiles([NOTES]);
    expect(loaded()).toMatchObject({
      chip: 'Your files',
      placed: { subject: 'dm.csv: 2' },
      setAside: ['site_notes.csv']
    });
    expect(notes().join(' ')).not.toContain('was cleared');
  });
});

describe('the data view’s second face', () => {
  const viewer = { url: './study.viewer.js', global: 'StudyViewer' };

  it('is the face the data view opens on once files are loaded, on a page that serves the viewer: study.viewer on the loaded files, with what the data supports and the study’s actions above it', async () => {
    const mount = vi.fn((target) => {
      target.append('the viewer');
    });
    globalThis.StudyViewer = { mount, fromBuilt: (built) => ({ name: built.id, tables: [] }) };
    mounted({ demo: null, viewer });
    expect(q('.sva-faces')).toBeNull();
    app.loadFiles([DM]);
    await settle();
    expect([...document.querySelectorAll('.sva-face')].map((face) => face.textContent)).toEqual([
      'Explore the data',
      'Files'
    ]);
    expect(q('[data-action="explore"]').getAttribute('aria-selected')).toBe('true');
    expect(q('.sva-explore-body').textContent).toBe('the viewer');
    expect(q('.sva-data').classList.contains('sva-data-wide')).toBe(true);
    expect(
      [...document.querySelectorAll('.sva-explore-acts button')].map((act) => act.dataset.action)
    ).toEqual(['choose-files', 'download']);
    const { study } = mount.mock.calls[0][1];
    expect(study.name).toBe('Your files');
    expect(study.tables.map((table) => [table.id, table.group])).toEqual([
      ['dm.csv', 'Placed in a domain']
    ]);
    expect(study.tables[0].columns.find((column) => column.name === 'USUBJID')).toMatchObject({
      role: 'participant'
    });
    // A study that brings its own layers is handed over whole.
    app.loadFiles([DM], { as: { id: 'x', name: 'BUILT', built: { id: 'BUILT' } } });
    await settle();
    expect(mount.mock.calls.at(-1)[1].study).toEqual({ name: 'BUILT', tables: [] });
    // The other face is the files, one by one, as the data view was.
    q('[data-action="files"]').click();
    expect(q('.sva-explore-body')).toBeNull();
    expect(q('.sva-file')).not.toBeNull();
  });

  it('draws a study study.builder built with study.builder’s own study view when the page has it, told to leave out its RBQM and Safety views since the app has tabs of its own for both, and opens it again where the reader was', async () => {
    const destroy = vi.fn();
    const mountStudy = vi.fn((target) => {
      target.append('the study view');
      return { destroy };
    });
    const mount = vi.fn();
    globalThis.StudyViewer = { mount };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const built = { id: 'BUILT' };
    app.loadFiles([DM], { as: { id: 'x', name: 'BUILT', built } });
    await settle();
    expect(q('.sva-explore-body').textContent).toBe('the study view');
    // The study view is the first face; the files one by one are the other (#405).
    expect(q('[data-action="explore"]').getAttribute('aria-selected')).toBe('true');
    expect(q('[data-action="files"]').getAttribute('aria-selected')).toBe('false');
    expect(mount).not.toHaveBeenCalled();
    const options = mountStudy.mock.calls.at(-1)[1];
    expect(options.study).toBe(built);
    expect(options.operations).toBe(false);
    expect(options.viewing).toBeNull();
    // The view the reader moves to is where the next draw of the page opens.
    const drawn = mountStudy.mock.calls.length;
    options.onView({ view: 'adverse', table: 'adam:ADAE' });
    app.select('data');
    expect(mountStudy.mock.calls.length).toBe(drawn + 1);
    expect(destroy).toHaveBeenCalled();
    const again = mountStudy.mock.calls.at(-1)[1];
    expect(again.viewing).toEqual({ view: 'adverse', table: 'adam:ADAE' });
    expect(again.operations).toBe(false);
  });

  it('APP-LOAD-030: with a study study.builder built in use, the Files face is in reach beside the study view and has the file picker and Reset; Choose files on the Studies view opens the picker; and Reset clears the study as it clears a demo study (#405)', async () => {
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = {
      mountStudy: vi.fn((target) => {
        target.append('the study view');
        return { destroy() {} };
      })
    };
    mounted({ demo: null, viewer });
    app.loadFiles([DM], {
      as: { id: 'x', name: 'BUILT', kind: 'Simulated', built: { id: 'BUILT' } }
    });
    await settle();
    expect(q('.sva-explore-body').textContent).toBe('the study view');
    // The other face is the files, one by one, with the ways to load and to clear.
    q('[data-action="files"]').click();
    expect(q('.sva-explore-body')).toBeNull();
    expect(q('[data-action="files"]').getAttribute('aria-selected')).toBe('true');
    expect(
      [...document.querySelectorAll('.sva-loaded-name')].map((name) => name.textContent)
    ).toEqual(['dm.csv']);
    expect(q('.sva-side [data-action="choose-files"]')).not.toBeNull();
    expect(q('.sva-data input[type="file"]')).not.toBeNull();
    expect(q('.sva-side [data-action="reset"]')).not.toBeNull();
    // Back on the study view, Choose files on the Studies view still finds the picker.
    q('[data-action="explore"]').click();
    expect(q('.sva-data input[type="file"]')).toBeNull();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    app.select(STUDIES_VIEW_ID);
    q('[data-add="files"]').click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toBe(q('.sva-data input[type="file"]'));
    click.mockRestore();
    // Reset: nothing is loaded, no study is named, and the drop zone is back.
    q('.sva-side [data-action="reset"]').click();
    expect(app.state.named).toBeNull();
    expect(app.state.files).toEqual({});
    expect(q('.sva-chip-name').textContent).toBe('No study');
    expect(q('.sva-faces')).toBeNull();
    expect(q('.sva-drop')).not.toBeNull();
  });

  // A study study.builder built that kept its snapshots, as its `studyOf`
  // gives one: `history` oldest first, the last being the study itself, and
  // `at(date)`, the study as it stood then, with the files a page loads.
  const people = (count) =>
    Array.from({ length: count }, (_, index) => `S${index + 1},A,F`).join('\n');
  function keptStudy(id, dates, { scores = false } = {}) {
    const snapshot = (date, number) => ({
      id,
      snapshotDate: date,
      snapshotNumber: number,
      standard: [
        { id: 'subject', name: 'adsl.csv' },
        ...(scores ? [{ id: 'qs', name: 'adqs.csv' }] : [])
      ],
      files: () => ({
        raw: [
          { name: 'Raw_SUBJ.csv', text: `subjid,invid\n${people(number)}\n` },
          // No adverse event had been reported by the first snapshot.
          ...(number > 1 ? [{ name: 'Raw_AE.csv', text: `subjid,aeser\n${people(number)}\n` }] : [])
        ],
        standard: [
          { name: 'adsl.csv', text: `USUBJID,ARM,SEX\n${people(number)}\n` },
          ...(number > 1
            ? [{ name: 'adae.csv', text: `USUBJID,AESEQ,AEBODSYS,AEDECOD\nS1,1,Body,Term\n` }]
            : []),
          ...(scores
            ? [
                {
                  name: 'adqs.csv',
                  text:
                    'USUBJID,ARM,VISIT,VISITNUM,TEST,STRESN,BASE,CHG,ABLFL,DY\n' +
                    'S1,A,Baseline,1,ADAS-Cog (11),24,24,0,Y,1\n'
                }
              ]
            : [])
        ]
      })
    });
    const all = dates.map((date, index) => snapshot(date, index + 1));
    const built = all[all.length - 1];
    built.history = all.map((one) => ({
      date: one.snapshotDate,
      number: one.snapshotNumber,
      problem: null,
      study: () => one
    }));
    built.at = (date) => all.find((one) => one.snapshotDate === date) || null;
    return built;
  }
  /** Hand a built study to the app as builder-view.js does. */
  function handOver(built, id) {
    const as = { id, name: built.id, kind: 'Simulated', built };
    app.loadRaw(built.files().raw, { as });
    app.loadFiles(built.files().standard, { notes: [], as });
  }
  const studyChip = () => q('[data-action="study-chip"]');

  it('APP-STUDY-001: a snapshot chosen on the study view is the one the app holds: the charts’ files and gsm’s raw files become that snapshot’s, read from the study with no R; a file the snapshot does not have does not stay behind, and an efficacy score is still left out; a move within the snapshot loads nothing (#406)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29', '2012-03-31'], { scores: true });
    handOver(built, 'preset:kept');
    await settle();
    const rowsHeld = () => ({
      participants: app.state.files.subject.rows.length,
      placed: Object.values(app.state.files)
        .map((file) => file.name)
        .sort(),
      raw: app.state.raw.map((file) => [file.name, file.rows])
    });
    expect(rowsHeld()).toEqual({
      participants: 3,
      placed: ['adae.csv', 'adqs.csv', 'adsl.csv'],
      raw: [
        ['Raw_SUBJ.csv', 3],
        ['Raw_AE.csv', 3]
      ]
    });
    // The reader chooses the first snapshot on the study view.
    const drawn = mountStudy.mock.calls.length;
    mountStudy.mock.calls.at(-1)[1].onView({ view: 'overview', snapshot: '2012-01-31' });
    await settle();
    expect(rowsHeld()).toEqual({
      participants: 1,
      placed: ['adsl.csv'],
      raw: [['Raw_SUBJ.csv', 1]]
    });
    expect(app.state.unplaced).toEqual([]);
    expect(app.state.notes).toEqual([]);
    // It is still the same study, whole, and the study view opens where the reader was.
    expect(app.state.named).toMatchObject({ id: 'preset:kept', name: 'KEPT', built });
    expect(app.state.selected).toBe('data');
    expect(mountStudy.mock.calls.length).toBeGreaterThan(drawn);
    const again = mountStudy.mock.calls.at(-1)[1];
    expect(again.study).toBe(built);
    expect(again.viewing).toEqual({ view: 'overview', snapshot: '2012-01-31' });
    // A move to another view of the same snapshot keeps the place and loads nothing.
    const settledAt = mountStudy.mock.calls.length;
    again.onView({ view: 'tables', table: 'adam:ADSL', snapshot: '2012-01-31' });
    await settle();
    expect(mountStudy.mock.calls.length).toBe(settledAt);
    expect(app.state.viewing).toEqual({
      view: 'tables',
      table: 'adam:ADSL',
      snapshot: '2012-01-31'
    });
    // The second snapshot has adverse events again; its score is left out as a study’s is.
    again.onView({ view: 'tables', table: 'adam:ADSL', snapshot: '2012-02-29' });
    await settle();
    expect(rowsHeld()).toEqual({
      participants: 2,
      placed: ['adae.csv', 'adsl.csv'],
      raw: [
        ['Raw_SUBJ.csv', 2],
        ['Raw_AE.csv', 2]
      ]
    });
    expect(app.state.unplaced.map((item) => item.file.name)).toEqual([]);
  });

  it('APP-STUDY-002: a study opens on its own last snapshot: the study view is opened there, and a snapshot chosen in one study is not carried to the next, even where the next has one of the same date (#406)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const opened = () => mountStudy.mock.calls.at(-1)[1];
    const first = keptStudy('FIRST', ['2012-01-31', '2012-02-29']);
    handOver(first, 'preset:first');
    await settle();
    expect(opened().viewing).toEqual({ snapshot: '2012-02-29' });
    opened().onView({ view: 'overview', snapshot: '2012-01-31' });
    await settle();
    expect(opened().viewing).toEqual({ view: 'overview', snapshot: '2012-01-31' });
    // Another study, which has a snapshot of that date and two after it.
    const second = keptStudy('SECOND', ['2012-01-31', '2012-02-29', '2012-03-31']);
    handOver(second, 'preset:second');
    await settle();
    expect(opened().study).toBe(second);
    expect(opened().viewing).toEqual({ view: 'overview', snapshot: '2012-03-31' });
    expect(app.state.files.subject.rows).toHaveLength(3);
    // A study that kept no snapshots is handed none to open at.
    handOver({ id: 'PLAIN', files: () => first.files() }, 'preset:plain');
    await settle();
    expect(opened().viewing).toEqual({ view: 'overview' });
  });

  it('APP-STUDY-003: the study chip says which snapshot the page draws, under the study’s name on every tab, and the i’s card says its date; a study with no snapshots to choose from says nothing of one (#406)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29', '2012-03-31']);
    handOver(built, 'preset:kept');
    await settle();
    expect(q('.sva-chip-name').textContent).toBe('KEPT');
    expect(q('.sva-chip-snap').textContent).toBe('Snapshot 3 of 3');
    expect(studyChip().getAttribute('aria-label')).toBe('KEPT, snapshot 3 of 3, 2012-03-31');
    mountStudy.mock.calls.at(-1)[1].onView({ view: 'overview', snapshot: '2012-01-31' });
    await settle();
    expect(q('.sva-chip-snap').textContent).toBe('Snapshot 1 of 3');
    // On another tab the chip still says it.
    app.select(STUDIES_VIEW_ID);
    expect(q('.sva-chip-snap').textContent).toBe('Snapshot 1 of 3');
    expect(studyChip().getAttribute('aria-label')).toBe('KEPT, snapshot 1 of 3, 2012-01-31');
    q('[data-action="study-info"]').click();
    const facts = [...q('.sva-chip-card').querySelectorAll('dt')].map((term) => [
      term.textContent,
      term.nextElementSibling.textContent
    ]);
    expect(facts).toContainEqual(['Snapshot drawn', '2012-01-31 · 1 of 3']);
    // A study with one snapshot, and a reader's own files, say nothing of one.
    handOver({ id: 'PLAIN', files: () => built.files() }, 'preset:plain');
    expect(q('.sva-chip-snap')).toBeNull();
    expect(studyChip().textContent).toBe('PLAIN▾');
    expect(studyChip().hasAttribute('aria-label')).toBe(false);
    app.loadFiles([DM]);
    expect(q('.sva-chip-snap')).toBeNull();
  });

  it('hands the viewer each placed file’s mapping as roles, and a role set in the viewer sets the app’s mapping', async () => {
    const mount = vi.fn();
    globalThis.StudyViewer = { mount };
    mounted({ demo: null, viewer });
    // The renamed-column study's participants file: its arm is called TREATMENT.
    const renamed = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/app/dm.csv'),
      'utf8'
    );
    app.loadFiles([{ name: 'dm.csv', text: renamed }]);
    await settle();
    const options = mount.mock.calls.at(-1)[1];
    const [table] = options.study.tables;
    const arm = table.roles.find((role) => role.id === 'column|subject|ARM');
    expect(arm).toMatchObject({ kind: 'column', value: '' });
    expect(arm.options).toContain('TREATMENT');
    expect(table.roles.find((role) => role.id === 'column|subject|USUBJID').value).not.toBe('');
    options.onRole(table, arm, 'TREATMENT');
    await settle();
    expect(app.state.mappings.subject.columns.ARM.value).toBe('TREATMENT');
    const again = mount.mock.calls.at(-1)[1].study.tables[0];
    expect(again.roles.find((role) => role.id === 'column|subject|ARM').value).toBe('TREATMENT');
  });

  it('says so when the viewer’s script does not load', async () => {
    mounted({ demo: null, viewer });
    app.loadFiles([DM]);
    document.head.querySelector('script[src="./study.viewer.js"]').onerror();
    await settle();
    expect(q('.sva-explore-body [role="alert"]').textContent).toBe(
      'The viewer cannot be shown: ./study.viewer.js did not load on this page.'
    );
    document.head.querySelectorAll('script').forEach((script) => script.remove());
  });

  it('APP-LIB-039: the viewer of one visit to the Overview is released when the next is drawn, so twenty visits hold one viewer and not twenty; a study view study.builder draws releases it too, and is released in its turn (#408)', async () => {
    const live = new Set();
    const mount = vi.fn(() => {
      const handle = { destroy: vi.fn(() => live.delete(handle)) };
      live.add(handle);
      return handle;
    });
    globalThis.StudyViewer = { mount };
    mounted({ demo: null, viewer });
    app.loadFiles([DM]);
    await settle();
    expect(mount).toHaveBeenCalledTimes(1);
    for (let visit = 0; visit < 20; visit += 1) {
      app.select(STUDIES_VIEW_ID);
      app.select('data');
      await settle();
    }
    expect(mount).toHaveBeenCalledTimes(21);
    expect(live.size).toBe(1);
    // The one held is the one on the page.
    expect(mount.mock.results.at(-1).value.destroy).not.toHaveBeenCalled();
    // A study study.builder built is drawn by its study view, which takes the viewer's place.
    const studyView = { destroy: vi.fn() };
    globalThis.StudyBuilder = { mountStudy: vi.fn(() => studyView) };
    app.loadFiles([DM], { as: { id: 'x', name: 'BUILT', built: { id: 'BUILT' } } });
    await settle();
    expect(live.size).toBe(0);
    expect(studyView.destroy).not.toHaveBeenCalled();
    // And the reader's own files after it release the study view.
    delete globalThis.StudyBuilder;
    app.loadFiles([DM]);
    await settle();
    expect(studyView.destroy).toHaveBeenCalledTimes(1);
    expect(live.size).toBe(1);
  });

  it('APP-LIB-040: study.viewer’s script is fetched the first time the data view draws a loaded study, which on a page that loads a demo study as it opens is as the page opens, with nothing pressed; it is fetched once, however many times the Overview is opened (#408)', async () => {
    const asked = () => document.head.querySelectorAll('script[src="./study.viewer.js"]').length;
    // A page with no study yet has asked for nothing.
    mounted({ demo: null, viewer });
    expect(asked()).toBe(0);
    app.destroy();
    // A page that loads a demo study as it opens: the data view is drawn with
    // the study on the way to the first view, and the script is asked for then.
    mounted({ viewer });
    await app.ready;
    expect(asked()).toBe(1);
    for (let visit = 0; visit < 3; visit += 1) {
      app.select(STUDIES_VIEW_ID);
      app.select('data');
    }
    app.loadFiles([DM]);
    expect(asked()).toBe(1);
    document.head.querySelectorAll('script').forEach((script) => script.remove());
  });

  it('reads the loaded files as tables: placed, set aside, and gsm’s raw files', () => {
    mounted({ demo: null });
    app.loadFiles([DM, { name: 'notes.csv', text: 'A,B\n1,2\n' }]);
    app.loadRaw([{ name: 'Raw_SITE.csv', text: 'invid\nS1\n' }]);
    const study = loadedStudy(app, 'Mine');
    expect(study.tables.map((table) => table.group)).toEqual(
      expect.arrayContaining(['gsm raw files'])
    );
    expect(study.tables.find((table) => table.id === 'Raw_SITE.csv')).toMatchObject({
      text: 'invid\nS1\n',
      rows: 1
    });
  });
});
