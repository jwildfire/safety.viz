# subject-summary

The whole-journey blurb above the timeline: treatment and exposure span, the adverse-event picture with the serious events named, how the record ends, and the data notes a reviewer needs before reading the lanes. At most eight cited sentences; the `summary` field is the one-line blurb the card shows collapsed.

Use it when a participant is selected. Do not use it for the context of one event (`event-context`), one lab test (`lab-trajectory`), the dose course in detail (`dose-journey`) or the end of treatment in detail (`disposition`).

Inputs: `{ subject }`. Renders as the light-blue "AI narrative" card above the lanes, blurb first, "Show full narrative" to expand. Refuses with `refused:insufficient-data` when the record has no rows in any domain.
