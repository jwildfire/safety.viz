# Adverse Event Timelines requirement coverage

Traceability for the ae-timelines module (a Chart.js reimplementation of
[RhoInc/ae-timelines](https://github.com/RhoInc/ae-timelines) matching the
original renderer's behavior, under
[#26](https://github.com/jwildfire/safety.viz/issues/26)), per the convention
in [CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs are the `AET-*` rows
of the reviewed 43-row matrix at
[safety.agent `docs/requirements/ae-timelines.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/ae-timelines.md);
rows are routed to Vitest (transforms) or Playwright (interaction/visual
behavior) by judgment, since every source row is still typed `planned`.

## Browser evidence (Playwright — `tests/e2e/ae-timelines.spec.js`)

| Requirement ID               | Source matrix rows                                     | Issue | Test                                                                               |
| ---------------------------- | ------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------- |
| AET-FUNC-002/003/004/005     | AET-FUNC-002, AET-FUNC-003, AET-FUNC-004, AET-FUNC-005 | #26   | renders the timeline with filter and sort controls and a severity legend           |
| AET-FUNC-007                 | AET-FUNC-007, AET-REG-002, AET-REG-013                 | #26   | the italicized participant annotation reports shown of total and updates on filter |
| AET-DATA-001 (cleaning note) | AET-DATA-001                                           | #26   | blank-term and non-integer-start-day records are removed with visible counts       |
| AET-REG-001                  | AET-REG-001                                            | #26   | filtering by severity changes the visible events and participants                  |
| AET-FUNC-006                 | AET-FUNC-006, AET-REG-003                              | #26   | the sort control switches between earliest and alphabetical participant order      |
| AET-FUNC-008                 | AET-FUNC-008, AET-REG-004                              | #26   | hovering an event shows the reported term, start day, and stop day                 |
| AET-REG-005/006              | AET-REG-005, AET-REG-006                               | #26   | serious events carry a distinct mark and dots sit at start days only               |
| AET-FUNC-009                 | AET-FUNC-009, AET-REG-008, AET-API-003                 | #26   | clicking a participant ID opens the detail view and fires participantsSelected     |
| AET-FUNC-010                 | AET-FUNC-010, AET-REG-012, AET-API-003                 | #26   | the Back button returns to the timelines and clears the selection                  |
| AET-REG-009/010/011          | AET-REG-009, AET-REG-010, AET-REG-011                  | #26   | the detail listing supports search, header sorting, and CSV export                 |
| AET-API-001 (module scheme)  | — (see legacy-API note)                                | #26   | lifecycle API supports init, setData, setSettings, render, resize, and destroy     |

## Unit evidence (Vitest — `tests/unit/ae-timelines/`)

| Requirement ID                                     | Source matrix rows                      | Issue | Test file               |
| -------------------------------------------------- | --------------------------------------- | ----- | ----------------------- |
| AET-DATA-001/004 (ADaM defaults)                   | AET-DATA-001, AET-DATA-004              | #26   | `configure.test.js`     |
| AET-CFG-005..012 (settings sync)                   | AET-CFG-005..012                        | #26   | `configure.test.js`     |
| AET-FUNC-002/003/004/005 (default filters)         | AET-FUNC-002..005                       | #26   | `configure.test.js`     |
| AET-CFG-004, AET-DATA-003/006 (validation)         | AET-CFG-004, AET-DATA-003, AET-DATA-006 | #26   | `checkInputs.test.js`   |
| AET-DATA-001, AET-FUNC-007 (cleaning + population) | AET-DATA-001, AET-FUNC-007              | #26   | `structureData.test.js` |
| AET-FUNC-003 (color domain + N/A)                  | AET-FUNC-003                            | #26   | `structureData.test.js` |
| AET-FUNC-006 (sort orders)                         | AET-FUNC-006, AET-REG-003               | #26   | `structureData.test.js` |
| AET-FUNC-002, AET-CFG-008 (serious flag)           | AET-FUNC-002, AET-CFG-008               | #26   | `structureData.test.js` |
| AET-FUNC-008 (study-day domain + axes)             | AET-FUNC-008, AET-REG-001               | #26   | `getScales.test.js`     |
| AET-FUNC-008, AET-CFG-009 (tooltips + datasets)    | AET-FUNC-008, AET-REG-004, AET-CFG-009  | #26   | `getPlugins.test.js`    |

## Source-matrix routing status (43 rows)

- **Covered (35 rows):** AET-FUNC-002..010, AET-REG-001..006 and
  AET-REG-008..013, AET-DATA-001/003/004/006, AET-CFG-004..012, and
  AET-API-003 are evidenced by the tables above. Every source row is still
  typed `planned` in the matrix; re-typing covered rows (`planned` → `unit`/
  `browser`) with links back to these tests is a safety.agent follow-up.
- **AET-REG-007 + AET-DATA-005 (2 rows, descoped):** the viz-library
  "customized chart with queries" example — a study-specific configuration of
  the color/highlight settings, flagged `needs-jeremy-review` in the matrix.
  The remapping mechanics it relies on are covered by the AET-CFG-005..010
  tests; the example itself is not reproduced as a demo.
- **AET-CFG-001 + AET-CFG-002 (2 rows, descoped):** legacy Webcharts
  settings-system rows (`needs-jeremy-review`). The reimplementation ships
  flat safety.viz settings merged by `syncSettings`; the behavior-level
  equivalents are covered by the AET-CFG-004..012 tests.
- **AET-CFG-013 + AET-CFG-014 (2 rows, descoped):** the `custom_marks`
  setting exposes raw Webcharts mark `type`/`per` semantics
  (`needs-jeremy-review`); the Chart.js reimplementation does not carry a
  pass-through mark API.
- **AET-REQ-003 (1 row, descoped):** wiki link text pointing at the wrong
  project's wiki; the matrix AI review recommends dropping it.
- **AET-API-001 (1 row, legacy API):** see the legacy-API note below.

**Legacy-API note:** source-matrix AET-API-001 ("a factory to create a custom
Webcharts chart object") describes the legacy Webcharts API, which the designs
intentionally do not preserve. The module ships the histogram-proven lifecycle
API instead — AET-API-001 in the module scheme — and the original's
`participantsSelected` wrapper event becomes a DOM CustomEvent on the
container element with the same `data` payload (AET-API-003).

**Sort-direction note:** AET-FUNC-006's wording is ambiguous (flagged in the
matrix AI review). The original builds its y domain bottom-to-top, so its
`earliest` and `alphabetical-descending` comparators read top-to-bottom as
earliest-onset-first and alphabetically ascending; the reimplementation
asserts those top-to-bottom orders directly.

## View-selector rollout (VIEW-3, #76)

One primary display — the participant timeline chart. Controls are Filters and a participant-ID sort order; the participant detail is a y-axis-click drill-down listing, not a view switch. Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).

## Participant-profile dock (#99, PPRF-COV-001)

Not a lab-family renderer: ae-timelines ingests adverse-event records, not the measure-per-visit long-lab contract the docked participant profile consumes — adoption is deferred to the AE-domain profile sections planned for the module's v2 ([#99](https://github.com/jwildfire/safety.viz/issues/99) PPRF-13).
