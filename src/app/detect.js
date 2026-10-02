// Demo app: which domain is this file? (#149, obot.roadmap#352). A file is
// placed in the manifest domain whose columns it carries most of, counting a
// column as found when the file has it by the same name or a known
// alternative — the shape of the old safetyGraphics app's standard detection.
// The count is reported, not a confidence: "9 of 13 columns found" is something
// a study programmer can check against their own file.

import { MEASURES, resolveColumn, resolveMeasure } from './mapping.js';

/** A file matching this many of a domain's columns or fewer is not placed. */
export const UNPLACED_AT_OR_BELOW = 2;

const QTC_MEASURES = MEASURES.filter((measure) => measure.key === 'QTcF' || measure.key === 'QTcB');

/**
 * Place a file in a domain by its column names.
 *
 * The best count wins; on equal counts the fuller match does (five of the
 * seven subject-level columns beats five of the thirteen labs columns). Labs
 * and ECG are the same long-format shape and cannot be told apart by column
 * names alone, so when a file could be either and its measure names are
 * supplied, a QTc correction among them sends it to ECG.
 * @param {string[]} columns The file's column names.
 * @param {Object} manifest The portfolio manifest.
 * @param {Object} [options] Placement options.
 * @param {string[]} [options.measureNames] The distinct values of the file's measure column, when known.
 * @returns {{domain: ?string, matched: number, of: number, candidates: {domain: string, matched: number, of: number}[], found: string[]}} The domain (null when the file is not placed), its count, every domain's count best first, and the file's columns that matched any domain.
 */
export function placeFile(columns, manifest, { measureNames = [] } = {}) {
  const found = new Set();
  const candidates = Object.entries(manifest.domains).map(([domain, definition], order) => {
    const names = Object.keys(definition.columns);
    let matched = 0;
    for (const name of names) {
      const { value } = resolveColumn(columns, domain, name);
      if (value !== null) {
        matched += 1;
        found.add(value);
      }
    }
    return { domain, matched, of: names.length, order };
  });
  candidates.sort(
    (a, b) => b.matched - a.matched || b.matched / b.of - a.matched / a.of || a.order - b.order
  );

  const placeable = candidates.filter((candidate) => candidate.matched > UNPLACED_AT_OR_BELOW);
  let best = placeable[0] || null;
  const eg = placeable.find((candidate) => candidate.domain === 'eg');
  if (best && best.domain === 'bds' && eg) {
    const hasQtc = QTC_MEASURES.some(
      (measure) => resolveMeasure(measureNames, measure).value !== null
    );
    if (hasQtc) best = eg;
  }

  return {
    domain: best ? best.domain : null,
    matched: best ? best.matched : candidates[0].matched,
    of: best ? best.of : candidates[0].of,
    candidates: candidates.map(({ domain, matched, of }) => ({ domain, matched, of })),
    found: columns.filter((column) => found.has(column))
  };
}
