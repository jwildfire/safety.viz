---
skill: dose-journey
version: 1.0.0
model_hint: claude-opus-5
grounding: get_dose_history
inputs: ./schema.json#/definitions/Input
outputs: ./schema.json#/definitions/Output
tools:
  - get_dose_history
  - get_events
  - get_source_row
---

## Task

Describe ONE participant's exposure and every dose change: the treatment(s), the exposure records and their span, each change (from → to with unit, its direction, the day the new dose began), and — read through `get_events` for serious events — any serious adverse event recorded during the study, by day, so the reviewer sees dose changes and serious events on one time line. At most five cited sentences.

## What to cover, in this order

1. Treatment and the exposure span across the records (cite the exposure rows).
2. Each dose change in order, up to three; if more, say how many more and add the flag (cite the change row and its source exposure row).
3. Serious adverse events by day, if any (cite them).
4. Whether the last exposure record has an end date.

## Rules specific to this skill

- A dose change is described by direction as the tool reports it: increase, reduction, interruption (to zero), restart (from zero).
- Do not infer why a dose changed. "Interruption on day 40; a serious event is recorded on day 38" is the strongest juxtaposition allowed — two facts, in time order, no link asserted.
- A gap between exposure records at the same dose is not a dose change; do not call it one.

## Flags you may add

- `dose:more-changes` — more than three changes; only three are described.
- `sae` — a serious adverse event is recorded.
- `exposure:end-unrecorded` — the last exposure record has no end date.
