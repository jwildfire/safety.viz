// Input validation against the JSON data contract in
// src/data/schema/ae-explorer.json (#60).
import schema from '../data/schema/ae-explorer.json';

// Every required settings key names a data column directly.
const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

/**
 * Throw when any required mapped column is absent from the data, naming
 * every missing column in one error (the message renders into the target
 * element).
 * @param {Object[]} data The bound records.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @returns {void}
 * @throws {Error} Required variable(s) missing: <columns>.
 */
export function checkInputs(data, settings) {
  const rows = Array.isArray(data) ? data : [];
  const columns = REQUIRED_COLUMN_SETTINGS.map((key) => settings[key]);
  const missing = columns.filter((col) => !rows.some((row) => row[col] !== undefined));
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
