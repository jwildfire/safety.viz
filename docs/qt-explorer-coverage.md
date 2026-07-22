# Qt-explorer requirement coverage

Traceability for the qt-explorer module (a Chart.js reimplementation of the
[SafetyGraphics/qtexplorer](https://github.com/SafetyGraphics/qtexplorer) QT
Safety Explorer, Phase 1, under
[#68](https://github.com/jwildfire/safety.viz/issues/68); parent requirement
[obot.roadmap#36](https://github.com/jwildfire/obot.roadmap/issues/36)), per the
convention in [CONTRIBUTING.md](../CONTRIBUTING.md). Requirement IDs use the
module's condensed **`QT-*`** scheme cited in the source and test names —
`QT-CT-*` (central tendency: per-arm change over time, Δ / ΔΔ, CI band,
reference line, peak-effect visit, ICH-E14 metric), `QT-OUT-*` (outlier scatter:
absolute-QTc diagonals, change lines, arm marks, tooltip), `QT-CAT-*`
(categorical by-arm exceedance), `QT-CTRL-*` (view / correction / statistic /
display / timepoint / filter controls), and `QT-DATA-*` (data contract,
cleaning, baseline/change derivation). The Phase-1 scope is QTcF/QTcB corrections
plus heart rate; QTcI, PR/QRS/JT, per-subject drill-down, QT-RR hysteresis, the
guided ICH-E14 workflow, and a moxifloxacin positive-control arm are deferred to
Phase 2 (the CDISC Pilot ADEG carries none of them). A reviewed source
requirement matrix (`qt-explorer.md` in the requirements repo) is not yet
published, so the source-matrix column is pending; each row lists the module IDs
its test covers.

## Browser evidence (Playwright — `tests/e2e/qt-explorer.spec.js`)

| Requirement ID                        | Source matrix rows | Issue | Test                                                                                    |
| ------------------------------------- | ------------------ | ----- | --------------------------------------------------------------------------------------- |
| QT-CTRL-001, QT-CTRL-002, QT-CTRL-003 | —                  | #68   | renders the view, correction, statistic, display, and filter controls                   |
| QT-CT-002, QT-CT-003, QT-CT-006       | —                  | #68   | central tendency draws per-arm lines, a CI band, the reference line and the peak marker |
| QT-CT-004, QT-CT-005                  | —                  | #68   | ΔΔ drops placebo and reports the ICH-E14 metric above the reference                     |
| QT-OUT-002, QT-OUT-003, QT-OUT-004    | —                  | #68   | the outlier scatter draws absolute diagonals, the zero line, and per-arm marks          |
| QT-OUT-003                            | —                  | #68   | a specific visit adds the change-from-baseline lines                                    |
| QT-CAT-001, QT-CAT-002, QT-CAT-003    | —                  | #68   | the categorical view hides the chart and tabulates by-arm exceedance                    |
| QT-CT-007                             | —                  | #68   | heart rate is offered in central tendency without the QTc reference line                |
| QT-OUT-007                            | —                  | #68   | heart rate shows a QTc-only note in the outlier view                                    |
| QT-DATA-003                           | —                  | #68   | the removed-count path drops missing and non-numeric results                            |

## Unit evidence (Vitest — `tests/unit/qt-explorer/`)

| Requirement ID                                                            | Source matrix rows | Issue | Test file               |
| ------------------------------------------------------------------------- | ------------------ | ----- | ----------------------- |
| QT-CFG-001..007 (settings normalization, z table, placebo resolution)     | —                  | #68   | `configure.test.js`     |
| QT-DATA-005 (schema required columns)                                     | —                  | #68   | `checkInputs.test.js`   |
| QT-DATA-003/004/006, QT-STAT-001/002 (cleaning, change derivation, stats) | —                  | #68   | `structureData.test.js` |
| QT-CT-001/002/004/005/006 (central-tendency series, ΔΔ, ICH-E14, peaks)   | —                  | #68   | `structureData.test.js` |
| QT-OUT-001/002 (subject points, max post-baseline vs visit)               | —                  | #68   | `structureData.test.js` |
| QT-CAT-001/002/003 (by-arm exceedance counts and percents)                | —                  | #68   | `structureData.test.js` |
| QT-SCL-001..008 (correction suffix, axis titles, domains, arm marks)      | —                  | #68   | `getScales.test.js`     |
| QT-PLG-001/002/003 (color scale, rgba, scatter tooltip)                   | —                  | #68   | `getPlugins.test.js`    |
| QT-API-001 (module export)                                                | —                  | #68   | `export.test.js`        |

## Source-matrix routing status

No reviewed source requirement matrix exists yet for this module (the config's
`qt-explorer.md` matrix link resolves once it is published in the requirements
repo), so routing is against the Phase-1 port spec's scope rather than matrix
rows.

- **Implemented (`browser`/`unit` above):** the per-arm central-tendency change
  over time with a mean/median statistic and a Δ / placebo-corrected ΔΔ toggle
  (QT-CT-001/002/004), a two-sided 90% CI band, the mode-labelled reference line
  and the peak-effect-visit marker (QT-CT-003/006), the ICH-E14 metric — the
  largest upper bound of the two-sided 90% CI for the mean difference vs the
  ~10 ms reference (QT-CT-005); the outlier scatter of change-from-baseline vs
  baseline QTc with the 450/480/500 ms absolute diagonals, the 30/60 ms change
  lines (per-visit mode), the zero no-change line, per-arm colour + mark shape,
  and the point tooltip (QT-OUT-001..006); the by-arm categorical exceedance
  table for the absolute and change thresholds with per-arm denominators
  (QT-CAT-001..003); the view / correction / statistic / display / timepoint /
  filter controls (QT-CTRL-001..003); and the data contract, cleaning, and
  source-or-derived change (QT-DATA-001..006). Heart rate is offered in central
  tendency without the QTc reference line and shows a QTc-only note in the
  scatter and categorical views (QT-CT-007, QT-OUT-007).

- **Deferred (Phase 2, not part of the Phase-1 claim):** the QTcI individualized
  correction (per-subject QT-RR slopes), PR/QRS/JT multi-interval categorical
  rows, the per-subject drill-down (electrolytes/TSH spaghetti plots), the QT-RR
  hysteresis plot, the guided step-by-step ICH-E14 evaluation workflow, and a
  moxifloxacin positive-control arm — none present in the CDISC Pilot ADEG. The
  ΔΔ CI is a large-sample normal approximation for exploratory screening, not the
  regulatory ANCOVA/MMRM least-squares-means bound.

## View-selector rollout (VIEW-2, #76)

The View selector (QT-CTRL-001) is now the shared shell builder [`renderViewSelector`](../src/shell.js) — the module-scoped `qt-view-*` CSS + builder were removed with no visual or behavioral change (option class names moved to the neutral `sv-view-*` namespace). See [view-selector-inventory.md](view-selector-inventory.md).
