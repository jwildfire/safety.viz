# Hep-explorer requirement coverage

Traceability for the hep-explorer module (a Chart.js reimplementation of the
[SafetyGraphics/hep-explorer](https://github.com/SafetyGraphics/hep-explorer)
eDISH hepatotoxicity explorer matching its core behavior, under
[#43](https://github.com/jwildfire/safety.viz/issues/43)), per the convention
in [CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs use the module's
condensed **`HEP-*`** scheme cited in the source and test names — `HEP-CHART-*`
(scatter/axes), `HEP-QUAD-*` (quadrants/cutpoints), `HEP-CTRL-*` (controls),
`HEP-DISPLAY-*` (eDISH/mDISH standardization), `HEP-SELECT-*` (participant
detail/visit path), `HEP-DATA-*` (data contract/cleaning), and `HEP-API-*`
(lifecycle/events). A reviewed source requirement matrix (`hep-explorer.md` in
the requirements repo) is not yet published, so the source-matrix column is
pending; each row lists the module IDs its test covers.

## Browser evidence (Playwright — `tests/e2e/hep-explorer.spec.js`)

| Requirement ID                               | Source matrix rows | Issue | Test                                                                                                         |
| -------------------------------------------- | ------------------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| HEP-CTRL-001/002/006/007/008/009/010/011/012 | —                  | #43   | renders the full control panel                                                                               |
| HEP-DATA-001, HEP-CTRL-011                   | —                  | #43   | participant note reports N and % and updates on filter                                                       |
| HEP-DATA-003                                 | —                  | #43   | missing and non-numeric results are dropped with a reported count and note                                   |
| HEP-QUAD-002/003/004/005                     | —                  | #43   | quadrant cut-lines classify one participant per quadrant and drive the summary table                         |
| HEP-QUAD-001/004                             | —                  | #43   | changing the x-axis reference line reclassifies the quadrants                                                |
| HEP-DISPLAY-001/002, HEP-CHART-002           | —                  | #43   | the display toggle switches eDISH and mDISH axis titles and cutpoints                                        |
| HEP-SELECT-001/002/003/005/006               | —                  | #43   | clicking a point draws the visit path, detail panels, and linked listing                                     |
| HEP-SELECT-002                               | —                  | #43   | selecting a second participant without a background click destroys the prior detail chart (no Chart.js leak) |
| HEP-SELECT-007                               | —                  | #43   | clicking the background clears the selection, detail panels, and listing                                     |
| HEP-SELECT-006                               | —                  | #43   | changing Display Type while a participant is selected re-renders the coordinated panels in the new units     |
| HEP-CTRL-009                                 | —                  | #43   | grouping colors the points and renders a legend                                                              |
| HEP-CTRL-006, HEP-CHART-003                  | —                  | #43   | the axis-type toggle switches both axes between linear and log                                               |
| HEP-CHART-004                                | —                  | #43   | point tooltips list participant, R Ratio, peaks with days, and the day difference                            |
| HEP-API-003                                  | —                  | #43   | participantsSelected fires on select and clear                                                               |
| HEP-API-001                                  | —                  | #43   | lifecycle API supports init, setData, setSettings, render, resize, and destroy                               |

## Unit evidence (Vitest — `tests/unit/hep-explorer/`)

| Requirement ID                                                                             | Source matrix rows | Issue | Test file               |
| ------------------------------------------------------------------------------------------ | ------------------ | ----- | ----------------------- |
| HEP-CTRL-001/002/006/007/008/009/010/011 (defaults, control specs)                         | —                  | #43   | `configure.test.js`     |
| HEP-QUAD-001, HEP-DATA-001/002, HEP-DISPLAY-001, HEP-SELECT-006 (cuts back-fill, mappings) | —                  | #43   | `configure.test.js`     |
| HEP-DATA-005 (schema required columns)                                                     | —                  | #43   | `checkInputs.test.js`   |
| HEP-DATA-002/003/004 (measure resolution, cleaning)                                        | —                  | #43   | `structureData.test.js` |
| HEP-DISPLAY-001/002/003/004/006 (×ULN, ×Baseline, peaks, R-Ratio)                          | —                  | #43   | `structureData.test.js` |
| HEP-CHART-001, HEP-CTRL-008/009/011 (points, timing, group, filters)                       | —                  | #43   | `structureData.test.js` |
| HEP-QUAD-004 (quadrant classification counts/percents)                                     | —                  | #43   | `structureData.test.js` |
| HEP-SELECT-002/003/005 (drill-down series)                                                 | —                  | #43   | `structureData.test.js` |
| HEP-CHART-002/003/004, HEP-CTRL-006, HEP-DISPLAY-001 (domains, log, labels)                | —                  | #43   | `getScales.test.js`     |
| HEP-CHART-004, HEP-CTRL-009, HEP-QUAD-002, HEP-SELECT-001 (tooltip, palette, plugin)       | —                  | #43   | `getPlugins.test.js`    |
| HEP-API-001 (module export)                                                                | —                  | #43   | `export.test.js`        |

## Source-matrix routing status

No reviewed source requirement matrix exists yet for this module (the config's
`hep-explorer.md` matrix link resolves once it is published in the requirements
repo), so routing is against the port spec's scope rather than matrix rows.

- **Implemented (`browser`/`unit` above):** the peak-vs-peak eDISH scatter
  (HEP-CHART-001), participant counts (HEP-CHART-002), axis domains including
  the cutpoints (HEP-CHART-003), point tooltips (HEP-CHART-004), the Hy's-Law
  quadrant cut-lines, labels, and live percents (HEP-QUAD-001..004) plus the
  quadrant summary table (HEP-QUAD-005), the full control panel — measure
  pickers, reference lines, display type, axis type, point size, timing window,
  grouping, filters, R-Ratio range, and reset (HEP-CTRL-001..012) — the
  ×ULN/×Baseline standardization with baseline and drop handling
  (HEP-DISPLAY-001..006), the coordinated participant drill-down: point
  selection with visit-path overlay, lab-over-time panel, measure summary
  table, and linked listing (HEP-SELECT-001..007), data cleaning and the data
  contract (HEP-DATA-001..005), and the lifecycle API + `participantsSelected`
  event (HEP-API-001/003).

- **Deferred (follow-ups, not part of the coordinated-views claim):**
  draggable cut-lines (v1 uses the reference-line number inputs), the study-day
  animation with play/stop and motion trails, marginal box plots and axis rugs,
  per-row sparklines in the measure summary table and the sparkline
  drill-down (the lab-over-time panel covers the trajectory-over-time need),
  the exposure (EX domain) track and P_ALT hepatocyte estimate, CSV downloads
  of dropped rows/participants, population-profile links, and imputation of
  below-LLOQ values (v1 drops non-numeric results like the other modules).
