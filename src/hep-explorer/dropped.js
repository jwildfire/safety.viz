// CSV export of the records and participants that left the chart
// (safety.viz#50, obot.roadmap#88), restoring parity with the original
// RhoInc/hep-explorer's `initDroppedRowsWarning` / `showMissingDataWarning`
// pair and their shared `downloadCSV` helper.
//
// A count in the notes tells a reviewer how much data did not make it onto the
// plot. It does not tell them WHICH data, or why — and "23 results removed" is
// exactly the sort of line that gets read past. The download turns the count
// into something checkable against the source dataset.
//
// The CSV is built ON CLICK, not on render. A study-sized dataset drops
// thousands of records — the pharmaverseadam demo drops 1663 — and serializing
// them into an href would put close to half a megabyte of text in the DOM on
// every redraw, for a link most readers never use. The click builds the text,
// hands the browser a blob, and revokes it.
//
// Requirement group: HEP-DROP-*.

/** The columns of the dropped-participant export, in order. */
export const DROPPED_PARTICIPANT_COLUMNS = ['id', 'reason'];

/** The one internal column the exports keep, because it is the answer. @private */
const REASON_COLUMN = '__hep_dropReason';

/**
 * Render rows as CSV text (HEP-DROP-002), matching the original helper: every
 * field quoted, embedded quotes doubled. A missing value is an empty cell
 * rather than the string "null" or "undefined".
 * @param {Object[]} rows The rows to export.
 * @param {string[]} columns The columns to write, in order.
 * @returns {string} The CSV text, header first.
 */
export function toCsv(rows, columns) {
  const cell = (value) => {
    if (value === null || value === undefined) return '""';
    return `"${String(value).replace(/"/g, '""')}"`;
  };
  const lines = [columns.map(cell).join(',')];
  (rows || []).forEach((row) => lines.push(columns.map((column) => cell(row[column])).join(',')));
  return lines.join('\n');
}

/**
 * The columns of the dropped-row export (HEP-DROP-002): the reason first,
 * because it is why the reviewer opened the file, then the source columns as
 * they arrived. The module's own derived `__hep_*` columns are left out — they
 * are this renderer's working, not the reviewer's data.
 * @param {Object[]} rows The dropped rows.
 * @returns {string[]} The column names, in order.
 */
export function droppedRowColumns(rows) {
  if (!rows || !rows.length) return [];
  const source = Object.keys(rows[0]).filter((column) => !column.startsWith('__hep_'));
  return [REASON_COLUMN, ...source];
}

/**
 * A link that downloads a CSV built at click time (HEP-DROP-003). The file name
 * carries the run's date, so two exports from one sitting do not overwrite each
 * other in the downloads folder.
 *
 * The builder is also stashed on the element as `__hepCsv`, so the browser
 * suite can assert the exported text without actually downloading a file.
 * @param {function(): string} buildCsv Returns the CSV text; called on click.
 * @param {string} fileCore The file-name stem.
 * @param {string} label The link text.
 * @returns {HTMLAnchorElement} The link element.
 */
export function csvDownloadLink(buildCsv, fileCore, label) {
  const link = document.createElement('a');
  const fileName = `${fileCore}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.className = 'hep-csv-link';
  link.textContent = label;
  link.setAttribute('href', '#');
  link.setAttribute('download', fileName);
  link.__hepCsv = buildCsv;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const url = URL.createObjectURL(new Blob([buildCsv()], { type: 'text/csv;charset=utf-8;' }));
    const trigger = document.createElement('a');
    trigger.href = url;
    trigger.download = fileName;
    trigger.click();
    // The browser has taken the blob by the time the click returns; releasing
    // it on the next tick keeps a long session from holding every export.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  return link;
}
