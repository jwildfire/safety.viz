// Unscheduled-visit identification, shared across renderers (#136,
// obot.roadmap#33).
//
// Promoted VERBATIM from src/results-over-time/structureData.js so a second
// module can consume it without importing a renderer file — the same promotion
// src/box-whisker.js records for the box marks. The bodies are byte-identical
// to the shipped results-over-time behaviour and must stay that way: that
// module has committed evidence pinned to them (SROT-CFG-017/019), and
// src/results-over-time/structureData.js keeps a re-export shim so no existing
// caller or test changes.
//
// Consumers: results-over-time (an "Unscheduled visits" display toggle) and
// hep-explorer (SafetyGraphics/hep-explorer#229 — where the toggle is NOT
// display-only, because excluding a record re-derives the baseline and the
// on-treatment peak).

/**
 * Parse an unscheduled-visit pattern string. Accepts the /source/flags form
 * used by the original renderer's settings, or a plain source string.
 * @param {string} pattern The pattern string.
 * @returns {RegExp} The compiled expression.
 */
export function parseUnscheduledPattern(pattern) {
  const match = /^\/(.*)\/([a-z]*)$/i.exec(String(pattern));
  return match ? new RegExp(match[1], match[2]) : new RegExp(String(pattern));
}

/**
 * Whether a visit is unscheduled: an explicit unscheduled_visit_values list
 * takes precedence over the unscheduled_visit_pattern.
 * @param {string} visit The visit name.
 * @param {Object} settings The unscheduled-visit settings.
 * @returns {boolean} True when the visit is unscheduled.
 */
export function isUnscheduledVisit(visit, settings) {
  if (Array.isArray(settings.unscheduled_visit_values)) {
    return settings.unscheduled_visit_values.map(String).includes(String(visit));
  }
  if (settings.unscheduled_visit_pattern) {
    return parseUnscheduledPattern(settings.unscheduled_visit_pattern).test(String(visit));
  }
  return false;
}

/**
 * Whether any row sits at a visit the settings identify as unscheduled — the
 * test a caller uses to decide whether an unscheduled-visit control is worth
 * rendering at all. An unmapped visit column answers false, so a module that
 * gates its control on this degrades to its previous appearance rather than
 * offering a control that could do nothing.
 * @param {Object[]} rows Data records.
 * @param {?string} visitCol The mapped visit column, or nullish when unmapped.
 * @param {Object} settings The unscheduled-visit settings.
 * @returns {boolean} True when at least one row sits at an unscheduled visit.
 */
export function hasUnscheduledVisits(rows, visitCol, settings) {
  if (!visitCol) return false;
  return (rows || []).some(
    (row) =>
      row[visitCol] !== undefined &&
      row[visitCol] !== null &&
      row[visitCol] !== '' &&
      isUnscheduledVisit(row[visitCol], settings)
  );
}
