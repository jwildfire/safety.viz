// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { STUDIES_VIEW_ID } from '../../../src/app/portfolio.js';
import { loadedStudy } from '../../../src/app/viewer-view.js';
import { STYLES } from '../../../src/app/styles.js';

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
    // A simulated study says so under its name (#427).
    expect(q('[data-action="study-chip"]').textContent).toBe('READY-P2Simulated▾');
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

  it('APP-PAGE-049: the chip carries the study’s whole name on hover, where the header may cut it short, and the rules that keep the header to one row start at 1,200 pixels, so none of them reaches a narrower page (#416)', async () => {
    mounted({ demo: null });
    const chip = () => q('[data-action="study-chip"]');
    // With no study there is no name to cut.
    expect(chip().hasAttribute('title')).toBe(false);
    app.loadFiles([DM]);
    expect(chip().title).toBe('Your files');
    const long = 'A study whose name is longer than its chip';
    app.loadFiles([DM], { as: { id: 'x', name: long, kind: 'Simulated' } });
    expect(q('.sva-chip-name').textContent).toBe(long);
    // A simulated study's hover line says so after the name (#427).
    expect(chip().title).toBe(`${long}, a simulated study`);
    // The name is also in the list and in the i's card, as before.
    chip().click();
    expect(q('.sva-chip-item[aria-current="true"] .sva-chip-study').textContent).toBe(long);
    q('[data-action="study-info"]').click();
    expect(q('.sva-chip-cardhead strong').textContent).toBe(long);

    // The stylesheet: what is new is inside the two blocks for wide pages.
    const blocks = STYLES.split('@media ').slice(1);
    const from1200 = blocks.find((block) => block.startsWith('(min-width:1200px){'));
    expect(from1200).toContain('.sva-chip-slot{flex:1 1 7rem;min-width:0;max-width:max-content}');
    expect(from1200).toContain('.sva-studychip{flex:0 1 auto;min-width:0}');
    const to1439 = blocks.find((block) =>
      block.startsWith('(min-width:1200px) and (max-width:1439px){')
    );
    // Only a header with the chip gives up the words beside the wordmark.
    expect(to1439).toContain('.sva-bar:has(>.sva-chip-slot) .sva-kicker{display:none}');
    expect(STYLES.match(/\.sva-kicker\{display:none\}/g)).toHaveLength(1);
    // Outside them the chip's place does not flex and the kicker is drawn.
    const everywhere = STYLES.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(everywhere).not.toContain('@media');
    expect(everywhere).toContain(
      '.sva-chip-slot{position:relative;display:flex;align-items:center;gap:.1rem}'
    );
    expect(everywhere).not.toMatch(/\.sva-chip-slot\{[^}]*flex:1/);
    expect(everywhere).not.toMatch(/\.sva-kicker\{[^}]*display:none/);
    // The phone's rules are the ones they were.
    const phone = blocks.find((block) => block.startsWith('(max-width:760px){'));
    expect(phone).toContain('.sva-tabs{order:3;flex-basis:100%;min-width:0}');
    expect(phone).not.toContain('sva-chip-slot');
    expect(phone).not.toContain('sva-studychip');
    expect(phone).not.toContain('sva-kicker');
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

  it('APP-STUDY-012: a mapping row the reader set by hand is kept when another snapshot of the same study is chosen, wherever that snapshot has the same file with the column the row names; a row whose file the snapshot does not have is cleared, and a note on the page names it; rows the reader did not set are filled again from the snapshot’s own file (#427)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29', '2012-03-31']);
    handOver(built, 'preset:kept');
    await settle();
    const choose = async (snapshot) => {
      mountStudy.mock.calls.at(-1)[1].onView({ view: 'overview', snapshot });
      await settle();
    };
    const row = (domain, column) => app.state.mappings[domain].columns[column];
    // Filled by the app: the arm is the column called ARM.
    expect(row('subject', 'ARM')).toEqual({ value: 'ARM', source: 'same name' });
    // The reader sets two rows by hand: the participants file's arm, and the adverse events file's term.
    app.setColumn('subject', 'ARM', 'SEX');
    app.setColumn('ae', 'AEDECOD', 'AEBODSYS');
    expect(row('subject', 'ARM')).toEqual({ value: 'SEX', source: 'chosen' });
    // The second snapshot has both files: both rows are as the reader set them, and nothing is said.
    await choose('2012-02-29');
    expect(app.state.files.subject.rows).toHaveLength(2);
    expect(row('subject', 'ARM')).toEqual({ value: 'SEX', source: 'chosen' });
    expect(row('ae', 'AEDECOD')).toEqual({ value: 'AEBODSYS', source: 'chosen' });
    expect(row('subject', 'SEX')).toEqual({ value: 'SEX', source: 'same name' });
    expect(app.state.notes).toEqual([]);
    // The first snapshot has no adverse events file: the participants file's row is kept,
    // and the page says which row was cleared, and why.
    await choose('2012-01-31');
    expect(app.state.files.subject.rows).toHaveLength(1);
    expect(app.state.files.ae).toBeUndefined();
    expect(row('subject', 'ARM')).toEqual({ value: 'SEX', source: 'chosen' });
    expect(app.state.notes).toEqual([
      'Mapping rows set by hand were cleared, because this snapshot’s files do not have them: AEBODSYS (adae.csv).'
    ]);
    app.state.exploring = false;
    app.select('data');
    expect(q('.sva-notes').textContent).toContain('AEBODSYS (adae.csv)');
    // Back at the last snapshot the cleared row is the app's own guess again, and the kept one is still the reader's.
    await choose('2012-03-31');
    expect(row('subject', 'ARM')).toEqual({ value: 'SEX', source: 'chosen' });
    expect(row('ae', 'AEDECOD')).toEqual({ value: 'AEDECOD', source: 'same name' });
    expect(app.state.notes).toEqual([]);
  });

  it('APP-STUDY-012: a mapping row the reader cleared by hand, and a file the reader set aside by hand, are kept when another snapshot of the same study is chosen: the row stays empty where the app would fill it again, at that snapshot and at the ones after it, and the file stays set aside; a row nothing matched is not one of these; and where the snapshot does not have the file, a note on the page names what was not kept (#431)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ demo: null, viewer });
    const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29', '2012-03-31', '2012-04-30']);
    // At the third snapshot the participants file has no column for the arm,
    // so the app itself leaves that row empty there.
    const third = built.at('2012-03-31');
    const whole = third.files();
    third.files = () => ({
      raw: whole.raw,
      standard: whole.standard.map((file) =>
        file.name === 'adsl.csv'
          ? { name: file.name, text: 'USUBJID,SEX,RACE,SITEID\nS1,F,Other,01\n' }
          : file
      )
    });
    handOver(built, 'preset:kept');
    await settle();
    const choose = async (snapshot) => {
      mountStudy.mock.calls.at(-1)[1].onView({ view: 'overview', snapshot });
      await settle();
    };
    const row = (domain, column) => app.state.mappings[domain].columns[column];
    const cleared = { value: null, source: null, cleared: true };
    // The reader clears two rows the app had filled: the participants file's arm, and the adverse events file's term.
    expect(row('subject', 'ARM')).toEqual({ value: 'ARM', source: 'same name' });
    app.setColumn('subject', 'ARM', null);
    app.setColumn('ae', 'AEDECOD', null);
    expect(row('subject', 'ARM')).toEqual(cleared);
    // A row nothing matched is empty too, and carries no mark.
    expect(row('subject', 'SITEID')).toEqual({ value: null, source: null });
    // Another snapshot with both files: both rows are still cleared, and nothing is said.
    await choose('2012-02-29');
    expect(app.state.files.subject.rows).toHaveLength(2);
    expect(row('subject', 'ARM')).toEqual(cleared);
    expect(row('ae', 'AEDECOD')).toEqual(cleared);
    expect(row('subject', 'SEX')).toEqual({ value: 'SEX', source: 'same name' });
    expect(row('subject', 'SITEID')).toEqual({ value: null, source: null });
    expect(app.state.notes).toEqual([]);
    // A snapshot whose file would not have filled the row: it is still the reader's, so at
    // the snapshot after it, whose file has the column again, the row is still cleared.
    await choose('2012-03-31');
    expect(app.state.files.subject.columns).toEqual(['USUBJID', 'SEX', 'RACE', 'SITEID']);
    expect(row('subject', 'ARM')).toEqual(cleared);
    await choose('2012-04-30');
    expect(app.state.files.subject.columns).toEqual(['USUBJID', 'ARM', 'SEX']);
    expect(row('subject', 'ARM')).toEqual(cleared);
    expect(row('ae', 'AEDECOD')).toEqual(cleared);
    expect(app.state.notes).toEqual([]);
    // The first snapshot has no adverse events file: the participants file's row is kept,
    // and the page names the row that was not, by the name the Files face gives it.
    await choose('2012-01-31');
    expect(app.state.files.ae).toBeUndefined();
    expect(row('subject', 'ARM')).toEqual(cleared);
    expect(app.state.notes).toEqual([
      'Mapping rows cleared by hand were not kept, because this snapshot does not have their file in the same place: Preferred term (adae.csv).'
    ]);
    app.state.exploring = false;
    app.select('data');
    expect(q('.sva-notes').textContent).toContain('Preferred term (adae.csv)');
    // Back at the last snapshot that row is the app's own again, as the note said.
    await choose('2012-04-30');
    expect(row('ae', 'AEDECOD')).toEqual({ value: 'AEDECOD', source: 'same name' });
    expect(row('subject', 'ARM')).toEqual(cleared);
    expect(app.state.notes).toEqual([]);

    // A file set aside by hand: the adverse events file is taken out of its domain.
    app.placeFileIn({ domain: 'ae' }, null);
    expect(app.state.files.ae).toBeUndefined();
    const aside = () => app.state.unplaced.map((item) => item.file.name);
    expect(aside()).toEqual(['adae.csv']);
    // Another snapshot has the file, and the app would place it: it stays set aside, and nothing is said.
    await choose('2012-02-29');
    expect(app.state.files.subject.rows).toHaveLength(2);
    expect(app.state.files.ae).toBeUndefined();
    expect(app.state.mappings.ae).toBeUndefined();
    expect(aside()).toEqual(['adae.csv']);
    expect(app.state.notes).toEqual([]);
    await choose('2012-04-30');
    expect(app.state.files.ae).toBeUndefined();
    expect(aside()).toEqual(['adae.csv']);
    // The first snapshot does not have the file, and the page says what that means.
    await choose('2012-01-31');
    expect(aside()).toEqual([]);
    expect(app.state.notes).toEqual([
      'Files set aside by hand are placed again when they are back, because this snapshot does not have them: adae.csv.'
    ]);
    await choose('2012-02-29');
    expect(app.state.files.ae.name).toBe('adae.csv');
    expect(aside()).toEqual([]);
    // A file the reader placed again by hand is no longer one set aside.
    app.placeFileIn({ domain: 'ae' }, null);
    app.placeFileIn({ unplaced: 0 }, 'ae');
    await choose('2012-04-30');
    expect(app.state.files.ae.name).toBe('adae.csv');
    expect(aside()).toEqual([]);
  });

  it('APP-STUDY-014: with a simulated study in use a file the app’s own buttons offer for download says it is simulated in its name: Download CSV in a file’s Details gives simulated-adsl.csv, a raw file’s gives simulated-Raw_SUBJ.csv, and Download mapping gives simulated-safety-viz-mapping.json, which loads back as the mapping it is; a demo study’s files and a reader’s own keep their names (#431)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    // What a download is saved as: the name on the link the page presses.
    const saved = [];
    const hadCreate = URL.createObjectURL;
    const hadRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:saved';
    URL.revokeObjectURL = () => {};
    const press = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      saved.push(this.download);
    });
    try {
      mounted({ viewer });
      await app.ready;
      const files = () => {
        app.state.exploring = false;
        app.select('data');
      };
      const downloadCsv = (name) => {
        const details = q(`.sva-file-details[data-details="${name}"]`);
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
        details.querySelector('.sva-detail-download').click();
      };
      const names = (...of) => {
        saved.length = 0;
        files();
        for (const name of of) downloadCsv(name);
        q('[data-action="download-mapping"]').click();
        return [...saved];
      };
      // A demo study: the names are the files' own.
      expect(q('.sva-chip-name').textContent).toBe('Study one');
      expect(names('dm.csv')).toEqual(['dm.csv', 'safety-viz-mapping.json']);
      // A simulated study, as study.builder hands one over: every name says so.
      const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29']);
      handOver(built, 'preset:kept');
      await settle();
      expect(q('.sva-chip-under').textContent).toBe('Simulated · Snapshot 2 of 2');
      expect(names('adsl.csv', 'Raw_SUBJ.csv')).toEqual([
        'simulated-adsl.csv',
        'simulated-Raw_SUBJ.csv',
        'simulated-safety-viz-mapping.json'
      ]);
      expect(app.downloadName('simulated-adsl.csv')).toBe('simulated-adsl.csv');
      // One with a single snapshot, as a saved study or one just built.
      handOver({ id: 'PLAIN', files: () => built.files() }, 'saved:study:PLAIN');
      expect(names('adae.csv')).toEqual([
        'simulated-adae.csv',
        'simulated-safety-viz-mapping.json'
      ]);
      // The mapping file loads back under the name it was saved by: a row set by hand comes with it.
      app.setColumn('subject', 'ARM', 'SEX');
      const mapping = JSON.stringify(app.mappingFile());
      handOver({ id: 'PLAIN', files: () => built.files() }, 'saved:study:PLAIN-2');
      expect(app.state.mappings.subject.columns.ARM).toEqual({ value: 'ARM', source: 'same name' });
      app.loadFiles([{ name: 'simulated-safety-viz-mapping.json', text: mapping }]);
      expect(app.state.mappings.subject.columns.ARM).toEqual({ value: 'SEX', source: 'chosen' });
      expect(app.state.notes[0]).toContain(
        'simulated-safety-viz-mapping.json is a saved mapping for:'
      );
      // It is still the simulated study, and its files still say so.
      expect(app.state.named.name).toBe('PLAIN');
      expect(app.downloadName('adsl.csv')).toBe('simulated-adsl.csv');
      // A reader's own files keep their names, also after a simulated study.
      app.loadFiles([DM]);
      expect(q('.sva-chip-name').textContent).toBe('Your files');
      expect(names('dm.csv')).toEqual(['dm.csv', 'safety-viz-mapping.json']);
    } finally {
      press.mockRestore();
      URL.createObjectURL = hadCreate;
      URL.revokeObjectURL = hadRevoke;
    }
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
    expect(studyChip().getAttribute('aria-label')).toBe(
      'KEPT, simulated study, snapshot 3 of 3, 2012-03-31'
    );
    mountStudy.mock.calls.at(-1)[1].onView({ view: 'overview', snapshot: '2012-01-31' });
    await settle();
    expect(q('.sva-chip-snap').textContent).toBe('Snapshot 1 of 3');
    // On another tab the chip still says it.
    app.select(STUDIES_VIEW_ID);
    expect(q('.sva-chip-snap').textContent).toBe('Snapshot 1 of 3');
    expect(studyChip().getAttribute('aria-label')).toBe(
      'KEPT, simulated study, snapshot 1 of 3, 2012-01-31'
    );
    q('[data-action="study-info"]').click();
    const facts = [...q('.sva-chip-card').querySelectorAll('dt')].map((term) => [
      term.textContent,
      term.nextElementSibling.textContent
    ]);
    expect(facts).toContainEqual(['Snapshot drawn', '2012-01-31 · 1 of 3']);
    // A study with one snapshot, and a reader's own files, say nothing of one.
    handOver({ id: 'PLAIN', files: () => built.files() }, 'preset:plain');
    expect(q('.sva-chip-snap')).toBeNull();
    expect(studyChip().textContent).toBe('PLAINSimulated▾');
    app.loadFiles([DM]);
    expect(q('.sva-chip-snap')).toBeNull();
    expect(studyChip().hasAttribute('aria-label')).toBe(false);
  });

  it('APP-STUDY-011: the study chip marks a simulated study as simulated on every tab, in the small line under its name, before the snapshot’s words where there are any, and in its hover line and its accessible name; a demo study and a reader’s own files carry no mark; and the line is cut with the name, from 1,200 pixels, before the header takes a second row (#427)', async () => {
    const mountStudy = vi.fn(() => ({ destroy() {} }));
    globalThis.StudyViewer = { mount: vi.fn() };
    globalThis.StudyBuilder = { mountStudy };
    mounted({ viewer });
    await app.ready;
    const under = () => (q('.sva-chip-under') ? q('.sva-chip-under').textContent : null);
    // A demo study says nothing of the kind.
    expect(q('.sva-chip-name').textContent).toBe('Study one');
    expect(under()).toBeNull();
    expect(q('.sva-chip-sim')).toBeNull();
    // A simulated study that kept its snapshots: the mark, then which snapshot.
    const built = keptStudy('KEPT', ['2012-01-31', '2012-02-29', '2012-03-31']);
    handOver(built, 'preset:kept');
    await settle();
    expect(under()).toBe('Simulated · Snapshot 3 of 3');
    expect(q('.sva-chip-under').previousElementSibling).toBe(q('.sva-chip-name'));
    expect(studyChip().title).toBe('KEPT, a simulated study, as it stood on 2012-03-31');
    expect(studyChip().getAttribute('aria-label')).toBe(
      'KEPT, simulated study, snapshot 3 of 3, 2012-03-31'
    );
    // On every tab: a chart's, the Studies view, and back on the Overview.
    for (const view of ['ae-explorer', STUDIES_VIEW_ID, 'data']) {
      app.select(view);
      expect(under(), view).toBe('Simulated · Snapshot 3 of 3');
    }
    // One with a single snapshot, as a study just built or a saved one: the mark alone.
    handOver({ id: 'PLAIN', files: () => built.files() }, 'saved:study:PLAIN');
    expect(under()).toBe('Simulated');
    expect(studyChip().title).toBe('PLAIN, a simulated study');
    expect(studyChip().getAttribute('aria-label')).toBe('PLAIN, simulated study');
    app.select('ae-explorer');
    expect(under()).toBe('Simulated');
    // A reader's own files carry no mark.
    app.loadFiles([DM]);
    expect(under()).toBeNull();
    expect(studyChip().title).toBe('Your files');
    // The line gives with the name where the header is tight, and only from 1,200 pixels.
    const blocks = STYLES.split('@media ').slice(1);
    const from1200 = blocks.find((block) => block.startsWith('(min-width:1200px){'));
    expect(from1200).toContain(
      '.sva-chip-under{max-width:100%;overflow:hidden;text-overflow:ellipsis}'
    );
    const everywhere = STYLES.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(everywhere).toContain('.sva-chip-under{font-size:.62rem;');
    expect(everywhere).not.toContain('.sva-chip-under{max-width');
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
