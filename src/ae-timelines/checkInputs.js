// Input validation against the JSON data contract in
// src/data/schema/ae-timelines.json (#26). The thrown message format matches
// the histogram module's (and the original renderers').

import schema from '../data/schema/ae-timelines.json';

// Every required settings key names a data column directly except `color`,
// whose column lives at color.value_col.
const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required.filter(
  (key) => key !== 'color'
);

export function checkInputs(data, settings) {
  const rows = Array.isArray(data) ? data : [];
  const columns = [
    ...REQUIRED_COLUMN_SETTINGS.map((key) => settings[key]),
    settings.color.value_col
  ];
  const missing = columns.filter((col) => !rows.some((row) => row[col] !== undefined));
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
