# View-selector suite inventory (VIEW-3, #76)

Records which safety.viz renderers carry the shared view selector
([`renderViewSelector`](../src/shell.js), VIEW-1) and which were ruled
single-view, per the suite-wide rollout in
[#76](https://github.com/jwildfire/safety.viz/issues/76) (parent
[obot.roadmap#41](https://github.com/jwildfire/obot.roadmap/issues/41)). Each
of the nine non-hep/qt renderers was inventoried against a single test.

## What counts as a "view-shaped display switch"

A control that toggles the **primary** display of the **same** dataset between
two or more **mutually-exclusive** alternative representations, where only one is
shown at a time and the control chooses which. The two reference cases:

- **hep-explorer** — `View` = {eDISH / mDISH scatter, Composite plot}
- **qt-explorer** — `View` = {Central tendency, Outlier scatter, Categorical}

The following are explicitly **not** view switches, and do not qualify a renderer
for the control (matching #76's "no new views/analyses invented" scope):

- A linked/drill-down listing or detail table shown **in addition** to a
  persistent chart when the user selects a point/bin/row (chart stays; listing
  is supplementary). Signal: `showListing()` / `currentTableData` populated on
  selection.
- Filters, group pickers, statistic pickers, axis-type/scale toggles,
  point-size/overlay options — these reshape **one** display.
- Small-multiples grids shown alongside or instead of the main chart (a
  data-scope choice, not a representation switch).

## Result

| Renderer                 | Status    | View control               | Basis                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hep-explorer             | available | **Yes** (migrated, VIEW-2) | `state.view` ∈ {scatter, composite} drives which primary display renders                                                                                                                                                                                                                      |
| qt-explorer              | available | **Yes** (migrated, VIEW-2) | `state.view` ∈ {central, outlier, categorical} drives which primary display renders                                                                                                                                                                                                           |
| ae-explorer              | available | No — single-view           | One primary display: the SOC→PT incidence table. "Summarize by" (participant/event) is a statistic-basis picker that reshapes the same table; the category drill-down (`showDetails`/`backToSummary`) is a master-detail listing restored by a "Return to the Summary View" button.           |
| ae-timelines             | available | No — single-view           | One primary display: the participant timeline floating-bar chart. Only Filters + a "Sort Participant IDs" order control; the participant detail (`showParticipantDetail` → `renderListing`) is a y-axis-click drill-down.                                                                     |
| delta-delta              | available | No — single-view           | One primary display: the paired change-from-baseline scatter (`drawScatter`). No `state.view`; the per-measure table (`selectPoint` → `drawMeasureTable`) is a point-click drill-down beside the persistent chart.                                                                            |
| histogram                | available | No — single-view           | One representation: a histogram. The "All Measures" sentinel toggles an all-measures **small-multiples overview** vs a single-measure histogram — a data-scope picker with drill-down, not a representation switch — and the bar-click listing (`showListing`) is a supplementary drill-down. |
| outlier-explorer         | available | No — single-view           | One primary display: the line chart (`drawChart`). Every control (Measure, Filters, "Plot by", Y-limits, Normal Range method, Group-by) reshapes that chart; the participant listing (`selectParticipant` → `renderListing`) is a point-click drill-down.                                     |
| results-over-time        | available | No — single-view           | One primary display: the per-visit box-and-whisker + outlier overlay. `Scale` is an axis-type toggle; the Display checkboxes (Box plots, Outliers, …) are **non-exclusive** overlay toggles on one chart, not a chooser between displays.                                                     |
| shift-plot               | available | No — single-view           | One primary display: the baseline-vs-comparison scatter (`drawChart`). Controls are Measure/Visits/Filters; the linked listing (`renderListing`) is a brush-selection drill-down shown in addition to the chart.                                                                              |
| paneled-outlier-explorer | planned   | n/a                        | No implementation yet; revisit when the renderer lands.                                                                                                                                                                                                                                       |
| web-codebook             | planned   | n/a                        | No implementation yet; revisit when the renderer lands.                                                                                                                                                                                                                                       |

## Notes

- **The histogram was the issue's guessed candidate** ("e.g. histogram
  chart/listing"). On inspection its listing is a bar-click drill-down and its
  overview is a small-multiples data-scope mode — neither is a mutually-exclusive
  primary-display switch — so promoting it would require **inventing** a new
  chart↔listing toggle, which #76 places out of scope. It is therefore ruled
  single-view.
- The seven implemented single-view renderers each carry a one-line note in
  their coverage doc (`docs/<renderer>-coverage.md`) pointing here, rather than
  an empty view control.
- This inventory was produced by a per-renderer read of each entry file and its
  `src/<renderer>/` module, cross-checked against each coverage doc.
