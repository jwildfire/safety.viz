> **Experimental.** This module ships for evaluation alongside the Hepatic Safety Explorer's adoption of it. The profile itself reproduces long-reviewed behaviour — it is the participant drill-down the original SafetyGraphics hep-explorer always had — but its standalone API and event wiring are new and may change; pin a version if you depend on the exact surface.

The Participant Profile is the answer to the question every population-level safety display eventually raises: **"who is that point, and what actually happened to them?"** A scatter, a waterfall, or an outlier plot reduces each participant to one mark; the decision about whether that mark matters — a lab error, a transient blip, or a genuine injury pattern — needs the participant's whole course. The profile shows exactly that for one participant at a time: who they are, how their key labs moved over the study, and a per-measure summary you can expand where it gets interesting.

Historically this display lived welded inside the hep-explorer's eDISH scatter as its click-to-drill-down panel. safety.viz lifts it into a module of its own, so the same profile can sit under the Hepatic Safety Explorer (where it is docked by default), under any other chart in this library that dispatches the shared `participantsSelected` event, or under **your** chart — the wiring is one custom event, demonstrated live on this page.

## How to read it

### The header: who this is

The top strip identifies the participant: their id, the demographic columns you configured (`details` — sex, race, arm, site, whatever your data carries), and two derived values from hepatic practice:

- **R Ratio** — `(peak ALT ÷ ALT ULN) ÷ (peak ALP ÷ ALP ULN)`, the standard classifier of injury pattern: **≥ 5** reads as hepatocellular, **≤ 2** as cholestatic, and the range between as mixed. It is computed from the profile's own peak values, so it always agrees with the charts below it.
- **P_ALT** — shown only when your data supplies a pre-computed value (`p_alt_col`); the profile never computes it client-side, so what you see is what your statistical pipeline produced.

When a `participantProfileURL` is configured, the header carries a link-out to the participant's full record in your review system — every `{id}` token in the URL is replaced with this participant's id.

### The spaghetti: the whole course at a glance

The middle panel plots every key measure for this participant on one time axis (study day, or the visit sequence when no study-day column exists), one coloured line per measure, standardized so they share a scale:

- **×ULN** (the default) divides each result by its upper limit of normal — the eDISH frame, right when baselines are normal;
- **×Baseline** divides each result by the participant's own baseline — the mDISH/composite frame, right when baselines are abnormal.

The dashed horizontal lines are the configured reference cuts for the current display mode (by default the Hy's-Law-derived cuts: 3×ULN for ALT/AST, 2×ULN for bilirubin, 1×ULN for ALP). A line that crosses its cut is the event that put this participant in front of you; the lines around it tell you what the rest of the liver panel was doing at the same time — the difference between an isolated ALT blip and a hepatocellular pattern with a bilirubin rise behind it.

The **Labs** control subsets which measures are drawn, and the extras toggle admits the participant's non-key measures when you need the wider panel.

### The measure table: one row per lab, expandable

The bottom panel summarizes every measure the participant has: baseline, minimum, maximum (with study days), and a **sparkline** of the course drawn against two context bands — the participant's normal range and the population's 1st–99th percentile extent (`measureBounds`), so a flat-looking line that is nevertheless far outside the population band still catches the eye. Values flagged outside the normal range are marked.

Click a sparkline (or press Enter on its row) to **expand it into a full inset chart** with axes, points per visit, and tooltips — the sparkline is the overview, the inset is the evidence. Rows beyond the key measures sit behind a "show N additional" toggle so the default view stays one screen tall. When `listing: true`, the participant's raw records render underneath in the shared listing for record-level verification.

## Stepping through a cohort

Select more than one participant — a multi-select on the composite plot, a brushed region, a carried cohort from the migration view — and the profile collapses to a **stepper**: "1 of N" with the current participant's full profile and previous/next controls (keyboard-operable). The order is not arbitrary: the cohort is ranked **worst-first** using the host chart's severity frame (worst eDISH quadrant first where quadrants apply, peak severity otherwise), so the participant most worth reviewing is the one already on screen. Stepping keeps the host chart's highlight in sync — the point being profiled is emphasized above — without dispatching any new selection.

**Clear** (in the profile, in the chart's sidebar, or a background click on the chart) empties the selection everywhere and hides the profile; the three routes converge on the same host clear path, so the chart and profile can never disagree about what is selected.

## Wiring it to a chart

The profile is deliberately chart-agnostic, with two mounts:

- **Docked** — the Hepatic Safety Explorer mounts it by default in the shell's profile slot below the chart (`profile: false` turns it off, restoring the pre-adoption behaviour). The dock consumes the host's already-cleaned rows, so the chart and profile always agree on every derived value.
- **Standalone** — `SafetyViz.participantProfile(element, data, settings)` ingests the same long-format lab contract itself and listens for `participantsSelected` (`event.detail.data` = the selected ids) on `listen_to` — an element, a selector, or the document. It never dispatches selection events of its own, so wiring it up cannot create feedback loops.

The demo on this page is the standalone wiring end-to-end: the Hepatic Safety Explorer above with its built-in dock turned off, this module mounted independently below, and nothing connecting them except the public event on the chart's root element. Replace the top half with your own chart and dispatch the same event, and the profile works unchanged.

## What it is not

The profile summarizes one participant's laboratory course to support review and prioritization. It does not adjudicate causality, apply stopping rules, or diagnose drug-induced liver injury — pattern classification (the R Ratio), reference cuts, and out-of-range flags are review aids, and a DILI conclusion remains a diagnosis of exclusion requiring evidence beyond what any lab display shows.
