# Time-to-event requirement coverage

Traceability for the time-to-event module (the interactive Kaplan–Meier
Time-to-Event Explorer, **Phase 1**, under
[#128](https://github.com/jwildfire/safety.viz/issues/128); parent requirement
[obot.roadmap#161](https://github.com/jwildfire/obot.roadmap/issues/161), design
[161_design.html](https://jwildfire.github.io/obot.roadmap/requirements/design/161_design.html)),
per the convention in [CONTRIBUTING.md](../CONTRIBUTING.md). The reviewed source
matrix is [`requirements/time-to-event.md`](../requirements/time-to-event.md) in
this repo, and each row below cites the matrix rows its test covers.

Requirement IDs use the module's condensed `TTE-*` scheme cited in the source
and test names — `TTE-CFG-*` (settings and the direction / ci decisions),
`TTE-DATA-*` (the ADTTE contract, CNSR semantics, counted exclusions),
`TTE-STAT-*` (the estimator itself: product-limit arithmetic, Greenwood /
log-log intervals, the survfit cross-validation, the risk-table definitions,
degenerate inputs), `TTE-CURV-*` (step rendering, censor marks, the band, axis
labelling, the flat tail, group styling), `TTE-RISK-*` (the in-canvas strip
table), `TTE-USER-*` (controls, tooltips, selection, empty states),
`TTE-GUIDE-*` (the statistical-honesty language in-app and in the clinical
guide), and `TTE-DEMO-*` (the derived `adtte.csv` demo dataset and its drift
guard).

The estimator gets three independent checks (design §7): hand-computed unit
tests (a tiny exact example plus the Freireich 6-MP textbook values), the
committed `survival::survfit` reference fixture asserted to 1e-10 per endpoint ×
arm, and the browser suite's hand-computed fixture curves. One derivation feeds
curve, band, marks and table (TTE-STAT-001), so the browser assertions read the
module's own recorded geometry (`chart.$tteBand`, `chart.$tteRiskTable`) rather
than re-deriving expectations.

## Browser evidence (Playwright — `tests/e2e/time-to-event.spec.js`)

| Requirement ID                           | Source matrix rows                       | Issue | Test                                                                               |
| ---------------------------------------- | ---------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| TTE-CURV-001, TTE-CURV-005, TTE-STAT-001 | TTE-CURV-001, TTE-CURV-005, TTE-STAT-001 | #128  | the step curves carry the hand-computed product-limit values and extend flat       |
| TTE-CURV-002                             | TTE-CURV-002                             | #128  | censor tick marks sit on the curve at each censored time                           |
| TTE-CURV-003, TTE-STAT-004               | TTE-CURV-003, TTE-STAT-004               | #128  | the pointwise band is drawn from the same estimate and gaps where undefined        |
| TTE-USER-003                             | TTE-USER-003                             | #128  | the CI toggle removes the band                                                     |
| TTE-CURV-004, TTE-USER-002               | TTE-CURV-004, TTE-USER-002               | #128  | the axis names the estimator and the orientation toggle flips the curves           |
| TTE-RISK-001, TTE-RISK-002               | TTE-RISK-001, TTE-RISK-002               | #128  | the strip table shows at-risk and cumulative events at the axis ticks              |
| TTE-RISK-003                             | TTE-RISK-003                             | #128  | hiding a group via the legend drops its curve, marks, band and rows together       |
| TTE-USER-001                             | TTE-USER-001, TTE-STAT-006               | #128  | the endpoint picker switches endpoints, including an all-censored group drawn flat |
| TTE-USER-004                             | TTE-USER-004                             | #128  | a configured filter constrains the analysis rows                                   |
| TTE-DATA-002                             | TTE-DATA-002                             | #128  | unusable rows are counted with an exportable record list                           |
| TTE-GUIDE-001                            | TTE-GUIDE-001                            | #128  | the notes state the pointwise bands and the 1 − KM competing-risks limitation      |
| TTE-USER-008                             | TTE-USER-008                             | #128  | clicking an event step dispatches participantsSelected with that step's ids        |
| TTE-USER-007                             | TTE-USER-007                             | #128  | an all-unusable selection renders the empty state                                  |
| TTE-DEMO-001                             | TTE-DEMO-001                             | #128  | the built demo renders the derived adtte.csv with three endpoints                  |
| TTE-GUIDE-002                            | TTE-GUIDE-002                            | #128  | the built clinical guide states the estimator's limits                             |

## Unit evidence (Vitest — `tests/unit/time-to-event/`, `tests/unit/demo-data/tte.test.js`)

| Requirement ID | Source matrix rows | Issue | Test                                                                                 |
| -------------- | ------------------ | ----- | ------------------------------------------------------------------------------------ |
| TTE-CFG-001    | TTE-CFG-001        | #128  | `configure.test.js` — the default settings carry the ADTTE mapping                   |
| TTE-CFG-002    | TTE-CFG-002        | #128  | `configure.test.js` — direction validated, incidence fallback                        |
| TTE-CFG-003    | TTE-CFG-003        | #128  | `configure.test.js` — ci coerced to a boolean, defaulting on                         |
| TTE-DATA-001   | TTE-DATA-001       | #128  | `structureData.test.js` — one error naming every missing required column             |
| TTE-DATA-002   | TTE-DATA-002       | #128  | `structureData.test.js` — bad time / bad censor flag rows dropped with named reasons |
| TTE-DATA-003   | TTE-DATA-003       | #128  | `structureData.test.js` — duplicate participant rows dropped with a named reason     |
| TTE-DATA-004   | TTE-DATA-004       | #128  | `structureData.test.js` — pooled group when the group column is absent               |
| TTE-STAT-001   | TTE-STAT-001       | #128  | `structureData.test.js` — one km.js pass per group feeds the structured result       |
| TTE-STAT-002   | TTE-STAT-002       | #128  | `km.test.js` — product-limit values, tie conventions, Freireich 6-MP textbook case   |
| TTE-STAT-003   | TTE-STAT-003       | #128  | `km.test.js` — Greenwood SE, log-log bounds, absent where undefined                  |
| TTE-STAT-004   | TTE-STAT-004       | #128  | `survfit.test.js` — agreement with survival::survfit to 1e-10 per endpoint × arm     |
| TTE-STAT-005   | TTE-STAT-005       | #128  | `km.test.js` — risk-table numbers from the same pass                                 |
| TTE-STAT-006   | TTE-STAT-006       | #128  | `km.test.js` — all-censored group stays at S = 1 with no band                        |
| TTE-CURV-005   | TTE-CURV-005       | #128  | `getPlugins.test.js` — the terminal vertex extends the curve flat                    |
| TTE-CURV-006   | TTE-CURV-006       | #128  | `getPlugins.test.js` — fixed-order colors and dash patterns                          |
| TTE-RISK-001   | TTE-RISK-001       | #128  | `getPlugins.test.js` — the two strips assembled from the estimates                   |
| TTE-RISK-002   | TTE-RISK-002       | #128  | `getScales.test.js` — the 1/2/5-decade tick generator the table aligns to            |
| TTE-USER-005   | TTE-USER-005       | #128  | `getPlugins.test.js` — event tooltip with the pointwise interval                     |
| TTE-USER-006   | TTE-USER-006       | #128  | `getPlugins.test.js` — censor tooltip with count and reasons                         |
| TTE-DEMO-002   | TTE-DEMO-002       | #128  | `tte.test.js` — derivation rules plus the committed-file drift guard                 |

## Known gaps, stated

- **Decisions D1–D6 are provisional** (adopted in an unattended session,
  2026-08-15). The matrix rows carrying them say so; the module ships marked
  Experimental until @jwildfire's review.
- **The clinical-guide language (TTE-GUIDE-002) awaits clinical review** — the
  competing-risks and censoring passages especially.
- **Aalen–Johansen, log-rank / hazard ratios, medians, simultaneous bands, and
  in-browser derivation are out of scope** for Phase 1 by design (§2), each
  needing its own decision.
