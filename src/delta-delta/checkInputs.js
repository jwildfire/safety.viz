// Input validation against the JSON data contract in
// src/data/schema/delta-delta.json (#25). Mirrors the histogram guard: throw
// when a required mapped column is absent from every row (SDD-REG-010,
// SDD-DATA-001). The main module renders the thrown message into the target
// element and tears the chart down.

import schema from '../data/schema/delta-delta.json';

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
