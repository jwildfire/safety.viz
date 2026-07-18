// Input validation against the JSON data contract in
// src/data/schema/qt-explorer.json (#68). Mirrors the hep-explorer guard: each
// required column setting must name a column present in at least one row, or a
// single Error names every missing variable (QT-DATA-005). The main module
// renders the thrown message into the target element and tears the chart down.

import schema from '../data/schema/qt-explorer.json';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

export function checkInputs(data, settings) {
  const rows = Array.isArray(data) ? data : [];
  const missing = REQUIRED_COLUMN_SETTINGS.map((key) => settings[key]).filter(
    (col) => !rows.some((row) => row[col] !== undefined)
  );
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
