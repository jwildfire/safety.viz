## What the Patient Journey Explorer shows

Most renderers in this gallery look across participants. This one, like Participant Profile, looks at **one participant** — and shows their whole safety record on a single study-day axis, so the question "what else was going on when this happened?" can be answered by looking rather than by joining six listings by hand. Pick a participant and the page draws stacked lanes on one shared timeline:

- **Exposure** — one bar per exposure record, labelled with the treatment, segmented wherever the dose changes.
- **Dose changes** — a caret above the exposure bar on the day a new dose begins: pointing up for an increase, down for a reduction, a pause mark for an interruption (dose to zero) and a restart mark for a resumption (zero back to a dose).
- **Adverse events** — one bar per event from onset to end. Bar height and border weight carry severity (mild, moderate, severe); a filled dot at the start and an `SAE` tag in the tooltip mark a serious event; an event with no recorded severity is drawn hatched and says so.
- **Labs** — one small sparkline per configured test (the demo shows the four-test liver panel), each with its reference range drawn as a band and each out-of-range point marked by shape as well as colour.
- **Con-meds** — one bar per concomitant medication course.
- **Medical history (at screening)** — one dot per history record at the day it was collected, which in this study is always before first dose.
- **Disposition** — a mark for every disposition record, and a dashed rule across every lane at the disposition event itself (completed, discontinued for an adverse event, and so on).

Three fixed reference lines run through every lane: day 1 (first dose), the disposition event, and — once you have anchored — the anchor day. Hovering or focusing any mark shows its tooltip; the same text is written into the footnote under the lanes so it stays readable after the tooltip closes. Every mark, and every item in the context panel, has a real control that jumps to the raw source row in the drawer beneath the lanes: the record exactly as it was passed in, nothing derived, nothing renamed.

This tool is **exploratory**. It lists what was recorded around a moment in one participant's course; it does not assess relatedness, and a co-occurrence on this page is not evidence of causation.

## Anchoring, and what the context panel claims

Click any mark — or focus it and press Enter — and time anchors on it. Three things change and one thing does not:

- The axis relabels to **days from anchor**, with the anchor at 0.
- A shaded **context window** of ±N days (30 by default; the control in the sidebar changes it, and 0 is legal and means the anchor day only) is drawn under every lane, and marks outside it are dimmed. Dimmed marks keep their tooltip, their keyboard stop and their full-strength row in the source drawer; they are pushed back, not removed.
- A **side panel** opens listing four things, each with a count and, where the count is zero, an explicit empty state.
- The day range on screen **does not change**. The whole journey stays visible, because the before-and-after is the point; anchoring is a highlight, not a zoom.

The four lists are computed mechanically from the records, with no interpretation, and their definitions are exact:

1. **Con-meds active at the anchor** — every con-med that started on or before the anchor day and did not end before it. A con-med with no usable start day is not on this list, because the absence of a start cannot prove presence; the panel says how many were set aside for that reason. Con-meds that start inside the window but after the anchor are listed separately underneath as "started later in the window", so a treatment given in response to the event is visible as such.
2. **Abnormal labs in the window** — every lab result inside the window whose normal-range indicator is present and not `NORMAL` (`HIGH`, `LOW`, `ABNORMAL`, `HH`, `LL` all qualify), or whose value is at least twice or at most half the participant's baseline for that test. Each row says which rule fired. A blank indicator is not treated as abnormal: unknown is not the same as abnormal.
3. **Dose changes in the window** — every derived dose change whose day falls inside the window, with its direction and the day the new dose began.
4. **Earlier or same-day adverse events with the same preferred term** — every event for this participant with the anchor's preferred term (falling back to the verbatim term when the preferred term is blank) that started before the anchor, or on the same day with an earlier record index, most recent first. Each row says how many days before the anchor it started, and a same-day record says "same day": in this study most same-term pairs are same-day records (a duplicate, or a co-occurring record of the same term), not recurrences, so the heading and the rows say which is which rather than calling every one "prior". This list is deliberately not limited to the window: it answers "has this happened to them before?", and the answer is not confined to the last thirty days.

These four lists describe the **whole record**. A sidebar filter (serious only, abnormal labs only, a con-med class) or a lane turned off changes what is drawn, and the "everything in the window" count, but never the four lists or their counts; when a listed record is not on the timeline for one of those reasons, the panel says so and why ("2 of these 7 are not drawn on the timeline (2 filtered out)"), and when the anchored event itself is hidden the panel says that too.

At the foot of the panel is a standing sentence: co-occurrence is not causation. This panel lists what was recorded around the anchor; it does not assess relatedness.

Anchoring is offered on every placeable mark in every lane, not only on adverse events. The adverse-event case is the one the panel is designed around, but the same four lists are just as meaningful around a dose change or a disposition event.

## "Days from anchor" counts elapsed days, not study-day differences

CDISC study days have no day 0: the day before first dose is day −1 and the first dosing day is day 1. That numbering is kept on the axis and in every tooltip when nothing is anchored. But once you anchor, the offsets shown as "days from anchor" — and the ±N-day window itself — are computed in **elapsed days**, the continuous count a calendar would give, and therefore never equal a simple subtraction of two CDISC study-day numbers when the two days straddle first dose.

