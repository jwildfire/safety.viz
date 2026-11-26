// Demo app: what a loaded file holds, on its card of the data view. A reader
// who loaded a file, their own or a built study's, can open its details: its
// rows and columns, each column's kind, its first rows, and a download.
//
// The details are folded shut and drawn when first opened: a labs file is
// tens of thousands of rows, and most files are never looked into.

import { el, plural } from './dom.js';
import { parseCsv } from './parse.js';

/** How many rows a preview shows. */
export const PREVIEW_ROWS = 20;
/** How many of a column's values are read to say what kind it is. */
const SAMPLE = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * What kind of values a column holds, read from its first values that are not
 * empty: `number`, `date`, `text`, or `empty` when it has none.
 * @param {Array<?string>} values The column's values, as text.
 * @returns {string} The kind.
 */
export function kindOf(values) {
  let seen = 0;
  let numbers = 0;
  let dates = 0;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text === '') continue;
    seen += 1;
    if (NUMBER.test(text)) numbers += 1;
    else if (ISO_DATE.test(text)) dates += 1;
    if (seen >= SAMPLE) break;
  }
  if (!seen) return 'empty';
  if (numbers === seen) return 'number';
  if (dates === seen) return 'date';
  return 'text';
}

/** A value as a CSV field: quoted when it holds a comma, a quote or a line break. */
const field = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Rows as the text of a CSV file.
 * @param {string[]} columns The column names, in order.
 * @param {Object[]} rows One object per row.
 * @returns {string} The file's text.
 */
export function csvOf(columns, rows) {
  const lines = [columns.map(field).join(',')];
  for (const row of rows) lines.push(columns.map((column) => field(row[column])).join(','));
  return `${lines.join('\n')}\n`;
}

/**
 * The first rows of a file kept as text, without reading the whole of it.
 * @param {string} text The file's text.
 * @param {number} limit How many rows.
 * @returns {Object[]} One object per row.
 */
export function headOf(text, limit) {
  // A row has at least one line; twice as many lines as rows leaves room for a
  // line break inside a quoted field.
  let at = -1;
  for (let line = 0; line < limit * 2 + 1; line += 1) {
    at = text.indexOf('\n', at + 1);
    if (at === -1) break;
  }
  const head = at === -1 ? text : text.slice(0, at);
  try {
    return parseCsv(head).rows.slice(0, limit);
  } catch {
    return [];
  }
}

function table(header, rows, wrap) {
  const scroll = el('div', 'sva-detail-scroll');
  const grid = el('table', wrap ? 'sva-detail-table sva-detail-wrap' : 'sva-detail-table');
  const head = el('tr');
  for (const name of header) head.append(el('th', null, name));
  const top = el('thead');
  top.append(head);
  const body = el('tbody');
  for (const row of rows) {
    const line = el('tr');
    for (const value of row) line.append(el('td', null, value));
    body.append(line);
  }
  grid.append(top, body);
  scroll.append(grid);
  return scroll;
}

/**
 * A loaded file's details, folded shut.
 * @param {Object} file What the page holds of the file: its `name` and `columns`, and either its `rows` as objects or its `text` with `rows` a count.
 * @param {Object} [options]
 * @param {Set<string>} [options.open] The names of the files whose details are open; kept by the page so a redraw finds them as they were.
 * @param {(name: string, text: string) => void} [options.save] Saves a file; with none, there is no download.
 * @returns {HTMLDetailsElement} The details, `.sva-file-details`.
 */
export function fileDetails(file, { open = new Set(), save = null } = {}) {
  const kept = typeof file.text === 'string';
  const count = kept ? file.rows : file.rows.length;
  const details = el('details', 'sva-file-details');
  details.dataset.details = file.name;
  const summary = el(
    'summary',
    null,
    `Details: ${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}, ` +
      plural(file.columns.length, 'column')
  );
  details.append(summary);
  let drawn = false;
  const draw = () => {
    if (drawn) return;
    drawn = true;
    const first = kept ? headOf(file.text, PREVIEW_ROWS) : file.rows.slice(0, PREVIEW_ROWS);
    // A column's kind is read from the rows in hand: every row of a parsed
    // file, and the first rows of one kept as text.
    const sample = kept ? first : file.rows;
    const body = el('div', 'sva-detail-body');
    body.append(el('h4', 'sva-detail-title', 'Columns'));
    body.append(
      table(
        ['Column', 'Kind'],
        file.columns.map((column) => [column, kindOf(sample.map((row) => row[column]))])
      )
    );
    body.append(
      el(
        'h4',
        'sva-detail-title',
        first.length < count
          ? `First ${first.length} of ${count.toLocaleString('en-US')} rows`
          : `All ${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}`
      )
    );
    body.append(
      table(
        file.columns,
        first.map((row) => file.columns.map((column) => row[column] ?? ''))
      )
    );
    if (typeof save === 'function') {
      const download = el('button', 'sva-button sva-detail-download', 'Download CSV');
      download.type = 'button';
      download.onclick = () =>
        save(
          /\.csv$/i.test(file.name) ? file.name : `${file.name.replace(/\.[^.]+$/, '')}.csv`,
          kept ? file.text : csvOf(file.columns, file.rows)
        );
      body.append(download);
    }
    details.append(body);
  };
  details.addEventListener('toggle', () => {
    if (details.open) {
      open.add(file.name);
      draw();
    } else open.delete(file.name);
  });
  if (open.has(file.name)) {
    details.open = true;
    draw();
  }
  return details;
}
