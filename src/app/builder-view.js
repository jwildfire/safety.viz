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
// the page's own address when it is first needed, and that depends on the page
// (#408). A page with the study chip (`portfolio: true`, as the hosted demo)
// needs it as it opens: the chip's list names study.builder's ready-made
// studies and the ones saved in this browser, and both are read by
// study.builder's own code, so the script and then the list of ready-made
// studies are fetched as the page opens. No study is fetched until the reader
// opens one. A page with no chip fetches nothing until the source is first
// opened. Either way R is not asked for until the reader presses Build. The
// widget is handed the app's own way of making a connection to R, so it and
// the RBQM tab share one R.
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

  // The studies study.builder has for this page: the ready-made ones it hosts,
  // and what the reader saved in this browser. Found once, when first asked,
  // which a page with the study chip does as it opens: the chip's list is theirs.
  let offered = null; // { presets, shelf, saved } once found
  let finding = null;
  let opening = '';
  let openRun = 0; // the latest of these studies asked for; an earlier one still on its way is dropped
  let listProblem = '';

  /** What the page keeps of a study: its name, its facts, and its tables for the viewer. */
  function named(study, id) {
    const args = study.args || {};
    const layers = Array.isArray(study.layers) ? study.layers : [];
    const size = args.participants ? `${args.participants} participants · ${args.sites} sites` : '';
    return {
      id,
      name: study.id,
      kind: 'Simulated',
      size,
      about: 'Every row is synthetic.',
      facts: [
        {
          label: 'Phase and area',
          value: args.phase && `${args.phase} · ${args.therapeutic_area}`
        },
        {
          label: 'Participants',
          value: args.participants && `${args.participants} at ${args.sites} sites`
        },
        { label: 'Duration', value: study.snapshots && `${study.snapshots} monthly snapshots` },
        {
          label: 'Tables',
          value:
            layers.length &&
            `${layers.reduce((sum, layer) => sum + layer.tables.length, 0)} in ${layers.length} layers`
        },
        { label: 'Made by', value: study.simulator && `gsm.datasim ${study.simulator}` }
      ].filter((fact) => fact.value),
      // Every layer, for the data view's viewer, when the study has them.
      ...(layers.length ? { built: study } : {})
    };
  }

  function find(app) {
    if (finding || offered || !canBuild) return;
    finding = loadLibrary()
      .then(async (builder) => {
        if (!builder) throw new Error(problem || 'study.builder did not load');
        const shelf = typeof builder.createShelf === 'function' ? builder.createShelf() : null;
        const presets =
          typeof builder.fetchPresets === 'function'
            ? await builder.fetchPresets(`${base}presets/index.json`)
            : [];
        const saved = shelf && shelf.available ? await shelf.list() : [];
        offered = { builder, presets, shelf, saved };
      })
      .catch((error) => {
        listProblem = `study.builder's studies could not be listed: ${messageOf(error)}.`;
        offered = { builder: null, presets: [], shelf: null, saved: [] };
      })
      .then(() => {
        finding = null;
        app.retag();
        app.redrawView('studies');
      });
  }

  async function refreshSaved(app) {
    if (offered && offered.shelf && offered.shelf.available) {
      offered.saved = await offered.shelf.list();
      app.retag();
      app.redrawView('studies');
    }
  }

  /**
   * Open one of study.builder's studies and hand it to the app, with no R.
   * The study in use is the last one the reader chose (#407): a study still on
   * its way when another of these is asked for is dropped when it arrives, as
   * the page drops a demo study (page.js's `demoRun`), and so is one a demo
   * study was asked for after, which the page says by a new `ready`.
   */
  async function openOffered(app, id, name, get) {
    const run = ++openRun;
    const asked = app.ready;
    opening = `Opening ${name}…`;
    listProblem = '';
    app.retag();
    app.redrawView('studies');
    try {
      const study = await get();
      if (run !== openRun) return;
      if (app.ready === asked) use(study, app, id);
    } catch (error) {
      if (run !== openRun) return;
      if (app.ready === asked) listProblem = messageOf(error);
    }
    opening = '';
    app.retag();
    app.redrawView('studies');
  }

  /**
   * study.builder, loaded once from the page's own address: when the page's
   * list of studies first asks what it has, or when the source is first opened.
   * A script that did not load is taken off the page, and the next call asks again.
   */
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
      script.onerror = () => {
        script.remove();
        reject(new Error(`${library.url} did not load on this page`));
      };
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
  function use(study, app, id = null) {
    const { raw, standard: every } = study.files();
    // A study may hold an efficacy score (adqs.csv). No chart here reads one,
    // and it has the shape of a labs file, so it would take the labs' place.
    // It is left out; the study view on the Overview tab still shows it.
    const scores = new Set(
      (Array.isArray(study.standard) ? study.standard : [])
        .filter((table) => table.id === 'qs')
        .map((table) => table.name)
    );
    const standard = every.filter((file) => !scores.has(file.name));
    loaded = { id: study.id, said: study.said };
    const as = named(study, id || `saved:study:${study.id}`);
    app.loadRaw(raw, { as });
    app.loadFiles(standard, { notes: [], as });
    // A study built here closes the builder; one opened from the list leaves the reader where they are.
    if (app.state.source) app.openSource(null);
    // A study that was built is kept in this browser, so it opens at once next time.
    if (!id && offered && offered.shelf && offered.shelf.available && offered.builder) {
      offered.shelf
        .save(offered.builder.savedOf(study))
        .then(() => refreshSaved(app))
        .catch(() => {});
    }
  }

  function mountWidget(builder, app) {
    holder = el('div', 'sva-build-widget');
    widget = builder.mount(holder, {
      base,
      ...(repository ? { repository } : {}),
      createConnection,
      useLabel: 'Load into the demo',
      // The app has its own list of studies: the loader opens on its form.
      screen: 'describe',
      presets: false,
      // The study it shows once built leaves its RBQM and Safety views out,
      // as the study view on the data view does: the app has its own.
      operations: false,
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
    /** study.builder's studies, for the app's list of studies (page.js's `portfolio`). */
    studies: {
      list(app) {
        if (!canBuild) return { studies: [] };
        if (!offered) {
          find(app);
          return { studies: [], busy: 'Looking for study.builder’s studies…' };
        }
        const { builder, presets, shelf, saved } = offered;
        const entries = [];
        for (const entry of saved.filter((one) => one.kind === 'study')) {
          const id = `saved:${entry.id}`;
          entries.push({
            id,
            name: entry.name,
            kind: 'Simulated',
            size: entry.size.replace(/, /g, ' · ').replace(/ · \d+ months$/, ''),
            about: `Saved in this browser, ${String(entry.saved).slice(0, 10)}`,
            open: () =>
              openOffered(app, id, entry.name, async () =>
                builder.openStudy(await shelf.open(entry.id))
              ),
            remove: async () => {
              await shelf.remove(entry.id);
              refreshSaved(app);
            }
          });
        }
        for (const preset of presets.filter((one) => one.study)) {
          const id = `preset:${preset.id}`;
          entries.push({
            id,
            name: preset.settings.name,
            kind: 'Simulated',
            size: `${preset.settings.participants} participants · ${preset.settings.sites} sites`,
            about: `Ready-made: ${preset.name}`,
            open: () =>
              openOffered(
                app,
                id,
                preset.settings.name,
                async () => (await builder.openPreset(preset)).study
              )
          });
        }
        return { studies: entries, busy: opening, problem: listProblem };
      },
      add: canBuild
        ? [
            {
              id: 'describe',
              label: 'Describe a simulated study',
              about:
                'Phase, size, domains and layers. study.builder makes it in this browser: a few seconds, and about half a minute the first time.',
              action: 'Describe a study',
              primary: true,
              run: (app) => {
                app.openSource(BUILDER_SOURCE_ID);
              }
            },
            {
              id: 'protocol',
              label: 'From a protocol',
              about:
                'Open a CDISC USDM study definition, the data form of an ICH M11 protocol. The study is built on its schedule of activities, which you can change first.',
              action: 'Open the builder',
              run: (app) => {
                app.openSource(BUILDER_SOURCE_ID);
              }
            }
          ]
        : []
    },
    /** The source's state, for the tests and the page. */
    state: () => ({ loaded, problem, mounted: Boolean(widget), widget }),
    render(container, app) {
      shown = { container, app };
      // Opened again after the builder could not be shown, it is tried again
      // (#408): the script is asked for once more. The source's own redraws
      // (`redraw`) do not come this way, so one failure is one request.
      if (problem && !holder && !loading) problem = '';
      draw(container, app);
      return {
        destroy() {
          if (shown && shown.container === container) shown = null;
        }
      };
    }
  };
}
