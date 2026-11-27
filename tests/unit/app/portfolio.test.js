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
