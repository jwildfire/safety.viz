// Demo app: file text → rows (#149, obot.roadmap#352). The quote-aware
// CSV parser every demo page under site/demo/ carried its own copy of, in one
// place, plus a JSON reader, so a user's file becomes the same d3.csv()-style
// records the chart modules already take: one object per row, every value a
// string. Pure functions; nothing here touches the document or the network.
//
// Every failure is an Error whose message is one sentence naming the file,
// written for a study programmer rather than for a stack trace (APP-PARSE-006).

/**
 * Split CSV text into cells, honouring quoted fields: embedded commas, doubled
 * quotes and line breaks inside quotes stay in their field.
 * @param {string} text The file's text.
 * @returns {string[][]} One array of cells per line.
 * @private
 */
function splitCells(text) {
  const lines = [];
  let line = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      line.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      line.push(field);
      lines.push(line);
      line = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || line.length) {
    line.push(field);
    lines.push(line);
  }
  return lines;
}

/**
 * Parse CSV text into records. The first non-blank line is the header; blank
 * lines are skipped; a row shorter than the header is filled with blanks.
 * @param {string} text The file's text; a leading byte-order mark is ignored.
 * @returns {{columns: string[], rows: Object<string, string>[]}} The header in file order and one record per row.
 */
export function parseCsv(text) {
  const lines = splitCells(String(text).replace(/^﻿/, '')).filter(
    (cells) => cells.length > 1 || (cells[0] || '').trim() !== ''
  );
  if (!lines.length) return { columns: [], rows: [] };
  const [header, ...records] = lines;
  const columns = header.map((name) => name.trim());
  const rows = records.map((cells) =>
    Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']))
  );
  return { columns, rows };
}

/**
 * Parse a JSON list of records. Values become strings, as a CSV's would be,
 * with null and undefined as blanks; a record missing a column another record
 * has is given a blank for it.
 * @param {string} text The file's text: a JSON array with one object per row.
 * @returns {{columns: string[], rows: Object<string, string>[]}} Columns in first-seen order and one record per row.
 */
export function parseJson(text) {
  const parsed = JSON.parse(text);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((row) => row && typeof row === 'object' && !Array.isArray(row))
  ) {
    throw new TypeError('not a list of records');
  }
  const columns = [];
  const seen = new Set();
  for (const row of parsed) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const rows = parsed.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column, row[column] == null ? '' : String(row[column])])
    )
  );
  return { columns, rows };
}

/**
 * Read one file's text by its name's extension.
 * @param {string} name The file name, used for the extension and in every message.
 * @param {string} text The file's text.
 * @returns {{name: string, columns: string[], rows: Object<string, string>[]}} The parsed file.
 * @throws {Error} One sentence naming the file when it is not CSV or JSON, is empty, has no rows, or is not valid.
 */
export function parseFile(name, text) {
  const extension = (String(name).match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (extension !== 'csv' && extension !== 'json') {
    throw new Error(
      `${name} is not a CSV or JSON file. SAS transport and sas7bdat files are not supported yet.`
    );
  }
  if (!String(text).trim()) throw new Error(`${name} is empty.`);
  let parsed;
  if (extension === 'csv') {
    parsed = parseCsv(text);
  } else {
    try {
      parsed = parseJson(text);
    } catch (error) {
      throw new Error(
        error instanceof TypeError
          ? `${name} is not a list of records: it should be a JSON array with one object per row.`
          : `${name} is not valid JSON.`
      );
    }
  }
  if (!parsed.rows.length) throw new Error(`${name} has column names but no rows.`);
  return { name, ...parsed };
}
