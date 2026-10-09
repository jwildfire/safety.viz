// Demo app: the page (#150, obot.roadmap#352). A full-page web app whose own
// chrome is a header and a footer, so the chart keeps the page's full width. The
// header carries the wordmark, a Data tab and one tab per domain, and beneath
// them the charts of the open domain, each with a status saying whether the
// loaded data supports it. The open chart's chip is emphasised and is the
// view's visible name. The main area shows the data view or one chart at a
// time; the footer carries the links. The data view has a sidebar of its own
// (data-panel.js, #159); a chart view has none, so the chart keeps the width.
// This is the only module of the app that touches the document. The parsing,
// placing, mapping and status rules it shows are the pure modules beside it,
// and its look is styles.js.
//
// The chart factories and the manifest are passed in rather than imported, so
// the page's own logic is testable without the charts and the same page serves
// the site and the single-file build. Further chart libraries can be passed in
// beside safety.viz's own (#181): their charts are listed, counted, mapped,
// drawn and destroyed exactly as its own are (libraries.js). A library whose
// charts take something other than a study's standard domains brings one view
// instead, a tab of its own (#235): the page gives it the main area and the
// app handle, and the view draws itself.

import { parseFile } from './parse.js';
import { placeFile } from './detect.js';
import {
  applySavedMapping,
  buildMapping,
  distinctValues,
  resolveColumn,
  serializeMappings,
  setColumn,
  setMeasure
} from './mapping.js';
import { chartStatus, supportedCount } from './status.js';
import { chartData, chartSettings, isDestination } from './charts.js';
import {
  OTHER_GROUP,
  DOMAIN_COLOURS,
  OWN_LIBRARY,
  chartGroups as groupCharts,
  groupLabel,
  groupOf,
  hueClass,
  libraryOf,
  mergeLibraries,
  tabColours
} from './libraries.js';
import { renderDataPanel } from './data-panel.js';
import { DEMO_STUDIES, studyUrls } from './studies.js';
import { dataTag, tabCount, welcomeSentence } from './header.js';
import { el, plural } from './dom.js';
import { tierNoteOf, tierOf } from '../tiers.js';
import { LOGO_SVG, STYLES } from './styles.js';

const STYLE_ID = 'safety-viz-app-styles';

/** The name the mapping file is offered for download under. */
export const MAPPING_FILE_NAME = 'safety-viz-mapping.json';

// Whether an object has a key of its own. A name from the address or from a
// file is looked up this way, never with a bare `object[name]`: "constructor"
// and "toString" are on every object.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The rows of a saved domain that are a column name or an explicit blank; anything else is passed over. */
const savedRows = (rows) =>
  Object.fromEntries(
    Object.entries(isRecord(rows) ? rows : {}).filter(
      ([, value]) => value === null || typeof value === 'string'
    )
  );

/**
 * A mapping file's content, when a dropped file is one: a JSON object carrying
 * the `safetyVizMapping` marker. Anything else is data, and returns null. The
 * file is a user's, so nothing in it is trusted to be the shape the app wrote:
 * only the manifest's own domains are kept, each as a file name and its rows.
 * @private
 */
function readMappingFile({ name, text }, manifest) {
  if (!/\.json$/i.test(name)) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !parsed.safetyVizMapping) return null;
  const domains = {};
  for (const [id, entry] of Object.entries(isRecord(parsed.domains) ? parsed.domains : {})) {
    if (!has(manifest.domains, id) || !isRecord(entry)) continue;
    domains[id] = {
      file: typeof entry.file === 'string' ? entry.file : null,
      columns: savedRows(entry.columns),
      measures: savedRows(entry.measures)
    };
  }
  return { ...parsed, domains };
}

/** The short status shown beside a chart in the list. */
function tagFor(status) {
  if (status.state === 'ready') return { text: 'ready', className: 'sva-tag sva-ready' };
  if (status.state === 'missing') {
    return { text: `${status.missing.length} missing`, className: 'sva-tag sva-missing' };
  }
  if (status.state === 'did not draw') {
    return { text: 'did not draw', className: 'sva-tag sva-missing' };
  }
  return { text: status.state, className: 'sva-tag' };
}

/**
 * A chart's name on its chip in the header. safety.viz's charts are safety
 * charts, so the word is dropped from theirs; the full title is the view's
 * heading and the chip's tooltip. Another library's titles are its own.
 */
const chipLabel = (entry, module) =>
  libraryOf(entry) === OWN_LIBRARY
    ? entry.title.replace(/\bSafety\s+/, '')
    : titleOf(entry, module);

/** A chart's own pages a footnote can link (#246), in the order shown: the key the page is given under, and the link's words. */
const CHART_PAGES = [
  ['guide', 'Clinical guide'],
  ['evidence', 'Test evidence']
];

/** A chart's title, or its module name when its entry gives none it can use (#193). */
const titleOf = (entry, module) =>
  typeof entry.title === 'string' && entry.title ? entry.title : module;

/** The hex beside a chart in the list: its domain's hue when ready, red when something is missing, hollow when it has nothing to read. */
function hexFor(status) {
  if (status.state === 'ready') return 'sva-hex';
  if (status.state === 'missing' || status.state === 'did not draw') return 'sva-hex sva-alarm';
  return 'sva-hex sva-hollow';
}

/** The sentence shown in the main pane for a chart that is not drawn. */
function sentenceFor(module, status, manifest) {
  const labels = status.missing.map((item) => item.label).join(', ');
  if (status.state === 'missing') return `Not mapped yet: ${labels}.`;
  if (status.state === 'no file') return `No file loaded for: ${labels}.`;
  if (status.state === 'did not draw') return `Did not draw. ${status.message}`;
  if (status.state === 'not loaded') return status.message;
  if (status.state === 'needs more domains') return manifest.modules[module].note;
  return '';
}

