// Migration cross-tabulation for the safety.viz hepatic tools
// (obot.roadmap#43, safety.viz#91): the pretreatment × on-treatment quadrant
// cross-tab behind the composite view's migration table (Amirzadegan 2025
// Fig 4) and, shortly, the bidirectional migration Sankey (Fig 3), plus the
// per-arm level-of-concern summary. Moved VERBATIM out of
// src/hep-explorer/composite.js.
//
// Requirement groups: HEP-COMP-*, HEP-CORE-*.

import { COMPOSITE_QUADRANTS, SEVERITY_ORDER } from './quadrants.js';

/** The two Sankey sides, in left-to-right order. */
const SIDES = ['placebo', 'active'];

/**
 * The designated side of one subject: from the arm -> side map when one is
 * supplied, else the subject's own resolved `side` field.
 * @private
 */
function sideOf(subject, sides) {
  if (sides && typeof sides.get === 'function') return sides.get(subject.arm) ?? null;
  return subject.side ?? null;
}

/**
 * Cross-tabulate composite subjects into the pretreatment x on-treatment
 * migration matrix (HEP-COMP-004): counts keyed [pretreatQuadrant][onTreatQuadrant]
 * over the fixed quadrant order, with row totals, column totals, and the grand
 * total.
 * @param {Object[]} subjects Composite subjects from buildCompositeSubjects.
 * @returns {{counts: Object, rowTotals: Object, colTotals: Object, total: number}}
 */
export function migrationMatrix(subjects) {
  const counts = {};
  const rowTotals = {};
  const colTotals = {};
  COMPOSITE_QUADRANTS.forEach((pre) => {
    counts[pre] = {};
    rowTotals[pre] = 0;
    colTotals[pre] = 0;
    COMPOSITE_QUADRANTS.forEach((post) => {
      counts[pre][post] = 0;
    });
  });
  let total = 0;
  subjects.forEach((subject) => {
    const pre = subject.pretreatQuadrant;
    const post = subject.onTreatQuadrant;
    if (counts[pre] && counts[pre][post] !== undefined) {
      counts[pre][post] += 1;
      rowTotals[pre] += 1;
      colTotals[post] += 1;
      total += 1;
    }
  });
  return { counts, rowTotals, colTotals, total };
}

/**
 * Partition the cohort by arm side and cross-tabulate each side on its own
 * (HEP-CORE-007, HEP-XTAB-001): the migration view renders one table per
 * designated arm, so the reviewer reads the drug arm's upward shifts against the
 * placebo arm's. `migrationMatrix` is reused UNMODIFIED — the paper's cross
 * table is already exactly what it produces. Both sides are always present, even
 * when one is empty, so the view's layout does not depend on the data. Subjects
 * whose arm is designated neither side are excluded (HEP-ARM-004).
 * @param {Object[]} subjects Hep subjects from buildHepSubjects.
 * @param {?Map<string, ?string>} [sides] arm -> side map; omit to use each
 *   subject's own `side` field.
 * @returns {Map<string, {counts: Object, rowTotals: Object, colTotals: Object, total: number}>}
 *   'placebo' and 'active' -> that side's migration matrix.
 */
export function migrationMatrixBySide(subjects, sides) {
  const buckets = new Map(SIDES.map((side) => [side, []]));
  (subjects || []).forEach((subject) => {
    const side = sideOf(subject, sides);
    if (buckets.has(side)) buckets.get(side).push(subject);
  });
  return new Map([...buckets].map(([side, list]) => [side, migrationMatrix(list)]));
}

/**
 * Index the participants behind every non-empty migration cell (HEP-CORE-007),
 * keyed `${side}|${pretreatQuadrant}|${onTreatQuadrant}`. This single index
 * backs both interactions the migration view offers — clicking a Sankey ribbon
 * and clicking a cross-table cell — so the two selections are identical by
 * construction rather than by coincidence (HEP-XTAB-005).
 *
 * Iteration order is canonical (side, then both quadrants in SEVERITY_ORDER) and
 * ids within a cell are sorted, so repeated renders of the same cohort produce
 * byte-identical ribbon paths and selection payloads no matter what order the
 * data arrived in (HEP-MIG-016).
 * @param {Object[]} subjects Hep subjects from buildHepSubjects.
 * @param {?Map<string, ?string>} [sides] arm -> side map; omit to use each
 *   subject's own `side` field.
 * @returns {Map<string, {side: string, pre: string, post: string, ids: Array<string|number>}>}
 */
export function migrationCells(subjects, sides) {
  const staged = new Map();
  (subjects || []).forEach((subject) => {
    const side = sideOf(subject, sides);
    if (!SIDES.includes(side)) return;
    const key = `${side}|${subject.pretreatQuadrant}|${subject.onTreatQuadrant}`;
    if (!staged.has(key)) staged.set(key, []);
    staged.get(key).push(subject.id);
  });

  const cells = new Map();
  SIDES.forEach((side) =>
    SEVERITY_ORDER.forEach((pre) =>
      SEVERITY_ORDER.forEach((post) => {
        const key = `${side}|${pre}|${post}`;
        const ids = staged.get(key);
        if (!ids || !ids.length) return;
        cells.set(key, {
          side,
          pre,
          post,
          ids: [...ids].sort((a, b) => String(a).localeCompare(String(b)))
        });
      })
    )
  );
  return cells;
}

/**
 * Summarize migrations by level of concern for each value of an arm column
 * (HEP-COMP-005): per arm, the count of subjects whose migration is red
 * (concern), yellow (potential concern), green (no concern / benefit), or gray
 * (no migration), plus the arm total. When armCol is falsy, all subjects roll
 * up into a single 'All' row.
 * @param {Object[]} subjects Composite subjects from buildCompositeSubjects.
 * @param {?string} armCol The meta column to split by (e.g. treatment arm), or null.
 * @returns {Array<{arm: string, red: number, yellow: number, green: number, gray: number, total: number}>}
 */
export function byArmSummary(subjects, armCol) {
  const buckets = new Map();
  const bucketFor = (arm) => {
    if (!buckets.has(arm))
      buckets.set(arm, { arm, red: 0, yellow: 0, green: 0, gray: 0, total: 0 });
    return buckets.get(arm);
  };
  subjects.forEach((subject) => {
    const arm = armCol ? (subject.raw[armCol] ?? '') : 'All';
    const bucket = bucketFor(arm === '' ? '(missing)' : arm);
    bucket[subject.concern] += 1;
    bucket.total += 1;
  });
  return [...buckets.values()].sort((a, b) => String(a.arm).localeCompare(String(b.arm)));
}
