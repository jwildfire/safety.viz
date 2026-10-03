<!--
NEWS.md is the running release log and the draft of each release's notes.
Shape (per the RC framework, obot.agent/docs/rc-framework.md): newest release first;
every release section opens with its demo-artifact link, then a text-only,
functionality-first account of what a user can now do. The GitHub release publishes
from the section here when the release-candidate PR (dev -> main) merges and is tagged.
-->

# safety.viz v1.10.0 (Upcoming)

_Nothing merged yet._

# safety.viz v1.9.0

**See it move:** the [annotated v1.9.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.9-demo/) has captures and try-it steps for everything below.

safety.viz opens to a second chart library. The parts every chart is built from are exported as a kit, and the [demo app](https://jwildfire.github.io/safety.viz/demo/) carries bio.viz's four biomarker charts in a tab of their own, on the files and mapping a study already has, with R's tests when you ask for R. No existing chart or setting changes, and the API only grows: the kit is added, and the portfolio manifest's `version` goes from 1 to 2, which adds fields a second library can use and lets a library's chart list leave out the domains. A version-1 manifest still validates.

bio.viz v0.1.0 needs safety.viz v1.9.0: its charts are built from this release's kit.

## What's new

- **The kit.** The control sidebar, the filter contract, the record listing, the participant rail, the box drawing, the measure list, the Kaplan–Meier estimator and the bundled Chart.js, exported as `SafetyViz.kit` for a library on the same page: 36 members, each the very function the charts call. From this release the kit's members are public surface: a change to a member's name, signature, return value, or the elements and class names it produces is a breaking change, and the release notes will say so. One exception: the Kaplan–Meier estimator, `kmEstimate`, follows the Time-to-Event Explorer's Experimental status, so its estimates, intervals and at-risk counts may change after the external clinical review ([obot.roadmap#182](https://github.com/jwildfire/obot.roadmap/issues/182)) without counting as a breaking change. [Kit reference](https://jwildfire.github.io/safety.viz/kit/index.html) ([obot.roadmap#354](https://github.com/jwildfire/obot.roadmap/issues/354), [#154](https://github.com/jwildfire/safety.viz/issues/154), PR [#161](https://github.com/jwildfire/safety.viz/pull/161); the Experimental label, [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **Biomarker charts in the demo app.** The group comparison, association scatter, correlation matrix and biomarker screen sit in a Biomarkers tab, read the labs and subject files through the mapping already made, and draw with the labs file alone. The demo study reads 17 of 17. If bio.viz does not load, the page says so and why, and the safety charts are as before. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#182](https://github.com/jwildfire/safety.viz/issues/182), PR [#185](https://github.com/jwildfire/safety.viz/pull/185); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **R on request.** One control, Start R, brings R into the browser, about 13 MB once from webr.r-wasm.org, and the biomarker charts print R's tests. Until then the page fetches nothing from any other host, and the study's data never leaves the browser. If R cannot start, the control says so and offers to try again. A browser test compares the group comparison's answers for one measure with desktop R's. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#183](https://github.com/jwildfire/safety.viz/issues/183), PR [#186](https://github.com/jwildfire/safety.viz/pull/186); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **Another library's charts, listed with safety.viz's.** The portfolio manifest goes to format version 2, so a second library can list its charts in the app with their own group, tables and settings; the [Domains page](https://jwildfire.github.io/safety.viz/domains/) describes the format and lists the biomarker charts. A chart list the app cannot use costs only its own charts, each of which says why. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#181](https://github.com/jwildfire/safety.viz/issues/181), PR [#184](https://github.com/jwildfire/safety.viz/pull/184); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))

## Also in this release

- **The single file** carries bio.viz's charts inline and still loads nothing; it is now 1,168,524 bytes, about 1.2 MB. Its charts say statistics are unavailable there, since it cannot start R. [#182](https://github.com/jwildfire/safety.viz/issues/182), [#183](https://github.com/jwildfire/safety.viz/issues/183)
- **Copied, not rebuilt.** bio.viz's bundle and gsm.bio's statistics file are vendored by script from their `dev` branches, with commit and checksum recorded and checked against both in CI, along with each record's word that its commit is on `dev`. [#182](https://github.com/jwildfire/safety.viz/issues/182), [#183](https://github.com/jwildfire/safety.viz/issues/183), [#193](https://github.com/jwildfire/safety.viz/issues/193)
- **gsm.bio's statistics give a reason on degenerate inputs** (a constant column, every value tied, no events) instead of an "ok" whose number means nothing. No number changes on real data: the app's 17 recorded answers are identical. [#190](https://github.com/jwildfire/safety.viz/issues/190), PR [#191](https://github.com/jwildfire/safety.viz/pull/191)
- **Release bundles.** `dist/safety.viz-1.8.0/` is restored to the bytes v1.8.0 shipped, and `dist/safety.viz-1.9.0/` is the release bundle. [#187](https://github.com/jwildfire/safety.viz/issues/187), PR [#189](https://github.com/jwildfire/safety.viz/pull/189)

## Tests and provenance

2,176 unit and 373 browser tests pass. Some browser tests start real R in the browser, and one of them compares the group comparison's answers for one measure with desktop R's. The release candidate was reviewed in three parts, and every finding was fixed first: [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194).

# safety.viz v1.8.0

**See it move:** the [annotated v1.8.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.8-demo/) has captures and try-it steps for everything below.

safety.viz becomes something you can use on your own study. A [demo app](https://jwildfire.github.io/safety.viz/demo/) loads your files, maps their columns and draws the charts they support, all in your browser. Nine long-standing requests land on the existing charts. No existing API is removed or renamed.

## The demo app

- **Thirteen charts on one study.** Tabs by data domain say how many charts your data supports; a chart that cannot draw names what it is missing. [#150](https://github.com/jwildfire/safety.viz/issues/150)
- **Load your own study.** Drop CSV or JSON files: each is placed in a domain and its columns mapped, with every guess labelled. Nothing is uploaded. [#151](https://github.com/jwildfire/safety.viz/issues/151), [#165](https://github.com/jwildfire/safety.viz/issues/165)
- **A sidebar for the work.** Load, check the mapping, open a chart, with Reset and three demo studies to try. [#159](https://github.com/jwildfire/safety.viz/issues/159), [#163](https://github.com/jwildfire/safety.viz/issues/163)
- **One file to take with you.** The whole app as a single HTML file, under 1 MB, that runs offline. [#152](https://github.com/jwildfire/safety.viz/issues/152)
- **A standard domain set.** Four domains and what each chart reads from them, on the [Domains page](https://jwildfire.github.io/safety.viz/domains/) and in the bundle as `SafetyViz.portfolio`. [#138](https://github.com/jwildfire/safety.viz/issues/138), [#139](https://github.com/jwildfire/safety.viz/issues/139)

## Asked for by the original renderers' users

Nine requests the retired RhoInc and SafetyGraphics trackers left open. Who asked, and when: [#136](https://github.com/jwildfire/safety.viz/issues/136).

- **Filters mean the same thing in every chart:** `start`, `all` and `multiple`, in all twelve charts that have filters. [ae-timelines#83](https://github.com/RhoInc/ae-timelines/issues/83), [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **Choose and order the measures** with a `measures` setting, in five charts. [safety-results-over-time#5](https://github.com/RhoInc/safety-results-over-time/issues/5)
- **Reset chart** on nine charts. [safety-histogram#61](https://github.com/RhoInc/safety-histogram/issues/61)
- **Shift Plot:** a log scale. [safety-shift-plot#3](https://github.com/RhoInc/safety-shift-plot/issues/3)
- **QT Explorer:** its confidence intervals as a table, and its caution in every view. [qtexplorer#41](https://github.com/SafetyGraphics/qtexplorer/issues/41), [#51](https://github.com/SafetyGraphics/qtexplorer/issues/51)
- **Hepatic Safety Explorer:** include or exclude unscheduled visits. [hep-explorer#229](https://github.com/SafetyGraphics/hep-explorer/issues/229)
- **Adverse Event Explorer:** says what kind of empty an empty table is. [aeexplorer#153](https://github.com/RhoInc/aeexplorer/issues/153)

## Changed

- **A filter with a `start` value keeps its "All" option** in every chart; pass `all: false` to drop it. The Outlier Explorer used to drop it. [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **The QT Explorer averages replicate readings** to one value per participant and visit, so `n` counts participants. [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **A chart's status means one thing.** Prototype: docs site only, not ready for production. Experimental: ships, and may change. No badge: stable. The Hepatic ALT Waterfall is now Experimental. [#165](https://github.com/jwildfire/safety.viz/issues/165)

## Fixed

- **Adverse Event Explorer:** a single-arm study with the per-group columns off drew no counts. [aeexplorer#148](https://github.com/RhoInc/aeexplorer/issues/148)
- **Text from a dataset is written to the page as text,** never as markup. [#166](https://github.com/jwildfire/safety.viz/issues/166)

## Prototype

- **[Patient Journey Explorer](https://jwildfire.github.io/safety.viz/patient-journey-explorer/index.html):** one participant's record as stacked lanes on a study-day axis; click an event to see what was recorded around it. Docs site only, not ready for production: known issues in [#167](https://github.com/jwildfire/safety.viz/issues/167). [#142](https://github.com/jwildfire/safety.viz/issues/142)

## Tests and provenance

2,100 unit and 344 browser tests pass. The release candidate was reviewed in three parts, and every finding in the charts and the app was fixed first: [#171](https://github.com/jwildfire/safety.viz/pull/171).

# safety.viz v1.7.0

**See it move:** the [annotated v1.7.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.7-demo/) walks the new chart with captures and try-it-yourself steps against the live demo.

The gallery learns to answer "how long until…". A thirteenth renderer brings Kaplan–Meier time-to-event displays to the safety portfolio: step curves, confidence bands, and the at-risk table the FDA Safety Tables & Figures guide mandates beneath every time-to-event plot. No existing API is removed or renamed.

**The Time-to-Event Explorer ships marked Experimental, and stays marked until an external clinical review confirms the Kaplan–Meier implementation.** That is a deliberate withholding of confidence rather than a formality: until that review lands, safety.viz does not assert that these curves, confidence bands and at-risk counts are correct, so treat the estimates as provisional. The badge is on the gallery card and on every one of the renderer's pages, and it comes off in a later release under [obot.roadmap#182](https://github.com/jwildfire/obot.roadmap/issues/182).

## What's new

- **Time-to-Event Explorer** — a new renderer for Kaplan–Meier safety displays ([obot.roadmap#161](https://github.com/jwildfire/obot.roadmap/issues/161), [#128](https://github.com/jwildfire/safety.viz/issues/128), PRs [#129](https://github.com/jwildfire/safety.viz/pull/129) and the sv#131 review rework). **You compose the endpoint yourself, from the event data**: flexible multiselect filters over the adverse events (body system, preferred term, seriousness, severity — configurable per study) define what counts as a qualifying event, and the chart shows time to each participant's first qualifying event, censored at end of follow-up from the population data. No endpoint list is hard-coded — the important events vary from study to study; configured one-click presets are a natural later release on the same filter state. Step curves by treatment group with censoring tick marks, **pointwise 95% confidence bands** (the `survival::survfit` default family, cross-validated against it), and the **at-risk / cumulative-events strip table** — all derived from one estimator pass, so the table cannot disagree with the curve, and drawn without intro animation so every frame the chart shows is an estimate, never a transition. It consumes ADAE-shaped event records plus an ADSL-shaped population extract, defaults to **cumulative incidence (1 − KM)** with the estimator always named on the axis, and states plainly — in-app and in the clinical guide — the fixed derivation rule and where that estimator overreads risk. Ships **Experimental** pending the external clinical review above, and pending review of the design decisions. [Try it live](https://jwildfire.github.io/safety.viz/time-to-event/index.html).

## Also in this release

- **NEWS.md becomes the running release log** — this file; unreleased work now accumulates under a `(Upcoming)` heading per the program-wide convention ([#125](https://github.com/jwildfire/safety.viz/pull/125), [#127](https://github.com/jwildfire/safety.viz/pull/127), convention: [obot.roadmap#155](https://github.com/jwildfire/obot.roadmap/discussions/155)).
- Evidence baselines for every module refreshed on the canonical Linux environment as part of the time-to-event landing.
- Release prep: `dist/safety.viz-1.7.0/` vendored, e2e fixtures repointed to the new bundle.

1 257 unit + 255 browser tests pass; `evidence:check`, `requirements:check`, `build:check-dist`, `prettier` and the site build all clean.

# safety.viz v1.6.0

**See it move:** the [annotated v1.6.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.6-demo/) walks each update with captures and try-it-yourself steps against the live gallery.

The gallery crosses into nephrotoxicity. A twelfth renderer ports the KDIGO acute-kidney-injury creatinine scatter from [SafetyGraphics/nepExplorer](https://github.com/SafetyGraphics/nepExplorer), and the Hepatic Safety Explorer gets back the feature the original renderer was best known for — the study-day playback — alongside an opt-in hepatocyte-loss estimate and the last of its v1.2 polish list. No existing API is removed or renamed.

## What's new

- **Nephrotoxicity Explorer** — a new renderer for KDIGO acute-kidney-injury screening ([obot.roadmap#35](https://github.com/jwildfire/obot.roadmap/issues/35), [#120](https://github.com/jwildfire/safety.viz/issues/120), PR [#121](https://github.com/jwildfire/safety.viz/pull/121)). One point per participant at their maximum post-baseline **fold change** in serum creatinine against their maximum **absolute change**, over the L-shaped KDIGO stage zones — the fold bands at any absolute change, plus the ≥ 0.3 mg/dL arm below 1.5× — with the lower-left box, where both criteria are clear, left unpainted. The **≥ 4.0 mg/dL Stage-3 rule is a mark, not a zone**: a larger triangular point with its own tooltip line, so a high-baseline chronic-kidney-disease participant sitting in the Stage-1 band is still read as Stage 3 and says why. Units resolve per record (mg/dL and µmol/L can mix within one participant); a record that resolves to neither suppresses absolute-change staging chart-wide rather than guessing. Nothing is dropped silently — participants whose creatinine only fell stay on the chart below zero, and every dropped record and participant downloads as a CSV naming its reason. The stage summary table counts the population three ways, with **dashes, not zeroes**, where KDIGO defines no stage on absolute change. Marked **Experimental** pending clinical confirmation of the staging ladder. [Try it live](https://jwildfire.github.io/safety.viz/nep-explorer/index.html).

- **Study-day playback with motion trails** on the Hepatic Safety Explorer ([obot.roadmap#88](https://github.com/jwildfire/obot.roadmap/issues/88), [#46](https://github.com/jwildfire/safety.viz/issues/46), PRs [#118](https://github.com/jwildfire/safety.viz/pull/118), [#119](https://github.com/jwildfire/safety.viz/pull/119)). Press play and the eDISH cloud walks each participant along their own lab trajectory, motion trails accumulating behind the moving points; scrub the day slider and the playback yields to you rather than fighting for the day. The original's four drawing rules are ported verbatim: a point sits on its most recent result at or before the shown day, holds at its first result before it is measured, shrinks outside its own measured span, and is not drawn before its first record.

- **An opt-in P_ALT hepatocyte-loss estimate** (same requirement, [#49](https://github.com/jwildfire/safety.viz/issues/49) partial, PR [#118](https://github.com/jwildfire/safety.viz/pull/118)). With `calculate_palt: true`, the participant profile header shows the estimated fraction of hepatocytes lost, with the arithmetic behind it. Off by default on purpose: the estimate integrates ALT over study day × 24 hours and carries unit and sampling assumptions only the data owner can confirm.

- **The eDISH axes finish their v1.2 polish list** ([#54](https://github.com/jwildfire/safety.viz/issues/54), PR [#122](https://github.com/jwildfire/safety.viz/pull/122)). On log axes a **Log Base** picker chooses decades or doublings — a tick generator, not a transform, so the cloud never moves, only the gridlines. **Manual axis limits** on both axes load pre-filled with the limit actually in force; clear one to hand that side back to auto, and a limit typed for one measure never survives to another. The drill-down labs chart **names each measure in full** in its legend and writes each line's short key at its own last point. The Clinical guide links the R / nR primary sources and states the nR formula.

## Also in this release

- `HEP-ANIM-008` (scrub stops playback) had shipped implemented but unevidenced; [#119](https://github.com/jwildfire/safety.viz/pull/119) gives it a named, asserted browser test — under the done-gate a requirement row is only as good as the evidence it points at.
- Release prep [#123](https://github.com/jwildfire/safety.viz/pull/123): `dist/safety.viz-1.5.0/` is restored to the bytes v1.5.0 shipped, `dist/safety.viz-1.6.0/` is vendored fresh, fixtures and README repointed.

## The gallery

Twelve renderers are now available, up from eleven:

| Renderer                    | Factory              | What it shows                                                                                           |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Safety Histogram            | `histogram`          | Distribution of a lab or vital-sign measure, with a normal-range overlay and a linked listing           |
| Safety Outlier Explorer     | `outlierExplorer`    | One line per participant over time against a population normal-range band                               |
| Safety Results Over Time    | `resultsOverTime`    | Population distribution of a measure at each visit                                                      |
| Safety Shift Plot           | `shiftPlot`          | Baseline versus comparison-visit values on a scatter with an identity line                              |
| Safety Delta-Delta          | `deltaDelta`         | Paired change-from-baseline comparison of two measures                                                  |
| Hepatic Safety Explorer     | `hepExplorer`        | eDISH / mDISH scatter with Hy's-Law quadrants, composite and migration views, and study-day playback    |
| Hepatic ALT Waterfall       | `hepWaterfall`       | Baseline → maximum on-treatment ALT in absolute U/L, for abnormal-baseline trials                       |
| Participant Profile         | `participantProfile` | One participant's whole lab course, demographics and adverse events — standalone or as any chart's rail |
| **Nephrotoxicity Explorer** | **`nepExplorer`**    | **KDIGO creatinine scatter: fold vs absolute change over stage zones, with a stage summary table**      |
| Adverse Event Explorer      | `aeExplorer`         | Hierarchical adverse-event browser with rates and differences by arm                                    |
| Adverse Event Timelines     | `aeTimelines`        | One bar per event on the study-day axis, per participant                                                |
| QT Safety Explorer          | `qtExplorer`         | Central tendency Δ/ΔΔ with CIs against ICH E14 references, outliers and categorical views               |

## Tests and provenance

1 178 unit and 236 browser tests are green; every requirement row on the [evidence pages](https://jwildfire.github.io/safety.viz/nep-explorer/evidence.html) traces to a named test, with screenshots captured on the canonical Linux environment. The vendored `dist/safety.viz-1.6.0/` is byte-checked against a fresh build in CI.

# Earlier releases

Full notes for every earlier release live on its GitHub release page:

- [v1.5.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.5.0) (2026-07-26) — Participant Profile, a chart-agnostic drill-down module adopted by six renderers (v2 adds the right-hand rail and the adverse-event timeline); the Hepatic ALT Waterfall renderer for abnormal-baseline trials; the migration Sankey as a third hep-explorer view; the eDISH scatter regains draggable cut-lines, marginal box plots and self-describing quadrants. [Annotated demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.5-demo/).
- [v1.4.1](https://github.com/jwildfire/safety.viz/releases/tag/v1.4.1) (2026-07-22) — QT demo data made internally consistent (QTcF/QTcB rederived from QT and RR, provenance documented); hep-explorer and qt-explorer share one view-selector builder.
- [v1.4.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.4.0) (2026-07-18) — QT Safety Explorer Phase 1 (central-tendency Δ/ΔΔ with CIs and the ICH-E14 metric, outlier scatter, categorical table); the composite ×BLN plot joins hep-explorer for abnormal-baseline populations; a persistent gallery link site-wide.
- [v1.3.1](https://github.com/jwildfire/safety.viz/releases/tag/v1.3.1) (2026-07-16) — test-evidence pages show the reviewed requirement text beside each ID, guarded against drift in CI.
- [v1.3.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.3.0) (2026-07-16) — Adverse Event Explorer: a hierarchical incidence table with per-arm rates, group differences with CIs, and drill-through listings.
- [v1.2.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.2.0) (2026-07-13) — Hepatic Safety Explorer (eDISH) with the coordinated participant drill-down, and the first per-renderer Clinical guide.
- [v1.1.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.1.0) (2026-07-12) — all-measures overview for the histogram; demo data regenerated from a scripted pharmaverse pipeline; user-first README.
- [v1.0.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.0.0) (2026-07-12) — first stable release: six interactive charts with data contracts, live demos and test-evidence pages.
- [v0.1.0](https://github.com/jwildfire/safety.viz/releases/tag/v0.1.0) (2026-07-11) — the safety-histogram pilot as a library module plus the shared renderer shell.