The difference is exactly one day, and it matters for the window. An event at study day −5 with an anchor at study day 10 is **14** days before the anchor — the two calendar dates are 14 days apart — not the 15 that subtracting the study-day numbers gives. A ±30-day window around study day 10 runs from study day −21 to study day 40, which is 30 elapsed days on each side. If this module subtracted study days instead, every pre-dose offset would be overstated by one, the window would be a day wider before the anchor than after it, and the day-mode offsets would disagree with the calendar-date display by a day for every pre-treatment record. Those disagreements would sit exactly where a temporal-association judgement is made, so the module does not make them, and the unit tests pin the rule by checking that every offset equals the corresponding calendar difference.

## Reading the labs small multiples

Each configured test gets its own strip on the shared axis, so a rise in one enzyme can be read against the events and con-meds directly above it. The shaded band is the reference range from the data (lower to upper limit of normal, per record — the limits vary by laboratory in this study and are never taken from a constant). Points are open circles when normal, an up-pointing triangle when the indicator says high and a down-pointing triangle when it says low; a doubled glyph with a ring marks an `HH` or `LL` result, which this demo's data does not contain.

Every flagged result in the context panel prints its **ratio to the limit it crossed** — `4.03 × ULN` for a high value, `0.61 × LLN` for a low one — so a marginal flag cannot read as a large one. On the demo's opening participant the one abnormal lab in the window is an AST of 36 U/L, flagged high, at 1.06 × ULN; the ratio is there precisely so that "1 abnormal lab" is read at its real size.

The **baseline** used by the twice-or-half rule is, in order: the record the data flags as the analysis baseline (`ABLFL`), when the data carries that flag; otherwise the last value on or before study day 1; otherwise the participant's earliest value for that test. The panel names which rule applied beside the multiple ("2.0 × baseline (10 U/L, day −7; baseline is the flagged baseline record)"). The fallback matters more than it looks: study day 1 is a dosing day, so "on or before day 1" can admit a post-dose sample when the flag is absent, and the guide would rather you knew that than trusted the number blindly.

## Three kinds of end, never two

An interval record — an adverse event or a con-med — can end in one of three ways on this page, and the distinction is drawn, labelled and counted rather than collapsed:

- **Closed** — an end day is recorded. The bar stops there.
- **Ongoing** — no end day, but the record's outcome column says the event continues (for adverse events, `AEOUT` of "not recovered/not resolved" or "recovering/resolving"). The bar runs to the edge with an arrow cap and the tooltip says "ongoing" with the outcome.
- **End not recorded** — no end day and nothing that asserts continuation. The bar runs to the edge with a dotted fade, the tooltip says "end not recorded", and the record is still counted as running for the purposes of the window and the active-at-anchor list.

That last case is the one to read carefully, because in this study it is most con-meds: the con-med data carries no ongoing indicator at all and 71% of the con-med courses on this page have no end date (91% of the raw per-visit rows, before the build collapsed them to one row per course). The module counts those records as active, because excluding them would print "0 con-meds active" and assert that nothing was co-administered, which the data does not support either. It also names the count: when every listed con-med has an unrecorded end the panel says, directly under the heading, "None of these 7 has a recorded end date; they are shown as active because nothing records them stopping." When only some do, it says how many. Read the number and the sentence together.

A record whose end day is earlier than its start day is a data error, not an open interval. It is kept, drawn as a single-day mark at its start, treated as a single day for the window and the active-at-anchor list, labelled "end day precedes start; shown as a single day", and counted in a note above the lanes, so it can be found and fixed rather than quietly redrawn as ongoing.

## Calendar dates

The **Time axis** control switches the tick labels, the tooltips and the panel from study days to calendar dates. The underlying scale stays linear in days in both modes, which for these studies is also linear in dates, so nothing moves — only the labels change. Day 1 maps to the participant's reference date (`TRTSDT` when the data carries it; otherwise derived from the earliest record that has both a full date and a study day), day −1 to the day before it, with no day 0.

A partial recorded date — a year, or a year and month — is shown in the tooltip exactly as recorded and is never used to position a mark; position always comes from the study day. When a record carries a full date that disagrees with its study day, the study day wins for both position and label, the tooltip names the disagreement, and the affected records are counted in a note above the lanes.

## What this demo's data cannot show

The demo runs on the CDISC Pilot 01 study (pharmaverseadam for five domains, pharmaversesdtm for disposition). It is real trial data with real gaps, and four of them shape what you will see:

- **Only 3 serious adverse events** in 254 participants, so the "Serious only" filter empties the adverse-event lane for almost everyone. The control's label carries the count.
- **83% of the con-med courses on this page are `UNCODED`** (81% of the raw per-visit rows): their ATC class was never assigned. `UNCODED` is kept as its own selectable bucket in the class filter rather than hidden, and the sidebar says how large it is.
- **Medical-history verbatim terms are scrubbed** to placeholders like `VERBATIM_0308`, so the lane labels use the decoded term where one exists.
- **No `HH` / `LL` lab tier** — the indicator column carries only normal, high and low — so the escalation glyph and its ring, and the direction-unknown diamond an `ABNORMAL` indicator would draw, are implemented but never drawn on this page. Onset days for medical history are also sparsely populated (17%, shipped as `MHONSDY`), which is why the history lane plots the collection day and says "at screening"; the tooltip names the onset day where one exists.

