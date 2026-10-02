// Portfolio app: the data panel (#151, obot.roadmap#352). Where a user's own
// files come in: a drop zone that reads them in the browser, and under each
// file one table mapping what the charts need to what the file has — its
// columns, and the names of the key measures — pre-filled, with every guess
// labelled and every empty row priced in the charts that need it.
//
// Nothing here fetches, posts or stores anything: files are read with the File
// API and the mapping is saved by offering a file to download.

import { MEASURES, distinctValues, measureColumn } from './mapping.js';
import { neededBy } from './status.js';
import { el, plural } from './dom.js';

/** Files larger than this are refused: they are parsed in memory. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const NOT_MAPPED = '';

const rowCount = (count) => `${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}`;

/**
 * Read dropped or chosen files into `{ name, text }` pairs, refusing in one
 * sentence each any that is too large to parse in memory.
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
    loaded.push({ name: file.name, text: await file.text() });
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

/** One file's card: where it is placed, and its mapping table. */
function fileCard(domain, app, needed) {
  const { manifest } = app;
  const file = app.state.files[domain];
  const mapping = app.state.mappings[domain];
  const definition = manifest.domains[domain];
  const candidate = app.state.placements[domain].candidates.find((item) => item.domain === domain);

  const card = el('section', 'sva-file');
  card.dataset.domain = domain;
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

  for (const [column, meta] of Object.entries(definition.columns)) {
    const row = el('tr');
    row.dataset.column = column;
    const label = el('td', null, meta.label);
    label.title = meta.description;
    const select = picker(file.columns, mapping.columns[column].value, 'not mapped');
    select.setAttribute('aria-label', `${meta.label} in ${file.name}`);
    select.onchange = () => app.setColumn(domain, column, select.value || null);
    const cell = el('td');
    cell.append(select);
    const tagCell = el('td');
    tagCell.append(rowTag(mapping.columns[column], needed.columns[domain][column]));
    row.append(label, cell, tagCell);
    table.append(row);
  }

  const measures = MEASURES.filter((measure) => measure.domain === domain);
  if (measures.length) {
    table.append(sectionRow('Key measures'));
    const names = distinctValues(file.rows, measureColumn(mapping));
    if (!names.length) {
      const row = el('tr', 'sva-map-hint');
      const cell = el('td', null, 'Map the measure column above to choose the key measures.');
      cell.colSpan = 3;
      row.append(cell);
      table.append(row);
    }
    for (const measure of names.length ? measures : []) {
      const row = el('tr');
      row.dataset.measure = measure.key;
      const select = picker(names, mapping.measures[measure.key].value, 'not in this data');
      select.setAttribute('aria-label', `${measure.label} in ${file.name}`);
      select.onchange = () => app.setMeasure(domain, measure.key, select.value || null);
      const cell = el('td');
      cell.append(select);
      const tagCell = el('td');
      // A measure of which one of several is enough is priced by the group:
      // it is needed only while none of the group is mapped.
      const group = needed.anyMeasure.find((item) => item.keys.includes(measure.key));
      const groupMapped = group && group.keys.some((key) => mapping.measures[key].value);
      const charts = group && !groupMapped ? group.charts : needed.measures[measure.key];
      tagCell.append(rowTag(mapping.measures[measure.key], charts));
      row.append(el('td', null, `${measure.label} is called`), cell, tagCell);
      table.append(row);
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
    el('span', 'sva-file-name', item.file.name),
    select,
    el('span', 'sva-file-rows', rowCount(item.file.rows.length))
  );
  card.append(head);
  return card;
}

/**
 * Render the data panel: the drop zone, a card per loaded file with its
 * mapping table, and a card per file that was not placed.
 * @param {Element} container The element to render into.
 * @param {Object} app The app handle from mountApp.
 * @returns {void}
 */
export function renderDataPanel(container, app) {
  const { state, manifest } = app;

  const drop = el('div', 'sva-drop');
  const input = el('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.csv,.json,text/csv,application/json';
  input.hidden = true;
  input.className = 'sva-file-input';
  const choose = el('button', 'sva-button', 'Choose files');
  choose.type = 'button';
  choose.onclick = () => input.click();
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
  const prompt = el('p', null, 'Drop CSV or JSON files here, or ');
  prompt.append(choose);
  drop.append(
    prompt,
    el('p', 'sva-drop-note', 'They are read in this browser and sent nowhere.'),
    input
  );
  container.append(drop);

  const domains = Object.keys(manifest.domains).filter((domain) => state.files[domain]);
  if (!domains.length && !state.unplaced.length) {
    container.append(el('p', 'sva-message', 'No files are loaded.'));
    return;
  }

  const needed = neededBy(manifest);
  for (const domain of domains) container.append(fileCard(domain, app, needed));
  state.unplaced.forEach((item, index) => container.append(unplacedCard(item, index, app)));

  // A mapping edit re-renders the panel; put the keyboard back where it was.
  if (state.focus) {
    const { domain, kind, key } = state.focus;
    state.focus = null;
    const target = container.querySelector(
      `.sva-file[data-domain="${domain}"] tr[data-${kind}="${key}"] select`
    );
    if (target) target.focus();
  }
}
