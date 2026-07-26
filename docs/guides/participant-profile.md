> **Experimental.** This module ships for evaluation alongside the Hepatic Safety Explorer's adoption of it. The profile itself reproduces long-reviewed behaviour — it is the participant drill-down the original SafetyGraphics hep-explorer always had — but its standalone API, its event wiring, and the adverse-event domain added in v2 are new and may change; pin a version if you depend on the exact surface.

The Participant Profile is the answer to the question every population-level safety display eventually raises: **"who is that point, and what actually happened to them?"** A scatter, a waterfall, or an outlier plot reduces each participant to one mark; the decision about whether that mark matters — a lab error, a transient blip, or a genuine injury pattern — needs the participant's whole course. The profile shows exactly that for one participant at a time: who they are, how their key labs moved over the study, what adverse events were reported and when, and a per-measure summary you can expand where it gets interesting.

Historically this display lived welded inside the hep-explorer's eDISH scatter as its click-to-drill-down panel. safety.viz lifts it into a module of its own, so the same profile can open beside the Hepatic Safety Explorer (where it is on by default), beside any other chart in this library that dispatches the shared `participantsSelected` event, or beside **your** chart — the wiring is one custom event, demonstrated live on this page.

## Where the profile opens

Click a participant and the profile opens in a **right-hand rail** beside the chart, opposite the control sidebar. The rail is a sibling of the chart column, not an overlay: the chart re-lays out to make room, so the mark you just clicked stays visible and in place while you read about it. Idle, the rail takes no width at all — it appears on the first selection and disappears again when you clear.

The rail head stays put while the body scrolls. It names the participant, says where the selection came from (or how many participants are in it), and carries two controls:

- **Expand** fills the host renderer's own container with the rail, dimming the chart behind it — for when the measure table and the event timeline both want the width. It is deliberately not a browser-fullscreen takeover, so the profile behaves the same way embedded in a gsm.safety widget or a report panel as it does on this page. **Escape** collapses it, and closing the rail collapses it too, so it never reopens expanded.
- **✕** closes the rail, which clears the host chart's selection — the same clear the profile's own **Clear** performs.

The rail's default width is 520px, settable through the `--sv-rail-width` custom property on the shell root. Below the shell's 900px breakpoint it stops being a rail and stacks below the chart instead, which is where the reading order wants it on a narrow screen.

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

### The adverse-event tracks: what was reported, and when

Directly under the labs chart — sharing its edge, so the two time tracks read as one — sits the participant's adverse-event block, when the host supplies AE records. It opens with four figures: **Events**, **Highest severity**, **Serious**, and **No end date** (events still open, or never given a resolution day). Below them a **severity mix** bar breaks the events down worst-first, dropping levels the participant has none of; every level is named in the legend and in the bar's text alternative, so severity is never carried by hue alone. A **body-system rollup** closes the block, most-frequent first.

Between the mix and the rollup is the **timeline**: one row per event, drawn on _the labs chart's own study-day axis_. That is the point of the block. The two x-axes are aligned by construction — the spaghetti's y-axis width and right padding are pinned to the gutters the timeline draws into — so a bar sitting under an ALT peak really is contemporaneous with it, at any width, after any resize.

The timeline is explicit about imperfect data rather than quietly tidying it:

- an event with no recorded stop day, or a stop day before its start, reads as **open-ended** — the bar runs to the end of the domain and the label says so, rather than becoming a zero-length tick;
- a same-day event still gets a visible minimum bar width;
- an event whose start day cannot be resolved is **named beneath the timeline** instead of being dropped, so the figures in the tiles and the rows you can see never disagree without explanation;
- rows are capped (`max_rows`, 10 by default) and the remainder counted;
- **serious** events are marked in the label as well as on the bar, and every bar carries a text alternative naming its days and severity.

The x-axis domain is the **union** of the lab and AE day ranges, so a late event does not fall off the end of the labs' axis — both tracks rescale together. When the participant's records carry no resolvable study day at all, the summary still renders and the timeline says why it is absent rather than inventing a clock.

The AE contract reuses the setting names `ae-timelines` and `ae-explorer` already ship — `id_col`, `term_col`, `minor_col`/`major_col`, `stdy_col`/`endy_col`, `color.*`, `highlight.*` — so a host already feeding one of those renderers can hand the profile the same mapping instead of a third vocabulary for the same records.