The demo opens on participant `01-716-1447` because they are the one participant whose ±30-day window contains every kind of context at once. Anchor the ERYTHEMA event at day 30 and the panel shows **7 con-meds active** (all 7 with no recorded end date), **2 more starting later in the window** (two topical steroids, cortisone and Lidex, at day 43 — a visible response to the rash), **1 abnormal lab** (the 1.06 × ULN AST at day 27), **1 dose change** (54 → 81 mg at day 17) and **0 prior adverse events** with the same preferred term. The hyperhidrosis at day 17 is a different term, so it is a co-occurring event in the window, not a recurrence. Those five numbers are what the browser suite asserts against the built demo page.

Two other participants are worth opening. `01-705-1310` carries the pilot's highest post-baseline ALT (129 U/L, 4.03 × ULN at day 55, rechecked at an unscheduled visit and resolved by day 83) and discontinued for an adverse event. `01-701-1203` is the uneventful placebo case: every liver lab normal, one same-day event, no dose change, and a con-med that started in 1986 — which is why the axis clamps a far-pre-study start rather than compressing the whole journey into a few pixels to honour it.

## Where the derivations stop

- **A dose change is a change in dose, not a gap in dosing.** Consecutive exposure records with different doses produce a change dated to the day the new dose begins. Two records with the same dose separated by a gap produce nothing; the module reports dose changes, not exposure gaps.
- **A con-med with no start day is never asserted active.** It is drawn nowhere on the timeline, listed by name under the lane, counted in the panel as not evaluated, and shown in the source drawer.
- **A record with no usable study day is kept, not dropped.** It is named beneath its lane, listed in the drawer and counted in the context bundle, so the absence of a day is visible rather than silent. Rows that cannot be used at all — no participant id, no term, a non-numeric lab result — are dropped with a named reason, counted in the note above the lanes, and downloadable as a CSV led by the reason column.
- **Lanes have a row cap.** A lane with more rows than the cap (12 by default) draws a deterministic subset in the lane's stated order — adverse events by severity then onset, con-meds by start day then name — and says in prose how many are not drawn and which rule chose them. The panel's counts include the undrawn rows and say so.
- **Medical history is plotted where it was collected**, not where it began, because onset is rarely recorded in this study; the tooltip names the onset when one exists and the relative timing ("before study") when it does not. A host with complete onset days can switch the lane to onset (`mh_day_source: 'onset'`); the onset day is read from `ASTDY`, then the SDTM `MHSTDY`, and a host with another name for it sets `mh_onset_stdy_col`.
- **A lab for a test outside the configured panel is kept, not drawn.** It is counted in the participant summary, listed in the source drawer and named in the labs lane's footer ("N lab results for tests not in lb_tests are not drawn"); it never enters the lane, the shared axis or the context panel.
- **Only the disposition event draws the cross-lane rule.** Protocol milestones and other disposition records still draw a mark and appear in the drawer; they do not each get a dashed line through every lane.

## Keyboard and screen readers

Every mark is a real button with a sentence for a name ("Erythema, adverse event, moderate, day 30 to ongoing. Press Enter to anchor time on this event."). Tab moves between lanes, one stop each; arrow keys move along a lane chronologically and up or down to the nearest mark in the neighbouring lane; Home and End jump to the lane's ends; Enter or Space anchors and re-activating clears; Shift+Enter opens the source row; Escape closes the tooltip, then clears the anchor, then collapses the expanded panel, in that order. A polite live region announces the participant, the anchor and the context counts. Marks carry no encoding by colour alone: three hues distinguish exposure, adverse events and con-meds, and every other distinction — severity, seriousness, lab direction, dose direction, the three kinds of end — is carried by shape, height, weight or text.

## What is not on this page

- **Any narrative.** No summary of "why", no relatedness assessment, no similar-participant search. The panel is the mechanical substrate such a layer would read; the event surface hands it the whole context bundle without touching the page.
- **Cross-participant comparison.** This is a participant picker, not a cohort stepper; the other renderers in the gallery are the population views.
- **A QT / ECG lane**, and any lane beyond the seven.
- **A "zoom to window" control.** Anchoring never re-ranges the axis; a zoom is a reasonable later addition.
- **The R widget** — a separate requirement ([obot.roadmap#350](https://github.com/jwildfire/obot.roadmap/issues/350)).

## Source

A new build, not a port: the Patient Journey Explorer has no RhoInc or SafetyGraphics predecessor. It is specified by [obot.roadmap#349](https://github.com/jwildfire/obot.roadmap/issues/349) and built under [safety.viz#142](https://github.com/jwildfire/safety.viz/issues/142). The demo extracts and their derivation are documented in `docs/DATA_SOURCES.md`.
