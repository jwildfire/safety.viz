// Demo app: Build a study, a way to load data. A library brings it through
// the second-library seam (page.js) as a source: the data view offers it
// beside the demo studies and the file picker, and draws it in place of the
// loaded files while it is open. It is study.builder's widget
// (github.com/jwildfire/study.builder): the reader
// describes a trial and chooses its domains, R in the browser has gsm.datasim
// simulate it, and every domain can be looked at. When the reader hands the
// study over, the app loads it as it loads a reader's own files: gsm's raw
// files for the RBQM tab, and the standard files for the other charts.
//
// Nothing of study.builder is in the app's bundle. Its script is fetched from
// the page's own address when the source is first opened, and R is not asked for
// until the reader presses Build. The widget is handed the app's own way of
// making a connection to R, so it and the RBQM tab share one R.
//
// This module loads the script, keeps the one widget across the page's
// redraws, and hands the study to the app, which closes the source and shows
// the loaded files. Everything shown of a study while it is built is the
// widget's.

import { el } from './dom.js';
import { note } from './note.js';

/** The source's id in the app. */
export const BUILDER_SOURCE_ID = 'build';

const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);

/**
 * Build a study, as a source the data view offers.
 * @param {Object} options
 * @param {(options: Object) => {run: Function}} [options.createConnection] The app's own connection factory (main.js's), so the widget shares the app's one R. Left out on a page that cannot start R.
 * @param {{url: string, global: string}} [options.library] study.builder's bundle: where the page serves it and the global it defines.
 * @param {string} [options.base] Where the page serves the files study.builder's R reads: its `r/` and `vendor/` folders.
 * @param {string} [options.repository] Where the page serves gsm's packages, as a package repository.
 * @param {?string} [options.unavailable] On a page that cannot start R, the sentence that says so; the source then offers no builder.
 * @returns {{id: string, label: string, about: string, render: Function, state: Function}} The source, as page.js takes one.
 */
export function builderSource({
  createConnection,
  library = null,
  base = './',
  repository = null,
  unavailable = null
} = {}) {
  let loading = null; // the promise of study.builder's global
  let problem = '';
  let holder = null; // the element the widget is mounted in, kept across redraws
  let widget = null;
  let loaded = null; // { id, said } of the study last handed to the app
  let shown = null; // { container, app } of the view as it is on the page now

  const canBuild = typeof createConnection === 'function' && !unavailable;

  /** study.builder, loaded once from the page's own address when the tab is first opened. */
  function loadLibrary() {
    if (loading) return loading;
    const found = () => (library && globalThis[library.global]) || null;
    loading = new Promise((resolve, reject) => {
      if (found()) return resolve(found());
      if (!library || !library.url) return reject(new Error('this page serves no study.builder'));
      const script = el('script');
      script.src = library.url;
      script.onload = () =>
        found()
          ? resolve(found())
          : reject(new Error(`${library.url} did not define ${library.global}`));
      script.onerror = () => reject(new Error(`${library.url} did not load on this page`));
      document.head.append(script);
      return undefined;
    }).catch((error) => {
      problem = `The builder cannot be shown: ${messageOf(error)}.`;
      loading = null;
      return null;
    });
    return loading;
  }

  function redraw() {
    if (shown && shown.container.isConnected) draw(shown.container, shown.app);
  }

  /**
   * Hand a study to the app: its raw files kept as they are, its standard
   * files placed, and the source closed, so the data view shows what loaded.
   */
  function use(study, app) {
    const { raw, standard } = study.files();
    loaded = { id: study.id, said: study.said };
    app.loadRaw(raw);
    app.loadFiles(standard, { notes: [] });
    app.openSource(null);
  }

  function mountWidget(builder, app) {
    holder = el('div', 'sva-build-widget');
    widget = builder.mount(holder, {
      base,
      ...(repository ? { repository } : {}),
      createConnection,
      useLabel: 'Load into the demo',
      // The app the study is handed to is the one on the page when the button is pressed.
      onStudy: (study) => use(study, shown ? shown.app : app)
    });
  }

  function draw(container, app) {
    container.textContent = '';
    container.classList.add('sva-build');
    if (!canBuild) {
      container.append(
        el('h2', 'sva-rbqm-heading', 'Build a study'),
        note({
          kind: 'warning',
          say: unavailable || 'This page cannot start R, so it cannot build a study.'
        })
      );
      return;
    }
    if (holder) {
      container.append(holder);
      return;
    }
    if (problem) {
      const box = el('p', 'sva-message sva-problem', problem);
      box.setAttribute('role', 'alert');
      container.append(box);
      return;
    }
    container.append(note({ say: 'Loading the builder…', busy: true, role: 'status' }));
    loadLibrary().then((builder) => {
      if (builder && !holder) {
        try {
          mountWidget(builder, app);
        } catch (error) {
          problem = `The builder cannot be shown: ${messageOf(error)}.`;
        }
      }
      redraw();
    });
  }

  return {
    id: BUILDER_SOURCE_ID,
    label: 'Build a study',
    about: 'Simulate a study with gsm.datasim, in this browser.',
    /** The source's state, for the tests and the page. */
    state: () => ({ loaded, problem, mounted: Boolean(widget), widget }),
    render(container, app) {
      shown = { container, app };
      draw(container, app);
      return {
        destroy() {
          if (shown && shown.container === container) shown = null;
        }
      };
    }
  };
}
