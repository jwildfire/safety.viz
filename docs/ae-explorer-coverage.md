# Adverse Event Explorer requirement coverage

Traceability for the ae-explorer module (a dependency-free DOM/SVG
reimplementation of [RhoInc/aeexplorer](https://github.com/RhoInc/aeexplorer)
v3.4.1 matching the original renderer's behavior, under
[#60](https://github.com/jwildfire/safety.viz/issues/60)), per the convention
in [CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs are the `AE-*` rows
of the harvested 74-row matrix at
[obot.agent `docs/requirements/aeexplorer.md`](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/aeexplorer.md);
rows are routed to Vitest (transforms) or Playwright (interaction/visual
behavior) by judgment, since every source row is still typed `planned`.

## Browser evidence (Playwright — `tests/e2e/ae-explorer.spec.js`)

| Requirement ID                      | Source matrix rows                                                                  | Issue | Test                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| AE-DATA-003/AE-API-001              | AE-DATA-003, AE-API-001                                                             | #60   | default-column data renders the hierarchical summary table from the factory          |
| AE-DATA-001 (denominators)          | AE-DATA-001                                                                         | #60   | placeholder rows keep AE-free participants in the group denominators                 |
| AE-USER-014/015, AE-REG-001/002     | AE-USER-014, AE-USER-015, AE-REG-001, AE-REG-002                                    | #60   | the category toggle expands and collapses the nested preferred terms                 |
| AE-REG-008                          | AE-REG-008                                                                          | #60   | participant mode counts each participant once                                        |
| AE-USER-006, AE-REG-009/033/035     | AE-USER-006, AE-REG-009, AE-REG-033, AE-REG-035                                     | #60   | the summarize-by toggle switches both numerators and denominators                    |
| AE-USER-001, AE-REG-007/012/013     | AE-USER-001, AE-REG-007, AE-REG-012, AE-REG-013                                     | #60   | the numeric prevalence filter hides rows below the threshold as it is typed          |
| AE-USER-007, AE-REG-003/004         | AE-USER-007, AE-REG-003, AE-REG-004                                                 | #60   | search shows only matching categories, highlighted, with a match count               |
| AE-USER-008, AE-REG-005             | AE-USER-008, AE-REG-005                                                             | #60   | clearing the search resets the table; a no-match term leaves it unchanged            |
| AE-REG-006/018, AE-USER-002/003/018 | AE-REG-006, AE-REG-018, AE-USER-002, AE-USER-003, AE-USER-018                       | #60   | event filters narrow counted events without changing denominators, with badges       |
| AE-REG-014                          | AE-REG-014                                                                          | #60   | filters with no matching events show the exact no-results error                      |
| AE-USER-016, AE-REG-019/022         | AE-USER-016, AE-REG-019, AE-REG-022                                                 | #60   | clicking a category opens the details listing with the record count in the header    |
| AE-USER-017, AE-REG-020/021         | AE-USER-017, AE-REG-020, AE-REG-021                                                 | #60   | the details view reports the active filters and Return restores the table            |
| AE-USER-012, AE-REG-016             | AE-USER-012, AE-REG-016, AE-USER-009                                                | #60   | the rate plot draws one group-colored dot per group with the percentage on hover     |
| AE-USER-013/011, AE-REG-017         | AE-USER-013, AE-USER-011, AE-REG-017, AE-USER-009, AE-USER-010, AE-REG-015          | #60   | difference diamonds compare each group pair, revealing intervals and counts on hover |
| AE-USER-019, AE-REG-037/039         | AE-USER-019, AE-REG-037, AE-REG-039                                                 | #60   | group configuration drives the Total and Difference columns                          |
| AE-CFG-004, AE-REG-041/043/044      | AE-CFG-004, AE-REG-041, AE-REG-043, AE-REG-044                                      | #60   | the group re-mapping control offers the current column and redraws on change         |
| AE-USER-020, AE-REG-026..030        | AE-USER-020, AE-CFG-009, AE-REG-026, AE-REG-027, AE-REG-028, AE-REG-029, AE-REG-030 | #60   | validation mode offers the summarized CSV named major-minor-basis with filtered data |

## Unit evidence (Vitest — `tests/unit/ae-explorer/`)

| Requirement ID                                   | Source matrix rows                                           | Issue | Test file               |
| ------------------------------------------------ | ------------------------------------------------------------ | ----- | ----------------------- |
| AE-CFG-001/002/003, AE-DATA-003                  | AE-CFG-001, AE-CFG-002, AE-CFG-003, AE-DATA-003              | #60   | `configure.test.js`     |
| AE-USER-002..005 (default filters)               | AE-USER-002, AE-USER-003, AE-USER-004, AE-USER-005           | #60   | `configure.test.js`     |
| AE-USER-018, AE-REG-031 (filter specs)           | AE-USER-018, AE-REG-031                                      | #60   | `configure.test.js`     |
| AE-CFG-007/008, AE-REG-046                       | AE-CFG-007, AE-CFG-008, AE-REG-046                           | #60   | `configure.test.js`     |
| AE-REG-033/035 (summary bases)                   | AE-REG-033, AE-REG-035                                       | #60   | `configure.test.js`     |
| AE-USER-019, AE-REG-037 (column plan)            | AE-USER-019, AE-REG-037, AE-REG-039                          | #60   | `configure.test.js`     |
| AE-CFG-005/006 (groups + colors)                 | AE-CFG-005, AE-CFG-006                                       | #60   | `configure.test.js`     |
| AE-DATA-001/003, AE-CFG-003 (guard)              | AE-DATA-001, AE-DATA-003, AE-CFG-003                         | #60   | `checkInputs.test.js`   |
| AE-DATA-001 (placeholder model)                  | AE-DATA-001                                                  | #60   | `structureData.test.js` |
| AE-REG-008/009 (summary bases)                   | AE-REG-008, AE-REG-009                                       | #60   | `structureData.test.js` |
| AE-REG-006, AE-USER-018 (filter semantics)       | AE-REG-006, AE-USER-018                                      | #60   | `structureData.test.js` |
| AE-USER-013 (Wald interval)                      | AE-USER-013                                                  | #60   | `structureData.test.js` |
| AE-USER-001, AE-REG-007 (prevalence)             | AE-USER-001, AE-REG-007                                      | #60   | `structureData.test.js` |
| AE-USER-007 (search matching)                    | AE-USER-007                                                  | #60   | `structureData.test.js` |
| AE-USER-012 (zero-shell cells)                   | AE-USER-012                                                  | #60   | `structureData.test.js` |
| AE-USER-012/013, AE-REG-046 (scales)             | AE-USER-012, AE-USER-013, AE-REG-046                         | #60   | `getScales.test.js`     |
| AE-CFG-006, AE-REG-040 (palette)                 | AE-CFG-006, AE-REG-040                                       | #60   | `getPlugins.test.js`    |
| AE-USER-010/011, AE-REG-015/016/017 (hover text) | AE-USER-010, AE-USER-011, AE-REG-015, AE-REG-016, AE-REG-017 | #60   | `getPlugins.test.js`    |
| AE-REG-027..030, AE-USER-020 (CSV)               | AE-REG-027, AE-REG-028, AE-REG-029, AE-REG-030, AE-USER-020  | #60   | `getPlugins.test.js`    |

## Source-matrix routing status (74 rows)

- **Covered (63 rows):** AE-USER-001..020 (see modernization notes below for
  AE-USER-009 and AE-USER-020), AE-REG-001..009, AE-REG-012..022,
  AE-REG-024*, AE-REG-026..031, AE-REG-033/035/037/039/040/041/042*/043/044,
  AE-REG-046, AE-DATA-001/003, AE-CFG-001..009, and AE-API-001 are evidenced
  by the tables above. Every source row is still typed `planned` in the
  matrix; re-typing covered rows (`planned` → `unit`/`browser`) with links
  back to these tests is an obot.agent follow-up.
- **AE-REG-024 (details column labels):** the details setting accepts
  `{ value_col, label }` specs with and without labels via the shared
  field-list normalization (`configure.test.js`); the labeled-listing
  rendering itself is the shared listing module, evidenced under the
  histogram (SH-LIST-001..004).
- **AE-REG-042 (multiple variableOptions controls):** the control builder is
  exercised for the group mapping in the browser; multiple simultaneous
  controls share the same code path (one select per mapping with 2+ options).
- **Descoped — legacy environment (4 rows):** AE-REG-010 (viz-library
  gallery), AE-REG-011 (Bootstrap-CSS toggle), AE-REG-025 (Webcharts detail
  table — the behavior it asks for: sort, search, pagination, and export in
  the details listing, is covered by the shared listing module without the
  Webcharts dependency), and AE-DATA-004 (viz-library query example page).
  These test the RhoInc hosting environment, not the renderer.
- **Descoped — superseded control (1 row):** AE-REG-023 ("details listing
  appears as normal" ahead of a Webcharts comparison) is subsumed by the
  details-view browser tests above.
- **Modernization notes:** filters render as single-select dropdowns with an
  All option in the shared sidebar chrome (the original used multi-selects);
  the AE-USER-009 hover aggregate row is covered by its child rows
  (AE-USER-010/011, AE-REG-015..018); the AE-USER-020 CSV downloads via a
  Data-section button rather than a bare link, with the original's
  major-minor-basis file naming; and search/prevalence inputs update per
  keystroke (AE-REG-013) rather than on blur.

## View-selector rollout (VIEW-3, #76)

One primary display — the SOC→PT incidence table. "Summarize by" is a statistic-basis picker that reshapes the same table, and the category drill-down is a master-detail listing restored via a "Return to the Summary View" button, not a mutually-exclusive view switch. Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).

## Participant-profile dock (#99, PPRF-COV-001)

Not a lab-family renderer: ae-explorer ingests adverse-event records, not the measure-per-visit long-lab contract the docked participant profile consumes — adoption is deferred to the AE-domain profile sections planned for the module's v2 ([#99](https://github.com/jwildfire/safety.viz/issues/99) PPRF-13).
