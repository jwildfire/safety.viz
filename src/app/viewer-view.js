// Demo app: the loaded study, looked through. The data view's second face is
// study.viewer (github.com/jwildfire/study.builder, src/viewer): a rail of the
// study's tables, and their rows, a profile of every column, and one
// participant across them. It is the same for a demo study, a reader's own
// files and a simulated study; a simulated study brings its layers with it.
//
// Nothing of study.viewer is in the app's bundle: its script is fetched from
// the page's own address the first time the data view draws a loaded study
// with it. On a page that loads a demo study as it opens, that is as the page
// opens, whichever tab it opens on: the data view is drawn once with the study
// before the first chart takes its place (#408). Nothing more is fetched when
// the reader opens the Overview tab or loads files of their own.

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
 * @param {(domain: string) => Object[]} [rolesOf] What a placed file's columns are read as, for the viewer's mapping.
 * @returns {Object} What study.viewer's `viewerStudy` takes.
 */
export function loadedStudy(app, name, rolesOf = null) {
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
      ...(typeof rolesOf === 'function' ? { roles: rolesOf(domain) } : {}),
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
 * study.builder's own view of one built study (its facts, then its sections:
 * Overview, Design, Data, One participant and Reporting), when the page has
 * study.builder loaded. A study it built or opened is always shown with it.
 * @returns {?Function} `StudyBuilder.mountStudy`, or null.
 */
export function studyModule() {
  const builder = globalThis.StudyBuilder;
  return builder && typeof builder.mountStudy === 'function' ? builder.mountStudy : null;
}

// What is on the page now, study.builder's study view or the viewer, let go of
// when the next of either is drawn (#408): one is held at a time, however many
// times the Overview tab is opened.
let shownNow = null;

function release() {
  const last = shownNow;
  shownNow = null;
  if (!last || typeof last.destroy !== 'function') return;
  try {
    last.destroy();
  } catch {
    // It was already gone with its element.
  }
}

/**
 * Draw study.builder's view of a built study into an element of the data view.
 * @param {HTMLElement} container The element.
 * @param {Object} app The app handle.
 * @param {Object} built The study, as study.builder built or opened it.
 * @returns {boolean} Whether it was drawn; false leaves the element for the viewer.
 */
export function drawStudy(container, app, built) {
  const mountStudy = studyModule();
  if (!mountStudy) return false;
  release();
  container.textContent = '';
  container.classList.add('sva-explore', 'sva-study');
  try {
    shownNow = mountStudy(container, {
      study: built,
      // The app has its own RBQM tab and its own safety charts: the study
      // view leaves its RBQM and Safety views out, so neither is there twice.
      operations: false,
      viewing: openingAt(app),
      save: typeof app.saveFile === 'function' ? app.saveFile.bind(app) : undefined,
      // Where the reader was is kept, so a redraw of the page finds it.
      onView: (at) => {
        viewed(app, built, at);
      }
    });
    return true;
  } catch {
    container.textContent = '';
    return false;
  }
}

/**
 * Draw the viewer into an element of the data view.
 * @param {HTMLElement} container The element.
 * @param {Object} app The app handle.
 * @param {Object} study The study to show, as study.viewer takes one; or `{ fromBuilt }`, a study study.builder built.
 * @returns {void}
 */
export function drawViewer(container, app, study, { onRole = null } = {}) {
  container.textContent = '';
  container.classList.add('sva-explore');
  container.append(note({ say: 'Loading the viewer…', busy: true, role: 'status' }));
  release();
  loadViewer(app.viewer).then(
    (viewer) => {
      if (!container.isConnected) return;
      container.textContent = '';
      const remembered = app.state.viewing || {};
      try {
        shownNow = viewer.mount(container, {
          // A study study.builder built is handed over whole, with its layers.
          study: study && study.fromBuilt ? viewer.fromBuilt(study.fromBuilt) : study,
          view: remembered.view,
          table: remembered.table,
          ...(typeof onRole === 'function' ? { onRole } : {}),
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

/**
 * Which snapshot of the loaded study the page draws (#406), for a study
 * study.builder built that kept its snapshots: the one the reader chose on the
 * study view, or the study's own last. The Overview tab, the charts and the
 * RBQM tab all draw this one, and the study chip says which it is.
 * @param {?Object} named What the page keeps of the loaded study (`state.named`).
 * @returns {?{date: string, number: number, of: number}} The snapshot, or null for a study with none to choose from.
 */
export function snapshotDrawn(named) {
  const built = named && named.built;
  const kept = built && Array.isArray(built.history) ? built.history : [];
  if (kept.length < 2) return null;
  const entry = kept.find((one) => one.date === named.snapshot) || kept[kept.length - 1];
  return { date: entry.date, number: entry.number, of: kept.length };
}

/**
 * Where study.builder's study view opens: the view and table the reader was
 * at, and the snapshot the page draws. A snapshot chosen in another study is
 * not carried over, so a study opens on its own last snapshot (#406).
 */
function openingAt(app) {
  const { snapshot: _carried, ...where } = app.state.viewing || {};
  const drawn = snapshotDrawn(app.state.named);
  if (drawn) return { ...where, snapshot: drawn.date };
  return app.state.viewing ? where : null;
}

/**
 * The reader moved on the study view. Where they are is kept; and when they
 * chose another snapshot, the app is handed that snapshot's files in place of
 * the ones it had, so the charts and the RBQM tab draw the snapshot the
 * Overview tab shows (#406). study.builder reads the snapshot from the study
 * itself (`study.at`), with no R. The files are handed over as builder-view.js
 * hands a study over: gsm's raw files kept as they are, the standard files
 * placed, and an efficacy score left out.
 */
function viewed(app, built, at) {
  app.state.viewing = at;
  const drawn = snapshotDrawn(app.state.named);
  const chosen = at && at.snapshot;
  if (!drawn || !chosen || chosen === drawn.date) return;
  // After study.builder has finished with the reader's choice: the page is drawn again here.
  Promise.resolve().then(() => {
    const named = app.state.named;
    if (!named || named.built !== built || typeof built.at !== 'function') return;
    const shown = built.at(chosen);
    if (!shown) return;
    const { raw, standard: every } = shown.files();
    const scores = new Set(
      (Array.isArray(shown.standard) ? shown.standard : [])
        .filter((table) => table.id === 'qs')
        .map((table) => table.name)
    );
    const standard = every.filter((file) => !scores.has(file.name));
    const as = { ...named, snapshot: shown.snapshotDate ? String(shown.snapshotDate) : chosen };
    // The files of the snapshot before are cleared whole first, so none of
    // them stays behind where this snapshot has no such file, or an empty one.
    app.reset();
    app.state.viewing = at;
    app.loadRaw(raw, { as });
    app.loadFiles(standard, { notes: [], as });
  });
}
