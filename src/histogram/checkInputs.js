// Input validation against the JSON data contract in
// src/data/schema/histogram.json — replaces the pilot's ad-hoc guards (#2).
// The thrown message stays identical to the pilot's (SH-DATA-001).

import schema from '../data/schema/histogram.json';

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
