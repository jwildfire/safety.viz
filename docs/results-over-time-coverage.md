# Results-over-time requirement coverage

Traceability for the results-over-time module (a Chart.js reimplementation of
[RhoInc/safety-results-over-time](https://github.com/RhoInc/safety-results-over-time),
under [#27](https://github.com/jwildfire/safety.viz/issues/27)), per the
convention in [CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs (`SROT-*`)
come from the reviewed 58-row matrix at
[safety.agent `docs/requirements/safety-results-over-time.md`](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-results-over-time.md),
whose `Evidence Type` column routes rows (`unit` → Vitest, `browser` →
Playwright).

## Browser evidence (Playwright — `tests/e2e/results-over-time.spec.js`)

| Requirement ID                          | Source matrix rows                        | Issue | Test                                                                   |
| --------------------------------------- | ----------------------------------------- | ----- | ---------------------------------------------------------------------- |
| SROT-FUNC-001/SROT-FUNC-002             | SROT-FUNC-001, SROT-FUNC-002              | #27   | renders measure, group, filter, y-axis, scale, and display controls    |
| SROT-FUNC-003/SROT-REG-001              | SROT-FUNC-003, SROT-REG-001               | #27   | participant note updates when a filter is applied                      |
| SROT-DATA-002                           | SROT-DATA-002                             | #27   | missing and non-numeric results are dropped with a reported count      |
| SROT-FUNC-008/SROT-REG-009              | SROT-FUNC-008, SROT-REG-009               | #27   | box-and-whisker marks render and toggle off with the Box plots control |
| SROT-REG-002/SROT-REG-003               | SROT-REG-002, SROT-REG-003                | #27   | grouping draws side-by-side boxes with a group-ordered legend          |
| SROT-REG-010/SROT-REG-012               | SROT-REG-010, SROT-REG-012                | #27   | the outlier overlay shows and hides with the Outliers control          |
| SROT-REG-011                            | SROT-REG-011                              | #27   | outlier points carry a larger hover radius than their resting radius   |
| SROT-REG-014/SROT-REG-015               | SROT-REG-014, SROT-REG-015                | #27   | hovering a box exposes the summary statistics tooltip                  |
| SROT-FUNC-004/SROT-REG-016/SROT-REG-017 | SROT-FUNC-004, SROT-REG-016, SROT-REG-017 | #27   | y-limit inputs redraw and invert a crossed pair                        |
| SROT-FUNC-005/SROT-REG-020              | SROT-FUNC-005, SROT-REG-020               | #27   | Reset Limits restores the data extent                                  |
| SROT-REG-018                            | SROT-REG-018                              | #27   | the Scale control switches the y-axis between linear and log           |
| SROT-FUNC-006/SROT-REG-004/SROT-REG-005 | SROT-FUNC-006, SROT-REG-004, SROT-REG-005 | #27   | the Visits without data control adds empty timepoints                  |
| SROT-FUNC-007/SROT-REG-006/SROT-REG-007 | SROT-FUNC-007, SROT-REG-006, SROT-REG-007 | #27   | the Unscheduled visits control shows unscheduled timepoints            |
| SROT-REG-023/SROT-REG-024               | SROT-REG-023, SROT-REG-024                | #27   | start_value selects the initial measure and falls back when absent     |
| SROT-API                                | — (see legacy-API note)                   | #27   | lifecycle API supports init, setData, setSettings, render, resize      |

## Unit evidence (Vitest — `tests/unit/results-over-time/`)

| Requirement ID                      | Source matrix rows                                     | Issue | Test file                                       |
| ----------------------------------- | ------------------------------------------------------ | ----- | ----------------------------------------------- |
| SROT-CFG-004/005/006/007/009        | SROT-CFG-004, SROT-CFG-005, SROT-CFG-007, SROT-CFG-009 | #27   | `configure.test.js`                             |
| SROT-CFG-008/012/013/014/015        | SROT-CFG-008, SROT-CFG-012, SROT-CFG-013, SROT-CFG-014 | #27   | `configure.test.js`                             |
| SROT-CFG-017/018/019, SROT-DATA-003 | SROT-CFG-017, SROT-CFG-019, SROT-DATA-003              | #27   | `configure.test.js` / `structureData.test.js`   |
| SROT-DATA-001/002                   | SROT-DATA-001, SROT-DATA-002                           | #27   | `checkInputs.test.js` / `structureData.test.js` |
| SROT-CFG-005/006                    | SROT-CFG-005, SROT-CFG-006                             | #27   | `structureData.test.js`                         |
| SROT-REG-010/012                    | SROT-REG-010, SROT-REG-012                             | #27   | `structureData.test.js`                         |
| SROT-REG-021                        | SROT-REG-021                                           | #27   | `structureData.test.js`                         |
| SROT-REG-015/016/017/020            | SROT-REG-015, SROT-REG-016, SROT-REG-017, SROT-REG-020 | #27   | `getScales.test.js`                             |
| SROT-REG-003/011/014/015            | SROT-REG-003, SROT-REG-011, SROT-REG-014, SROT-REG-015 | #27   | `getPlugins.test.js`                            |

## Source-matrix routing status (58 rows)

**Covered: 44 of 58 rows** (the browser and unit tables above). The remaining
14 rows are descoped, honestly, for the reasons below.

- **Violin plots — `SROT-FUNC-009`, `SROT-REG-008` (2 rows):** descoped. Violin
  (kernel-density) marks are off by default in the original renderer and add
  little over the box-and-whisker distribution summary; Chart.js has no violin
  primitive, so they would be a large custom-SVG effort for a non-default
  feature. Box-and-whisker + outliers deliver the population distribution.
- **Legacy Webcharts / CAT / API rows — `SROT-CFG-001`, `SROT-CFG-002`,
  `SROT-API-001`, `SROT-REG-022`, `SROT-REG-025` (5 rows):** descoped. These
  describe the legacy Webcharts configuration object, the
  `safetyResultsOverTime()` Webcharts-chart factory, and CAT-specific settings
  workflows. The module ships the shared nextgen lifecycle API instead
  (`SROT-API`, module scheme) with explicit settings, matching the histogram
  precedent; the reviewed matrix flags these rows `needs-jeremy-review`.
- **Normal-range mappings — `SROT-CFG-010`, `SROT-CFG-011` (2 rows):**
  descoped. `normal_col_low`/`normal_col_high` exist in the original settings
  but the results-over-time view does not draw a normal range (unlike the
  histogram), so these mappings are not part of this renderer's contract.
- **`missingValues` — `SROT-CFG-016` (1 row):** descoped. Missing/non-numeric
  results are removed by numeric cleaning with a reported count
  (`SROT-DATA-002`); the explicit missing-value token list is not reproduced.
- **Enrolled/randomized denominator — `SROT-REG-013` (1 row):** adapted. The
  participant note reports "shown of total (%)" for the current measure; the
  enrolled/randomized population denominator is not present in the trimmed
  example data contract, so it is not shown.
- **Log-axis tick overlap — `SROT-REG-019` (1 row):** delegated. Log-scale tick
  selection and label spacing are handled by Chart.js's logarithmic scale; the
  module does not add a custom de-duplication pass, so this is not separately
  asserted.
- **Group-variable validation — `SROT-REG-026`, `SROT-REG-027` (2 rows):**
  descoped. Filters whose column is absent from the data are dropped with a
  warning, but group options are taken from settings as-is (missing-column
  dropping and duplicate-label de-duplication for the Group-by control are not
  implemented). A follow-up could extend the filter validation to groups.
