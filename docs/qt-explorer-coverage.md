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

| Requirement ID                        | Source matrix rows                                    | Issue | Test                                                                                               |
| ------------------------------------- | ----------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| QT-CTRL-001, QT-CTRL-002, QT-CTRL-003 | —                                                     | #68   | renders the view, correction, statistic, display, and filter controls                              |
| QT-CT-002, QT-CT-003, QT-CT-006       | —                                                     | #68   | central tendency draws per-arm lines, a CI band, the reference line and the peak marker            |
| QT-CT-004, QT-CT-005                  | —                                                     | #68   | ΔΔ drops placebo and reports the ICH-E14 metric above the reference                                |
| QT-OUT-002, QT-OUT-003, QT-OUT-004    | —                                                     | #68   | the outlier scatter draws absolute diagonals, the zero line, and per-arm marks                     |
| QT-OUT-003                            | —                                                     | #68   | a specific visit adds the change-from-baseline lines                                               |
| QT-CAT-001, QT-CAT-002, QT-CAT-003    | —                                                     | #68   | the categorical view hides the chart and tabulates by-arm exceedance                               |
| QT-CT-007                             | —                                                     | #68   | heart rate is offered in central tendency without the QTc reference line                           |
| QT-OUT-007                            | —                                                     | #68   | heart rate shows a QTc-only note in the outlier view                                               |
| QT-DATA-003                           | —                                                     | #68   | the removed-count path drops missing and non-numeric results                                       |
| PPRF-QT-001, PPRF-QT-002              | PPRF-QT-001, PPRF-QT-002 (participant-profile matrix) | #99   | clicking an outlier-scatter point opens the docked profile in observed ms with the 450 cut on QTcF |
| PPRF-QT-003, PPRF-QT-004              | PPRF-QT-003, PPRF-QT-004 (participant-profile matrix) | #99   | empty clicks and view switches clear the dock, which idles on non-scatter views                    |

## Unit evidence (Vitest — `tests/unit/qt-explorer/`)

| Requirement ID                                                            | Source matrix rows                            | Issue | Test file                  |
| ------------------------------------------------------------------------- | --------------------------------------------- | ----- | -------------------------- |
| QT-CFG-001..007 (settings normalization, z table, placebo resolution)     | —                                             | #68   | `configure.test.js`        |
| QT-DATA-005 (schema required columns)                                     | —                                             | #68   | `checkInputs.test.js`      |
| QT-DATA-003/004/006, QT-STAT-001/002 (cleaning, change derivation, stats) | —                                             | #68   | `structureData.test.js`    |
| QT-CT-001/002/004/005/006 (central-tendency series, ΔΔ, ICH-E14, peaks)   | —                                             | #68   | `structureData.test.js`    |
| QT-OUT-001/002 (subject points, max post-baseline vs visit)               | —                                             | #68   | `structureData.test.js`    |
| QT-CAT-001/002/003 (by-arm exceedance counts and percents)                | —                                             | #68   | `structureData.test.js`    |
| QT-SCL-001..008 (correction suffix, axis titles, domains, arm marks)      | —                                             | #68   | `getScales.test.js`        |
| QT-PLG-001/002/003 (color scale, rgba, scatter tooltip)                   | —                                             | #68   | `getPlugins.test.js`       |
| QT-API-001 (module export)                                                | —                                             | #68   | `export.test.js`           |
| PPRF-QT-001..004 (dock adoption, interval-measure mapping, clear paths)   | PPRF-QT-001..004 (participant-profile matrix) | #99   | `profile-adoption.test.js` |

## Docked participant profile (#99, PPRF-QT)

The shared participant-profile module docks below the chart (config-on,
`profile: true`), fed by a NEW outlier-scatter point-click selection
(`state.selectedId`, single-select only) via the house `participantsSelected`
dispatch on the shell root. The profile's long-lab contract is mapped for
interval (ECG) measures: the feed rows synthesize a unit ULN
(`__qt_profile_uln = 1`) so the spaghetti plots **observed milliseconds**; the
identity `measure_values` map over the host's `measures` makes the ECG
parameters the KEY measures; and per-QTc `cuts` carry the FIRST absolute
threshold (450 ms by default) while the NaN `defaults` entry leaves Heart Rate
cut-free. Adoption rows are PPRF-QT-001..004 in the
[participant-profile matrix](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/participant-profile.md);
unit evidence lives in `tests/unit/qt-explorer/profile-adoption.test.js`.

View coverage and mapping caveats:

- **Only the outlier scatter carries participant marks.** The central-tendency
  and categorical views aggregate by arm, so they offer no selection gesture;
  the dock stays mounted and idles there, and every view switch clears the
  selection and the dock in the render preamble (PPRF-QT-003).
- **The 30/60 ms change-from-baseline thresholds are not representable in the
  dock** — the profile draws one cut per measure per display mode, and the
  change thresholds apply to Δ, not the observed series. They stay on the
  scatter and the categorical table.
- **The host's `baseline_col` ('BASE') is a VALUE column**, not the profile's
  baseline FLAG contract, so the profile receives `baseline_col: null` and its
  `deriveBaseline` earliest-visit rule resolves the baseline record (VISITNUM
  orders the day axis; ADEG-style data carries no DY — the profile's "Study
  Day" axis titles and tooltips therefore show visit numbers, not days).
- **Module-surface (#98): the synthesized unit ULN poisons the measure table's
  normal-range semantics.** The sparkline/inset outlier flags compare each
  observed value against `__qt_profile_uln = 1`, so every ECG value renders as
  a filled out-of-range point, the inset y-domain unions the ULN into its pool
  (band edge at y≈1 under a ~460 ms series), and the table footnote's
  "outside the normal range" wording misstates the clinical semantics. The fix
  is a module "no normal range" mode for hosts without real LLN/ULN columns —
  routed to #98's surface per this issue's out-of-scope rule; not adopter-fixable
  (the hep-core cleaner's ULN>0 guard drops rows without a positive finite ULN).
- **Module-surface (#98): the docked spaghetti's y-axis title and canvas
  accessible name read "Standardized Result [xULN]"** while plotting observed
  milliseconds — the module hard-codes the label per display mode and offers no
  override, so the host's `display_options` relabel ("Observed (ms)") reaches
  the toggle but not the axis. Same root cause: the tooltip shows identical
  "Raw"/"Adjusted" values (ULN = 1). Fix (derive the label from the active
  `display_options` entry) routed to #98's surface.
- **The "Observed (ms)" toggle label covers the Heart Rate series too**, which
  plots bpm on the same axis — a knowingly mixed-unit axis in the default
  interval-measure mapping.
- **Header surface note (#98):** the profile header always renders its R Ratio
  field; with no ALT/ALP measures present it computes NaN and displays an
  empty value (never the string "NaN") — acceptable for now, tracked as a
  module-surface refinement if it should be omitted entirely.

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
