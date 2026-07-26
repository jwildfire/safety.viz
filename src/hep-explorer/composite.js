// Pure re-export shim (safety.viz#91). Every symbol below moved to src/hep-core/
// so the bidirectional migration Sankey (Amirzadegan 2025 Fig 3, safety.viz#92)
// and the modified ALT waterfall (Fig 5, safety.viz#93) can share one hepatic
// domain with the composite view (Fig 4); see obot.roadmap#43.
//
// This file exists only so the hep-explorer entry point and the pre-existing
// tests/unit/hep-explorer/composite.test.js keep working through their original
// import path. It holds no logic and must never gain any: add new code in
// src/hep-core/.
//
// The move is NOT behaviour-preserving for `buildCompositeSubjects`: the plan's
// chunk-0 baseline correction rides along with it and changes the shipped
// composite view's population on real data (295/23 -> 293/25 on the demo
// dataset). See the header of src/hep-core/subjects.js.

/**
 * @deprecated Since safety.viz#91 — import from `src/hep-core/` instead:
 * `hep-core/quadrants.js` for `COMPOSITE_QUADRANTS`, `ALT_ULN_CUT`,
 * `BILI_ULN_CUT`, `BLN_LINES`, `QUADRANT_STYLE`, `CONCERN_COLORS`,
 * `CONCERN_MATRIX`, `concernOf` and `classifyComposite`;
 * `hep-core/subjects.js` for `buildCompositeSubjects`; `hep-core/migration.js`
 * for `migrationMatrix` and `byArmSummary`. Removal is the follow-up
 * `hep-core-cleanup` chunk, which re-points the unit tests at `src/hep-core/`
 * and deletes this file.
 */

export {
  ALT_ULN_CUT,
  BILI_ULN_CUT,
  BLN_LINES,
  COMPOSITE_QUADRANTS,
  CONCERN_COLORS,
  CONCERN_MATRIX,
  QUADRANT_STYLE,
  classifyComposite,
  concernOf
} from '../hep-core/quadrants.js';

export { buildCompositeSubjects } from '../hep-core/subjects.js';

export { byArmSummary, migrationMatrix } from '../hep-core/migration.js';
