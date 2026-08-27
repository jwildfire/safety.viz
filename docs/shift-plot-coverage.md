# Shift-plot requirement coverage

Traceability for the shift-plot module (#14) — the second full renderer, built
on the framework proven by the histogram (#2) — per the convention in
[CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs are the `SSP-*` rows of
the 45-row matrix at
[safety.agent `docs/requirements/safety-shift-plot.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-shift-plot.md)
— 39 harvested and reviewed from the RhoInc wiki, plus six added locally in
[#136](https://github.com/jwildfire/safety.viz/issues/136) (`SSP-CHART-001/002`
backfilled, `SSP-SCALE-001..004` new). One module-scheme ID remains outside the
matrix: the module-API `SSP-API-001` note. Development follows red-green TDD:
matrix row → failing test → minimal implementation.

## Browser evidence (Playwright — `tests/e2e/shift-plot.spec.js`)

| Requirement ID                                              | Source matrix rows                                              | Issue    | Test                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| SSP-CTRL-001/SSP-REQ-002/SSP-CTRL-002/SSP-CTRL-003          | SSP-CTRL-001, SSP-REQ-002, SSP-CTRL-002                         | #14      | renders measure, baseline/comparison visit, and filter controls                              |
| SSP-CHART-002                                               | SSP-CHART-002                                                   | #14      | the identity line spans a domain shared by both axes                                         |
| SSP-SCALE-001/SSP-SCALE-004                                 | SSP-SCALE-001, SSP-SCALE-004                                    | #136     | the axis-type toggle switches both axes to log and keeps the shared domain                   |
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
| PPRF-SSP-001                                                | PPRF-SSP-001 (participant-profile matrix)                       | #99      | a multi-participant brush collapses the rail to a worst-first stepper                        |
| PPRF-SSP-002                                                | PPRF-SSP-002 (participant-profile matrix)                       | #99      | a single-point brush shows the full railed profile beside the linked listing                 |
| PPRF-SSP-003                                                | PPRF-SSP-003 (participant-profile matrix)                       | #99      | clearing the selection and control-driven redraws empty the rail                             |

## Unit evidence (Vitest — `tests/unit/shift-plot/`)

| Requirement ID                             | Source matrix rows                                     | Issue | Test file                                                        |
| ------------------------------------------ | ------------------------------------------------------ | ----- | ---------------------------------------------------------------- |
| SSP-CFG-004/005/006                        | SSP-CFG-004, SSP-CFG-005, SSP-CFG-006                  | #14   | `configure.test.js`                                              |
| SSP-REQ-005                                | SSP-REQ-005                                            | #14   | `configure.test.js`                                              |
| SSP-REG-020                                | SSP-REG-020                                            | #14   | `structureData.test.js`                                          |
| SSP-DATA-001                               | SSP-DATA-001                                           | #14   | `structureData.test.js`                                          |
| SSP-REG-013/SSP-REG-014                    | SSP-REG-013, SSP-REG-014                               | #14   | `structureData.test.js`                                          |
| SSP-CHART-001/SSP-REQ-005/SSP-REG-019      | SSP-CHART-001, SSP-REQ-005, SSP-REG-019                | #14   | `structureData.test.js`                                          |
| SSP-CFG-005                                | SSP-CFG-005                                            | #14   | `structureData.test.js`                                          |
| SSP-CTRL-001/SSP-CTRL-003                  | SSP-CTRL-001, SSP-CTRL-003                             | #14   | `structureData.test.js`                                          |
| SSP-CHART-002                              | SSP-CHART-002                                          | #14   | `structureData.test.js`, `getScales.test.js`                     |
| SSP-SCALE-001                              | SSP-SCALE-001                                          | #136  | `configure.test.js`, `getScales.test.js`, `scale-toggle.test.js` |
| SSP-SCALE-002                              | SSP-SCALE-002                                          | #136  | `structureData.test.js`, `scale-toggle.test.js`                  |
| SSP-SCALE-003                              | SSP-SCALE-003                                          | #136  | `scale-toggle.test.js`                                           |
| SSP-DATA-001/SSP-DATA-003                  | SSP-DATA-001, SSP-DATA-003                             | #14   | `checkInputs.test.js`                                            |
| PPRF-SSP-001..004                          | PPRF-SSP-001..004 (participant-profile matrix)         | #99   | `profile-adoption.test.js`                                       |
| SSP-FILT-001..004 (shared filter contract) | SSP-FILT-001, SSP-FILT-002, SSP-FILT-003, SSP-FILT-004 | #136  | `../shared/filters.test.js`                                      |
| SSP-MEAS-001/002 (measures whitelist)      | SSP-MEAS-001, SSP-MEAS-002                             | #136  | `measure-list.test.js`                                           |

## Source-matrix routing status (45 rows)

Of the 45 `SSP-*` rows, **38 are covered** by the browser/unit evidence above
and **7 are descoped** with rationale below (honest routing per the histogram
precedent). The count rose from 39 in
[#136](https://github.com/jwildfire/safety.viz/issues/136): four new
`SSP-SCALE-*` rows for the axis-type toggle, plus `SSP-CHART-001` and
`SSP-CHART-002` backfilled — the module's central behavior had been named only
in source comments and test titles, never in the matrix.

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

## Axis type: linear / log (#136, SSP-SCALE)

The oldest request in the legacy sweep — [RhoInc/safety-shift-plot#3](https://github.com/RhoInc/safety-shift-plot/issues/3)
(brittsikora, April 2016): "Auto-scaling was throwing people off, so add
ability to set limits. Or toggle between log axis and linear." This module
answers the **log/linear half**. The axis-**limits** half is deliberately a
separate follow-up: it means adopting the shared `src/axis-limits.js` (already
consumed by histogram, outlier-explorer, results-over-time and hep-explorer)
and re-opening a UX question this module has not answered — one pair of boxes
governs BOTH axes here, so the section would be "Axis Limits", not the
per-axis form every existing consumer ships.

Two facts shape the behavior:

- **The scale type is per-chart, not per-axis.** shift-plot has exactly one
  domain, shared by x and y; that shared domain is what makes the dashed
  identity line mean y = x. Two axes on different scale types could not share
  it (SSP-SCALE-001).
- **A logarithmic axis has no room for 0 or a negative number.** Two
  consequences, both made explicit rather than left to chance:
  - The domain is padded **multiplicatively** on the log scale, over the
    strictly positive values only, so the lower bound can never reach zero
    (SSP-SCALE-002). The linear 5% pad is not merely imprecise here — it goes
    negative on any wide-range measure (Alkaline Phosphatase spans 27..624 in
    the demo data, padding to -2.85), and a non-positive bound makes
    `getPixelForValue` return NaN, blanking the chart and vanishing the
    identity line.
  - A participant pair with a non-positive baseline **or** comparison value is
    **removed and reported** — never clamped, never imputed, never silently
    dropped (SSP-SCALE-003). Clamping would move a participant's clinical
    result; a silent drop would misstate how many participants the chart
    speaks for. The note above the chart carries the count beside the
    invalid-result count, and because the shown-of-total figure is
    `chartPairs.length`, the participant count stays honest on its own. The
    removal is **coupled**: one shared domain governs both axes, so a
    participant with a valid baseline and a zero comparison disappears
    entirely — which is why the count is stated rather than implied.

`identityLinePlugin` needs no change: it draws corner-to-corner in pixel
space through `scales.x/y.getPixelForValue`, and with both axes on the same
domain and the same scale type that segment is still exactly the locus y = x.

The non-positive-removal path is covered by **unit** evidence
(`scale-toggle.test.js`) rather than Playwright: the e2e fixture's values are
all positive (Albumin 10–21, Pulse 65–80) and two existing assertions are
pinned to its exact shape ("12 of 15 participants shown (80.0%)" and "2 missing
or non-numeric results removed."), so adding a non-positive row to the fixture
would move unrelated assertions. The browser test covers the toggle itself and
the shared-domain guarantee.

## Railed participant profile (#99, PPRF-SSP)

The shared participant-profile module mounts in the rail beside the chart (config-on,
`profile: true`) and is fed by the renderer's brush selection via the
`participantsSelected` dispatch — the rail SUPPLEMENTS the linked listing
(records vs story), replacing nothing. shift-plot is the rollout's stepper
renderer: a brush routinely catches several participants, so the rail collapses
to the worst-first cohort stepper ("1 of N"), stepper navigation
border-emphasizes the stepped point on the chart without re-dispatching, and a
single-point brush shows the full profile directly. The adoption moved the
`SSP-API-003` dispatch target from the host element to the shell root
(PPRF-SSP-004) — backward-compatible because the event bubbles. Adoption rows
are PPRF-SSP-001..004 in the
[participant-profile matrix](../requirements/participant-profile.md);
unit evidence lives in `tests/unit/shift-plot/profile-adoption.test.js`.

## View-selector rollout (VIEW-3, #76)

One primary display — the baseline-vs-comparison scatter. The linked listing is a brush-selection drill-down shown in addition to the chart, not a mutually-exclusive view switch. Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).
