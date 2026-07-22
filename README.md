# safety.viz

**safety.viz is a charting library for monitoring clinical trial safety.**
Point any of its nine interactive charts at your study data and review it in
the browser: filter, group, zoom, and click through from a pattern on the
screen to the participant records behind it. It's an
[agent-assisted update](https://jwildfire.github.io/keynote/) of the
[safetyGraphics](https://github.com/SafetyGraphics) interactive renderers.

**▶ Try every chart live: <https://jwildfire.github.io/safety.viz/>**

## The charts

| Chart                                                                                               | What it shows                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Safety Histogram](https://jwildfire.github.io/safety.viz/histogram/index.html)**                 | Distribution of any lab or vital-sign measure, with normal-range overlay, treatment-group small multiples, and a linked participant listing |
| **[Safety Outlier Explorer](https://jwildfire.github.io/safety.viz/outlier-explorer/index.html)**   | Every participant's results over time as one line each, against the population — click a line to isolate a participant                      |
| **[Safety Results Over Time](https://jwildfire.github.io/safety.viz/results-over-time/index.html)** | Population distribution of a measure at each visit as box-and-whisker marks, with grouping and outlier flags                                |
| **[Safety Shift Plot](https://jwildfire.github.io/safety.viz/shift-plot/index.html)**               | Baseline vs. comparison-visit values on a scatter — who moved, and which direction                                                          |
| **[Safety Delta-Delta](https://jwildfire.github.io/safety.viz/delta-delta/index.html)**             | Paired change-from-baseline for two measures on one scatter (e.g. ALT change vs. AST change)                                                |
| **[Adverse Event Timelines](https://jwildfire.github.io/safety.viz/ae-timelines/index.html)**       | Each participant's AEs as timelines colored by severity, serious events marked, with click-through detail                                   |
| **[Adverse Event Explorer](https://jwildfire.github.io/safety.viz/ae-explorer/index.html)**         | AE prevalence by system organ class and preferred term, with per-arm rates, between-arm differences, and participant drill-down             |
| **[Hepatic Safety Explorer](https://jwildfire.github.io/safety.viz/hep-explorer/index.html)**       | eDISH scatter of peak liver measures with Hy's Law quadrants, plus a baseline-referenced composite view for abnormal-baseline populations   |
| **[QT Safety Explorer](https://jwildfire.github.io/safety.viz/qt-explorer/index.html)**             | QT/QTc central tendency against the ICH E14 threshold, an outlier scatter, and categorical crossing counts                                  |

Every chart has a live demo against real example data, a generated API
reference documenting every setting, and its own test-evidence report — all
linked from its page on the site.

## Using it

Vendor the committed bundle — no build step, no npm install:

```html
<script src="dist/safety.viz-1.4.1/safety.viz.js"></script>
<script>
  SafetyViz.histogram('#container', {
    value_col: 'STRESN',
    measure_col: 'TEST',
    filters: [{ value_col: 'ARM', label: 'Treatment Group' }]
  }).init(rows); // rows: array of records, e.g. parsed from an ADaM BDS extract
</script>
```

An ESM build is committed alongside:

```js
import { histogram } from './dist/safety.viz-1.4.1/safety.viz.esm.js';
histogram('#container', settings).init(rows);
```

**Data.** Charts take an array of plain records, one row per result — a parsed
CSV or JSON extract. Each chart declares its expected columns in a
[JSON-Schema data contract](src/data/schema/) and validates its input on
`init`: malformed rows are removed and counted, not silently plotted. Column
defaults follow ADaM-style names (`USUBJID`, `TEST`, `STRESN`, `VISIT`, …) and
every mapping is a setting, so any tidy dataset works.

**Settings.** Every setting has a default, a type, and a description in the
generated API reference — e.g. the
[histogram API](https://jwildfire.github.io/safety.viz/histogram/api.html);
each chart's site page links its own.

**Using R?** [gsm.safety](https://github.com/jwildfire/gsm.safety) wraps this
same bundle as `Widget_*` htmlwidgets — one per chart.

## Example data

The demos and evidence reports run on
[pharmaverseadam](https://github.com/pharmaverse/pharmaverseadam), the
pharmaverse consortium's ADaM test data derived from the CDISC SDTM/ADaM
Pilot 01 study (Apache-2.0), vendored as CSVs under
[`site/data/`](site/data/) by
[`scripts/build-demo-data.mjs`](scripts/build-demo-data.mjs).

**One cleaning step is applied, to the ECG data.** Like plenty of real trial
data, the pilot is internally inconsistent here: it collects RR interval and
heart rate as separate measurements, and the two contradict each other — they
were generated independently, so only 0.8% of readings agree. Its pre-derived
QTc parameters are corrected against that collected RR, which puts them about
80 ms high. The build therefore derives QTcF and QTcB itself, correcting
against the RR implied by the recorded heart rate — the more credible of the
two inputs — and fails if the RR source ever contradicts heart rate again. To
be clear about where the fault lies: the packages that produced the data
behave exactly as documented; the inconsistency is in the source, and this is
routine cleaning rather than a defect report.

Two additions are also made for coverage: placeholder rows for participants
with no adverse events, so AE denominators cover the whole safety population,
and a small synthetic chronic-liver-disease cohort, without which the
hep-explorer composite plot has no abnormal-baseline population to draw.
Everything else ships as sourced. Full provenance, including what the cleaning
does and does not fix, is in
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Quality and evidence

Each chart re-implements an interactive display built by
[Rho, Inc.](https://github.com/RhoInc) and used in practice under the
safetyGraphics project. The port is held to that standard: every chart traces
to a reviewed
[requirement matrix](https://github.com/jwildfire/obot.agent/tree/main/docs/requirements),
tests are keyed to requirement IDs, and results are published as audit-style
[evidence reports](https://jwildfire.github.io/safety.viz/histogram/evidence.html)
with every release.

## Documentation site

<https://jwildfire.github.io/safety.viz/> — gallery, live demos, API
reference, and evidence reports.

| Tier                                                   | Tracks                     |
| ------------------------------------------------------ | -------------------------- |
| [root](https://jwildfire.github.io/safety.viz/)        | latest release (`main`)    |
| [`/dev/`](https://jwildfire.github.io/safety.viz/dev/) | the `dev` branch           |
| `/pr/{N}/`                                             | open pull-request previews |

## Layout

```
src/
├── main.js               # public module collection (the nine renderers)
├── {chart}.js            # one entry per renderer, plus a {chart}/ dir of parts
└── data/schema/          # JSON Schema data contracts, one per chart
site/                     # documentation-site sources (gallery, demos, shell)
docs/                     # requirement-coverage docs + evidence data
scripts/                  # build, site, API-reference, and evidence tooling
tests/
├── unit/                 # Vitest specs
└── e2e/                  # Playwright specs + fixtures
dist/                     # committed, versioned esbuild bundles
```

## Stack

Chart.js v4 · esbuild (IIFE + ESM bundles to `dist/safety.viz-{version}/`) ·
Vitest · Playwright · Prettier. See [CONTRIBUTING.md](CONTRIBUTING.md) for
commands and the test-naming / traceability conventions.

## Distribution

`dist/safety.viz-{version}/` is committed (not published to npm). Consumers
like `gsm.safety` vendor a specific version at
`inst/htmlwidgets/lib/safety.viz-{version}/`, the precedent set by gsm.kri
vendoring gsm.viz.

## Lineage

safety.viz is part of the safetyGraphics → gsm modernization
([design doc](https://jwildfire.github.io/obot.roadmap/requirements/design/1_design.html) ·
[roadmap](https://github.com/jwildfire/obot.roadmap/issues/1)), mirroring the
architecture of [gsm.viz](https://github.com/Gilead-BioStats/rbm-viz) behind
[gsm.kri](https://github.com/Gilead-BioStats/gsm.kri). Full credits are on the
[about page](https://jwildfire.github.io/safety.viz/about.html).
