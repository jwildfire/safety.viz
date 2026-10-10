// Demo app: the data panel (#151, #159, obot.roadmap#352). Where a user's own
// files come in: a drop zone that reads them in the browser, and under each
// file one table mapping what the charts need to what the file has — its
// columns, and the names of the key measures — pre-filled, with every guess
// labelled and every empty row priced in the charts that need it.
//
// Beside them, on this view only, a sidebar: the three steps of the work as
// live status, each carrying its own actions, and the loaded files, each
// flagged only where a row wants a look.
//
// Every file comes in here (#282, obot.roadmap#406), a tab's own files too. A
// tab that takes files of its own says so through the seam (libraries.js): the
// page asks it of each file loaded, and this panel draws what the tab says the
// loaded data supports as one card (#281). The panel knows nothing else of
// such a tab: no name of anything the tab runs, and no name of a file it takes.
//
// Nothing here fetches, posts or stores anything: files are read with the File
// API and the mapping is saved by offering a file to download.

import { MEASURES, distinctValues, measureColumn } from './mapping.js';
import { neededBy, supportedCount } from './status.js';
import { el, plural } from './dom.js';
import { icon } from './icons.js';

/** Files larger than this are refused: they are parsed in memory. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const NOT_MAPPED = '';

const rowCount = (count) => `${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}`;

/**
 * Read dropped or chosen files into `{ name, text }` pairs, refusing in one
 * sentence each any that is too large to parse in memory or that the browser
 * cannot open (a dropped folder). One refused file does not lose the others.
 * @param {ArrayLike<{name: string, size: number, text: () => Promise<string>}>} fileList The File objects.
 * @returns {Promise<{loaded: {name: string, text: string}[], refused: string[]}>} The files' text and a sentence per refused file.
 */
export async function readFiles(fileList) {
  const loaded = [];
  const refused = [];
  for (const file of Array.from(fileList)) {
    if (file.size > MAX_FILE_BYTES) {
      refused.push(
        `${file.name} is ${Math.round(file.size / (1024 * 1024))} MB. Files over 100 MB are not ` +
          'supported yet: they are read into memory in the browser.'
      );
      continue;
    }
    try {
      loaded.push({ name: file.name, text: await file.text() });
    } catch {
      refused.push(
        `${file.name} could not be read: it may be a folder, or a file the browser was not ` +
          'allowed to open.'
      );
    }
  }
  return { loaded, refused };
}

/** A select with a "not mapped" first option, the current value selected. */
function picker(values, current, emptyLabel) {
  const select = el('select', 'sva-select');
  const empty = el('option', null, emptyLabel);
  empty.value = NOT_MAPPED;
  select.append(empty);
  for (const value of values) {
    const option = el('option', null, value);
    option.value = value;
    select.append(option);
  }
  select.value = current ?? NOT_MAPPED;
  return select;
}

/** The third cell of a mapping row: how it was filled, or what its absence costs. */
function rowTag(row, charts) {
  if (row.value) {
    const className =
      row.source === 'guessed'
        ? 'sva-tag sva-guess'
        : row.source === 'chosen'
          ? 'sva-tag sva-chosen'
          : 'sva-tag sva-same';
    return el('span', className, row.source);
  }
  if (!charts.length) return el('span', 'sva-tag', 'optional');
  const tag = el('span', 'sva-tag sva-missing', `needed by ${plural(charts.length, 'chart')}`);
  tag.title = charts.join(', ');
  return tag;
}

function sectionRow(title) {
  const row = el('tr', 'sva-map-section');
  const cell = el('td', null, title);
  cell.colSpan = 3;
  row.append(cell);
  return row;
}

/**
 * The rows of one file's mapping table: a row per column the domain's charts
 * read, and a row per key measure once the measure column is mapped. Each
 * carries the charts that cannot draw while it is empty.
 * @private
 */
