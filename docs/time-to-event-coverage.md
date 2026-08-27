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
`TTE-DATA-*` (the events + population contract, counted exclusions),
`TTE-FILT-*` (the multiselect event filters that compose the endpoint — the
sv#131 review's architectural change), `TTE-DERIV-*` (the fixed
first-qualifying-event / censor-at-follow-up derivation rule), `TTE-ANIM-*`
(the no-intro-animation frame-consistency rule), `TTE-STAT-*` (the estimator
itself: product-limit arithmetic, Greenwood / log-log intervals, the survfit
cross-validation, the risk-table definitions, degenerate inputs), `TTE-CURV-*`
(step rendering, censor marks, the band, axis labelling, the flat tail, group
styling), `TTE-RISK-*` (the in-canvas strip table), `TTE-USER-*` (controls,
tooltips, selection, empty states), `TTE-GUIDE-*` (the statistical-honesty
language in-app and in the clinical guide), and `TTE-DEMO-*` (the vendored
`adae.csv` + `adsl.csv` demo extracts and their drift guards).

The estimator gets three independent checks (design §7): hand-computed unit
tests (a tiny exact example plus the Freireich 6-MP textbook values), the
committed `survival::survfit` reference fixture asserted to 1e-10 per endpoint ×
arm, and the browser suite's hand-computed fixture curves. One derivation feeds
curve, band, marks and table (TTE-STAT-001), so the browser assertions read the
module's own recorded geometry (`chart.$tteBand`, `chart.$tteRiskTable`) rather
than re-deriving expectations.

## Browser evidence (Playwright — `tests/e2e/time-to-event.spec.js`)

| Requirement ID                                          | Source matrix rows                                      | Issue | Test                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| TTE-CURV-001, TTE-CURV-005, TTE-STAT-001, TTE-DERIV-001 | TTE-CURV-001, TTE-CURV-005, TTE-STAT-001, TTE-DERIV-001 | #128  | the step curves carry the hand-computed product-limit values from each participant's first qualifying event and extend flat |
| TTE-CURV-002, TTE-DERIV-002                             | TTE-CURV-002, TTE-DERIV-002                             | #128  | censor tick marks sit on the curve at each follow-up-end time, carrying the population censoring description                |
| TTE-CURV-003, TTE-STAT-004                              | TTE-CURV-003, TTE-STAT-004                              | #128  | the pointwise band is drawn from the same estimate and gaps where undefined                                                 |
| TTE-ANIM-001                                            | TTE-ANIM-001                                            | #128  | the chart renders without intro animation — curves, band and risk table share one truthful frame                            |
| TTE-USER-003                                            | TTE-USER-003                                            | #128  | the CI toggle removes the band                                                                                              |
| TTE-CURV-004, TTE-USER-002                              | TTE-CURV-004, TTE-USER-002                              | #128  | the axis names the estimator and the orientation toggle flips the curves                                                    |
| TTE-RISK-001, TTE-RISK-002                              | TTE-RISK-001, TTE-RISK-002                              | #128  | the strip table shows at-risk and cumulative events at the axis ticks                                                       |
| TTE-RISK-003                                            | TTE-RISK-003                                            | #128  | hiding a group via the legend drops its curve, marks, band and rows together                                                |
| TTE-FILT-001                                            | TTE-FILT-001, TTE-STAT-006                              | #128  | a multiselect event filter recomposes the endpoint live, including an all-censored group drawn flat                         |
| TTE-FILT-002                                            | TTE-FILT-002                                            | #128  | no active selection qualifies every event; an empty selection draws the honest all-censored display                         |
| TTE-FILT-003                                            | TTE-FILT-003                                            | #128  | the notes name the composed endpoint and the active filter selection                                                        |
| TTE-USER-004                                            | TTE-USER-004                                            | #128  | a configured population filter constrains the denominator                                                                   |
| TTE-DATA-002, TTE-DATA-003                              | TTE-DATA-002, TTE-DATA-003                              | #128  | unusable rows in both datasets are counted with exportable record lists                                                     |
| TTE-GUIDE-001                                           | TTE-GUIDE-001                                           | #128  | the notes state the derivation rule, the pointwise bands and the 1 − KM competing-risks limitation                          |
| TTE-USER-008                                            | TTE-USER-008                                            | #128  | clicking an event step dispatches participantsSelected with that step's ids                                                 |
| TTE-USER-007                                            | TTE-USER-007                                            | #128  | an all-unusable selection renders the empty state                                                                           |
| TTE-DEMO-001                                            | TTE-DEMO-001                                            | #128  | the built demo composes the endpoint from the vendored adae + adsl extracts                                                 |
| TTE-GUIDE-002                                           | TTE-GUIDE-002                                           | #128  | the built clinical guide states the estimator's limits                                                                      |

## Unit evidence (Vitest — `tests/unit/time-to-event/`, `tests/unit/demo-data/adsl.test.js`, `tests/unit/shell/multiSelect.test.js`)

