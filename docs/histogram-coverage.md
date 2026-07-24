# Histogram requirement coverage

Traceability for the histogram module (extracted from the
[safety-histogram pilot](https://github.com/jwildfire/safety-histogram), `dev`
@ a3ff9f7, under [#2](https://github.com/jwildfire/safety.viz/issues/2)), per
the convention in [CONTRIBUTING.md](../CONTRIBUTING.md). Two requirement-ID
schemes appear:

- **Module IDs** (`SH-CTRL-*`, `SH-CHART-*`, `SH-LIST-*`, `SH-DATA-*`,
  `SH-API-*`) — the pilot's condensed matrix, used by
  [design #2](https://jwildfire.github.io/obot.roadmap/requirements/design/2_design.html)'s
  decomposition mapping.
- **Source matrix rows** (`SH-FUNC-*`, `SH-REG-*`, `SH-CFG-*`, …) — the
  reviewed matrix at
  [obot.agent `docs/requirements/safety-histogram.md`](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/safety-histogram.md),
  whose `Evidence Type` column routes rows (`unit` → Vitest, `browser` →
  Playwright). `SH-OVW-*` rows are post-pilot additions — the all-measures
  overview ([#39](https://github.com/jwildfire/safety.viz/issues/39)) is new
  capability beyond the original renderer.

## Browser evidence (Playwright — `tests/e2e/histogram.spec.js`)

| Requirement ID                      | Source matrix rows                                    | Issue | Test                                                                        |
| ----------------------------------- | ----------------------------------------------------- | ----- | --------------------------------------------------------------------------- |
| SH-CTRL-001/SH-CTRL-002/SH-CTRL-006 | SH-FUNC-001, SH-FUNC-002                              | #2    | renders measure, filter, axis, bin, and group controls                      |
| SH-CTRL-003                         | SH-FUNC-003                                           | #2    | participant note updates when a filter is applied                           |
| SH-DATA-002                         | SH-CFG-005                                            | #2    | missing and non-numeric results are dropped with a reported count and note  |
| SH-CHART-003                        | SH-FUNC-008, SH-FUNC-010, SH-FUNC-012                 | #2    | selecting a canvas bar opens a linked listing with record details and count |
| —                                   | SH-FUNC-011                                           | #2    | selecting a bar de-emphasizes the bars outside the linked listing           |
| SH-LIST-001/002/003/004             | SH-FUNC-008                                           | #2    | listing supports pagination, search, sorting, and CSV export                |
| SH-CTRL-004                         | SH-FUNC-004A, SH-FUNC-004B                            | #2    | normal range checkbox toggles a stable overlay region                       |
| —                                   | SH-FUNC-004C                                          | #2    | normal range control is hidden when the measure has no normal range data    |
| SH-CTRL-005                         | SH-FUNC-005A, SH-FUNC-005B, SH-FUNC-005D              | #2    | x-axis limit inputs redraw and normalize invalid ranges                     |
| —                                   | SH-FUNC-005C                                          | #2    | x-axis limit inputs support stepper increments of 1                         |
| SH-CTRL-007                         | —                                                     | #2    | x-axis tick mode switches labels between centers and bin boundaries         |
| SH-CHART-005                        | — (see SH-REG-078 note)                               | #2    | p-value annotations display the approximation and validation disclaimer     |
| SH-CHART-004                        | —                                                     | #2    | group-by renders grouped histograms                                         |
| SH-CHART-004/SH-CTRL-006            | —                                                     | #19   | grouped small multiples share the main chart's bin boundaries               |
| SH-CTRL-006                         | —                                                     | #19   | bin boundaries anchor to the measure results, not the filtered subset       |
| SH-CTRL-008                         | SH-REG-024, SH-REG-025, SH-REG-026                    | #19   | bin quantity and width inputs reflect the resolved binning                  |
| SH-CTRL-008                         | SH-REG-020                                            | #19   | editing Quantity switches the algorithm to Custom and recomputes the width  |
| SH-API-001 (module scheme)          | — (see legacy-API note)                               | #2    | lifecycle API supports init, setData, setSettings, render, resize, destroy  |
| —                                   | SH-OVW-001                                            | #39   | the overview is the default view when start_value is not set                |
| —                                   | SH-OVW-001                                            | #39   | an unknown start_value warns and falls back to the overview                 |
| —                                   | SH-OVW-002                                            | #39   | the overview renders one independently binned panel per measure             |
| —                                   | SH-OVW-003                                            | #39   | clicking a small multiple opens that measure in the single-measure view     |
| —                                   | SH-OVW-004                                            | #39   | selecting All Measures returns from a single-measure view to the overview   |
| —                                   | SH-OVW-005                                            | #39   | filters stay active in the overview and measure controls hide               |
| PPRF-SH-001/PPRF-SH-002             | PPRF-SH-001, PPRF-SH-002 (participant-profile matrix) | #99   | clicking a listing row focuses the participant into the docked profile      |
| PPRF-SH-003                         | PPRF-SH-003 (participant-profile matrix)              | #99   | the dock Clear affordance un-highlights the row and keeps the listing       |
| PPRF-SH-003 (bin/control clears)    | PPRF-SH-003 (participant-profile matrix)              | #99   | a new bin click and control changes empty the dock                          |
| SH-AXIS-001/002/003                 | SH-AXIS-001, SH-AXIS-002, SH-AXIS-003, SH-FUNC-006    | #85   | x-axis limit inputs load pre-filled, follow the measure, and Reset restores |

## Unit evidence (Vitest — `tests/unit/histogram/`)

| Requirement ID               | Source matrix rows                                 | Issue | Test file                  |
| ---------------------------- | -------------------------------------------------- | ----- | -------------------------- |
| SH-CFG-004..009 (defaults)   | SH-CFG-004..009                                    | #2    | `configure.test.js`        |
| SH-CFG-010/011, SH-CHART-004 | SH-CFG-010, SH-CFG-011                             | #2    | `configure.test.js`        |
| SH-CFG-013/014               | SH-CFG-013, SH-CFG-014                             | #2    | `configure.test.js`        |
| SH-DATA-001/002              | SH-CFG-005                                         | #2    | `structureData.test.js`    |
| SH-CTRL-002/005/006          | SH-FUNC-004C (detection)                           | #2    | `structureData.test.js`    |
| SH-CTRL-006 (original QC)    | —                                                  | #19   | `binning.test.js`          |
| SH-CTRL-005/007              | SH-FUNC-005A, SH-FUNC-005B                         | #2    | `getScales.test.js`        |
| SH-AXIS-001/002/003/004      | SH-AXIS-001, SH-AXIS-002, SH-AXIS-003, SH-AXIS-004 | #85   | `axis-limits.test.js`      |
| SH-CHART-002/005             | SH-FUNC-011 (colors)                               | #2    | `getPlugins.test.js`       |
| SH-LIST-002/003/004          | —                                                  | #2    | `listing.test.js`          |
| SH-DATA-001/003 (schema)     | SH-DATA-001                                        | #2    | `checkInputs.test.js`      |
| SH-API-001 (module export)   | —                                                  | #2    | `../main.test.js`          |
| PPRF-SH-001/002/003          | PPRF-SH-001..003 (participant-profile matrix)      | #99   | `profile-adoption.test.js` |

## Docked participant profile (#99, PPRF-SH)

The shared participant-profile module docks below the chart (config-on,
`profile: true`) and is fed from the histogram's natural participant surface —
the SHARED linked listing a bin click opens. Setting the host's
`onListingRowClick` callback opts the shared listing renderer into
clickable/keyboard-focusable rows (presence-of-callback opt-in: the other
consumers of `src/histogram/listing.js`, outlier-explorer and shift-plot, are
unaffected); a row click focuses that participant via a NEW host selection
state (`state.selectedId`) and the house `participantsSelected` dispatch on the
shell root. The listing stays beside the dock (records vs story, PPRF-11) with
the focused participant's rows highlighted. Adoption rows are PPRF-SH-001..003
in the
[participant-profile matrix](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/participant-profile.md);
unit evidence lives in `tests/unit/histogram/profile-adoption.test.js`.

## Source-matrix routing status (125 rows)

- **`browser` (11 rows):** the 10 reviewed rows are covered above
  (SH-FUNC-004A–C, SH-FUNC-005A–D, SH-FUNC-010, SH-FUNC-011, SH-FUNC-012).
  **SH-REG-078** (status `replaced`) is superseded by design #2's p-value
  disposition: the shipped approximate screening annotations intentionally
  carry the validation disclaimer, so no test asserts the legacy text's
  removal.
- **`manual` (8 rows):** SH-REG-044/045/047/058/059/061/081/082 carry manual
  review evidence and are out of scope for automated coverage.
- **`planned` (106 rows):** not yet routed to `unit`/`browser` in the source
  matrix. Where a test here already evidences a planned row it is listed under
  "Source matrix rows" above; re-typing those rows (`planned` → `unit`/
  `browser`) with links back to these tests is a safety.agent follow-up.

**Legacy-API note:** source-matrix SH-API-001 ("a factory to create a custom
Webcharts chart object") describes the legacy Webcharts API, which the designs
intentionally do not preserve (pilot SH-API-002). The module ships the pilot's
lifecycle API instead — SH-API-001 in the module scheme.

**SH-REG-024 note:** the row's inputs-update behavior is evidenced by
SH-CTRL-008; its info-icon clause (an ⓘ link to the algorithm's description)
is not ported.

## View-selector rollout (VIEW-3, #76)

One representation — a histogram. The "All Measures" overview is a small-multiples data-scope mode and the bar-click listing is a supplementary drill-down; neither is a mutually-exclusive primary-display switch, so promoting would require inventing a new toggle (out of scope). Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).
