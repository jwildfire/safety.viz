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
// the site and the single-file build.

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
import { renderDataPanel } from './data-panel.js';
import { DEMO_STUDIES, studyUrls } from './studies.js';
import { el, plural } from './dom.js';
import { LOGO_SVG, STYLES } from './styles.js';

const STYLE_ID = 'safety-viz-app-styles';

/** The name the mapping file is offered for download under. */
export const MAPPING_FILE_NAME = 'safety-viz-mapping.json';

const OTHER_GROUP = 'other';

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
 * A chart's name on its chip in the header. Every chart here is a safety chart,
 * so the word is dropped; the full title is the view's heading and the chip's
 * tooltip.
 */
const chipLabel = (title) => title.replace(/\bSafety\s+/, '');

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
  if (status.state === 'needs more domains') return manifest.modules[module].note;
  return '';
}

/**
 * Mount the demo app.
 * @param {string|Element} target The element, or a selector for it, to mount into.
 * @param {Object} options Mount options.
 * @param {Object} options.charts The chart factories, keyed by export name (the safety.viz module collection).
 * @param {Object} options.manifest The portfolio manifest.
 * @param {{base: string, studies?: Object[]}} [options.demo] Where the demo studies are served from, and which (default: {@link DEMO_STUDIES}); when given, the first study is loaded on mount and the data view offers each by name.
 * @param {{docs?: string, domains?: string, download?: string, github?: string}} [options.links] Where the footer's links go; a link with no address is left out.
 * @param {string} [options.version] The safety.viz version, shown in the footer.
 * @param {(url: string) => Promise<string>} [options.fetchText] Fetches the demo extracts' text; defaults to `fetch`, refusing an answer that is not a success.
 * @param {(container: Element, app: Object) => void} [options.dataView] Renders the data view; defaults to the data panel.
 * @returns {{ready: Promise<void>, loadFiles: Function, loadDemo: Function, reset: Function, select: Function, state: Object, destroy: Function}} The app handle.
 */
