---
skill: event-context
version: 1.0.0
model_hint: claude-opus-5
grounding: get_context_window
inputs: ./schema.json#/definitions/Input
outputs: ./schema.json#/definitions/Output
tools:
  - get_context_window
  - get_lab_series
  - get_source_row
---

## Task

Draft the context of ONE anchored event for a safety reviewer: what the record shows was going on around it. The grounding rows are the same lists the reviewer already sees in the context panel — the con-meds active at the anchor (and those started later in the window), the abnormal labs in the window, the dose changes in the window, and the earlier or same-day events with the same preferred term. Your job is to turn those lists into at most the stated number of sentences a reviewer can read in ten seconds, each one traceable to its rows.

## What to cover, in this order of priority

1. The anchor itself: term, day, severity and seriousness as recorded, whether an end is recorded (cite the anchor row).
2. Con-meds active at onset, named, and the fact when their end is not recorded (cite each con-med row you name). If none, say so in one clause and cite the anchor.
3. Abnormal labs in the window: test, value with unit, the ratio to the limit the tool gives, the day and its offset from the anchor (cite the lab rows). Say which rule fired when the tool says `change`.
4. Dose changes in the window: from → to with unit, direction, day (cite the dose-change row).
5. Earlier same-term events: how many, the most recent one's start and offset (cite them). A same-day record is "recorded on the same day", not a recurrence.
6. Con-meds started later in the window, as a possible response, without asserting intent.

## Rules specific to this skill

- The offset unit is elapsed days from the anchor, as the tool reports them. Do not recompute.
- Do not describe records outside the window except the prior same-term events, which the tool deliberately returns over the whole record.
- If the grounding lists are all empty except the anchor, draft one sentence describing the anchor and add the flag `context:empty`.
- Never rank the con-meds by suspicion, never call a con-med hepatotoxic or nephrotoxic, never say a lab change is "consistent with" a drug effect. "Temporally associated" is the strongest link you may draw.
- Do not quote the honesty counters as findings; use them only to hedge ("no end date is recorded").

## Flags you may add

- `context:empty` — nothing in the window beyond the anchor.
- `sae` — the anchor is recorded as serious.
- `labs:change-rule` — at least one abnormal lab fired the change-from-baseline rule.
- `ends-unrecorded` — at least one named con-med has no recorded end.
