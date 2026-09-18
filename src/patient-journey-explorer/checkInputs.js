// Input validation against the JSON data contract in
// src/data/schema/patient-journey-explorer.json (#142, design §5.3) — the
// time-to-event pattern over six optional domains: at least one domain must
// carry rows, and every present domain must resolve every column its schema
// entry's `requiredSettings` names. An absent domain is never an error
// (PJE-DATA-005): a journey over partial data still draws, with the missing
// lanes explained in place.
//
// The normalized domain map is UPPER-case keyed (`AE`, …) while the schema's
// properties are lower-case (`ae`, …), so the lookup goes through
// `domain.toLowerCase()` (RF-3). A day setting may be a fallback chain
// (PJE-DATA-007); the chain is satisfied when any one of its columns appears
// in any row.
import schema from '../data/schema/patient-journey-explorer.json';
import { arrayify } from '../histogram/configure.js';
import { DOMAINS } from './normalize.js';

/**
 * Throw when no domain has rows, or a present domain is missing a required
 * mapped column, naming everything missing in one error (the message renders
 * into the target element).
 * @param {Object<string, Object[]>} domains The normalized per-domain row map (upper-case keys).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {void}
 * @throws {Error} No usable domain, or required variable(s) missing.
 */
export function checkInputs(domains, settings) {
  const present = DOMAINS.filter(
    (domain) => Array.isArray(domains?.[domain]) && domains[domain].length > 0
  );
  if (!present.length) {
    throw new Error(
      'No usable data: pass at least one of { ae, lb, ex, cm, mh, ds } ' +
        `(or a merged array with a ${settings?.domain_col ?? 'DOMAIN'} column).`
    );
  }
  const missing = [];
  for (const domain of present) {
    const rows = domains[domain];
    const property = schema.properties[domain.toLowerCase()];
    const required = (property?.requiredSettings || []).map((key) =>
      arrayify(settings[key]).map(String)
    );
    for (const chain of required) {
      if (!chain.length) continue;
      const found = rows.some((row) => row && chain.some((column) => row[column] !== undefined));
      if (!found) missing.push(`${domain.toLowerCase()}.${chain.join('|')}`);
    }
  }
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}