function mappingRows(domain, app, needed) {
  const file = app.state.files[domain];
  const mapping = app.state.mappings[domain];
  const columns = Object.entries(app.manifest.domains[domain].columns).map(([key, meta]) => ({
    kind: 'column',
    key,
    label: meta.label,
    description: meta.description,
    row: mapping.columns[key],
    charts: needed.columns[domain][key]
  }));
  const keyed = MEASURES.filter((measure) => measure.domain === domain);
  const names = keyed.length ? distinctValues(file.rows, measureColumn(mapping)) : [];
  const measures = (names.length ? keyed : []).map((measure) => {
    // A measure of which one of several is enough is priced by the group:
    // it is needed only while none of the group is mapped.
    const group = needed.anyMeasure.find((item) => item.keys.includes(measure.key));
    const groupMapped = group && group.keys.some((key) => mapping.measures[key].value);
    return {
      kind: 'measure',
      key: measure.key,
      label: `${measure.label} is called`,
      row: mapping.measures[measure.key],
      charts: group && !groupMapped ? group.charts : needed.measures[measure.key]
    };
  });
  return { columns, measures, names, keyed: keyed.length > 0 };
}

/** How many of a file's rows are guesses, and how many are empty with a chart waiting on them. */
function rowSummary({ columns, measures }) {
  const rows = [...columns, ...measures];
  return {
    guessed: rows.filter((item) => item.row.value && item.row.source === 'guessed').length,
    needed: rows.filter((item) => !item.row.value && item.charts.length).length
  };
}

/** One file's card: where it is placed, and its mapping table. */
function fileCard(domain, app, rows) {
  const { manifest } = app;
  const file = app.state.files[domain];
  const candidate = app.state.placements[domain].candidates.find((item) => item.domain === domain);

  const card = el('section', `sva-file sva-domain-${domain}`);
  card.dataset.domain = domain;
  card.tabIndex = -1;
  card.setAttribute('aria-label', `${file.name}, ${manifest.domains[domain].label}`);
  const head = el('div', 'sva-file-head');
  const domainPicker = el('select', 'sva-select sva-domain');
  domainPicker.setAttribute('aria-label', `Domain of ${file.name}`);
  for (const [id, entry] of Object.entries(manifest.domains)) {
    const option = el('option', null, entry.label);
    option.value = id;
    domainPicker.append(option);
  }
  const aside = el('option', null, 'Set aside');
  aside.value = NOT_MAPPED;
  domainPicker.append(aside);
  domainPicker.value = domain;
  domainPicker.onchange = () => app.placeFileIn({ domain }, domainPicker.value || null);
  head.append(
    el('span', 'sva-hex'),
    el('span', 'sva-file-name', file.name),
    domainPicker,
    el('span', 'sva-tag sva-found', `${candidate.matched} of ${candidate.of} columns found`),
    el('span', 'sva-file-rows', rowCount(file.rows.length))
  );
  card.append(head);

  const scroll = el('div', 'sva-scroll');
  const table = el('table', 'sva-map');
  const header = el('tr');
  for (const title of ['The charts need', 'Your column', '']) header.append(el('th', null, title));
  table.append(header);

  const tableRow = (item, options, emptyLabel, onChange) => {
    const row = el('tr');
    row.dataset[item.kind] = item.key;
    const label = el('td', null, item.label);
    if (item.description) label.title = item.description;
    const select = picker(options, item.row.value, emptyLabel);
    select.setAttribute('aria-label', `${item.label.replace(/ is called$/, '')} in ${file.name}`);
    select.onchange = () => onChange(select.value || null);
    const cell = el('td');
    cell.append(select);
    const tagCell = el('td');
    tagCell.append(rowTag(item.row, item.charts));
    row.append(label, cell, tagCell);
    return row;
  };

  for (const item of rows.columns) {
    table.append(
      tableRow(item, file.columns, 'not mapped', (value) => app.setColumn(domain, item.key, value))
    );
  }

  if (rows.keyed) {
    table.append(sectionRow('Key measures'));
    if (!rows.names.length) {
      const row = el('tr', 'sva-map-hint');
      const cell = el('td', null, 'Map the measure column above to choose the key measures.');
      cell.colSpan = 3;
      row.append(cell);
      table.append(row);
    }
    for (const item of rows.measures) {
      table.append(
        tableRow(item, rows.names, 'not in this data', (value) =>
          app.setMeasure(domain, item.key, value)
        )
      );
    }
  }

  scroll.append(table);
  card.append(scroll);
  return card;
}

