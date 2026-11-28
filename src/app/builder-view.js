// Demo app: Build a study, a way to load data. A library brings it through
// the second-library seam (page.js) as a source: the data view offers it
// beside the demo studies and the file picker, and draws it in place of the
// loaded files while it is open. It is study.builder's widget
// (github.com/jwildfire/study.builder): the reader
// describes a trial and chooses its domains, R in the browser has
// study.builder's simulator make it, and every domain can be looked at. The
// simulator is a modified copy of gsm.datasim: Gilead's 2.1.0 with additions
// that are not theirs, and the app's own words say so wherever they name what
// makes a study (#423). When the reader hands the
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
// opened. When the source is first opened, the studies feed is fetched too,
// once: it names the example protocols' licence and attribution, which are
// shown under the builder wherever the widget shows no attribution of its own
// (#423, #428). Either way R is not asked for until the reader presses Build.
// The widget is handed the app's own way of making a connection to R, so it
// and the RBQM tab share one R.
//
// This module loads the script, keeps the one widget across the page's
// redraws, and hands the study to the app, which closes the source and shows
// the loaded files. Everything shown of a study while it is built is the
// widget's.

import { el, oneStop } from './dom.js';
import { note } from './note.js';

/** The source's id in the app. */
export const BUILDER_SOURCE_ID = 'build';

/**
 * What the page is told the view of a simulated study stands on, by this id
 * among its rungs (`tiers`; site/config.json's `appParts`, #427). The source
 * itself is told its own by its id.
 */
export const SIMULATED_RUNG_ID = 'simulated-study';

const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);

/**
 * Whose a study's protocol is, for the study's card (#423): the attribution
 * and the statement of change the protocol's source carries, as CDISC's
 * example protocols do.
 * @param {?Object} protocol The protocol a study followed, as study.builder keeps it.
 * @returns {string} The words, empty for a study with no protocol or a protocol that names none.
 */
export function protocolCredit(protocol) {
  const source = protocol && typeof protocol === 'object' ? protocol.source : null;
  if (!source || typeof source !== 'object') return '';
  return [source.attribution, source.changes]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ');
}

/**
 * The lines that credit the example protocols the builder's form offers (#423),
 * from the studies feed: one for each licence and attribution the feed's
 * protocols name, which for CDISC's five is one.
 * @param {Object[]} entries The feed's entries, as study.builder's `listStudies` gives them.
 * @returns {string[]} The lines; none when no protocol names an attribution.
 */
