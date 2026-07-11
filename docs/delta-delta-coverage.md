# Delta-delta requirement coverage

Traceability for the delta-delta module (a Chart.js reimplementation of
[RhoInc/safety-delta-delta](https://github.com/RhoInc/safety-delta-delta),
matching behavior), built under
[#25](https://github.com/jwildfire/safety.viz/issues/25) per the convention in
[CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs come from the reviewed
48-row matrix at
[safety.agent `docs/requirements/safety-delta-delta.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-delta-delta.md),
whose `Evidence Type` column routes rows (`unit` → Vitest, `browser` →
Playwright). The renderer flattens long-format results (one row per
measurement at a visit) to one point per participant: **change in measure X**
(comparison-visit mean − baseline-visit mean) against **change in measure Y**.

## Browser evidence (Playwright — `tests/e2e/delta-delta.spec.js`)

| Requirement ID                               | Source matrix rows                                                                         | Issue | Test                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------- |
| SDD-FUNC-001/SDD-FUNC-002/SDD-FUNC-003       | SDD-FUNC-001, SDD-FUNC-002, SDD-FUNC-003                                                   | #25   | renders visit, measure, filter, and display controls           |
| SDD-FUNC-002/SDD-REG-003                     | SDD-FUNC-002, SDD-REG-003                                                                  | #25   | defaults to the first/second measure and first/last visit      |
| SDD-FUNC-004                                 | SDD-FUNC-004                                                                               | #25   | the participant-count note reports the total and percentage    |
| SDD-REG-008                                  | SDD-REG-008                                                                                | #25   | missing/non-numeric results are dropped with a reported count  |
| SDD-REG-001                                  | SDD-REG-001                                                                                | #25   | changing the Y measure changes the plotted distribution        |
| SDD-REG-002                                  | SDD-REG-002                                                                                | #25   | changing the comparison visit changes the plotted distribution |
| SDD-REG-006/SDD-REG-005                      | SDD-REG-005, SDD-REG-006                                                                   | #25   | a filter narrows the plotted points and updates the count      |
| SDD-FUNC-005                                 | SDD-FUNC-005                                                                               | #25   | the tooltip reports the participant ID and both change values  |
| SDD-FUNC-006/SDD-REG-011/016/018/019/020/024 | SDD-FUNC-006, SDD-REG-011, SDD-REG-016, SDD-REG-018, SDD-REG-019, SDD-REG-020, SDD-REG-024 | #25   | clicking a point opens the linked measure table                |
| SDD-REG-021/022/025                          | SDD-REG-021, SDD-REG-022, SDD-REG-025                                                      | #25   | change values are signed and colored, with axis tags           |
| SDD-REG-012/SDD-REG-013                      | SDD-REG-012, SDD-REG-013                                                                   | #25   | the clicked point is highlighted and clicking another redraws  |
| SDD-REG-014                                  | SDD-REG-014                                                                                | #25   | changing a control removes the detail table                    |
| SDD-REG-026                                  | SDD-REG-026                                                                                | #25   | the regression line toggles with an equation and R² note       |
| SDD-REG-007                                  | SDD-REG-007                                                                                | #25   | a filter for a non-existent variable logs a console warning    |
| SDD-REG-010                                  | SDD-REG-010                                                                                | #25   | a non-existent required column errors into the container       |
| SDD-API-001 (module scheme)                  | — (see legacy-API note)                                                                    | #25   | lifecycle API supports init, setData, setSettings, render      |

## Unit evidence (Vitest — `tests/unit/delta-delta/`)

| Requirement ID                     | Source matrix rows                                              | Issue | Test file               |
| ---------------------------------- | --------------------------------------------------------------- | ----- | ----------------------- |
| SDD-CFG-004..008                   | SDD-CFG-004, SDD-CFG-005, SDD-CFG-006, SDD-CFG-007, SDD-CFG-008 | #25   | `configure.test.js`     |
| SDD-CFG-009..013                   | SDD-CFG-009, SDD-CFG-010, SDD-CFG-011, SDD-CFG-012, SDD-CFG-013 | #25   | `configure.test.js`     |
| SDD-CFG-014/SDD-CFG-015            | SDD-CFG-014, SDD-CFG-015                                        | #25   | `configure.test.js`     |
| SDD-REG-003 (delta math)           | SDD-REG-003                                                     | #25   | `structureData.test.js` |
| SDD-FUNC-001/SDD-REG-004 (average) | SDD-FUNC-001, SDD-REG-004                                       | #25   | `structureData.test.js` |
| SDD-REG-008 (removal)              | SDD-REG-008                                                     | #25   | `structureData.test.js` |
| SDD-REG-019/022/023/025            | SDD-REG-019, SDD-REG-022, SDD-REG-023, SDD-REG-025              | #25   | `structureData.test.js` |
| SDD-REG-006 (filters)              | SDD-REG-006                                                     | #25   | `structureData.test.js` |
| SDD-REG-021/022 (format/color)     | SDD-REG-021, SDD-REG-022                                        | #25   | `getScales.test.js`     |
| SDD-REG-015 (axis padding)         | SDD-REG-015                                                     | #25   | `getScales.test.js`     |
| SDD-REG-026 (regression)           | SDD-REG-026                                                     | #25   | `getPlugins.test.js`    |
| SDD-FUNC-004 (count text)          | SDD-FUNC-004                                                    | #25   | `getPlugins.test.js`    |
| SDD-REG-012 (selection)            | SDD-REG-012                                                     | #25   | `getPlugins.test.js`    |
| SDD-DATA-001/SDD-REG-010 (guard)   | SDD-DATA-001, SDD-REG-010                                       | #25   | `checkInputs.test.js`   |

## Source-matrix routing status (48 rows)

- **Fully evidenced (44 rows):** SDD-FUNC-001..006, SDD-REG-001..008,
  SDD-REG-010..014, SDD-REG-016..026, SDD-DATA-001, SDD-CFG-004..015. Each maps
  to a browser and/or unit test above. SDD-REG-017 (details metadata above the
  table) is evidenced by the participant-detail header, which renders every
  configured `details` column.
- **Partial / addressed by implementation (2 rows):**
  - **SDD-REG-009** — the initial X/Y measure is honored (`measure_x` /
    `measure_y`, verified via the default-selection browser test and
    `configure`), but the row's "with units attached" clause is **descoped**:
    the original renderer labels measures by their bare `measure_col` value, so
    unit-suffixed measure labels are intentionally not reproduced.
  - **SDD-REG-015** ("points are not cut off on the edge of the chart") — the
    delta domain includes 0 and pads beyond the data extent (`deltaDomain`, unit
    tested) and the chart adds layout padding, so edge points render inside the
    frame. No pixel-level assertion is made; this is a visual acceptance item.
- **Descoped — legacy Webcharts API/config (2 rows):** SDD-CFG-001 and
  SDD-CFG-002 describe configuring the chart as a Webcharts `chart` object with
  `webchartsSettings.js`. Per the cross-renderer legacy-API decision
  ([design #2](https://jwildfire.github.io/obot.roadmap/requirements/design/2_design.html)),
  the nextgen module does not preserve the Webcharts configuration surface; it
  ships flat `DEFAULT_SETTINGS` (documented in the API reference) instead.

**Legacy-API note:** source-matrix **SDD-API-001** ("a factory to create a
custom Webcharts chart object") describes the legacy Webcharts API, which the
designs intentionally do not preserve. The module ships the histogram's proven
lifecycle API instead — `deltaDelta(element, settings)` returning an instance
with `init`/`setData`/`setSettings`/`render`/`resize`/`destroy` — evidenced as
SDD-API-001 in the module scheme above.

**Removed/merged upstream (AI review):** SDD-CFG-003, SDD-CFG-016, SDD-API-002,
SDD-REQ-001, and SDD-REQ-002 were dropped in the safety.agent matrix review as
introductory/aggregate text or navigation artifacts, and are not counted in the
48 rows.
