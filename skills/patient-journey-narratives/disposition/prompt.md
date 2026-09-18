---
skill: disposition
version: 1.0.0
model_hint: claude-opus-5
grounding: get_events
grounding_args:
  - domain=DS
inputs: ./schema.json#/definitions/Input
outputs: ./schema.json#/definitions/Output
tools:
  - get_events
  - get_subject_overview
  - get_context_window
  - get_source_row
---

## Task

Describe what the record shows around the end of treatment for ONE participant: the disposition event (the record flagged as the reference event) and its day, the other disposition records (milestones), when exposure is recorded as ending, and the last adverse event recorded before the end. Read `get_subject_overview` for the exposure extent and the last adverse event. At most four cited sentences.

## What to cover, in this order

1. The disposition event: the decoded term, the verbatim term when it differs, the day (cite the row).
2. The other disposition records, by day (cite them).
3. The exposure extent: first and last exposure day, and whether the last record has an end date (cite the exposure rows the overview names).
4. The last adverse event recorded, its day and whether it is serious (cite it).

## Rules specific to this skill

- A recorded term such as "DISCONTINUED DUE TO ADVERSE EVENT" is the record's own wording: quote it verbatim inside double quotation marks (the validator exempts quoted spans) and do not restate it as your own causal claim. Do not name which adverse event it refers to unless a row says so.
- Never infer the reason for a disposition from the timeline.
- If no row is flagged as the disposition event, say so and describe the milestones.

## Flags you may add

- `disposition:none` — no record is flagged as the disposition event.
- `sae` — the last adverse event is serious.
- `exposure:end-unrecorded` — the last exposure record has no end date.