/** A file that matched no domain: named, with a picker to place it by hand. */
function unplacedCard(item, index, app) {
  const card = el('section', 'sva-file sva-unplaced');
  card.dataset.unplaced = item.file.name;
  card.tabIndex = -1;
  card.setAttribute('aria-label', `${item.file.name}, not placed`);
  const head = el('div', 'sva-file-head');
  const select = el('select', 'sva-select sva-domain');
  select.setAttribute('aria-label', `Domain of ${item.file.name}`);
  const none = el('option', null, 'Not placed: choose a domain');
  none.value = NOT_MAPPED;
  select.append(none);
  for (const [id, entry] of Object.entries(app.manifest.domains)) {
    const option = el('option', null, entry.label);
    option.value = id;
    select.append(option);
  }
  select.onchange = () => {
    if (select.value) app.placeFileIn({ unplaced: index }, select.value);
  };
  head.append(
    el('span', 'sva-hex sva-hollow'),
    el('span', 'sva-file-name', item.file.name),
    select,
    el('span', 'sva-file-rows', rowCount(item.file.rows.length))
  );
  card.append(head);
  return card;
}

/**
 * One of gsm's raw files (#233): named, with its rows and columns, kept as it
 * is. Its tag is what the tab that took it says of it (#281), which names the
 * raw domain it was read as; with no such tab, that it is kept as it is.
 */
function rawCard(file, said) {
  const card = el('section', 'sva-file sva-raw');
  card.dataset.raw = file.name;
  card.tabIndex = -1;
  card.setAttribute('aria-label', `${file.name}, a gsm raw file`);
  const head = el('div', 'sva-file-head');
  const tag = el('span', 'sva-tag', said ? said.tag : 'gsm raw file, kept as it is');
  if (said && said.title) tag.title = said.title;
  head.append(
    el('span', 'sva-hex sva-hollow'),
    el('span', 'sva-file-name', file.name),
    tag,
    el('span', 'sva-file-rows', `${rowCount(file.rows)}, ${plural(file.columns.length, 'column')}`)
  );
  card.append(head);
  return card;
}

/** A button of the sidebar, keyed by the action it takes. */
function actionButton(name, label, onClick) {
  const button = el('button', 'sva-button', label);
  button.type = 'button';
  button.dataset.action = name;
  button.onclick = onClick;
  return button;
}

/** A list of sentences, one to a line. */
function sentences(className, items) {
  const list = el('ul', className);
  for (const item of items) list.append(el('li', null, item));
  return list;
}

/**
 * What one tab says the loaded data supports (#281), as a card: the tab's
 * name in its colour, its one sentence and a button that opens it; what it
 * runs, each with the mark for its state and a name that says both in full;
 * the key to the marks; why some cannot run, behind their title; any further
 * sentences; and the small print. Every word of it is the tab's
 * (libraries.js::supportSaid).
 * @private
 */
