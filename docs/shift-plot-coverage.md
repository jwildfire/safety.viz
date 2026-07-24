# Shift-plot requirement coverage

Traceability for the shift-plot module (#14) — the second full renderer, built
on the framework proven by the histogram (#2) — per the convention in
[CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs are the `SSP-*` rows of
the 39-row reviewed matrix at
[safety.agent `docs/requirements/safety-shift-plot.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-shift-plot.md);
a few module-scheme IDs (`SSP-CHART-002`, the module-API `SSP-API-001` note)
name behavior the matrix does not enumerate. Development follows red-green TDD:
matrix row → failing test → minimal implementation.

## Browser evidence (Playwright — `tests/e2e/shift-plot.spec.js`)

| Requirement ID                                              | Source matrix rows                                              | Issue    | Test                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| SSP-CTRL-001/SSP-REQ-002/SSP-CTRL-002/SSP-CTRL-003          | SSP-CTRL-001, SSP-REQ-002, SSP-CTRL-002                         | #14      | renders measure, baseline/comparison visit, and filter controls                              |
| SSP-CHART-002                                               | —                                                               | #14      | the identity line spans a domain shared by both axes                                         |
| SSP-COUNT-001/SSP-REG-005                                   | SSP-COUNT-001, SSP-REG-005                                      | #14      | the participant note reports shown-of-total participants                                     |
| SSP-REG-020                                                 | SSP-REG-020                                                     | #14      | missing and non-numeric results are dropped with a reported count                            |
| SSP-REG-001                                                 | SSP-REG-001                                                     | #14      | changing the measure re-pairs the scatter                                                    |
| SSP-REG-002/SSP-REG-003                                     | SSP-REG-002, SSP-REG-003                                        | #14      | changing baseline and comparison visits swaps the axes                                       |
| SSP-CTRL-003                                                | SSP-CTRL-003                                                    | #14      | applying a filter updates the participant note                                               |
| SSP-REG-006                                                 | SSP-REG-006                                                     | #14      | the point tooltip reports id, baseline, comparison, change, and pct                          |
| SSP-REQ-003/SSP-REQ-006/SSP-REQ-007/SSP-REG-004/SSP-REG-012 | SSP-REQ-003, SSP-REQ-006, SSP-REQ-007, SSP-REG-004, SSP-REG-012 | #14      | brushing opens the listing, boxes the selection, and de-emphasizes the rest                  |
| SSP-REG-011                                                 | SSP-REG-011                                                     | #14      | clearing the selection resets the points and hides the listing                               |
| SSP-REG-008/SSP-REG-009/SSP-REG-010                         | SSP-REG-008, SSP-REG-009, SSP-REG-010                           | #14      | the listing searches, sorts, and exports to CSV                                              |
| SSP-API-003/PPRF-SSP-004                                    | SSP-API-003 + PPRF-SSP-004 (participant-profile matrix)         | #14, #99 | brushing dispatches participantsSelected on the shell root, bubbling to the element          |
| SSP-API-001 (module scheme)                                 | — (see legacy-API note)                                         | #14      | lifecycle API supports init, setData, setSettings, render, resize, destroy                   |
| SSP-REG-016/SSP-REG-018                                     | SSP-REG-016, SSP-REG-018                                        | #14      | shared shell: controls left of the chart, chart above the listing (`tests/e2e/site.spec.js`) |
| PPRF-SSP-001                                                | PPRF-SSP-001 (participant-profile matrix)                       | #99      | a multi-participant brush collapses the dock to a worst-first stepper                        |
| PPRF-SSP-002                                                | PPRF-SSP-002 (participant-profile matrix)                       | #99      | a single-point brush shows the full docked profile beside the linked listing                 |
| PPRF-SSP-003                                                | PPRF-SSP-003 (participant-profile matrix)                       | #99      | clearing the selection and control-driven redraws empty the dock                             |

## Unit evidence (Vitest — `tests/unit/shift-plot/`)

| Requirement ID            | Source matrix rows                             | Issue | Test file                  |
| ------------------------- | ---------------------------------------------- | ----- | -------------------------- |
| SSP-CFG-004/005/006       | SSP-CFG-004, SSP-CFG-005, SSP-CFG-006          | #14   | `configure.test.js`        |
| SSP-REQ-005               | SSP-REQ-005                                    | #14   | `configure.test.js`        |
| SSP-REG-020               | SSP-REG-020                                    | #14   | `structureData.test.js`    |
| SSP-DATA-001              | SSP-DATA-001                                   | #14   | `structureData.test.js`    |
| SSP-REG-013/SSP-REG-014   | SSP-REG-013, SSP-REG-014                       | #14   | `structureData.test.js`    |
| SSP-REQ-005/SSP-REG-019   | SSP-REQ-005, SSP-REG-019                       | #14   | `structureData.test.js`    |
| SSP-CFG-005               | SSP-CFG-005                                    | #14   | `structureData.test.js`    |
| SSP-CTRL-001/SSP-CTRL-003 | SSP-CTRL-001, SSP-CTRL-003                     | #14   | `structureData.test.js`    |
| SSP-CHART-002             | —                                              | #14   | `structureData.test.js`    |
| SSP-DATA-001/SSP-DATA-003 | SSP-DATA-001, SSP-DATA-003                     | #14   | `checkInputs.test.js`      |
| PPRF-SSP-001..004         | PPRF-SSP-001..004 (participant-profile matrix) | #99   | `profile-adoption.test.js` |

## Source-matrix routing status (39 rows)

Of the 39 reviewed `SSP-*` rows, **32 are covered** by the browser/unit
evidence above and **7 are descoped** with rationale below (honest routing per
the histogram precedent).

- **Descoped — legacy Webcharts/CAT (5 rows):**
  - **SSP-API-001** ("a factory to create a custom Webcharts chart object")
    describes the legacy Webcharts API, which the designs intentionally do not
    preserve. The module ships the pilot's lifecycle API instead —
    `SSP-API-001` in the module scheme (see the browser table).
  - **SSP-CFG-001** and **SSP-CFG-002** are legacy Webcharts settings
    passthrough/detail; the nextgen module exposes an explicit settings object
    (`ShiftPlotSettings`, covered by `SSP-CFG-004/005/006`) rather than
    accepting Webcharts configuration objects.
  - **SSP-DATA-004** is a CAT/viz-library "customized chart with queries"
    example page; the nextgen demo uses the standalone real-data page instead.
  - **SSP-REG-020**'s CAT download/edit/re-upload workflow is descoped; the
    underlying behavior it verifies (invalid results removed row-by-row, with a
    reported count in a console warning and a visible note) **is** covered.
- **Descoped — secondary decoration (1 row):**
  - **SSP-REG-007** (marginal box-and-whisker markers with N / percentiles /
    mean / SD tooltips) is a secondary axis decoration from the original
    Webcharts renderer; the core shift comparison (scatter, identity line, and
    the per-point tooltip of `SSP-REG-006`) is fully implemented. A follow-up
    can add marginal box plots if a study needs them.
- **Adapted — layout (1 row):**
  - **SSP-REG-017** ("the listings appear to the right of the chart") is
    superseded by the shared renderer shell (#17), which standardizes the
    listing **below** the chart across every renderer (matching the histogram).
    Controls-left / chart-above-listing (`SSP-REG-016`, `SSP-REG-018`) hold and
    are enforced by `tests/e2e/site.spec.js`. **SSP-REG-015** ("fits on one
    page") — flagged vague in the AI review — is addressed by the fixed
    460px chart area and the responsive shell rather than a pixel assertion.

## Docked participant profile (#99, PPRF-SSP)

The shared participant-profile module docks below the chart (config-on,
`profile: true`) and is fed by the renderer's brush selection via the
`participantsSelected` dispatch — the dock SUPPLEMENTS the linked listing
(records vs story), replacing nothing. shift-plot is the rollout's stepper
renderer: a brush routinely catches several participants, so the dock collapses
to the worst-first cohort stepper ("1 of N"), stepper navigation
border-emphasizes the stepped point on the chart without re-dispatching, and a
single-point brush shows the full profile directly. The adoption moved the
`SSP-API-003` dispatch target from the host element to the shell root
(PPRF-SSP-004) — backward-compatible because the event bubbles. Adoption rows
are PPRF-SSP-001..004 in the
[participant-profile matrix](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/participant-profile.md);
unit evidence lives in `tests/unit/shift-plot/profile-adoption.test.js`.

## View-selector rollout (VIEW-3, #76)

One primary display — the baseline-vs-comparison scatter. The linked listing is a brush-selection drill-down shown in addition to the chart, not a mutually-exclusive view switch. Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).
