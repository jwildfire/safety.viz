# Outlier-explorer requirement coverage

Traceability for the outlier-explorer module (a Chart.js reimplementation of
[RhoInc/safety-outlier-explorer](https://github.com/RhoInc/safety-outlier-explorer)
matching its behavior, under
[#24](https://github.com/jwildfire/safety.viz/issues/24)), per the convention in
[CONTRIBUTING.md](../CONTRIBUTING.md). Two requirement-ID schemes appear:

- **Module IDs** (`SOE-CTRL-*`, `SOE-SELECT-*`, `SOE-NORM-*`, `SOE-YAXIS-*`,
  `SOE-XAXIS-*`, `SOE-API-*`) — this module's condensed scheme, keyed to the
  browser/unit tests below.
- **Source-matrix rows** (`SOE-FUNC-*`, `SOE-REG-*`, `SOE-CFG-*`, `SOE-DATA-*`,
  `SOE-API-*`) — the reviewed matrix at
  [safety.agent `docs/requirements/safety-outlier-explorer.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-outlier-explorer.md),
  whose `Evidence Type` column routes rows (`unit` → Vitest, `browser` →
  Playwright).

## Browser evidence (Playwright — `tests/e2e/outlier-explorer.spec.js`)

| Requirement ID           | Source matrix rows                                                                                        | Issue | Test                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| SOE-CTRL-001             | SOE-FUNC-001, SOE-FUNC-002, SOE-FUNC-004, SOE-FUNC-005, SOE-FUNC-006, SOE-FUNC-007                        | #24   | renders the full control panel                                                 |
| SOE-COUNT-003            | SOE-FUNC-003, SOE-REG-001, SOE-REG-002                                                                    | #24   | participant note reports N and % and updates on filter                         |
| SOE-DATA-037             | SOE-REG-037, SOE-REG-038                                                                                  | #24   | missing and non-numeric results are dropped with a reported count and note     |
| SOE-SELECT-010           | SOE-FUNC-010, SOE-FUNC-012, SOE-FUNC-013, SOE-REG-013, SOE-REG-014, SOE-REG-016, SOE-REG-022, SOE-REG-023 | #24   | clicking a point highlights the participant and opens a linked listing         |
| SOE-SELECT-020           | SOE-FUNC-010, SOE-REG-020                                                                                 | #24   | clicking the background clears the selection and listing                       |
| SOE-NORM-007             | SOE-FUNC-007, SOE-REG-025, SOE-REG-026, SOE-REG-027                                                       | #24   | normal-range methods drive the band and conditional inputs                     |
| SOE-YAXIS-005            | SOE-FUNC-005, SOE-FUNC-006, SOE-REG-004, SOE-REG-005, SOE-REG-006                                         | #24   | y-axis limits redraw, normalize, and reset                                     |
| SOE-GROUP-049            | SOE-REG-048, SOE-REG-049, SOE-REG-050                                                                     | #24   | grouping colors the marks and renders a legend                                 |
| SOE-XAXIS-004            | SOE-FUNC-004, SOE-REG-003                                                                                 | #24   | the x-axis toggle switches between the visit and study-day axes                |
| SOE-TIP-011              | SOE-REG-011                                                                                               | #24   | point tooltips list participant, result, and time                              |
| SOE-EVENT-003            | SOE-API-003                                                                                               | #24   | participantsSelected fires on select and clear                                 |
| SOE-FILT-051             | SOE-REG-051, SOE-REG-052, SOE-REG-053                                                                     | #24   | a filter with a start value initializes filtered and offers no All option      |
| SOE-API-001              | — (see legacy-API note)                                                                                   | #24   | lifecycle API supports init, setData, setSettings, render, resize, and destroy |
| PPRF-OE-001/PPRF-OE-002  | PPRF-OE-001, PPRF-OE-002 (participant-profile matrix)                                                     | #99   | clicking a point opens the docked profile ALONGSIDE the linked listing         |
| PPRF-OE-003              | PPRF-OE-003 (participant-profile matrix)                                                                  | #99   | background click and control changes empty the dock                            |
| PPRF-OE-002 (dock Clear) | PPRF-OE-002 (participant-profile matrix)                                                                  | #99   | the dock Clear affordance routes through the host clear path                   |

## Unit evidence (Vitest — `tests/unit/outlier-explorer/`)

| Requirement ID                       | Source matrix rows                                              | Issue | Test file               |
| ------------------------------------ | --------------------------------------------------------------- | ----- | ----------------------- |
| SOE-CFG-004/005/006/013/014          | SOE-CFG-004, SOE-CFG-005, SOE-CFG-006, SOE-CFG-013, SOE-CFG-014 | #24   | `configure.test.js`     |
| SOE-CFG-007/008/009 (defaults)       | SOE-CFG-007, SOE-CFG-008, SOE-CFG-009                           | #24   | `configure.test.js`     |
| SOE-FUNC-004/SOE-REG-048             | SOE-FUNC-004, SOE-REG-048                                       | #24   | `configure.test.js`     |
| SOE-REG-037/038, SOE-REG-029/031     | SOE-REG-037, SOE-REG-038, SOE-REG-029, SOE-REG-031              | #24   | `structureData.test.js` |
| SOE-FUNC-004/SOE-REG-028 (axis)      | SOE-FUNC-004, SOE-REG-028                                       | #24   | `structureData.test.js` |
| SOE-FUNC-007/SOE-CFG-007/008 (stats) | SOE-FUNC-007, SOE-CFG-007, SOE-CFG-008, SOE-REG-025             | #24   | `structureData.test.js` |
| SOE-FUNC-005/006, SOE-REG-004/033    | SOE-FUNC-005, SOE-FUNC-006, SOE-REG-004, SOE-REG-033            | #24   | `getScales.test.js`     |
| SOE-REG-028 (x-scale)                | SOE-REG-028                                                     | #24   | `getScales.test.js`     |
| SOE-REG-011/049, SOE-CFG-006         | SOE-REG-011, SOE-REG-049, SOE-CFG-006                           | #24   | `getPlugins.test.js`    |
| SOE-DATA-001/003 (schema)            | SOE-DATA-001, SOE-DATA-003                                      | #24   | `checkInputs.test.js`   |
| SOE-API-001 (module export)          | —                                                               | #24   | `export.test.js`        |

## Source-matrix routing status

The matrix carries 84 rows; this module implements the core product surface —
roughly 50 rows, evidenced by the tests above — and descopes the remaining
exotic, legacy, or data-unsupported rows honestly.

- **Implemented (`browser`/`unit` above):** the measure/filter controls
  (SOE-FUNC-001/002), the participant count (SOE-FUNC-003), the x-axis toggle
  (SOE-FUNC-004), the y-axis limits + reset (SOE-FUNC-005/006), all four
  normal-range methods with their conditional inputs (SOE-FUNC-007,
  SOE-CFG-007/008/009, SOE-REG-025/026/027), click-to-select participant detail
  and de-emphasis (SOE-FUNC-010/012/013, SOE-REG-013/014/016/020/022/023), the
  `participantsSelected` event (SOE-API-003), color-by grouping with a legend
  (SOE-REG-048/049/050), start-valued filters (SOE-REG-051/052/053), point
  tooltips with configurable columns (SOE-REG-011/012, SOE-CFG-006), removed-
  record reporting (SOE-REG-037/038), unit-suffixed measures (SOE-REG-029/031),
  and axis tick rotation by variable (SOE-REG-028). Regression rows
  SOE-REG-001..006 are evidenced by the count/measure/axis tests above.

- **Descoped — no time/visit metadata in the shared demo data
  (SOE-FUNC-008/009, SOE-CFG-010/011/012, SOE-DATA-005, SOE-REG-007/008/009/010):**
  the "visits without data" and "unscheduled visits" toggles and their
  `unscheduled_visit_pattern`/`unscheduled_visits_values` config depend on a
  visit-name/scheduling column. The reused `adbds.csv` is a distribution set
  with no such column, and the module derives an ordinal measurement sequence
  for its axis; there is no honest way to demo empty or unscheduled visits, so
  these are out of scope for this module.

- **Descoped — secondary visualization (SOE-FUNC-010/012 sparkline panel,
  SOE-REG-021/024):** the original opens a panel of small per-measure sparkline
  charts plus a selected-participant dropdown. The linked tabular participant
  listing (demographics + records, reusing the histogram listing) covers the
  drill-down requirement; the sparkline panel and its dropdown are not built.

- **Descoped — exotic/legacy UX (SOE-REG-015/017/018/032/034/035/036,
  SOE-REG-043/044/045/046/047):** overlapping-point notes and hover-from-note
  highlighting, hover-line darkening, the overlap-count tooltip line, and
  `custom_marks` injection are legacy Webcharts-era interactions not carried
  into the Chart.js reimplementation. Basic hover tooltips and click selection
  are implemented instead.

- **Legacy-API note (SOE-API-001 source, SOE-CFG-001/002):** the source
  SOE-API-001 ("a factory to create a custom Webcharts chart object") and the
  base-Webcharts settings describe the legacy Webcharts API, which the designs
  intentionally do not preserve. The module ships the pilot's lifecycle API
  instead — SOE-API-001 in the module scheme.

- **Manual / out of automated scope (SOE-CFG-001/002, SOE-DATA-004,
  SOE-REG-030, SOE-REG-039/040/041/042):** legacy CAT/viz-library demo checks
  and console-warning behaviors for invalid `start_value` / missing units. The
  invalid-measure and missing-unit console warnings are implemented in
  `validateAndCleanData` / `measureLabel` but not asserted by an automated row
  here.

## Docked participant profile (#99, PPRF-OE)

The shared participant-profile module docks below the chart (config-on,
`profile: true`) and is fed by the renderer's existing point-click selection
via the `participantsSelected` dispatch on the shell root (SOE-API-003) — the
dock SUPPLEMENTS the linked listing (records vs story), replacing nothing.
Adoption rows are PPRF-OE-001..003 in the
[participant-profile matrix](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/participant-profile.md);
unit evidence lives in `tests/unit/outlier-explorer/profile-adoption.test.js`.

## View-selector rollout (VIEW-3, #76)

One primary display — the line chart. Every control reshapes that chart; the participant listing is a point-click drill-down, not a view switch. Ruled **single-view** in the shared view-selector rollout ([#76](https://github.com/jwildfire/safety.viz/issues/76)) — no view control is added; see [view-selector-inventory.md](view-selector-inventory.md).
