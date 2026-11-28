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
import { applySavedMapping } from './mapping.js';
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
 * The date the loaded study's data stands at (#427), for a simulated study:
 * the snapshot the page draws, or, for a study that kept only its last, the
 * date the study itself carries. The RBQM tab hands R this date and says it,
 * so the tab agrees with the chip on which snapshot is shown. A demo study
 * and a reader's own files name no date.
 * @param {?Object} named What the page keeps of the loaded study (`state.named`).
 * @returns {?{date: string, number: number, of: number}} The date as `2012-01-31`, with which snapshot it is of how many; null where the study names none.
 */
export function studyDate(named) {
  const drawn = snapshotDrawn(named);
  const built = named && named.built;
  const date = String((drawn ? drawn.date : built && built.snapshotDate) || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return drawn ? { ...drawn, date } : { date, number: 1, of: 1 };
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
 * The mapping rows the reader set by hand, for each placed file (#427): the
 * rows marked chosen, each with the column or the measure's name it was set to.
 * @param {Object} app The app handle.
 * @returns {Object<string, {file: string, columns: Object, measures: Object}>} Domain → its file's name and its hand-set rows; a domain with none is left out.
 */
function handSet(app) {
  const chosen = (rows) =>
    Object.fromEntries(
      Object.entries(rows || {})
        .filter(([, row]) => row && row.source === 'chosen' && row.value)
        .map(([key, row]) => [key, row.value])
    );
  const kept = {};
  for (const [domain, mapping] of Object.entries(app.state.mappings)) {
    const file = app.state.files[domain];
    const columns = chosen(mapping.columns);
    const measures = chosen(mapping.measures);
    if (!file || !(Object.keys(columns).length || Object.keys(measures).length)) continue;
    kept[domain] = { file: file.name, columns, measures };
  }
  return kept;
}

/**
 * Set the reader's hand-set rows again on the files of the snapshot just
 * loaded (#427). A row is set only where it is safe: the same file is placed
 * in the same domain, and it has the column, or the measure column has the
 * name, the row was set to. What could not be set is returned, to be said.
 * @param {Object} app The app handle.
 * @param {Object} kept What `handSet` gave before the snapshot changed.
 * @returns {{set: boolean, lost: string[]}} Whether any row was set, and each row that was not, as the value it was set to with its file: "AEBODSYS (adae.csv)".
 */
function setAgain(app, kept) {
  let set = false;
  const lost = [];
  for (const [domain, saved] of Object.entries(kept)) {
    const file = app.state.files[domain];
    const values = [...Object.values(saved.columns), ...Object.values(saved.measures)];
    if (!file || file.name !== saved.file || !app.state.mappings[domain]) {
      lost.push(...values.map((value) => `${value} (${saved.file})`));
      continue;
    }
    const { mapping, skipped } = applySavedMapping(app.state.mappings[domain], saved, file);
    if (mapping !== app.state.mappings[domain]) set = true;
    app.state.mappings[domain] = mapping;
    lost.push(...skipped.map((value) => `${value} (${saved.file})`));
  }
  return { set, lost };
}

/**
 * The reader moved on the study view. Where they are is kept; and when they
 * chose another snapshot, the app is handed that snapshot's files in place of
 * the ones it had, so the charts and the RBQM tab draw the snapshot the
 * Overview tab shows (#406). study.builder reads the snapshot from the study
 * itself (`study.at`), with no R. The files are handed over as builder-view.js
 * hands a study over: gsm's raw files kept as they are, the standard files
 * placed, and an efficacy score left out.
 *
 * It is the same study at another date, so the mapping rows the reader set by
 * hand on the Files face are kept across the change (#427), wherever the
 * snapshot has the same file with the column or the measure the row names.
 * A row that cannot be kept is named in a note on the page, with its file.
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
    const byHand = handSet(app);
    // The files of the snapshot before are cleared whole first, so none of
    // them stays behind where this snapshot has no such file, or an empty one.
    app.reset();
    app.state.viewing = at;
    app.loadRaw(raw, { as });
    app.loadFiles(standard, { notes: [], as });
    const { set, lost } = setAgain(app, byHand);
    if (lost.length) {
      app.state.notes.push(
        `Mapping rows set by hand were cleared, because this snapshot’s files do not have them: ${lost.join(', ')}.`
      );
    }
    if (set || lost.length) app.refresh();
  });
}
