// Portfolio app: the page (#150, obot.roadmap#352). Every chart in the manifest
// behind one list, grouped by the domain it reads, each with a status saying
// whether the loaded data supports it; one chart drawn at a time in the main
// pane. This is the only module of the app that touches the document. The
// parsing, placing, mapping and status rules it shows are the pure modules
// beside it.
//
// The chart factories and the manifest are passed in rather than imported, so
// the page's own logic is testable without the charts and the same page serves
// the site and the single-file build.

import { parseFile } from './parse.js';
import { placeFile } from './detect.js';
import { buildMapping, distinctValues, resolveColumn } from './mapping.js';
import { chartStatus, supportedCount } from './status.js';
import { chartData, chartSettings, isDestination } from './charts.js';

const STYLE_ID = 'safety-viz-app-styles';

const STYLES = `
.sva-app{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2933;font-size:.95rem}
.sva-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem;padding:.6rem .9rem;border:1px solid #d8dee4;border-radius:10px;background:#f6f8fa;margin-bottom:1rem}
.sva-count{font-weight:600}
.sva-actions{display:flex;flex-wrap:wrap;gap:.5rem}
.sva-button{border:1px solid #b8c0cc;border-radius:6px;background:#fff;color:#1f2933;font:inherit;font-size:.85rem;padding:.35rem .7rem;cursor:pointer}
.sva-button:hover{border-color:#0b62a4;color:#0b62a4}
.sva-button:focus-visible,.sva-item:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sva-body{display:grid;grid-template-columns:15.5rem minmax(0,1fr);gap:1.25rem;align-items:start}
.sva-nav{border:1px solid #d8dee4;border-radius:10px;background:#fff;padding:.5rem}
.sva-app .sva-group-title{margin:.9rem .4rem .3rem;font-family:inherit;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#52616f}
.sva-item{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;border:0;border-radius:6px;background:none;color:inherit;font:inherit;font-size:.88rem;text-align:left;padding:.35rem .4rem;cursor:pointer}
.sva-item:hover{background:#f0f3f6}
.sva-item[aria-current=page]{background:#e3eef8;font-weight:600}
.sva-tag{flex:none;border-radius:999px;padding:.1rem .5rem;font-size:.7rem;font-weight:600;white-space:nowrap;background:#eef1f4;color:#52616f}
.sva-tag.sva-ready{background:#e3f4ec;color:#146c43}
.sva-tag.sva-missing{background:#fbe9e5;color:#a23a22}
.sva-main{min-width:0}
.sva-app .sva-title{margin:0 0 .5rem;font-family:inherit;font-size:1.25rem;font-weight:700}
.sva-message{margin:0 0 1rem;padding:.7rem .9rem;border:1px solid #d8dee4;border-left:3px solid #0b62a4;border-radius:6px;background:#f6f8fa}
.sva-message.sva-problem{border-left-color:#a23a22}
.sva-notes{margin:0 0 1rem;padding:0;list-style:none}
.sva-note{margin:0 0 .4rem;padding:.5rem .8rem;border:1px solid #f0d9a8;border-radius:6px;background:#fdf6e3}
.sva-files{width:100%;border-collapse:collapse;font-size:.88rem}
.sva-files th,.sva-files td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #e3e8ee;vertical-align:top}
.sva-files th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#52616f}
.sva-scroll{overflow-x:auto}
@media (max-width:760px){.sva-body{grid-template-columns:minmax(0,1fr)}}
`;

const OTHER_GROUP = 'other';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
 * Mount the portfolio app.
 * @param {string|Element} target The element, or a selector for it, to mount into.
 * @param {Object} options Mount options.
 * @param {Object} options.charts The chart factories, keyed by export name (the safety.viz module collection).
 * @param {Object} options.manifest The portfolio manifest.
 * @param {{base: string}} [options.demo] Where the demo extracts are served from; when given, the demo study is loaded on mount and a Load demo data button is offered.
 * @param {(url: string) => Promise<string>} [options.fetchText] Fetches the demo extracts' text; defaults to `fetch`.
 * @param {(container: Element, app: Object) => void} [options.dataView] Renders the data view; defaults to a summary of the loaded files.
 * @returns {{ready: Promise<void>, loadFiles: Function, loadDemo: Function, select: Function, state: Object, destroy: Function}} The app handle.
 */