### The measure table: one row per lab, expandable

The bottom panel summarizes every measure the participant has: baseline, minimum, maximum (with study days), and a **sparkline** of the course drawn against two context bands — the participant's normal range and the population's 1st–99th percentile extent (`measureBounds`), so a flat-looking line that is nevertheless far outside the population band still catches the eye. Values flagged outside the normal range are marked.

Click a sparkline (or press Enter on its row) to **expand it into a full inset chart** with axes, points per visit, and tooltips — the sparkline is the overview, the inset is the evidence. Rows beyond the key measures sit behind a "show N additional" toggle so the default view stays one screen tall. When `listing: true`, the participant's raw records render underneath in the shared listing for record-level verification.

### Labs are optional

The two adverse-event renderers mount this same profile without any laboratory data at all. With no measures configured the profile draws no spaghetti and no measure table — rather than empty ones — reads its header demographics off the AE records, and scales the timeline to the AE domain alone. The adverse-event domain is a second contract on the same module, not a second module.

## Stepping through a cohort

Select more than one participant — a multi-select on the composite plot, a brushed region, a carried cohort from the migration view — and the rail head gains a **stepper**: "1 of N" with previous/next controls (keyboard-operable), pinned in the head so it stays reachable however far you scroll the profile below it. The order is not arbitrary: the cohort is ranked **worst-first** using the host chart's severity frame (worst eDISH quadrant first where quadrants apply, peak severity otherwise), so the participant most worth reviewing is the one already on screen. Expand the stepper to see that whole ranking as a list with the current participant marked, and pick any row to jump straight to it. Stepping keeps the host chart's highlight in sync — the point being profiled is emphasized on the chart — without dispatching any new selection.

**Clear** (in the profile, the ✕ in the rail head, the chart's sidebar, or a background click on the chart) empties the selection everywhere and hides the rail; every route converges on the same host clear path, so the chart and profile can never disagree about what is selected.

## Where it sits: the rail

The profile lives in a **rail** — a right-hand column beside the chart, opposite the control sidebar. The rail takes no width at all until you select a participant, so a chart with nothing selected is exactly as wide as it was before; picking a point opens the rail beside the chart rather than pushing the chart up the page. Its head names the participant and carries two controls: **Close**, and **Expand**, which fills the host renderer's own container when one participant needs the whole area. Expand is deliberately not a viewport overlay or the native Fullscreen API — the same module has to behave identically inside a gsm.safety htmlwidget or an open.gismo panel, where escaping the container is either impossible or rude. **Escape** collapses it again rather than trapping you there.

Below 900px there is no room for a column beside the chart, so the rail stacks underneath it.

## Wiring it to a chart

The profile is deliberately chart-agnostic, with two mounts:

- **Railed** — the Hepatic Safety Explorer and the other adopting renderers mount it by default in the shell's rail slot beside the chart (`profile: false` turns it off, restoring the pre-adoption behaviour). The railed mount consumes the host's already-cleaned rows, so the chart and profile always agree on every derived value, and it installs no event listener of its own — the host drives it through `show`/`clear`/`resize`/`destroy`.
- **Standalone** — `SafetyViz.participantProfile(element, data, settings)` ingests the same long-format lab contract itself and listens for `participantsSelected` (`event.detail.data` = the selected ids) on `listen_to` — an element, a selector, or the document. It never dispatches selection events of its own, so wiring it up cannot create feedback loops.

The demo on this page is the standalone wiring end-to-end: the Hepatic Safety Explorer above with its built-in rail turned off, this module mounted independently below, and nothing connecting them except the public event on the chart's root element. Replace the top half with your own chart and dispatch the same event, and the profile works unchanged.

## What it is not

The profile summarizes one participant's laboratory course and the adverse events reported for them, to support review and prioritization. It does not adjudicate causality, apply stopping rules, or diagnose drug-induced liver injury — pattern classification (the R Ratio), reference cuts, out-of-range flags, and the visible coincidence in time of an event with a lab excursion are review aids, not evidence of causation, and a DILI conclusion remains a diagnosis of exclusion requiring evidence beyond what any lab or event display shows.
