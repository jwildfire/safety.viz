// Loads the vendored CDISC Pilot 01 extracts the Patient Journey Explorer
// demo mounts (site/data/pje-*.csv) into the per-domain arrays init() takes,
// for the eval harness and the Node-side narrative tests (#146). The parser
// is the demo page's quote-aware one (site/demo/patient-journey-explorer.js).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.join(rootDir, 'site', 'data');

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...records] = rows.filter(
    (cells) => cells.length > 1 || (cells[0] || '').trim() !== ''
  );
  return records.map((cells) => Object.fromEntries(header.map((col, i) => [col, cells[i] ?? ''])));
}

/** The demo's settings overrides (mirrors site/demo/patient-journey-explorer.js). */
export const DEMO_SETTINGS = {
  mh_onset_stdy_col: 'MHONSDY',
  lb_tests: [
    'Alanine Aminotransferase',
    'Aspartate Aminotransferase',
    'Bilirubin',
    'Alkaline Phosphatase'
  ]
};

/** The demo's opening participant. */
export const DEMO_SUBJECT = '01-716-1447';

let cached = null;

/**
 * The six per-domain arrays, parsed once.
 * @returns {{ex: Object[], ae: Object[], lb: Object[], cm: Object[], mh: Object[], ds: Object[]}} The demo data.
 */
export function loadDemoData() {
  if (cached) return cached;
  cached = {};
  for (const domain of ['ex', 'ae', 'lb', 'cm', 'mh', 'ds']) {
    cached[domain] = parseCsv(readFileSync(path.join(dataDir, `pje-${domain}.csv`), 'utf8'));
  }
  return cached;
}
