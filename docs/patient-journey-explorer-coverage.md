# Patient-journey-explorer requirement coverage

Traceability for the patient-journey-explorer module (the Patient Journey
Explorer — one participant's whole safety record on one shared study-day axis,
with time anchorable on any event and a mechanical context panel — under
[#142](https://github.com/jwildfire/safety.viz/issues/142); parent requirement
[obot.roadmap#349](https://github.com/jwildfire/obot.roadmap/issues/349), R
widget follow-on
[obot.roadmap#350](https://github.com/jwildfire/obot.roadmap/issues/350)), per
the convention in [CONTRIBUTING.md](../CONTRIBUTING.md). The reviewed source
matrix is
[`requirements/patient-journey-explorer.md`](../requirements/patient-journey-explorer.md)
in this repo, and each row below cites the matrix rows its test covers.

Requirement IDs use the module's condensed `PJE-*` scheme cited in the source
and test names — `PJE-CFG-*` (settings, the camelCase alias contract, lane and
window coercion), `PJE-DATA-*` (both input forms, the per-domain drop table, the
data contract, fallback day columns, end-before-start), `PJE-SUBJ-*` (the
subject picker), `PJE-LANE-*` (the seven lanes: order, toggles, groups,
alignment by construction, the labs small multiples, exposure segmentation,
empty and unplaceable states, fit-to-height, the row cap), `PJE-DERIV-*` (dose
changes and the lab baseline), `PJE-ANCH-*` (anchoring, the elapsed-day window
and the "days from anchor" rule), `PJE-CTX-*` (the four context queries),
`PJE-PANEL-*` (the side panel), `PJE-SRC-*` (source-row traceability),
`PJE-FILT-*` (the three filters), `PJE-TIME-*` (study day ↔ calendar date),
`PJE-EVT-*` (the three-channel event surface), `PJE-KEY-*` (the keyboard model
and the live region), `PJE-ACC-*` (the palette gate, redundant encoding, rendered
text contrast — the area token is letters only, because the extractor's ID
grammar admits no digits), and `PJE-DEMO-*` (the vendored CDISC Pilot 01
extracts, the built demo page, and the Definition of Done executed against it).

Two things about how the browser rows are read. Every synthetic-data assertion
in `tests/e2e/patient-journey-explorer.spec.js` reads its expected numbers from
`window.PJE_FIXTURE.expectations` (the fixture's single source of truth) and
never from a literal, so the spec and the fixture cannot disagree. And the
browser suite asserts against the module's own recorded geometry
(`chart.$pjeMarks`, `chart.$pjeBand`) and its documented read model
(`instance.getContext()`, `instance.getTimeMode()`, `instance.laneCharts`)
rather than reading pixels or private state. The pilot-data numbers live only in
`PJE-DEMO-003`, which runs against the built demo page in `site.spec.js`.

## Browser evidence (Playwright — `tests/e2e/patient-journey-explorer.spec.js`, `tests/e2e/site.spec.js`)

| Requirement ID | Source matrix rows | Issue | Test                                                                                  |
| -------------- | ------------------ | ----- | ------------------------------------------------------------------------------------- |
| PJE-SUBJ-001   | PJE-SUBJ-001       | #142  | the subject selector lists every participant and opens on the first                   |
| PJE-SUBJ-002   | PJE-SUBJ-002       | #142  | filtering the subject list and selecting a subject redraws every lane                 |
| PJE-LANE-001   | PJE-LANE-001       | #142  | every enabled domain renders a labelled lane in the fixed order                       |
| PJE-LANE-004   | PJE-LANE-004       | #142  | every lane shares one x domain and one y width                                        |
| PJE-LANE-002   | PJE-LANE-002       | #142  | toggling a lane hides it and leaves the shared domain unchanged                       |
| PJE-LANE-003   | PJE-LANE-003       | #142  | collapsing a lane group hides its lanes                                               |
| PJE-LANE-005   | PJE-LANE-005       | #142  | the labs lane draws one sparkline per configured test with its reference band         |
| PJE-LANE-006   | PJE-LANE-006       | #142  | exposure bars segment at each dose change and each change carries a direction glyph   |
| PJE-LANE-009   | PJE-LANE-009       | #142  | the opening participant's journey fits the panel without scrolling                    |
| PJE-LANE-010   | PJE-LANE-010       | #142  | a lane over its row cap draws a deterministic subset and says so                      |
| PJE-LANE-007   | PJE-LANE-007       | #142  | a subject with no adverse events renders the lane with a note                         |
| PJE-ANCH-001   | PJE-ANCH-001       | #142  | clicking an adverse event anchors time on it and leaves the day domain unchanged      |
| PJE-ANCH-003   | PJE-ANCH-003       | #142  | in-window marks stay full strength and out-of-window marks de-emphasize               |
| PJE-PANEL-001  | PJE-PANEL-001      | #142  | the side panel lists the four context kinds with counts                               |
| PJE-SRC-001    | PJE-SRC-001        | #142  | both a mark and a panel item jump to their source row                                 |
| PJE-DATA-003   | PJE-DATA-003       | #142  | unusable rows are counted in the notes and exportable                                 |
| PJE-DATA-005   | PJE-DATA-005       | #142  | an absent domain renders an explanatory empty lane and a disabled toggle              |
| PJE-FILT-001   | PJE-FILT-001       | #142  | serious only restricts the adverse-event lane and nothing else                        |
| PJE-FILT-003   | PJE-FILT-003       | #142  | the con-med class multiselect filters the lane and keeps UNCODED selectable           |
| PJE-TIME-001   | PJE-TIME-001       | #142  | switching to calendar date relabels ticks and tooltips                                |
| PJE-EVT-001    | PJE-EVT-001        | #142  | anchoring emits the context bundle on all three channels                              |
| PJE-KEY-001    | PJE-KEY-001        | #142  | marks are focusable controls with accessible names and a visible focus ring           |
| PJE-KEY-002    | PJE-KEY-002        | #142  | Enter anchors the focused mark and Escape clears it                                   |
| PJE-KEY-003    | PJE-KEY-003        | #142  | arrows move within and between lanes and the live region announces                    |
| PJE-KEY-004    | PJE-KEY-004        | #142  | focus is restored after a filter rebuild                                              |
| PJE-ACC-002    | PJE-ACC-002        | #142  | no encoding is colour-alone                                                           |
| PJE-ACC-003    | PJE-ACC-003        | #142  | module text meets AA at its rendered size                                             |
| PJE-DEMO-002   | PJE-DEMO-002       | #142  | built patient-journey-explorer demo mounts the shared shell with no console errors    |
| PJE-DEMO-003   | PJE-DEMO-003       | #142  | the seeded CDISC Pilot 01 participant's day-30 anchor produces the documented context |

## Unit evidence (Vitest — `tests/unit/patient-journey-explorer/`)

| Requirement ID | Source matrix rows | Issue | Test                                                                                                                                                       |
| -------------- | ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PJE-CFG-001    | PJE-CFG-001        | #142  | `configure.test.js` — every documented column default present and snake_case                                                                               |
| PJE-CFG-002    | PJE-CFG-002        | #142  | `configure.test.js` — the full alias accept and reject lists; the plan's literal settings object yields three live filters and a day column per domain     |
| PJE-CFG-003    | PJE-CFG-003        | #142  | `configure.test.js` — partial lane override back-fills, a null lane disables, an unknown lane warns and is dropped                                         |
| PJE-CFG-004    | PJE-CFG-004        | #142  | `configure.test.js` — the window coercion table, zero legal                                                                                                |
| PJE-SUBJ-003   | PJE-SUBJ-003       | #142  | `events.test.js` — `selectSubject` with an unknown id leaves the subject unchanged and warns once; a known id selects it and clears the anchor first       |
| PJE-DATA-001   | PJE-DATA-001       | #142  | `normalize.test.js` — both input forms produce an identical domain map; case-insensitive keys and values, `ADAE` → AE                                      |
| PJE-DATA-002   | PJE-DATA-002       | #142  | `normalize.test.js` — an unknown or blank domain value drops the row with its reason text                                                                  |
| PJE-DATA-004   | PJE-DATA-004       | #142  | `checkInputs.test.js` — one error naming every missing column per supplied domain; the all-empty message                                                   |
| PJE-DATA-006   | PJE-DATA-006       | #142  | `normalize.test.js` — `source` is the identical input object and the inputs are deep-equal after normalization                                             |
| PJE-DATA-007   | PJE-DATA-007       | #142  | `normalize.test.js` — the day-column chain resolves per row and records `dayCol`; `configure.test.js` — a single name and a chain are both legal           |
| PJE-DATA-008   | PJE-DATA-008       | #142  | `normalize.test.js` — an end day before the start day keeps the record as a single-day mark under a named flag                                             |
| PJE-LANE-008   | PJE-LANE-008       | #142  | `structureData.test.js` — unplaceable rows counted per lane and excluded from the shared domain                                                            |
| PJE-DERIV-001  | PJE-DERIV-001      | #142  | `doseChanges.test.js` — increase, reduction, interruption and restart at the new record's start day; `0→0→0` yields none                                   |
| PJE-DERIV-002  | PJE-DERIV-002      | #142  | `labs.test.js` — flag-first baseline, the day-rule and earliest fallbacks, ties on the smaller `sourceIndex`, the rule recorded                            |
| PJE-ANCH-002   | PJE-ANCH-002       | #142  | `anchor.test.js` — inclusive window bounds, interval overlap and point containment, ongoing and unrecorded ends both still running                         |
| PJE-ANCH-004   | PJE-ANCH-004       | #142  | `anchor.test.js` — `relativeDay` is 0 at the anchor and the anchored axis title is `Days from anchor`                                                      |
| PJE-ANCH-005   | PJE-ANCH-005       | #142  | `anchor.test.js` — the elapsed-day round-trip skips 0 and `relativeDay` equals the calendar difference for all 30 ordered pairs                            |
| PJE-ANCH-006   | PJE-ANCH-006       | #145  | `events.test.js` — the notice above the lanes says clicking any mark shows its associated events, names the anchor once set, hides with every lane off     |
| PJE-CTX-001    | PJE-CTX-001        | #142  | `context.test.js` — the active-at rule at the edges; unrecorded ends counted; a con-med with no start excluded and counted; later starts listed separately |
| PJE-CTX-002    | PJE-CTX-002        | #142  | `labs.test.js` — the flag rule and the symmetric change rule at exactly 2× and ½×; a blank indicator is not abnormal                                       |
| PJE-CTX-003    | PJE-CTX-003        | #142  | `context.test.js` — a dose change on the window edge is included                                                                                           |
| PJE-CTX-004    | PJE-CTX-004        | #142  | `context.test.js` — prior same-term ordering, the verbatim-term fallback, same-day ties by `sourceIndex`                                                   |
| PJE-SRC-002    | PJE-SRC-002        | #142  | `sourceRows.test.js` — `buildSourceUrl` fills `{domain}` and `{COLUMN}`; a missing column omits the link; no template, no link                             |
| PJE-FILT-002   | PJE-FILT-002       | #142  | `structureData.test.js` — the `__abnormal__` flag filter keeps only points failing the flag rule and leaves AE and CM untouched                            |
| PJE-FILT-004   | PJE-FILT-004       | #142  | `structureData.test.js` — a filter whose column is absent from its domain is dropped with the library's exact phrasing                                     |
| PJE-TIME-002   | PJE-TIME-002       | #142  | `getScales.test.js` — `dayToDate` with day 1 as the reference date and no day 0; the derived reference date                                                |
| PJE-TIME-003   | PJE-TIME-003       | #142  | `getScales.test.js` — `isFullDate` rejects year and year-month values and the event keeps `rawDate`                                                        |
| PJE-TIME-004   | PJE-TIME-004       | #142  | `getScales.test.js` — a full date that disagrees with its day is positioned and labelled from the day, flagged and counted                                 |
| PJE-EVT-002    | PJE-EVT-002        | #142  | `events.test.js` — `participantsSelected` on the shell root with the selected subject                                                                      |
| PJE-EVT-003    | PJE-EVT-003        | #142  | `events.test.js` — `off` by name and by handler; `destroy` empties the element and clears every listener                                                   |
| PJE-ACC-001    | PJE-ACC-001        | #142  | `palette.test.js` — contrast and ΔE recomputed in-test from the composited fills at full and de-emphasized strength                                        |
| PJE-DEMO-001   | PJE-DEMO-001       | #142  | `demo-data.test.js` — the six builders' derivation rules plus the committed-file drift guard and the pharmaversesdtm provenance assertion                  |

## Known gaps, stated

- **Decisions D1–D30 are provisional** (adopted in an unattended session,
  2026-09-18); D4, D16, D23 and D24 were confirmed by @jwildfire in-session the
  same day. The matrix rows carrying them say so; the module ships marked
  Experimental until his review of the whole.
- **The demo study cannot exercise every branch.** It carries only 3 serious
  adverse events, 83% of its con-med courses are `UNCODED` (81% of the raw
  per-visit rows), its medical-history verbatim
  terms are scrubbed placeholders, no con-med carries an ongoing indicator (so
  every blank-ended con-med is "end not recorded"), and no lab result carries an
  `HH` / `LL` tier. Each of those branches is evidenced by the synthetic fixture
  or by unit tests, and the guide says what the demo page cannot show.
- **Out of scope by design**, each needing its own decision: LLM narratives,
  cohort similarity, cross-study aggregation, a QT/ECG lane, a dark-mode toggle
  (the tokens ship, the switch does not), a "zoom to window" control, and the R
  widget binding ([obot.roadmap#350](https://github.com/jwildfire/obot.roadmap/issues/350)).
- **OS dark mode applies only under `data-theme="auto"`.** Both dark token
  blocks ship (`:root[data-theme="dark"]` forces dark; the
  `prefers-color-scheme: dark` block is gated on `:root[data-theme="auto"]`),
  and the `matchMedia` change listener re-resolves the theme, but a dark-OS
  visitor to the light-only site sees a light card: following the OS without
  the attribute would put a dark chart inside a light page. Recorded as
  decision D31 in the design's §14 (2026-09-18 verification pass).
- **The default `height` is 760, not the 720 the design's D21 computed.** The
  design's stack arithmetic omitted the 35px group headers, the 2px lane gaps
  and the 18px footers; at those, the Definition-of-Done participant measures
  736px at the row and lab floors, so 720 scrolled by 16px and the demo carried
  an undocumented `height: 760` override. The default is now 760, the demo
  passes no height, and PJE-LANE-009 asserts the fit on the synthetic fixture
  while the demo-page spec asserts it on the seeded participant (D32).
- **The verification pass of 2026-09-18** also made the four context lists
  whole-record facts (a display filter never changes them; the panel names why
  a listed record is not drawn), padded the drawing domain by one day so the
  last day's cell is inside the plot, treated study day 0 and an end before
  the start as what they are (unplaceable; a single day), kept labs for tests
  outside `lb_tests` in the record (counted, in the drawer, named in the
  footer) rather than dropping them silently, and gave the axis round
  days-from-anchor ticks. Each is pinned by a test named in the tables above.
