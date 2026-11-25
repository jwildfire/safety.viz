// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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
    expect(q('.sva-tabs .sva-tag').textContent).toBe('READY-P2');
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
    expect(q(`[data-tab="${STUDIES_VIEW_ID}"] .sva-tab-count`).textContent).toBe('3');
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

describe('the data view’s second face', () => {
  const viewer = { url: './study.viewer.js', global: 'StudyViewer' };

  it('is offered once files are loaded on a page that serves the viewer, and hands study.viewer the loaded files', async () => {
    const mount = vi.fn((target) => {
      target.append('the viewer');
    });
    globalThis.StudyViewer = { mount, fromBuilt: (built) => ({ name: built.id, tables: [] }) };
    mounted({ demo: null, viewer });
    expect(q('.sva-faces')).toBeNull();
    app.loadFiles([DM]);
    expect([...document.querySelectorAll('.sva-face')].map((face) => face.textContent)).toEqual([
      'Files and mapping',
      'Explore the data'
    ]);
    q('[data-action="explore"]').click();
    await settle();
    expect(q('.sva-explore-body').textContent).toBe('the viewer');
    expect(q('.sva-data').classList.contains('sva-data-wide')).toBe(true);
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
    app.explore();
    await settle();
    expect(mount.mock.calls.at(-1)[1].study).toEqual({ name: 'BUILT', tables: [] });
    q('[data-action="files"]').click();
    expect(q('.sva-explore-body')).toBeNull();
  });

  it('says so when the viewer’s script does not load', async () => {
    mounted({ demo: null, viewer });
    app.loadFiles([DM]);
    app.explore();
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