/**
 * Mount the demo app.
 * @param {string|Element} target The element, or a selector for it, to mount into.
 * @param {Object} options Mount options.
 * @param {Object} options.charts The chart factories, keyed by export name (the safety.viz module collection).
 * @param {Object} options.manifest The portfolio manifest.
 * @param {Array<{name: string, colour?: string, charts: ?Object, manifest: ?Object, file?: string, settings?: (Object|function(string): Object), action?: {state: function(): {label: string, done: boolean, note: string}, press: function(): void}, view?: {id: string, title: string, badge?: ?{text: string, title: string}, tag: function(): string, render: function(Element, Object): ?{destroy: Function}}}>} [options.libraries] Further chart libraries, each its name, its chart factories keyed by export name, and its chart list in the portfolio manifest's format (version 2). Their charts are listed after safety.viz's, under the groups their entries name, on a tab of the library's `colour`, a six-digit hex colour, or of the first colour no other tab uses when it names none (#268); a chart whose library or factory is missing, or whose entry cannot be read, reads "not loaded". A library handed in with no chart list the app can read is named on the page in every view, with `file`, the script the page loaded it from, when given (#193). A library may also bring `settings` added to each of its charts' settings when the chart is drawn (an object, or a function of the module name), and one `action`, a control shown with its charts that redraws the open chart when pressed (#183). A library that brings a `view` (#235) brings a tab of its own in place of charts: its `id` is the tab's address, `title` its name, `badge` a status shown beside the name, `tag()` what the tab's count says, and `render(container, app)` draws it and returns what tears it down. A view whose id is the data view's, a chart's or another view's is left out with a console warning.
 * @param {{base: string, studies?: Object[]}} [options.demo] Where the demo studies are served from, and which (default: {@link DEMO_STUDIES}); when given, the first study is loaded on mount and the data view offers each by name.
 * @param {{docs?: string, domains?: string, download?: string, github?: string}} [options.links] Where the footer's links go; a link with no address is left out. The wordmark is a link to `docs` too (#270).
 * @param {Object<string, {guide?: string, evidence?: string}>} [options.chartLinks] Each chart's own pages, keyed by module name: its clinical guide and its test evidence. A chart's view carries a footnote linking those it was given an address for (#246).
 * @param {Object<string, {tier: string, note?: string}>} [options.tiers] The rung of the status ladder each chart and each view stands on, keyed by module name or view id, with the sentence that says why where there is one (#272). A chart the page is told nothing of stands where its own entry says, by `tier` and `tierNote`, and on Exploratory when that names none.
 * @param {string} [options.version] The safety.viz version, shown in the footer.
 * @param {string} [options.title] The app's name in the browser tab's title, which names the open view before it: "RBQM · safety.viz demo" (#270).
 * @param {string} [options.pitch] What the footer says the app does with a study; the page that mounts it says what is true there (#183).
 * @param {(url: string) => Promise<string>} [options.fetchText] Fetches the demo extracts' text; defaults to `fetch`, refusing an answer that is not a success.
 * @param {(container: Element, app: Object) => void} [options.dataView] Renders the data view; defaults to the data panel.
 * @returns {{ready: Promise<void>, loadFiles: Function, loadRaw: Function, loadDemo: Function, reset: Function, select: Function, state: Object, destroy: Function}} The app handle.
 */