| Requirement ID                             | Source matrix rows                                     | Issue | Test                                                                                            |
| ------------------------------------------ | ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------- |
| TTE-CFG-001                                | TTE-CFG-001                                            | #128  | `configure.test.js` — the default settings carry the events + population mapping                |
| TTE-CFG-002                                | TTE-CFG-002                                            | #128  | `configure.test.js` — direction validated, incidence fallback                                   |
| TTE-CFG-003                                | TTE-CFG-003                                            | #128  | `configure.test.js` — ci coerced to a boolean, defaulting on                                    |
| TTE-DATA-001                               | TTE-DATA-001                                           | #128  | `structureData.test.js` — one error naming every missing dataset and column                     |
| TTE-DATA-002                               | TTE-DATA-002                                           | #128  | `structureData.test.js` — bad-day / unknown-participant event rows dropped with named reasons   |
| TTE-FILT-001                               | TTE-FILT-001                                           | #128  | `structureData.test.js` — multiselect semantics; `multiSelect.test.js` — the shared control     |
| TTE-FILT-002                               | TTE-FILT-002                                           | #128  | `structureData.test.js` — no selection qualifies all, empty selection qualifies none            |
| TTE-FILT-003                               | TTE-FILT-003                                           | #128  | `configure.test.js` — the endpoint label survives normalization                                 |
| TTE-DERIV-001                              | TTE-DERIV-001                                          | #128  | `structureData.test.js` — first qualifying event by day, ties by input order                    |
| TTE-DERIV-002                              | TTE-DERIV-002                                          | #128  | `structureData.test.js` — censoring at the follow-up day with the population description        |
| TTE-DATA-003                               | TTE-DATA-003                                           | #128  | `structureData.test.js` — duplicate population rows dropped with a named reason                 |
| TTE-DATA-004                               | TTE-DATA-004                                           | #128  | `structureData.test.js` — pooled group when the group column is absent                          |
| TTE-STAT-001                               | TTE-STAT-001                                           | #128  | `structureData.test.js` — one km.js pass per group feeds the structured result                  |
| TTE-STAT-002                               | TTE-STAT-002                                           | #128  | `km.test.js` — product-limit values, tie conventions, Freireich 6-MP textbook case              |
| TTE-STAT-003                               | TTE-STAT-003                                           | #128  | `km.test.js` — Greenwood SE, log-log bounds, absent where undefined                             |
| TTE-STAT-004                               | TTE-STAT-004                                           | #128  | `survfit.test.js` — agreement with survival::survfit to 1e-10 per endpoint × arm                |
| TTE-STAT-005                               | TTE-STAT-005                                           | #128  | `km.test.js` — risk-table numbers from the same pass                                            |
| TTE-STAT-006                               | TTE-STAT-006                                           | #128  | `km.test.js` — all-censored group stays at S = 1 with no band                                   |
| TTE-CURV-005                               | TTE-CURV-005                                           | #128  | `getPlugins.test.js` — the terminal vertex extends the curve flat                               |
| TTE-CURV-006                               | TTE-CURV-006                                           | #128  | `getPlugins.test.js` — fixed-order colors and dash patterns                                     |
| TTE-RISK-001                               | TTE-RISK-001                                           | #128  | `getPlugins.test.js` — the two strips assembled from the estimates                              |
| TTE-RISK-002                               | TTE-RISK-002                                           | #128  | `getScales.test.js` — the 1/2/5-decade tick generator the table aligns to                       |
| TTE-USER-005                               | TTE-USER-005                                           | #128  | `getPlugins.test.js` — event tooltip with the pointwise interval                                |
| TTE-USER-006                               | TTE-USER-006                                           | #128  | `getPlugins.test.js` — censor tooltip with count and reasons                                    |
| TTE-DEMO-002                               | TTE-DEMO-002                                           | #128  | `adsl.test.js` — EOSDY derivation rules plus the committed-file drift guard                     |
| TTE-FILT-001..004 (shared filter contract) | TTE-FILT-001, TTE-FILT-002, TTE-FILT-003, TTE-FILT-004 | #136  | `../shared/filters.test.js`                                                                     |
| TTE-CTRL-001                               | TTE-CTRL-001                                           | #136  | `reset.test.js` — the reset control sits last, restores every control, and clears the selection |

## Known gaps, stated

- **Decisions D1–D6 are provisional** (adopted in an unattended session,
  2026-08-15). The matrix rows carrying them say so; the module ships marked
  Experimental until @jwildfire's review.
- **The clinical-guide language (TTE-GUIDE-002) awaits clinical review** — the
  competing-risks and censoring passages especially.
- **Aalen–Johansen, log-rank / hazard ratios, medians, simultaneous bands, and
  configured filter presets are out of scope** for Phase 1 by design (§2, as
  revised by the sv#131 review — which pulled the first-qualifying-event
  derivation forward into Phase 1 and staged presets to a later release), each
  needing its own decision.