export function protocolCredits(entries) {
  const protocols = (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry && entry.kind === 'protocol'
  );
  const groups = new Map();
  for (const entry of protocols) {
    if (typeof entry.attribution !== 'string' || !entry.attribution.trim()) continue;
    const license = typeof entry.license === 'string' ? entry.license.trim() : '';
    const key = `${license}\n${entry.attribution.trim()}`;
    if (!groups.has(key))
      groups.set(key, { license, attribution: entry.attribution.trim(), of: [] });
    groups.get(key).of.push(entry.name);
  }
  return [...groups.values()].map(({ license, attribution, of }) => {
    const which =
      of.length === protocols.length
        ? 'The example protocols'
        : `Example protocols (${of.join('; ')})`;
    return `${which}${license ? `, ${license}` : ''}: ${attribution}`;
  });
}

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
  // The element that credits the example protocols (#423): under the widget
  // wherever the widget shows no attribution of its own, and off the page
  // where it does (#428).
  let credit = null;
  let crediting = null; // the promise of the studies feed's protocols, asked for once
  let loaded = null; // { id, said } of the study last handed to the app
  let shown = null; // { container, app } of the view as it is on the page now

  const canBuild = typeof createConnection === 'function' && !unavailable;

  // The studies study.builder has for this page: the ready-made ones it hosts,
  // and what the reader saved in this browser. Found once, when first asked,
  // which a page with the study chip does as it opens: the chip's list is theirs.
  let offered = null; // { builder, presets, shelf, saved } once looked for
  let finding = null;
  // The list could not be read whole, and is looked for again when Build a
  // study is next opened (#427): until then nothing asks again, however many
  // times the page is drawn.
  let listFailed = false;
  let listProblem = '';
  let notLoaded = ''; // why the script did not load, as the list of studies says it
  // The study the reader last asked these for, while it is on its way, and the
  // one that did not open: each with the page's word on whether it is still
  // the last thing the reader chose (page.js's `choose`, #427). Neither is
  // said once the reader has chosen something else.
  let opening = null; // { say, last }
  let unopened = null; // { say, last }

  /** What the page keeps of a study: its name, its facts, and its tables for the viewer. */
  function named(study, id) {
    const args = study.args || {};
    const layers = Array.isArray(study.layers) ? study.layers : [];
    const size = args.participants ? `${args.participants} participants · ${args.sites} sites` : '';
    return {
      id,
      name: study.id,
      kind: 'Simulated',
      // Which of the rungs the page was told this study's view stands on (#427).
      rung: SIMULATED_RUNG_ID,
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
        // `study.simulator` is the version the copy's DESCRIPTION states, as "2.1.0".
        {
          label: 'Made by',
          value: study.simulator && `a modified copy of gsm.datasim ${study.simulator}`
        },
        // A study that followed a protocol says which, and whose it is: the
        // attribution its source asks for is the fact's note, which the
        // study's card draws under the facts, small (#423).
        {
          label: 'Protocol',
          value: study.protocol && study.protocol.name,
          ...(protocolCredit(study.protocol) ? { note: protocolCredit(study.protocol) } : {})
        }
      ].filter((fact) => fact.value),
      // Every layer, for the data view's viewer, when the study has them.
      ...(layers.length ? { built: study } : {})
    };
  }

  /**
   * How many ready-made studies the page's studies feed names (#431): the
   * entries that come with a built study. Asked only when the list of
   * ready-made studies came back empty, so a page whose list arrives asks for
   * nothing more as it opens. A feed that cannot be read counts as none.
   */
  async function namedInFeed(builder) {
    if (typeof builder.listStudies !== 'function') return 0;
    try {
      const entries = await builder.listStudies(`${base}studies/index.json`, { built: true });
      return (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.build).length;
    } catch {
      return 0;
    }
  }

  /**
   * Look for the studies study.builder has for this page. Each part is kept
   * as far as it was read: a list of ready-made studies that did not arrive
   * leaves the saved studies listed, and the shelf to save a built study on.
   * What could not be read is said in one sentence (#427).
   *
   * study.builder's own `fetchPresets` answers a list it could not fetch with
   * an empty one, and says nothing. So an empty list is checked against the
   * studies feed, which the page serves beside it (#431): where the feed
   * names ready-made studies, the list did not arrive, and the page says so
   * and asks again when Build a study is opened. Where the feed names none,
   * or cannot be read either, an empty list is taken as it is: a list that
   * failed cannot then be told from one that is empty.
   */
  function find(app) {
    if (finding || (offered && !listFailed) || !canBuild) return;
    listFailed = false;
    const found = { builder: null, presets: [], shelf: null, saved: [] };
    finding = (async () => {
      let reading = 'studies';
      try {
        const builder = await loadLibrary();
        if (!builder) throw new Error(notLoaded || 'study.builder did not load');
        found.builder = builder;
        found.shelf = typeof builder.createShelf === 'function' ? builder.createShelf() : null;
        if (found.shelf && found.shelf.available) found.saved = await found.shelf.list();
        reading = 'ready-made studies';
        if (typeof builder.fetchPresets === 'function') {
          found.presets = await builder.fetchPresets(`${base}presets/index.json`);
          if (!found.presets.length) {
            const expected = await namedInFeed(builder);
            if (expected) {
              throw new Error(
                `their list came back empty, where the page’s list of studies names ${expected}`
              );
            }
          }
        }
        listProblem = '';
      } catch (error) {
        listFailed = true;
        listProblem = oneStop(
          `study.builder’s ${reading} could not be listed: ${messageOf(error)}`
        );
      }
      offered = found;
      finding = null;
      app.retag();
      app.redrawView('studies');
    })();
  }

  async function refreshSaved(app) {
    if (offered && offered.shelf && offered.shelf.available) {
      offered.saved = await offered.shelf.list();
      app.retag();
      app.redrawView('studies');
    }
  }

  /** How many files the page holds now: a study in use, or none. */
  const inUse = (app) =>
    Object.keys(app.state.files).length + app.state.unplaced.length + app.state.raw.length;

  /**
   * The app's own sentence for a study that did not open (#427): which study,
   * what study.builder said could not be done, and that what the page shows is
   * as it was. Only the first sentence of study.builder's message is quoted:
   * what it says after that is advice for its own page, where its form is in
   * sight and holds the study's settings, and neither is so here.
   */
  function notOpened(app, name, error) {
    const [why] = messageOf(error).match(/^.*?[.!?](?=\s|$)/) || [messageOf(error)];
    return `${name} did not open. ${oneStop(why)} ${
      inUse(app) ? 'The study in use is unchanged.' : 'No study is in use.'
    }`;
  }

  /**
   * Open one of study.builder's studies and hand it to the app, with no R.
   * The study in use is the last thing the reader chose (#407, #427): the
   * page keeps one ordering of every choice (page.js's `choose`), so a study
   * still on its way when the reader chooses anything else, another of these,
   * a demo study, files of their own or Reset, is dropped when it arrives,
   * and says nothing if it fails.
   */
  async function openOffered(app, id, name, get) {
    // What is said while it opens is in place before the turn is taken (#431):
    // taking it draws the page again when a demo study was still loading, and
    // the chip keeps the line for a study chosen from its list only while
    // every draw since the choice had something on its way to say.
    let last = () => true;
    opening = { say: `Opening ${name}…`, last: () => last() };
    unopened = null;
    last = app.choose();
    app.retag();
    app.redrawView('studies');
    let study = null;
    let failed = null;
    try {
      study = await get();
    } catch (error) {
      failed = error || new Error('it could not be read');
    }
    if (!last()) return;
    opening = null;
    if (failed) unopened = { say: notOpened(app, name, failed), last };
    else {
      try {
        use(study, app, id);
      } catch (error) {
        // A study that arrived and could not be handed over: said as it is,
        // with no word on what is in use, since part of it may have loaded.
        unopened = {
          say: `${name} did not open. ${oneStop(messageOf(error))}`,
          last: app.choose()
        };
      }
    }
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
      notLoaded = messageOf(error);
      problem = `The builder cannot be shown: ${notLoaded}.`;
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

  /**
   * Credit the example protocols under the builder (#423). The builder's form
   * offers CDISC's five by name and shows the schedule of the one tried. The
   * words are the studies feed's own (`license`, `attribution`), fetched once,
   * when the builder is first shown.
   *
   * From study.builder v0.5.2 the widget says the attribution itself, under
   * its list of ready-made protocols and under every schedule grid, each in an
   * element it marks `data-attribution` (#428). Where one of those is on the
   * page the app's line would say the same thing a second time, so it is taken
   * off the page; it is put back whenever the widget shows none: an older
   * study.builder, a protocol of the reader's own that names no attribution,
   * a view of the widget with no schedule in it.
   */
  function creditProtocols(builder) {
    if (crediting || typeof builder.listStudies !== 'function') return;
    credit = el('div', 'sva-build-credit');
    crediting = builder
      .listStudies(`${base}studies/index.json`, { kinds: ['protocol'] })
      .then(protocolCredits, (error) => [
        `The example protocols’ attribution could not be read: ${messageOf(error)}`
      ])
      .then((lines) => {
        credit.replaceChildren(...lines.map((line) => el('p', null, line)));
      });
    // The widget draws itself again as the reader works in it: follow it.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(placeCredit).observe(holder, { childList: true, subtree: true });
    }
  }

  /** Put the app's credit under the widget, or take it off the page where the widget shows its own (#428). */
  function placeCredit() {
    if (!credit || !holder) return;
    if (holder.querySelector('[data-attribution]')) credit.remove();
    else if (holder.parentNode && credit.previousElementSibling !== holder) holder.after(credit);
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
      placeCredit();
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
          creditProtocols(builder);
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
    about: 'Simulate a study with a modified copy of gsm.datasim 2.1.0, in this browser.',
    /** study.builder's studies, for the app's list of studies (page.js's `portfolio`). */
    studies: {
      list(app) {
        if (!canBuild) return { studies: [] };
        if (!offered) {
          find(app);
          return { studies: [], busy: 'Looking for study.builder’s studies…' };
        }
        // Looked for again after a list that could not be read (#427).
        if (finding) return { studies: [], busy: 'Looking for study.builder’s studies…' };
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
        // What is on its way, or did not open, is said while it is still the
        // last thing the reader chose; what could not be listed, until it can.
        return {
          studies: entries,
          busy: opening && opening.last() ? opening.say : '',
          problem: unopened && unopened.last() ? unopened.say : listProblem
        };
      },
      add: canBuild
        ? [
            {
              id: 'describe',
              label: 'Describe a simulated study',
              about:
                'Phase, size, domains and layers. study.builder makes it in this browser: a few seconds, and about a minute the first time.',
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
      // A list of studies that could not be read is looked for again now
      // (#427): the script this asks for is the one the builder just asked
      // for, so the two cost one request, and once it has loaded the chip's
      // list and the Studies view name the ready-made and saved studies, and
      // a study built here is kept in this browser.
      if (listFailed) find(app);
      return {
        destroy() {
          if (shown && shown.container === container) shown = null;
        }
      };
    }
  };
}
