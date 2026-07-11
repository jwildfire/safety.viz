// Input validation against the JSON data contract in
// src/data/schema/outlier-explorer.json (#24). Mirrors the histogram's
// checkInputs: the required column settings must each name a column present in
// at least one row, or a single Error names every missing variable.

import schema from '../data/schema/outlier-explorer.json';

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