function supportCard(said, app) {
  const card = el('section', 'sva-support');
  card.dataset.support = said.id;
  card.setAttribute('aria-label', `${said.title}: ${said.say}`);
  if (said.colour) card.style.setProperty('--hue', said.colour);
  const head = el('div', 'sva-support-head');
  head.append(
    el('span', 'sva-hex'),
    el('h2', 'sva-support-title', said.title),
    el('p', 'sva-support-say', said.say),
    actionButton('open-view', `Open ${said.title}`, () => app.select(said.id))
  );
  card.append(head);
  if (said.items.length) {
    const items = el('ul', 'sva-support-items');
    for (const item of said.items) {
      const entry = el('li');
      entry.dataset.item = item.id;
      if (item.state) entry.dataset.state = item.state;
      entry.title = item.name;
      entry.setAttribute('aria-label', item.name);
      if (item.icon) entry.append(icon(item.icon));
      entry.append(el('span', null, item.label));
      items.append(entry);
    }
    card.append(items);
  }
  if (said.key.length) {
    const key = el('p', 'sva-support-key');
    for (const { icon: mark, say } of said.key) {
      const one = el('span');
      one.append(icon(mark), say);
      key.append(one);
    }
    card.append(key);
  }
  if (said.why) {
    const why = el('details', 'sva-support-why');
    why.open = said.why.open;
    why.append(el('summary', null, said.why.title), sentences('sva-support-list', said.why.items));
    card.append(why);
  }
  if (said.lines.length) card.append(sentences('sva-support-list sva-support-lines', said.lines));
  if (said.note) card.append(el('p', 'sva-support-note', said.note));
  return card;
}

/** One step of the workflow: its number, its name, where it stands, and its actions. */
function workflowStep(id, index, state, title, status, extras = [], actions = []) {
  const step = el('li', 'sva-step');
  step.dataset.step = id;
  step.dataset.state = state;
  if (state === 'current') step.setAttribute('aria-current', 'step');
  const number = el('span', 'sva-step-n', state === 'done' ? '✓' : String(index + 1));
  number.setAttribute('aria-hidden', 'true');
  const body = el('div', 'sva-step-body');
  body.append(el('span', 'sva-step-title', title), el('span', 'sva-step-status', status));
  body.append(...extras);
  if (actions.length) {
    const row = el('div', 'sva-step-actions');
    row.append(...actions);
    body.append(row);
  }
  step.append(number, body);
  return step;
}

/** An entry of the loaded-data list: choosing it moves to the file's card. */
function loadedEntry(name, detail, flags, find) {
  const item = el('li');
  const button = el('button', 'sva-loaded-file');
  button.type = 'button';
  const list = el('span', 'sva-flags');
  for (const [className, text] of flags) list.append(el('span', `sva-flag ${className}`, text));
  button.append(
    el('span', 'sva-hex'),
    el('span', 'sva-loaded-name', name),
    el('span', 'sva-loaded-detail', detail),
    list
  );
  button.onclick = () => {
    const card = find();
    if (!card) return;
    card.focus({ preventScroll: true });
    if (card.scrollIntoView) card.scrollIntoView({ block: 'start' });
  };
  item.append(button);
  return { item, button };
}

/**
 * The sidebar: the three steps as live status, each with its own actions, and
 * the loaded files.
 * @private
 */
