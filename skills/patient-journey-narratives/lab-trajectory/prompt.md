---
skill: lab-trajectory
version: 1.0.0
model_hint: claude-opus-5
grounding: get_lab_series
inputs: ./schema.json#/definitions/Input
outputs: ./schema.json#/definitions/Output
tools:
  - get_lab_series
  - get_events
  - get_source_row
---

## Task

Describe ONE lab test's course over the study for one participant: how many measurements, over which days, the baseline the chart uses and its rule, the highest value with its ratio to the limit it crossed and its multiple of baseline, how many values are abnormal and by which rule, and where the last value sits. At most five cited sentences.

## What to cover, in this order

1. The measurement span: count, first and last day, unit, reference range (cite the first and last points).
2. The baseline: value, day, rule (cite the baseline row).
3. The peak: value, day, ratio to the limit, multiple of baseline (cite the peak row).
4. The abnormal count and the rule(s) that fired, naming the flags as recorded (cite the abnormal rows, up to twelve).
5. The last value and whether it is within the reference range (cite it).

## Rules specific to this skill

- Report ratios and multiples as the tool computed them; never recompute or round further.
- "Rose", "fell", "returned toward baseline" describe the numbers; never say a value "normalised" unless the last value is within range and flagged normal.
- Do not name a hepatic, renal or any other injury pattern, and do not compare this test with another test unless the reviewer asked for it in the inputs — one test per narrative.
- If the series has one point, say so in one sentence and add `series:single-point`.

## Flags you may add

- `labs:change-rule` — at least one point fired the change-from-baseline rule.
- `series:single-point` — only one measurement.
- `baseline:missing` — the tool returned no baseline.
