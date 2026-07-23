// Barrel re-export for src/hep-core/ — the shared hepatic-DILI domain behind
// the safety.viz hepatic tools (obot.roadmap#43, safety.viz#91): the eDISH
// composite view (Amirzadegan 2025 Fig 4), the bidirectional
// baseline-to-on-treatment migration Sankey (Fig 3, safety.viz#92) and the
// modified ALT waterfall (Fig 5, safety.viz#93).
//
// hep-core is NOT a chart module: it has no configure.js, it is absent from
// site/config.json, and it exposes no public API surface of its own. It is the
// one place the three figures agree on how a participant is reduced, how a
// quadrant is decided, and how a migration is counted.
//
// Import from this barrel for ergonomics, or from the individual files when a
// narrower dependency is wanted.

export * from './quadrants.js';
export * from './subjects.js';
export * from './arms.js';
export * from './migration.js';
export * from './stats.js';