function sidebar(container, app, { input, domains, rows, support }) {
  const { state, manifest } = app;
  const side = el('aside', 'sva-side');
  side.setAttribute('aria-label', 'Workflow and loaded data');

  const summaries = Object.fromEntries(domains.map((domain) => [domain, rowSummary(rows[domain])]));
  const total = (key) => domains.reduce((sum, domain) => sum + summaries[domain][key], 0);
  const guessed = total('guessed');
  const needed = total('needed');
  const { ready, total: charts } = supportedCount(app.status());
  // The mapping is settled when no chart is waiting on a row. Guesses are
  // counted and flagged, but they do not hold the step (#163).
  const settled = domains.length > 0 && !needed;
  // gsm's raw files (#233) are loaded files too, with nothing to map.
  const files = domains.length + state.raw.length;
  const anything = files || state.unplaced.length || state.saved !== null || state.notes.length;
  // Step three points where the data leads (#281). With gsm's raw files loaded
  // and no chart ready, that is the tab that says what they support; with a
  // chart ready, what that tab supports is counted beside the charts. One step
  // is the current one: a file whose mapping a chart still waits on comes first.
  const [tab] = support;
  const leads = Boolean(tab) && state.raw.length > 0 && !ready;
  const chartsReady = `${ready} of ${charts} charts ready`;

  // Step one: load. The demo studies, where the page is served with any; the
  // file picker; and Reset, once there is something to clear.
  const extras = [];
  if (app.studies.length) {
    const menu = el('select', 'sva-select sva-study');
    menu.setAttribute('aria-label', 'Demo study');
    const none = el('option', null, 'Choose a demo study');
    none.value = NOT_MAPPED;
    menu.append(none);
    for (const study of app.studies) {
      const option = el('option', null, study.label);
      option.value = study.id;
      menu.append(option);
    }
    const current = app.studies.find((study) => study.id === state.study);
    menu.value = current ? current.id : NOT_MAPPED;
    menu.onchange = () => {
      if (menu.value) app.loadDemo(menu.value);
    };
    extras.push(menu);
    if (current) extras.push(el('p', 'sva-study-note', current.description));
  }
  const loadActions = [actionButton('choose-files', 'Choose files', () => input.click())];
  if (anything) loadActions.push(actionButton('reset', 'Reset', () => app.reset()));

  const steps = el('ol', 'sva-steps');
  steps.append(
    workflowStep(
      'load',
      0,
      files ? 'done' : 'current',
      'Load your files',
      files ? `${plural(files, 'file')} loaded` : 'No files loaded',
      extras,
      loadActions
    ),
    workflowStep(
      'map',
      1,
      !domains.length ? 'todo' : settled ? 'done' : 'current',
      'Check the mapping',
      domains.length
        ? `${guessed} guessed, ${needed} needed by a chart`
        : state.raw.length
          ? 'Nothing to map: gsm’s raw files are kept as they are'
          : 'Nothing to check yet',
      [],
      domains.length
        ? [actionButton('download-mapping', 'Download mapping', () => app.downloadMapping())]
        : []
    ),
    workflowStep(
      'open',
      2,
      settled || (leads && !domains.length) ? 'current' : 'todo',
      leads ? `Open the ${tab.title} tab` : 'Open a chart',
      (leads ? [tab.step.lead, chartsReady] : [chartsReady, tab && tab.step.also])
        .filter(Boolean)
        .join(' · '),
      [],
      leads
        ? [actionButton('open-view', `Open ${tab.title}`, () => app.select(tab.id))]
        : app.firstReady()
          ? [actionButton('open-chart', 'Open first chart', () => app.select(app.firstReady()))]
          : []
    )
  );
  const workflow = el('section', 'sva-side-section');
  workflow.append(el('h2', 'sva-side-title', 'Workflow'), steps);

  const loaded = el('section', 'sva-side-section');
  loaded.append(el('h2', 'sva-side-title', 'Loaded data'));
  if (!files && !state.unplaced.length) {
    loaded.append(el('p', 'sva-loaded-empty', 'No files are loaded.'));
  } else {
    const list = el('ul', 'sva-loaded');
    for (const domain of domains) {
      const file = state.files[domain];
      const flags = [];
      if (summaries[domain].guessed) {
        flags.push(['sva-guess', `${summaries[domain].guessed} guessed`]);
      }
      if (summaries[domain].needed) {
        flags.push(['sva-missing', `${summaries[domain].needed} needed`]);
      }
      const { item, button } = loadedEntry(
        file.name,
        `${manifest.domains[domain].label}, ${rowCount(file.rows.length)}`,
        flags,
        () => container.querySelector(`.sva-file[data-domain="${domain}"]`)
      );
      button.classList.add(`sva-domain-${domain}`);
      button.dataset.domain = domain;
      list.append(item);
    }
    state.unplaced.forEach(({ file }, index) => {
      const { item, button } = loadedEntry(
        file.name,
        `Not placed, ${rowCount(file.rows.length)}`,
        [],
        () => container.querySelectorAll('.sva-file.sva-unplaced')[index]
      );
      button.querySelector('.sva-hex').classList.add('sva-hollow');
      button.dataset.unplaced = file.name;
      list.append(item);
    });
    state.raw.forEach((file, index) => {
      const { item, button } = loadedEntry(
        file.name,
        `gsm raw file, ${rowCount(file.rows)}`,
        [],
        () => container.querySelectorAll('.sva-file.sva-raw')[index]
      );
      button.querySelector('.sva-hex').classList.add('sva-hollow');
      button.dataset.raw = file.name;
      list.append(item);
    });
    loaded.append(list);
  }

  side.append(workflow, loaded);
  return side;
}

