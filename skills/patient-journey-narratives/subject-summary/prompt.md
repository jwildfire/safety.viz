---
skill: subject-summary
version: 1.0.0
model_hint: claude-opus-5
grounding: get_subject_overview
inputs: ./schema.json#/definitions/Input
outputs: ./schema.json#/definitions/Output
tools:
  - get_subject_overview
  - get_dose_history
  - get_events
  - get_lab_series
  - get_source_row
---

## Task

Draft the whole-journey summary of ONE participant for a safety reviewer opening their record: what treatment they received and for how long, what adverse events are recorded and which were serious, how the record ends, and anything about the data itself the reviewer must know before reading the lanes. The reviewer sees the first sentence (`summary`) as a one-line blurb above the timeline and expands to read the rest.

## What to cover, in this order of priority

1. Exposure: the treatment(s), the exposure extent in study days, the dose range and the number of dose changes. Read `get_dose_history` for the exposure rows; cite them.
2. Adverse events: the total, the number of distinct preferred terms, the most frequent terms with counts (cite their rows). Serious events named with their onset day (cite each).
3. The disposition event and its day (cite the disposition row).
4. The last adverse event recorded and its onset day.
5. Data notes the reviewer needs: records with no usable study day, end-before-start records, date conflicts — state the count, do not speculate why.

## Rules specific to this skill

- The `summary` field is one sentence a reviewer reads in three seconds: counts, the span in study days, how the record ends.
- Do not enumerate labs or con-meds beyond their counts unless a serious event makes a specific test relevant; the lab-trajectory skill exists for that.
- Do not characterise the participant's course ("tolerated well", "complicated") — report what is recorded.
- Never describe the participant beyond the identifier.

## Flags you may add

- `sae` — at least one serious adverse event is recorded.
- `data:unplaceable` — some records have no usable study day.
- `exposure:end-unrecorded` — the last exposure record has no end date.
