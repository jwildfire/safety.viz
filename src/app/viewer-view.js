// Demo app: the loaded study, looked through. The data view's second face is
// study.viewer (github.com/jwildfire/study.builder, src/viewer): a rail of the
// study's tables, and their rows, a profile of every column, and one
// participant across them. It is the same for a demo study, a reader's own
// files and a simulated study; a simulated study brings its layers with it.
//
// Nothing of study.viewer is in the app's bundle: its script is fetched from
// the page's own address the first time a reader explores a study.

import { el } from './dom.js';
import { note } from './note.js';

const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);

// One fetch of the viewer's script a page, whatever asks for it.
const loading = new Map();

/** study.viewer, loaded once from where the page serves it. */
function loadViewer(library) {
  const found = () => (library && globalThis[library.global]) || null;
  if (found()) return Promise.resolve(found());
  if (!library || !library.url) return Promise.reject(new Error('this page serves no viewer'));
  if (loading.has(library.url)) return loading.get(library.url);
  const asked = new Promise((resolve, reject) => {
    const script = el('script');
    script.src = library.url;
    script.onload = () =>
      found()
        ? resolve(found())
        : reject(new Error(`${library.url} did not define ${library.global}`));
    script.onerror = () => reject(new Error(`${library.url} did not load on this page`));
    document.head.append(script);
  }).catch((error) => {
    loading.delete(library.url);
    throw error;
  });
  loading.set(library.url, asked);
  return asked;
}

/**
 * The loaded files as a study the viewer reads: each placed file with what its
 * columns are used as and how many are still to map, each file set aside, and
 * each of gsm's raw files.
 * @param {Object} app The app handle.
 * @param {string} name What to call the study.
 * @returns {Object} What study.viewer's `viewerStudy` takes.
 */
export function loadedStudy(app, name) {
  const { state, manifest } = app;
  const tables = [];
  for (const domain of Object.keys(manifest.domains)) {
    const file = state.files[domain];
    if (!file) continue;
    const mapping = state.mappings[domain] || { columns: {}, measures: {} };
    const usedAs = new Map();
    let unmapped = 0;
    let participant = null; // the column the domain's charts read the participant from
    for (const [key, meta] of Object.entries(manifest.domains[domain].columns)) {
      const row = mapping.columns[key];
      if (row && row.value) {
        usedAs.set(row.value, meta.label);
        if (key === 'USUBJID') participant = row.value;
      } else unmapped += 1;
    }
    const label = manifest.domains[domain].label || domain;
    tables.push({
      id: file.name,
      label: file.name,
      group: 'Placed in a domain',
      file: file.name,
      records: file.rows,
      about: `Placed as ${label}`,
      note: unmapped ? `${unmapped} of this domain's columns are not mapped` : '',
      columns: file.columns.map((column) => ({
        name: column,
        ...(usedAs.has(column) ? { used: usedAs.get(column) } : {}),
        ...(column === participant ? { role: 'participant' } : {})
      }))
    });
  }
  for (const item of state.unplaced) {
    tables.push({
      id: item.file.name,
      label: item.file.name,
      group: 'Set aside',
      file: item.file.name,
      records: item.file.rows,
      about: 'In no domain',
      columns: item.file.columns
    });
  }
  for (const file of state.raw) {
    tables.push({
      id: file.name,
      label: file.name,
      group: 'gsm raw files',
      file: file.name,
      text: file.text,
      rows: file.rows,
      about: 'Kept as it is',
      columns: file.columns
    });
  }
  return { name, tables };
}

/**
 * Draw the viewer into an element of the data view.
 * @param {HTMLElement} container The element.
 * @param {Object} app The app handle.
 * @param {Object} study The study to show, as study.viewer takes one; or `{ fromBuilt }`, a study study.builder built.
 * @returns {void}
 */
export function drawViewer(container, app, study) {
  container.textContent = '';
  container.classList.add('sva-explore');
  container.append(note({ say: 'Loading the viewer…', busy: true, role: 'status' }));
  loadViewer(app.viewer).then(
    (viewer) => {
      if (!container.isConnected) return;
      container.textContent = '';
      const remembered = app.state.viewing || {};
      try {
        viewer.mount(container, {
          // A study study.builder built is handed over whole, with its layers.
          study: study && study.fromBuilt ? viewer.fromBuilt(study.fromBuilt) : study,
          view: remembered.view,
          table: remembered.table,
          save: typeof app.saveFile === 'function' ? app.saveFile.bind(app) : null,
          // Where the reader was is kept, so a redraw of the page finds it.
          onChange: (at) => {
            app.state.viewing = at;
          }
        });
      } catch (error) {
        const box = el(
          'p',
          'sva-message sva-problem',
          `The viewer cannot be shown: ${messageOf(error)}.`
        );
        box.setAttribute('role', 'alert');
        container.append(box);
      }
    },
    (error) => {
      if (!container.isConnected) return;
      container.textContent = '';
      const box = el(
        'p',
        'sva-message sva-problem',
        `The viewer cannot be shown: ${messageOf(error)}.`
      );
      box.setAttribute('role', 'alert');
      container.append(box);
    }
  );
}
