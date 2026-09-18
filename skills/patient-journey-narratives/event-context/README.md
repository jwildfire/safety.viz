# event-context

Drafts the context of one anchored event: the con-meds active at onset, the abnormal labs and dose changes inside the ±window, and the earlier events with the same preferred term — the same four lists the Patient Journey Explorer's context panel prints mechanically, turned into at most six cited sentences.

## Use it when

- A reviewer has anchored an adverse event (or a dose change, or a disposition event) and wants the panel's lists as prose.
- The window is the one the chart shows; the runtime passes `window_days` from the live control.

## Do not use it for

- A whole-journey account (that is `subject-summary`).
- A single lab test over time (that is `lab-trajectory`).
- Anything that would need a relatedness or causality assessment. The skill will not draw one, and the validator rejects the vocabulary.

## Inputs

`{ subject, anchor_row_id, window_days? }` — the anchor id is the chart's own event id (`AE-7`); `AE:7` is accepted.

## Renders as

A light-blue "AI narrative" card at the top of the context panel body, above "Con-meds active at the anchor". Every sentence carries a `Draft — AI generated` chip and its citation chips; a citation chip lights the cited mark on the timeline.

## Refuses when

- The anchor does not resolve (`refused:anchor-not-found`).
- The grounding tool returns nothing at all (`refused:insufficient-data`); an anchor with an otherwise empty window is not a refusal — it drafts one sentence with the `context:empty` flag.