export function mountApp(
  target,
  {
    charts,
    manifest: ownManifest,
    libraries = [],
    demo = null,
    links = {},
    chartLinks = {},
    tiers = {},
    version = '',
    title: appName = 'safety.viz demo',
    pitch = 'Everything runs in this browser. Nothing is sent anywhere.',
    // An error page is not the file: a 404's body would otherwise be read as data.
    fetchText = (url) =>
      fetch(url).then((response) => {
        if (!response.ok) throw new Error(`${url} was answered with HTTP ${response.status}.`);
        return response.text();
      }),
    dataView = renderDataPanel
  } = {}
) {
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  // A library that brings a view brings a tab of its own, not charts (#235).
  const handed = Array.isArray(libraries) ? libraries : [];
  const bringsView = (library) =>
    isRecord(library) && isRecord(library.view) && typeof library.view.render === 'function';
  // Every chart the page lists, safety.viz's and any other library's, in one
  // manifest; and for those that cannot be drawn, why.
  const {
    manifest,
    problems,
    unloaded,
    libraries: extras,
    declaredBy,
    factoryOf
  } = mergeLibraries(
    ownManifest,
    charts,
    handed.filter((library) => !bringsView(library))
  );
  // Every tab has a colour (#268): a standard domain's is its class's, and a
  // library's is the one it names or the first no other tab uses, in the order
  // the libraries were handed in (libraries.js::tabColours).
  const colours = tabColours(
    handed,
    groupCharts(manifest)
      .map(([group]) => group)
      .filter((group) => !has(declaredBy, group) && has(DOMAIN_COLOURS, group))
      .map((group) => DOMAIN_COLOURS[group])
  );
  /** Paint an element with a library's colour; a standard domain's element is painted by its class. */
  const paint = (element, library) => {
    if (colours.has(library)) element.style.setProperty('--hue', colours.get(library));
    return element;
  };
  /** An element of a group, with the group's class and, for a library's group, its colour. */
  const inGroup = (tag, className, group) =>
    paint(el(tag, `${className} ${hueClass(group, manifest)}`), declaredBy[group]);
  const views = new Map();
  const viewLibrary = new Map(); // a view's id → the name of the library that brought it
  for (const { name, view } of handed.filter(bringsView)) {
    const id = typeof view.id === 'string' ? view.id : '';
    if (!id || id === 'data' || has(manifest.modules, id) || views.has(id)) {
      console.warn(
        `safety.viz app: a view was handed in with no id or an id already used (${id}); it was left out.`
      );
      continue;
    }
    views.set(id, view);
    viewLibrary.set(id, name);
  }
  // The rung of the status ladder a chart or a view stands on (#272): what the
  // page was told, or what the chart's own entry says, or Exploratory.
  const rungOf = (id) => {
    const told = has(tiers, id) && isRecord(tiers[id]) ? tiers[id] : null;
    const entry = told ? { tier: told.tier, tierNote: told.note } : manifest.modules[id];
    const note = tierNoteOf(entry);
    return { tier: tierOf(entry), ...(note ? { note } : {}) };
  };
  // What a library brings besides its charts (#183): settings for each of its
  // charts, and one control. Looked up by the library a chart's entry names,
  // among the libraries the merge used, so a second library of the same name
  // brings nothing, as it brings no charts (#193).
  const extraSettings = (module, entry) => {
    const library = extras.get(libraryOf(entry));
    if (!library || !library.settings) return {};
    return typeof library.settings === 'function' ? library.settings(module) : library.settings;
  };
  if (!document.getElementById(STYLE_ID)) {
    const style = el('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  const state = {
    files: {}, // domain → { name, columns, rows }
    mappings: {}, // domain → mapping
    placements: {}, // domain → the placeFile result for its file
    unplaced: [], // files that matched no domain, kept so they can be placed by hand
    raw: [], // gsm's raw files, kept as they are: { name, text, columns, rows }, rows a count
    saved: null, // a mapping file's content, applied to each domain as its file loads
    study: null, // the id of the demo study that is loaded, when what is loaded is one
    notes: [], // sentences about the last load: unplaced, unreadable, replaced
    failed: {}, // module → the message of a chart that was ready and threw
    focus: null, // the mapping row to return the keyboard focus to after a re-render
    welcome: false, // whether the welcome line is still to be read: set as the app opens on a study, never stored
    selected: 'data',
    busy: ''
  };
  let instance = null;
  const studies = demo ? demo.studies || DEMO_STUDIES : [];
  let demoRun = 0; // the latest demo study asked for; an earlier one still loading is dropped

  const status = () => {
    const computed = chartStatus(state.mappings, manifest, problems);
    for (const [module, message] of Object.entries(state.failed)) {
      if (computed[module].state === 'ready') {
        computed[module] = { state: 'did not draw', missing: [], message };
      }
    }
    return computed;
  };

  const isChart = (id) => has(manifest.modules, id);
  const isView = (id) => views.has(id);
  const tabTitle = (group) => groupLabel(group, manifest);
  const groupTitle = (group) =>
    group === OTHER_GROUP ? 'Outside the standard domains' : groupLabel(group, manifest);

  root.innerHTML = '';
  const app = el('div', 'sva-app');

  // The header: the wordmark, the Data tab and a tab per domain; and beneath
  // them the charts of the open domain, the open one emphasised. That chip is
  // the view's visible name: the heading and the overall count are kept for
  // screen readers and not shown.
  const header = el('header', 'sva-header');
  const bar = el('div', 'sva-bar');
  // The wordmark leads to the docs home when the page says where that is (#270).
  const brand = el(links.docs ? 'a' : 'div', 'sva-brand');
  if (links.docs) {
    brand.href = links.docs;
    brand.title = 'safety.viz: docs and chart gallery';
  }
  const logo = el('span', 'sva-logo');
  logo.innerHTML = LOGO_SVG;
  brand.append(
    logo,
    el('span', 'sva-wordmark', 'safety.viz'),
    el('span', 'sva-kicker', 'Demo app')
  );
  const tabs = el('nav', 'sva-tabs');
  tabs.setAttribute('aria-label', 'Data and domains');
  const count = el('div', 'sva-count');
  count.setAttribute('aria-live', 'polite');
  bar.append(brand, tabs);
  const chartRow = el('nav', 'sva-charts');
  chartRow.setAttribute('aria-label', 'Charts');
  header.append(bar, chartRow);

  // The main area: the view's heading and count for screen readers, and the
  // view beneath them.
  const main = el('main', 'sva-main');
  const head = el('div', 'sva-sechead');
  const title = el('h1', 'sva-title');
  head.append(title, count);
  const content = el('div', 'sva-content');
  // The welcome line (#269): whose data, how much, and where to load your own.
  // On first open only, above whatever is drawn; closed with its cross, and
  // held nowhere but in this page's memory.
  const welcome = el('div', 'sva-welcome');
  welcome.setAttribute('role', 'note');
  welcome.hidden = true;
  const welcomeText = el('p');
  const dismiss = el('button', 'sva-close', '×');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.onclick = () => {
    state.welcome = false;
    welcome.hidden = true;
  };
  welcome.append(welcomeText, dismiss);
  main.append(head, welcome);
  // A library the page asked for whose charts are not listed says so in every
  // view, with why: it is not left out without a word (#193).
  if (unloaded.length) {
    const notes = el('ul', 'sva-notes sva-library-notes');
    notes.setAttribute('role', 'status');
    for (const sentence of unloaded) notes.append(el('li', 'sva-note', sentence));
    main.append(notes);
  }
  main.append(content);

  // The footer: what the app does with your data, and the links.
  const footer = el('footer', 'sva-footer');
  const railLinks = el('ul', 'sva-links');
  for (const [key, label] of [
    ['docs', 'Docs and chart gallery'],
    ['domains', 'The standard domains'],
    ['download', 'Download as one file'],
    ['github', 'Source on GitHub']
  ]) {
    if (!links[key]) continue;
    const anchor = el('a', null, label);
    anchor.href = links[key];
    anchor.dataset.link = key;
    if (key === 'download') anchor.setAttribute('download', '');
    const item = el('li');
    item.append(anchor);
    railLinks.append(item);
  }
  if (version) railLinks.append(el('li', 'sva-version', `safety.viz ${version}`));
  footer.append(el('p', 'sva-pitch', pitch), railLinks);

  app.append(header, main, footer);
  root.append(app);

  function destroyChart() {
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
      } catch (error) {
        console.warn('safety.viz app: a chart did not tear down cleanly.', error);
      }
    }
    instance = null;
  }

  function renderHead(current) {
    const { ready, total } = supportedCount(current);
    // Spoken, not shown: each domain's tab already carries its own count.
    count.textContent = state.busy || `${ready} of ${total} charts supported by the loaded data`;
    renderWelcome(ready);
  }

  /**
   * The welcome line, while it is still to be read: for the study the app
   * opened on, on any view but the data view, where the files are loaded.
   */
  function renderWelcome(ready) {
    const [first] = studies;
    const due =
      state.welcome &&
      !state.busy &&
      state.selected !== 'data' &&
      Boolean(first) &&
      state.study === first.id &&
      typeof first.whose === 'string';
    welcome.hidden = !due;
    if (!due) return;
    const subject = state.files.subject;
    const id = subject && state.mappings.subject && state.mappings.subject.columns.USUBJID;
    const [before, after] = welcomeSentence({
      whose: first.whose,
      participants: id && id.value ? distinctValues(subject.rows, id.value).length : null,
      charts: ready,
      tabs: chartGroups().size + views.size
    });
    const link = el('a', null, 'Data');
    link.href = '#data';
    welcomeText.replaceChildren(before, link, after);
  }

  function navItem(id, label, tag, hexClass, fullTitle = label) {
    const button = el('button', 'sva-item');
    button.type = 'button';
    button.dataset.view = id;
    if (fullTitle !== label) button.title = fullTitle;
    if (state.selected === id) button.setAttribute('aria-current', 'page');
    button.append(
      el('span', hexClass),
      el('span', 'sva-item-title', label),
      el('span', tag.className, tag.text)
    );
    button.onclick = () => handle.select(id);
    return button;
  }

  /** The charts of each group, in the order their tabs come (libraries.js). */
  const chartGroups = () => new Map(groupCharts(manifest));

  function renderNav(current) {
    const open = isChart(state.selected) ? groupOf(manifest.modules[state.selected]) : null;
    const loaded = Object.keys(state.files).length + state.raw.length;
    tabs.innerHTML = '';
    tabs.append(
      navItem(
        'data',
        'Data',
        { className: 'sva-tag', text: dataTag({ study: state.study, loaded, studies }) },
        'sva-hex sva-spectrum'
      )
    );
    chartRow.innerHTML = '';
    chartRow.hidden = open === null;
    const placed = new Set();
    for (const [group, members] of chartGroups()) {
      // The tab: the domain, and how many of its charts the data supports.
      const states = members.map(([module]) => current[module].state);
      const readyHere = states.filter((value) => value === 'ready').length;
      const tab = inGroup('button', 'sva-tab', group);
      tab.type = 'button';
      tab.dataset.domain = group;
      tab.setAttribute('aria-pressed', String(open === group));
      const alarm = states.some((value) => value === 'missing' || value === 'did not draw');
      tab.append(
        el('span', alarm ? 'sva-hex sva-alarm' : readyHere ? 'sva-hex' : 'sva-hex sva-hollow'),
        el('span', 'sva-tab-title', tabTitle(group)),
        el('span', 'sva-tab-count', tabCount(readyHere, members.length))
      );
      // The one number is short for this, which the tab says on hover.
      tab.title = `${readyHere} of ${members.length} charts supported by the loaded data`;
      tab.onclick = () => handle.openDomain(group);
      tabs.append(tab);

      // Its charts: on the page for every domain, shown for the open one.
      const section = inGroup('div', 'sva-group', group);
      section.dataset.group = group;
      section.hidden = open !== group;
      section.append(el('h2', 'sva-group-title', groupTitle(group)));
      for (const [module, entry] of members) {
        section.append(
          navItem(
            module,
            chipLabel(entry, module),
            tagFor(current[module]),
            hexFor(current[module]),
            titleOf(entry, module)
          )
        );
      }
      // A library's control, once, at the head of the first group its charts
      // are in, so a phone shows it without scrolling the row.
      for (const name of new Set(members.map(([, entry]) => libraryOf(entry)))) {
        const library = extras.get(name);
        if (!library || !library.action || placed.has(name)) continue;
        placed.add(name);
        section.querySelector('.sva-group-title').after(...actionControl(name, library.action));
      }
      chartRow.append(section);
    }
    // A library's view (#235): a tab after the domains', with what the view
    // says of itself where a domain's tab counts its charts.
    for (const [id, view] of views) {
      const tab = paint(
        el('button', 'sva-tab sva-view-tab sva-library-group'),
        viewLibrary.get(id)
      );
      tab.type = 'button';
      tab.dataset.tab = id;
      tab.setAttribute('aria-pressed', String(state.selected === id));
      tab.append(el('span', 'sva-hex'), el('span', 'sva-tab-title', view.title));
      if (view.badge) {
        // Shown where the header has room for it on one line (styles.js); the
        // tab says it on hover at any width, and the view carries it too.
        const pill = el('span', 'sva-badge', view.badge.text);
        pill.title = view.badge.title;
        tab.title = `${view.badge.text}: ${view.badge.title}`;
        tab.append(pill);
      }
      tab.append(el('span', 'sva-tab-count', String(view.tag(handle))));
      tab.onclick = () => handle.select(id);
      tabs.append(tab);
    }
  }

  /**
   * Bring an element into view within the row that scrolls it, and move
   * nothing else: at phone width the tabs and the chart names each scroll
   * sideways in a row of their own (#271).
   */
  function reveal(row, element) {
    if (!row || !element || row.scrollWidth <= row.clientWidth) return;
    const rowBox = row.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    if (box.left < rowBox.left) row.scrollLeft -= rowBox.left - box.left + 8;
    else if (box.right > rowBox.right) row.scrollLeft += box.right - rowBox.right + 8;
  }

  /** The open tab and the open chart's name, each brought into view in its row. */
  function revealOpen() {
    reveal(tabs, tabs.querySelector('[aria-pressed=true], [aria-current=page]'));
    const group = chartRow.querySelector('.sva-group:not([hidden])');
    if (group) reveal(group, group.querySelector('[aria-current=page]'));
  }

  /**
   * After a library's control was pressed, and again when what it started has
   * settled: the header says what the control now says, and the open chart, if
   * it is one of that library's, is handed the library's settings as they now
   * are — not drawn again, so it keeps what the reader chose in it. Handed
   * them again once the start has settled, it no longer carries what was true
   * only while it ran, such as a note that R is starting (#193).
   */
  function afterAction(name) {
    const current = status();
    renderHead(current);
    renderNav(current);
    revealOpen();
    if (!isChart(state.selected)) return;
    const entry = manifest.modules[state.selected];
    if (!entry || libraryOf(entry) !== name || !instance) return;
    if (typeof instance.setSettings !== 'function') {
      render();
      return;
    }
    try {
      instance.setSettings(extraSettings(state.selected, entry));
    } catch (error) {
      console.warn(
        'safety.viz app: a chart did not take its new settings; it is drawn again.',
        error
      );
      render();
    }
  }

  /** A library's control as it says itself now: its button, and what it costs in words beside it. */
  function actionControl(name, action) {
    const { label, done, note, hint } = action.state();
    const button = el('button', 'sva-action', label);
    button.type = 'button';
    button.disabled = Boolean(done);
    if (note) button.title = note;
    button.onclick = () => {
      let settled;
      try {
        settled = action.press();
      } catch (error) {
        console.warn('safety.viz app: a library’s control failed when pressed.', error);
      }
      afterAction(name);
      if (settled && typeof settled.then === 'function') {
        const update = () => afterAction(name);
        settled.then(update, update);
      }
    };
    return hint ? [button, el('span', 'sva-action-hint', hint)] : [button];
  }

  /**
   * The footnote of a chart's view (#246): the chart's name and a link to each
   * of its own pages the app was given an address for. A link opens in a new
   * tab, so a study the reader loaded stays loaded. Null when the chart was
   * given no address.
   */
  function chartFootnote(module, entry) {
    const given = has(chartLinks, module) && isRecord(chartLinks[module]) ? chartLinks[module] : {};
    const anchors = CHART_PAGES.filter(([key]) => given[key] && typeof given[key] === 'string').map(
      ([key, label]) => {
        const anchor = el('a', null, label);
        anchor.href = given[key];
        anchor.dataset.link = key;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        return anchor;
      }
    );
    if (!anchors.length) return null;
    const footnote = el('p', 'sva-chart-links');
    footnote.append(el('span', 'sva-chart-links-title', `${titleOf(entry, module)}:`));
    anchors.forEach((anchor, index) => footnote.append(index ? ' · ' : ' ', anchor));
    return footnote;
  }

  function renderNotes(container) {
    if (!state.notes.length) return;
    const list = el('ul', 'sva-notes');
    for (const note of state.notes) list.append(el('li', 'sva-note', note));
    container.append(list);
  }

  function renderMain(current) {
    destroyChart();
    content.innerHTML = '';
    if (state.busy) content.append(el('p', 'sva-message sva-busy', state.busy));
    if (state.selected === 'data') {
      title.textContent = 'Data';
      renderNotes(content);
      const container = el('div', 'sva-data');
      content.append(container);
      dataView(container, handle);
      return;
    }
    if (isView(state.selected)) {
      const view = views.get(state.selected);
      title.textContent = view.title;
      renderNotes(content);
      const container = paint(el('div', 'sva-view'), viewLibrary.get(state.selected));
      content.append(container);
      try {
        instance = view.render(container, handle) || null;
      } catch (error) {
        instance = null;
        container.append(
          el(
            'p',
            'sva-message sva-problem',
            `Did not draw. ${error && error.message ? error.message : String(error)}`
          )
        );
      }
      return;
    }

    const module = state.selected;
    const entry = manifest.modules[module];
    title.textContent = titleOf(entry, module);
    // A chart that threw is drawn again as one that did not draw, footnote and all.
    if (!renderChart(current, module, entry)) {
      render();
      return;
    }
    const footnote = chartFootnote(module, entry);
    if (footnote) content.append(footnote);
  }

  /**
   * Draw the open chart, or the sentence that says why it is not drawn.
   * @returns {boolean} False when the chart was ready and threw: its message is kept, and the view is to be rendered again.
   */
  function renderChart(current, module, entry) {
    if (module === 'participant-profile' && libraryOf(entry) === OWN_LIBRARY) {
      const hosts = Object.entries(manifest.modules)
        .filter(([id, host]) => libraryOf(host) === OWN_LIBRARY && id !== module)
        .filter(([id]) => isDestination(id, manifest))
        .filter(([, host]) => host.domains.includes('bds') || host.domains.includes('eg'))
        .map(([, host]) => host.title);
      const sentence =
        current[module].state === 'ready'
          ? 'The participant profile opens beside a chart when you select a participant in it. ' +
            `Choose one of these charts and select a point or a row: ${hosts.join(', ')}.`
          : sentenceFor(module, current[module], manifest);
      content.append(el('p', 'sva-message', sentence));
      return true;
    }

    if (current[module].state !== 'ready') {
      const message = el('p', 'sva-message', sentenceFor(module, current[module], manifest));
      if (!['needs more domains', 'not loaded'].includes(current[module].state)) {
        message.classList.add('sva-problem');
      }
      content.append(message);
      return true;
    }

    const mount = inGroup('div', 'sva-chart', groupOf(entry));
    content.append(mount);
    try {
      instance = factoryOf(module)(mount, {
        ...chartSettings(module, state.mappings, manifest),
        ...extraSettings(module, entry)
      });
      instance.init(chartData(module, state.files, state.mappings, manifest));
    } catch (error) {
      destroyChart();
      state.failed[module] = error && error.message ? error.message : String(error);
      return false;
    }
    return true;
  }

  /** The open view's name as the browser tab says it: the name on its tab or its chip. */
  function viewName() {
    if (isChart(state.selected)) return chipLabel(manifest.modules[state.selected], state.selected);
    if (isView(state.selected)) return views.get(state.selected).title;
    return 'Data';
  }

  function render() {
    const current = status();
    renderHead(current);
    renderNav(current);
    renderMain(current);
    revealOpen();
    // The browser tab's title follows the open view (#270).
    document.title = `${viewName()} · ${appName}`;
  }

  function place(file) {
    // Labs and ECG share a shape; the measure names decide between them, and
    // they are read from whichever column either domain would map as its measure.
    const measure =
      resolveColumn(file.columns, 'bds', 'TEST').value ||
      resolveColumn(file.columns, 'eg', 'TEST').value;
    return placeFile(file.columns, manifest, {
      measureNames: distinctValues(file.rows, measure)
    });
  }

  /** Apply the held mapping file to one loaded domain, noting what it could not find. */
  function applySaved(domain) {
    const saved = state.saved && state.saved.domains[domain];
    if (!saved || !state.files[domain]) return;
    const { mapping, skipped } = applySavedMapping(
      state.mappings[domain],
      saved,
      state.files[domain]
    );
    state.mappings[domain] = mapping;
    if (skipped.length) {
      state.notes.push(
        `The saved mapping names ${skipped.join(', ')}, which ${state.files[domain].name} ` +
          'does not have; those rows were left as they were.'
      );
    }
  }

  /** Forget the loaded files and their mappings, placed or set aside. */
  function clearFiles() {
    state.files = {};
    state.mappings = {};
    state.placements = {};
    state.unplaced = [];
    state.raw = [];
  }

  /** Forget everything that was loaded: files, mappings, a held mapping file, notes. */
  function clear() {
    clearFiles();
    state.saved = null;
    state.study = null;
    state.notes = [];
    state.failed = {};
    state.focus = null;
  }

  /** The first chart the loaded data supports that is drawn in the main pane. */
  function firstReady() {
    const current = status();
    return (
      Object.keys(manifest.modules).find(
        (module) => isDestination(module, manifest) && current[module].state === 'ready'
      ) || null
    );
  }

  async function runDemo(id, open) {
    const study = studies.find((item) => item.id === id) || studies[0];
    if (!study) return;
    const run = ++demoRun;
    state.busy = 'Loading the demo study…';
    render();
    let texts;
    try {
      texts = await Promise.all(studyUrls(study, demo.base).map((url) => fetchText(url)));
    } catch (error) {
      if (run !== demoRun) return;
      state.busy = '';
      state.notes = [`The demo study could not be loaded: ${error.message}`];
      state.selected = 'data';
      render();
      return;
    }
    if (run !== demoRun) return;
    state.busy = '';
    clear();
    const list = study.files.map((name, index) => ({ name, text: texts[index] }));
    // A study of gsm's raw domains (#233) is kept as it is; any other is placed and mapped.
    // The welcome line is for the study the app opened on, and for no other.
    if (!studies[0] || study.id !== studies[0].id) state.welcome = false;
    if (study.raw) handle.loadRaw(list, { study: study.id });
    else handle.loadFiles(list, { study: study.id });
    if (!open) return;
    const wanted = window.location.hash.slice(1);
    handle.select(
      isChart(wanted) || isView(wanted) || wanted === 'data' ? wanted : firstReady() || 'data'
    );
  }

  const handle = {
    state,
    manifest,
    problems,
    studies,
    ready: Promise.resolve(),

    /** The first chart the loaded data supports, or null when none is ready. */
    firstReady,

    /** The current status of every chart, including any that did not draw. */
    status,

    /** The rung of the status ladder every chart and every view stands on, with its reason where it has one (#272). */
    tiers: () =>
      Object.fromEntries(
        [...Object.keys(manifest.modules), ...views.keys()].map((id) => [id, rungOf(id)])
      ),

    /**
     * Load parsed-or-not files: each `{ name, text }` is read, placed in a
     * domain and given its pre-filled mapping. A file that cannot be read or
     * placed is reported in a sentence and changes nothing.
     * @param {{name: string, text: string}[]} list The files' names and text.
     * @param {{notes?: string[], study?: ?string}} [options] Sentences to show with the load, and the demo study these files are, when they are one.
     * @returns {void}
     */
    loadFiles(list, { notes = [], study = null } = {}) {
      // Files of the user's own outrank a demo study still on its way: it is
      // dropped when it arrives, instead of replacing them.
      if (!study) {
        demoRun += 1;
        state.busy = '';
        state.welcome = false;
      }
      state.notes = [...notes];
      const mappingFiles = [];
      const data = [];
      for (const entry of list) {
        const saved = readMappingFile(entry, manifest);
        if (saved) mappingFiles.push({ saved, name: entry.name });
        else data.push(entry);
      }
      // Files of the user's own replace a demo study whole: placed one by one
      // they would displace its files and leave each of them set aside.
      const demoLoaded = studies.find((item) => item.id === state.study);
      if (!study && demoLoaded && data.length) {
        clearFiles();
        state.notes.push(`The demo study (${demoLoaded.label}) was cleared to load your files.`);
      }
      if (study || data.length) state.study = study;
      // A mapping file among them is read first, so the data files dropped
      // with it land where it says and take its rows.
      for (const { saved, name } of mappingFiles) handle.restoreMapping(saved, name);
      for (const { name, text } of data) {
        let file;
        try {
          file = parseFile(name, text);
        } catch (error) {
          state.notes.push(error.message);
          continue;
        }
        const placement = place(file);
        const remembered =
          state.saved &&
          Object.keys(state.saved.domains).find((id) => state.saved.domains[id].file === name);
        const domain = remembered || placement.domain;
        // A file of this name that was not placed before is replaced by this one.
        state.unplaced = state.unplaced.filter((item) => item.file.name !== name);
        if (!domain) {
          const found = placement.found.length ? ` (${placement.found.join(', ')})` : '';
          state.notes.push(
            `${name} was not placed in a domain: it matches at most ` +
              `${plural(placement.matched, 'column')} of any of them${found}.`
          );
          state.unplaced.push({ file, placement });
          continue;
        }
        handle.setFile(domain, file, placement);
      }
      state.failed = {};
      render();
    },

    /**
     * Keep gsm's raw files as they are (#233, obot.roadmap#374): each
     * `{ name, text }` is read for its column names and its count of rows, and
     * kept with its text. None is placed in a standard domain or given a
     * mapping: gsm's raw domains are not the standard domains, and nothing in
     * the mapping table applies to them. A file of a name already kept replaces
     * it; a file that cannot be read is reported in a sentence and changes
     * nothing.
     * @param {{name: string, text: string}[]} list The files' names and text.
     * @param {{notes?: string[], study?: ?string}} [options] Sentences to show with the load, and the demo study these files are, when they are one.
     * @returns {void}
     */
    loadRaw(list, { notes = [], study = null } = {}) {
      if (!study) {
        demoRun += 1;
        state.busy = '';
        state.welcome = false;
      }
      state.notes = [...notes];
      // Files of the user's own replace a demo study whole, as loadFiles does.
      const demoLoaded = studies.find((item) => item.id === state.study);
      if (!study && demoLoaded && list.length) {
        clearFiles();
        state.notes.push(`The demo study (${demoLoaded.label}) was cleared to load your files.`);
      }
      if (study || list.length) state.study = study;
      for (const { name, text } of list) {
        let file;
        try {
          file = parseFile(name, text);
        } catch (error) {
          state.notes.push(error.message);
          continue;
        }
        const kept = { name, text, columns: file.columns, rows: file.rows.length };
        const at = state.raw.findIndex((item) => item.name === name);
        if (at === -1) state.raw.push(kept);
        else state.raw[at] = kept;
      }
      state.failed = {};
      render();
    },

    /**
     * Put one parsed file in one domain. A file of another name that was there
     * is not dropped: it is kept on the page, set aside, and the page says so.
     * The same file loaded again replaces itself. A saved mapping for the
     * domain, when one is held, is applied over the pre-filled one.
     * @param {string} domain The manifest domain.
     * @param {Object} file The parsed file.
     * @param {Object} placement The placeFile result to keep with it.
     * @returns {void}
     */
    setFile(domain, file, placement) {
      const previous = state.files[domain];
      if (previous && previous.name !== file.name) {
        state.unplaced = state.unplaced.filter((item) => item.file.name !== previous.name);
        state.unplaced.push({ file: previous, placement: state.placements[domain] });
        state.notes.push(
          `${file.name} replaced ${previous.name} as the ${manifest.domains[domain].label} ` +
            `file; ${previous.name} is set aside.`
        );
      }
      state.files[domain] = file;
      state.placements[domain] = placement;
      state.mappings[domain] = buildMapping(domain, file, manifest);
      applySaved(domain);
    },

    /**
     * Move a file to another domain, or set it aside, by hand.
     * @param {{domain: string}|{unplaced: number}} source The file: the domain it is in, or its index among the unplaced.
     * @param {?string} domain The domain to place it in; null sets it aside.
     * @returns {void}
     */
    placeFileIn(source, domain) {
      state.notes = [];
      let item;
      if ('unplaced' in source) {
        [item] = state.unplaced.splice(source.unplaced, 1);
      } else {
        item = { file: state.files[source.domain], placement: state.placements[source.domain] };
        delete state.files[source.domain];
        delete state.mappings[source.domain];
        delete state.placements[source.domain];
      }
      if (domain) handle.setFile(domain, item.file, item.placement);
      else state.unplaced.push(item);
      state.failed = {};
      render();
    },

    /**
     * Set one column row of a domain's mapping by hand.
     * @param {string} domain The manifest domain.
     * @param {string} column The manifest column.
     * @param {?string} value The file's column, or null to clear the row.
     * @returns {void}
     */
    setColumn(domain, column, value) {
      state.mappings[domain] = setColumn(
        state.mappings[domain],
        column,
        value,
        state.files[domain]
      );
      state.focus = { domain, kind: 'column', key: column };
      handle.refresh();
    },

    /**
     * Set one key-measure row of a domain's mapping by hand.
     * @param {string} domain The manifest domain.
     * @param {string} key The measure key.
     * @param {?string} value What the data calls the measure, or null to clear the row.
     * @returns {void}
     */
    setMeasure(domain, key, value) {
      state.mappings[domain] = setMeasure(state.mappings[domain], key, value);
      state.focus = { domain, kind: 'measure', key };
      handle.refresh();
    },

    /**
     * Hold a mapping file's content and apply it to what is already loaded: a
     * loaded file it names is moved to the domain it names, from another
     * domain or from among the unplaced, and every domain it covers takes its
     * rows. Domains loaded later take it as their files arrive.
     * @param {Object} saved The mapping file's content, as readMappingFile returns it.
     * @param {string} name The mapping file's name, for the note.
     * @returns {void}
     */
    restoreMapping(saved, name) {
      state.saved = saved;
      const domains = Object.keys(manifest.domains).filter((domain) => saved.domains[domain]);
      if (!domains.length) {
        state.notes.push(
          `${name} is a saved mapping, but it names no domain: nothing was restored.`
        );
        return;
      }
      const named = domains.map((domain) => {
        const { file } = saved.domains[domain];
        return `${manifest.domains[domain].label}${file ? ` (${file})` : ''}`;
      });
      state.notes.push(`${name} is a saved mapping for: ${named.join(', ')}.`);
      // Every file that has to move is taken out first and placed after, so
      // two files that swap domains do not displace one another.
      const moves = [];
      for (const domain of domains) {
        const wanted = saved.domains[domain].file;
        if (!wanted || (state.files[domain] && state.files[domain].name === wanted)) continue;
        const from = Object.keys(state.files).find((id) => state.files[id].name === wanted);
        const item = from
          ? { file: state.files[from], placement: state.placements[from] }
          : state.unplaced.find((entry) => entry.file.name === wanted);
        if (item) moves.push({ domain, from, item });
      }
      for (const { from, item } of moves) {
        if (from) {
          delete state.files[from];
          delete state.mappings[from];
          delete state.placements[from];
        } else {
          state.unplaced = state.unplaced.filter((entry) => entry.file !== item.file);
        }
      }
      // setFile applies the saved rows to a file it places; the domains whose
      // file stayed where it was take them here.
      for (const { domain, item } of moves) handle.setFile(domain, item.file, item.placement);
      const moved = new Set(moves.map((move) => move.domain));
      for (const domain of domains) if (!moved.has(domain)) applySaved(domain);
    },

    /** The mapping file's content for what is loaded now. */
    mappingFile() {
      return serializeMappings(state.files, state.mappings);
    },

    /** Offer the mapping file as a download; nothing leaves the browser. */
    downloadMapping() {
      const blob = new Blob([`${JSON.stringify(handle.mappingFile(), null, 2)}\n`], {
        type: 'application/json'
      });
      const link = el('a');
      link.href = URL.createObjectURL(blob);
      link.download = MAPPING_FILE_NAME;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    },

    /**
     * Fetch and load a demo study, replacing whatever is loaded. A study that
     * cannot be fetched is reported in a sentence and changes nothing.
     * @param {string} [id] The study's id; the first study when left out.
     * @param {{open?: boolean}} [options] `open` then shows the chart named in the URL's hash, or the first chart the data supports; otherwise the view stays where it is.
     * @returns {Promise<void>} Settles when the study is on the page; also kept as `ready`.
     */
    loadDemo(id, { open = false } = {}) {
      handle.ready = runDemo(id, open);
      return handle.ready;
    },

    /**
     * Clear every file, mapping, held mapping file and note, and show the
     * empty data view.
     * @returns {void}
     */
    reset() {
      demoRun += 1;
      state.busy = '';
      state.welcome = false;
      clear();
      handle.select('data');
    },

    /**
     * Open a domain's tab: show its charts and draw the first one the data
     * supports, or its first chart when none is ready, which says what is missing.
     * @param {string} group A domain id from the manifest, or `other` for charts outside the standard set.
     * @returns {void}
     */
    openDomain(group) {
      const current = status();
      const members = chartGroups().get(group) || [];
      const [module] =
        members.find(([id]) => current[id].state === 'ready' && isDestination(id, manifest)) ||
        members[0] ||
        [];
      if (module) handle.select(module);
    },

    /**
     * Show the data view or one chart.
     * @param {string} id `'data'`, a module name from the manifest, or the id of a library's view.
     * @returns {void}
     */
    select(id) {
      state.selected = id === 'data' || isChart(id) || isView(id) ? id : 'data';
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', `#${state.selected}`);
      }
      render();
    },

    /** Re-render after a change the caller made to the state (a mapping edit). */
    refresh() {
      state.failed = {};
      render();
    },

    /** Say again what each tab says of itself, and leave the open view as it is. */
    retag() {
      const current = status();
      renderHead(current);
      renderNav(current);
      revealOpen();
    },

    /**
     * A library's view changed (#235): its tab says what it now says, and the
     * view is drawn again if it is the one open. Any other open view is left
     * as it is.
     * @param {string} id The view's id.
     * @returns {void}
     */
    redrawView(id) {
      if (state.selected === id && isView(id)) render();
      else handle.retag();
    },

    /** Tear the page down: destroy the mounted chart, stop following the address and empty the target. */
    destroy() {
      window.removeEventListener('hashchange', followAddress);
      destroyChart();
      root.innerHTML = '';
      document.title = appName;
    }
  };

  // The app follows the address (#163): a hash changed after loading — typed,
  // followed as a link, or reached by back and forward — opens the view it
  // names. A hash that names no view is ignored. select() writes the address
  // with replaceState, which raises no hashchange, so this cannot loop.
  function followAddress() {
    const wanted = window.location.hash.slice(1);
    if (wanted === state.selected) return;
    if (wanted === 'data' || isChart(wanted) || isView(wanted)) handle.select(wanted);
  }
  window.addEventListener('hashchange', followAddress);

  render();
  if (studies.length) {
    state.welcome = true;
    handle.loadDemo(studies[0].id, { open: true });
  }
  return handle;
}
