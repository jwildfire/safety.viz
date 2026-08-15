<!--
NEWS.md is the running release log and the draft of each release's notes.
Shape (per the RC framework, obot.agent/docs/rc-framework.md): newest release first;
every release section opens with its demo-artifact link, then a text-only,
functionality-first account of what a user can now do. The GitHub release publishes
from the section here when the release-candidate PR (dev -> main) merges and is tagged.
-->

# safety.viz v1.8.0 (Upcoming)

Nothing user-facing yet.

## Also in this release

- The renderer done-gate gains a fourth pillar — a renderer is not done until its `gsm.safety` R widget is delivered or filed as a milestoned requirement ([#132](https://github.com/jwildfire/safety.viz/pull/132), rule: [obot.roadmap#164](https://github.com/jwildfire/obot.roadmap/issues/164)). Contributor-facing; no change to any chart.

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
