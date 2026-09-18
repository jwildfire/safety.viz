// The Journey Data Service the narrative tools read from (#146): the same
// structureData result the Patient Journey Explorer draws from, built per
// subject over the WHOLE record (every lane on, no filters) and memoized.
// Both the narrative generation and the future chatbot read through this and
// nothing else — no separate ETL, no retrieval index (design non-negotiable).

import { LANE_KEYS, syncSettings } from '../patient-journey-explorer/configure.js';
import { normalizeInput } from '../patient-journey-explorer/normalize.js';
import { structureData, subjectIndex } from '../patient-journey-explorer/structureData.js';

const ALL_LANES = Object.fromEntries(LANE_KEYS.map((key) => [key, true]));

/**
 * Create a data service over per-domain rows.
 * @param {Object} options The source.
 * @param {Object<string, Object[]>} [options.domains] Per-domain raw rows as normalizeInput returns them (the renderer passes its own `domains`).
 * @param {Object|Object[]} [options.data] Raw input in either init() form; used when `domains` is absent.
 * @param {Object} [options.settings] Patient Journey Explorer settings (synced or raw overrides).
 * @returns {{settings: Object, domains: Object, subjects: () => string[], structuredFor: (subject: string) => ?Object, invalidate: () => void}} The service.
 */
export function createDataService({ domains, data, settings } = {}) {
  const synced =
    settings && typeof settings === 'object' && Array.isArray(settings.lane_groups)
      ? settings
      : syncSettings(settings || {});
  const source =
    domains && typeof domains === 'object' ? domains : normalizeInput(data ?? {}, synced).domains;
  const cache = new Map();
  return {
    settings: synced,
    domains: source,
    subjects() {
      return subjectIndex(source, synced);
    },
    structuredFor(subject) {
      const key = subject === null || subject === undefined ? '' : String(subject);
      if (!key) return null;
      if (cache.has(key)) return cache.get(key);
      const structured = structureData(source, synced, { subject: key, lanes: ALL_LANES });
      const result = structured.subject === key ? structured : null;
      cache.set(key, result);
      return result;
    },
    invalidate() {
      cache.clear();
    }
  };
}
