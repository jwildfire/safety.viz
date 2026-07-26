// Input validation against the JSON data contract in
// src/data/schema/hep-waterfall.json (#93). Mirrors the hep-explorer and
// qt-explorer guards: each required column setting must name a column present
// in at least one row, or a single Error names every missing variable. The main
// module renders the thrown message into the target element and tears the
// charts down.
//
// The required list here carries arm_col, which hep-explorer's deliberately
// does NOT. The difference is not an oversight: the eDISH scatter and the
// composite plot are per-participant views that render honestly without an arm,
// whereas the waterfall's whole layout is two arms meeting at a seam. Validating
// it up front is the only way to avoid the silent failure mode — every
// participant collapsing into one bucket and the chart rendering confidently
// wrong (HWF-DATA-005).

import schema from '../data/schema/hep-waterfall.json';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

/**
 * Throw when any required column setting names a column absent from the data.
 * @param {Object[]} data The raw records.
 * @param {Object} settings Normalized settings.
 * @returns {void}
 * @throws {Error} Naming every missing variable.
 */
export function checkInputs(data, settings) {
  const rows = Array.isArray(data) ? data : [];
  const missing = REQUIRED_COLUMN_SETTINGS.map((key) => settings[key]).filter(
    (col) => !rows.some((row) => row[col] !== undefined)
  );
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