/**
 * Render the data view: the sidebar, and beside it the drop zone, a card for
 * what each tab that takes files of its own says the loaded data supports, a
 * card per loaded file with its mapping table, and a card per file that was
 * not placed.
 * @param {Element} container The element to render into.
 * @param {Object} app The app handle from mountApp.
 * @returns {{refresh: function(): void}} `refresh` draws again the cards that say what a tab supports, and nothing else: a tab's state may change while this view is open.
 */
export function renderDataPanel(container, app) {
  const { state, manifest } = app;
  const main = el('div', 'sva-data-main');

  const drop = el('div', 'sva-drop');
  const input = el('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.csv,.json,text/csv,application/json';
  input.hidden = true;
  input.className = 'sva-file-input';
  const take = async (fileList) => {
    const { loaded, refused } = await readFiles(fileList);
    app.loadFiles(loaded, { notes: refused });
  };
  input.onchange = () => take(input.files);
  drop.ondragover = (event) => {
    event.preventDefault();
    drop.classList.add('sva-over');
  };
  drop.ondragleave = () => drop.classList.remove('sva-over');
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.classList.remove('sva-over');
    if (event.dataTransfer && event.dataTransfer.files.length) take(event.dataTransfer.files);
  };
  drop.append(
    el('p', null, 'Drop CSV or JSON files here'),
    el(
      'p',
      'sva-drop-note',
      // Where a tab takes gsm's raw files, the one drop zone says it takes both kinds (#282).
      app.ownFiles
        ? 'Study files or gsm raw files. They are read in this browser and sent nowhere.'
        : 'They are read in this browser and sent nowhere.'
    ),
    input
  );
  main.append(drop);

  // What each tab says the loaded data supports (#281), between the drop zone
  // and the files. A reader who opened or closed the reasons finds them so
  // when the cards are drawn again.
  const support = app.support();
  const cards = el('div', 'sva-support-cards');
  const drawSupport = (said) => {
    const reasons = (card) => card.querySelector('.sva-support-why');
    const was = new Map(
      [...cards.children].map((card) => [card.dataset.support, reasons(card)?.open])
    );
    cards.replaceChildren(...said.map((one) => supportCard(one, app)));
    for (const card of cards.children) {
      const open = was.get(card.dataset.support);
      if (reasons(card) && typeof open === 'boolean') reasons(card).open = open;
    }
  };
  drawSupport(support);
  main.append(cards);

  const domains = Object.keys(manifest.domains).filter((domain) => state.files[domain]);
  const needed = neededBy(manifest, app.problems);
  const rows = Object.fromEntries(
    domains.map((domain) => [domain, mappingRows(domain, app, needed)])
  );
  for (const domain of domains) main.append(fileCard(domain, app, rows[domain]));
  state.unplaced.forEach((item, index) => main.append(unplacedCard(item, index, app)));
  // A raw file's card says what the tab that took it says of it.
  const saidOf = (file) => support.map((tab) => tab.files.get(file.name)).find(Boolean) || null;
  for (const file of state.raw) main.append(rawCard(file, saidOf(file)));

  container.append(sidebar(container, app, { input, domains, rows, support }), main);

  // A mapping edit re-renders the panel; put the keyboard back where it was.
  if (state.focus) {
    const { domain, kind, key } = state.focus;
    state.focus = null;
    const target = container.querySelector(
      `.sva-file[data-domain="${domain}"] tr[data-${kind}="${key}"] select`
    );
    if (target) target.focus();
  }
  return { refresh: () => drawSupport(app.support()) };
}
