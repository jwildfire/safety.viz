// Input validation against the JSON data contract in
// src/data/schema/time-to-event.json (#128) — the ae-explorer pattern extended
// to the two-dataset contract: each dataset's schema-required settings keys name
// data columns directly, and the check names every missing dataset and column in
// one error. The population group column and the description columns are
// deliberately not required: a bare (id, day) event set plus a bare (id,
// follow-up day) population draws one pooled curve.
import schema from '../data/schema/time-to-event.json';

const DATASETS = ['events', 'population'];

/**
 * Throw when either dataset is absent or any required mapped column is missing
 * from its dataset, naming everything missing in one error (the message renders
 * into the target element).
 * @param {{events: Object[], population: Object[]}} data The bound datasets.
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @returns {void}
 * @throws {Error} Required dataset(s)/variable(s) missing.
 */
export function checkInputs(data, settings) {
  const missingDatasets = DATASETS.filter((name) => !Array.isArray(data?.[name]));
  if (missingDatasets.length) {
    throw new Error(
      `Required dataset(s) missing: ${missingDatasets.join(', ')} — ` +
        'pass { events, population } arrays of records.'
    );
  }
  const missing = [];
  for (const name of DATASETS) {
    const rows = data[name];
    const required = schema.properties[name].requiredSettings.map((key) => settings[key]);
    for (const column of required) {
      if (!rows.some((row) => row[column] !== undefined)) missing.push(`${name}.${column}`);
    }
  }
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