export function mountApp(
  target,
  {
    charts,
    manifest,
    demo = null,
    fetchText = (url) => fetch(url).then((response) => response.text()),
    dataView = renderDataSummary
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
    notes: [], // sentences about the last load: unplaced, unreadable, replaced
    failed: {}, // module → the message of a chart that was ready and threw
    selected: 'data',
    busy: ''
  };
  let instance = null;

  const status = () => {
    const computed = chartStatus(state.mappings, manifest);
    for (const [module, message] of Object.entries(state.failed)) {
      if (computed[module].state === 'ready') {
        computed[module] = { state: 'did not draw', missing: [], message };
      }
    }
    return computed;
  };

  const groupOf = (entry) => (entry.externalDomains ? OTHER_GROUP : entry.domains[0]);
  const groupTitle = (group) =>
    group === OTHER_GROUP ? 'Outside the standard domains' : manifest.domains[group].label;

  root.innerHTML = '';
  const app = el('div', 'sva-app');
  const bar = el('div', 'sva-bar');
  const count = el('div', 'sva-count');
  count.setAttribute('aria-live', 'polite');
  const actions = el('div', 'sva-actions');
  bar.append(count, actions);
  const body = el('div', 'sva-body');
  const nav = el('nav', 'sva-nav');
  nav.setAttribute('aria-label', 'Data and charts');
  const main = el('section', 'sva-main');
  body.append(nav, main);
  app.append(bar, body);
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

  function renderBar(current) {
    const { ready, total } = supportedCount(current);
    count.textContent = state.busy || `${ready} of ${total} charts supported by the loaded data`;
    actions.innerHTML = '';
    if (demo) {
      const button = el('button', 'sva-button', 'Load demo data');
      button.type = 'button';
      button.dataset.action = 'demo';
      button.onclick = () => handle.loadDemo();
      actions.append(button);
    }
  }

  function navItem(id, title, tag) {
    const button = el('button', 'sva-item');
    button.type = 'button';
    button.dataset.view = id;
    if (state.selected === id) button.setAttribute('aria-current', 'page');
    button.append(el('span', 'sva-item-title', title), el('span', tag.className, tag.text));
    button.onclick = () => handle.select(id);
    return button;
  }

  function renderNav(current) {
    nav.innerHTML = '';
    const loaded = Object.keys(state.files).length;
    nav.append(
      navItem('data', 'Data', {
        className: 'sva-tag',
        text: loaded ? plural(loaded, 'file') : 'no files'
      })
    );
    const groups = new Map();
    for (const [module, entry] of Object.entries(manifest.modules)) {
      const group = groupOf(entry);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([module, entry]);
    }
    for (const [group, members] of groups) {
      const section = el('div', 'sva-group');
      section.dataset.group = group;
      section.append(el('h3', 'sva-group-title', groupTitle(group)));
      for (const [module, entry] of members) {
        section.append(navItem(module, entry.title, tagFor(current[module])));
      }
      nav.append(section);
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
    main.innerHTML = '';
    if (state.selected === 'data') {
      main.append(el('h2', 'sva-title', 'Data'));
      renderNotes(main);
      const container = el('div', 'sva-data');
      main.append(container);
      dataView(container, handle);
      return;
    }

    const module = state.selected;
    const entry = manifest.modules[module];
    main.append(el('h2', 'sva-title', entry.title));

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
      main.append(el('p', 'sva-message', sentence));
      return;
    }

    if (current[module].state !== 'ready') {
      const message = el('p', 'sva-message', sentenceFor(module, current[module], manifest));
      if (current[module].state !== 'needs more domains') message.classList.add('sva-problem');
      main.append(message);
      return;
    }

    const mount = el('div', 'sva-chart');
    main.append(mount);
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
    renderBar(current);
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

  const handle = {
    state,
    manifest,
    ready: Promise.resolve(),

    /** The current status of every chart, including any that did not draw. */
    status,

    /**
     * Load parsed-or-not files: each `{ name, text }` is read, placed in a
     * domain and given its pre-filled mapping. A file that cannot be read or
     * placed is reported in a sentence and changes nothing.
     * @param {{name: string, text: string}[]} list The files' names and text.
     * @returns {void}
     */
    loadFiles(list) {
      state.notes = [];
      for (const { name, text } of list) {
        let file;
        try {
          file = parseFile(name, text);
        } catch (error) {
          state.notes.push(error.message);
          continue;
        }
        const placement = place(file);
        if (!placement.domain) {
          const found = placement.found.length ? ` (${placement.found.join(', ')})` : '';
          state.notes.push(
            `${name} was not placed in a domain: it matches at most ` +
              `${plural(placement.matched, 'column')} of any of them${found}.`
          );
          continue;
        }
        handle.setFile(placement.domain, file, placement);
      }
      state.failed = {};
      render();
    },

    /**
     * Put one parsed file in one domain, replacing whatever was there.
     * @param {string} domain The manifest domain.
     * @param {Object} file The parsed file.
     * @param {Object} placement The placeFile result to keep with it.
     * @returns {void}
     */
    setFile(domain, file, placement) {
      const previous = state.files[domain];
      if (previous && previous.name !== file.name) {
        state.notes.push(
          `${file.name} replaced ${previous.name} as the ${manifest.domains[domain].label} file.`
        );
      }
      state.files[domain] = file;
      state.placements[domain] = placement;
      state.mappings[domain] = buildMapping(domain, file, manifest);
    },

    /**
     * Fetch and load the demo study, then open the chart named in the URL's
     * hash, or the first chart the data supports.
     * @returns {Promise<void>} Settles when the demo study is on the page.
     */
    async loadDemo() {
      state.busy = 'Loading the demo study…';
      render();
      try {
        const names = Object.values(manifest.domains).map((domain) => domain.demo);
        const texts = await Promise.all(names.map((name) => fetchText(`${demo.base}${name}`)));
        state.busy = '';
        handle.loadFiles(names.map((name, index) => ({ name, text: texts[index] })));
      } catch (error) {
        state.busy = '';
        state.notes = [`The demo study could not be loaded: ${error.message}`];
        state.selected = 'data';
        render();
        return;
      }
      const current = status();
      const wanted = window.location.hash.slice(1);
      const first = Object.keys(manifest.modules).find(
        (module) => isDestination(module, manifest) && current[module].state === 'ready'
      );
      handle.select(manifest.modules[wanted] || wanted === 'data' ? wanted : first || 'data');
    },

    /**
     * Show the data view or one chart.
     * @param {string} id `'data'` or a module name from the manifest.
     * @returns {void}
     */
    select(id) {
      state.selected = id === 'data' || manifest.modules[id] ? id : 'data';
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

    /** Tear the page down: destroy the mounted chart and empty the target. */
    destroy() {
      destroyChart();
      root.innerHTML = '';
    }
  };

  render();
  if (demo) handle.ready = handle.loadDemo();
  return handle;
}

/**
 * The data view's default: one row per loaded file, saying which domain it was
 * placed in, how many of that domain's columns it carries, and its size.
 * @param {Element} container The element to render into.
 * @param {Object} app The app handle from {@link mountApp}.
 * @returns {void}
 */
export function renderDataSummary(container, app) {
  const { files, placements } = app.state;
  const domains = Object.keys(app.manifest.domains).filter((domain) => files[domain]);
  if (!domains.length) {
    container.append(el('p', 'sva-message', 'No files are loaded.'));
    return;
  }
  const scroll = el('div', 'sva-scroll');
  const table = el('table', 'sva-files');
  const head = el('tr');
  for (const title of ['File', 'Domain', 'Columns found', 'Rows'])
    head.append(el('th', null, title));
  table.append(head);
  for (const domain of domains) {
    const row = el('tr');
    row.dataset.domain = domain;
    const placement = placements[domain];
    row.append(
      el('td', null, files[domain].name),
      el('td', null, app.manifest.domains[domain].label),
      el('td', null, `${placement.matched} of ${placement.of}`),
      el('td', null, files[domain].rows.length.toLocaleString('en-US'))
    );
    table.append(row);
  }
  scroll.append(table);
  container.append(scroll);
}