export function mountApp(
  target,
  {
    charts,
    manifest,
    demo = null,
    links = {},
    version = '',
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
    saved: null, // a mapping file's content, applied to each domain as its file loads
    study: null, // the id of the demo study that is loaded, when what is loaded is one
    notes: [], // sentences about the last load: unplaced, unreadable, replaced
    failed: {}, // module → the message of a chart that was ready and threw
    focus: null, // the mapping row to return the keyboard focus to after a re-render
    selected: 'data',
    busy: ''
  };
  let instance = null;
  const studies = demo ? demo.studies || DEMO_STUDIES : [];
  let demoRun = 0; // the latest demo study asked for; an earlier one still loading is dropped

  const status = () => {
    const computed = chartStatus(state.mappings, manifest);
    for (const [module, message] of Object.entries(state.failed)) {
      if (computed[module].state === 'ready') {
        computed[module] = { state: 'did not draw', missing: [], message };
      }
    }
    return computed;
  };

  const isChart = (id) => has(manifest.modules, id);
  const groupOf = (entry) => (entry.externalDomains ? OTHER_GROUP : entry.domains[0]);
  const tabTitle = (group) => (group === OTHER_GROUP ? 'Other' : manifest.domains[group].label);
  const groupTitle = (group) =>
    group === OTHER_GROUP ? 'Outside the standard domains' : manifest.domains[group].label;

  root.innerHTML = '';
  const app = el('div', 'sva-app');

  // The header: the wordmark, the Data tab and a tab per domain; and beneath
  // them the charts of the open domain, the open one emphasised. That chip is
  // the view's visible name: the heading and the overall count are kept for
  // screen readers and not shown.
  const header = el('header', 'sva-header');
  const bar = el('div', 'sva-bar');
  const brand = el('div', 'sva-brand');
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
  main.append(head, content);

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
  footer.append(
    el('p', 'sva-pitch', 'Everything runs in this browser. Nothing is sent anywhere.'),
    railLinks
  );

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

  /** The charts of each group, in manifest order. */
  function chartGroups() {
    const groups = new Map();
    for (const [module, entry] of Object.entries(manifest.modules)) {
      const group = groupOf(entry);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([module, entry]);
    }
    return groups;
  }

  function renderNav(current) {
    const open = state.selected === 'data' ? null : groupOf(manifest.modules[state.selected]);
    const loaded = Object.keys(state.files).length;
    tabs.innerHTML = '';
    tabs.append(
      navItem(
        'data',
        'Data',
        { className: 'sva-tag', text: loaded ? plural(loaded, 'file') : 'no files' },
        'sva-hex sva-spectrum'
      )
    );
    chartRow.innerHTML = '';
    chartRow.hidden = open === null;
    for (const [group, members] of chartGroups()) {
      // The tab: the domain, and how many of its charts the data supports.
      const states = members.map(([module]) => current[module].state);
      const readyHere = states.filter((value) => value === 'ready').length;
      const tab = el('button', `sva-tab sva-domain-${group}`);
      tab.type = 'button';
      tab.dataset.domain = group;
      tab.setAttribute('aria-pressed', String(open === group));
      const alarm = states.some((value) => value === 'missing' || value === 'did not draw');
      tab.append(
        el('span', alarm ? 'sva-hex sva-alarm' : readyHere ? 'sva-hex' : 'sva-hex sva-hollow'),
        el('span', 'sva-tab-title', tabTitle(group)),
        el('span', 'sva-tab-count', `${readyHere} of ${members.length}`)
      );
      tab.onclick = () => handle.openDomain(group);
      tabs.append(tab);

      // Its charts: on the page for every domain, shown for the open one.
      const section = el('div', `sva-group sva-domain-${group}`);
      section.dataset.group = group;
      section.hidden = open !== group;
      section.append(el('h2', 'sva-group-title', groupTitle(group)));
      for (const [module, entry] of members) {
        section.append(
          navItem(
            module,
            chipLabel(entry.title),
            tagFor(current[module]),
            hexFor(current[module]),
            entry.title
          )
        );
      }
      chartRow.append(section);
    }
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

    const module = state.selected;
    const entry = manifest.modules[module];
    title.textContent = entry.title;

    if (module === 'participant-profile') {
      const hosts = Object.entries(manifest.modules)
        .filter(([id]) => id !== module && isDestination(id, manifest))
        .filter(([, host]) => host.domains.includes('bds') || host.domains.includes('eg'))
        .map(([, host]) => host.title);
      const sentence =
        current[module].state === 'ready'
          ? 'The participant profile opens beside a chart when you select a participant in it. ' +
            `Choose one of these charts and select a point or a row: ${hosts.join(', ')}.`
          : sentenceFor(module, current[module], manifest);
      content.append(el('p', 'sva-message', sentence));
      return;
    }

    if (current[module].state !== 'ready') {
      const message = el('p', 'sva-message', sentenceFor(module, current[module], manifest));
      if (current[module].state !== 'needs more domains') message.classList.add('sva-problem');
      content.append(message);
      return;
    }

    const mount = el('div', `sva-chart sva-domain-${groupOf(entry)}`);
    content.append(mount);
    try {
      instance = charts[entry.export](mount, chartSettings(module, state.mappings, manifest));
      instance.init(chartData(module, state.files, state.mappings, manifest));
    } catch (error) {
      destroyChart();
      state.failed[module] = error && error.message ? error.message : String(error);
      render();
    }
  }

  function render() {
    const current = status();
    renderHead(current);
    renderNav(current);
    renderMain(current);
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
    handle.loadFiles(
      study.files.map((name, index) => ({ name, text: texts[index] })),
      { study: study.id }
    );
    if (!open) return;
    const wanted = window.location.hash.slice(1);
    handle.select(isChart(wanted) || wanted === 'data' ? wanted : firstReady() || 'data');
  }

  const handle = {
    state,
    manifest,
    studies,
    ready: Promise.resolve(),

    /** The first chart the loaded data supports, or null when none is ready. */
    firstReady,

    /** The current status of every chart, including any that did not draw. */
    status,

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
     * @param {string} id `'data'` or a module name from the manifest.
     * @returns {void}
     */
    select(id) {
      state.selected = id === 'data' || isChart(id) ? id : 'data';
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

    /** Tear the page down: destroy the mounted chart, stop following the address and empty the target. */
    destroy() {
      window.removeEventListener('hashchange', followAddress);
      destroyChart();
      root.innerHTML = '';
    }
  };

  // The app follows the address (#163): a hash changed after loading — typed,
  // followed as a link, or reached by back and forward — opens the view it
  // names. A hash that names no view is ignored. select() writes the address
  // with replaceState, which raises no hashchange, so this cannot loop.
  function followAddress() {
    const wanted = window.location.hash.slice(1);
    if (wanted === state.selected) return;
    if (wanted === 'data' || isChart(wanted)) handle.select(wanted);
  }
  window.addEventListener('hashchange', followAddress);

  render();
  if (studies.length) handle.loadDemo(studies[0].id, { open: true });
  return handle;
}
