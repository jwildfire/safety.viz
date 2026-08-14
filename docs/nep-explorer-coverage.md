# Nep-explorer requirement coverage

Traceability for the nep-explorer module (a Chart.js reimplementation of the
[SafetyGraphics/nepExplorer](https://github.com/SafetyGraphics/nepExplorer)
KDIGO nephrotoxicity explorer, **Phase 1**, under
[#120](https://github.com/jwildfire/safety.viz/issues/120); parent requirement
[obot.roadmap#35](https://github.com/jwildfire/obot.roadmap/issues/35), design
[35_design.html](https://jwildfire.github.io/obot.roadmap/requirements/design/35_design.html)),
per the convention in [CONTRIBUTING.md](../CONTRIBUTING.md). The reviewed source
matrix is [`requirements/nep-explorer.md`](../requirements/nep-explorer.md) in
this repo, and each row below cites the matrix rows its test covers.

Requirement IDs use the module's condensed `NEP-*` scheme cited in the source
and test names — `NEP-CFG-*` (settings, the `stages` and `units` objects, measure
resolution), `NEP-UNIT-*` (per-record mg/dL conversion, string normalization, the
refuse-to-guess path), `NEP-DATA-*` (baseline resolution and its fallback,
per-participant maxima, dropped records and their export), `NEP-STAGE-*` (the
fold ladder, the 0.3 mg/dL trigger, the ≥ 4.0 mg/dL rule, the combined stage),
`NEP-ZONE-*` (zone geometry, paint order, labels, axis floors), `NEP-SCAT-*`
(marks, tooltip, selection and the dispatched event), `NEP-TBL-*` (the summary
table), `NEP-API-*` (the module export), and `NEP-COHORT-*` (the synthetic AKI
demo cohort's own data-shape assertions, per
[#89](https://github.com/jwildfire/safety.viz/issues/89) DEMO-6).

Three rows exist because the port deliberately **diverges** from the R source,
each with design §3 as its citation: the staging ladder is read worst-first off
parameterized cut-points (D4, the source's `case_when` ascends so its Stage 2 and
3 arms are unreachable while its chart paints the same numbers descending); the
absolute-change domain extends below zero (D6, the source's y-limits drop a fifth
of the RhoInc cohort unannounced); and the ≥ 4.0 mg/dL Stage-3 rule is a mark
property rather than a region of the plane (D5). The Phase-1 scope is the
creatinine scatter and stage summary; the patient-profile drill-down, its RhoInc
dataset and the derived CKD-EPI eGFR are Phase 2, and scatter time-animation is
out entirely (D3).

**One branch cannot be reached from the demo**, whose units are all known: the
unknown-unit suppression path. It carries its own browser fixture page
(`tests/e2e/fixtures/nep-explorer-unknown-units.html`) as well as unit tests, so
it is evidenced rather than assumed.

## Browser evidence (Playwright — `tests/e2e/nep-explorer.spec.js`)

| Requirement ID               | Source matrix rows           | Issue | Test                                                                            |
| ---------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------------- |
| NEP-ZONE-001, NEP-ZONE-002   | NEP-ZONE-001, NEP-ZONE-002   | #120  | the stage zones paint worst-first behind the points                             |
| NEP-ZONE-004                 | NEP-ZONE-004                 | #120  | the zone labels can be hidden                                                   |
| NEP-STAGE-001, NEP-STAGE-004 | NEP-STAGE-001, NEP-STAGE-004 | #120  | each participant lands in the zone their staging names                          |
| NEP-UNIT-002                 | NEP-UNIT-002                 | #120  | a participant whose records mix mg/dL and µmol/L stages on the converted values |
| NEP-SCAT-001, NEP-STAGE-003  | NEP-SCAT-001, NEP-STAGE-003  | #120  | the >= 4.0 mg/dL participant carries a distinct mark                            |
| NEP-SCAT-004                 | NEP-SCAT-004                 | #120  | clicking a point selects it and dispatches participantsSelected                 |
| NEP-TBL-001, NEP-TBL-002     | NEP-TBL-001, NEP-TBL-002     | #120  | the summary tabulates the fold, absolute and combined stagings                  |
| NEP-DATA-005                 | NEP-DATA-005                 | #120  | unusable records and participants are counted with a download each              |
| NEP-CFG-006                  | NEP-CFG-006                  | #120  | the filters narrow the plotted population and restate the summary               |
| NEP-UNIT-003                 | NEP-UNIT-003                 | #120  | the fold axis survives and every absolute claim is withheld                     |

## Unit evidence (Vitest — `tests/unit/nep-explorer/`)

| Requirement ID                                                               | Source matrix rows         | Issue | Test file               |
| ---------------------------------------------------------------------------- | -------------------------- | ----- | ----------------------- |
| NEP-CFG-001..008 (mapping, baseline pair, stage ladder, units, zone labels)  | NEP-CFG-001..008           | #120  | `configure.test.js`     |
| NEP-UNIT-001 (µ/μ/u folding, case and whitespace)                            | NEP-UNIT-001               | #120  | `configure.test.js`     |
| NEP-STAGE-001..004 (fold ladder, 0.3 mg/dL trigger, ≥ 4 rule, combined)      | NEP-STAGE-001..004         | #120  | `structureData.test.js` |
| NEP-DATA-001..005 (baseline + fallback count, maxima, negatives, drops)      | NEP-DATA-001..005          | #120  | `structureData.test.js` |
| NEP-UNIT-002, NEP-UNIT-003 (per-record conversion, suppression, mixed units) | NEP-UNIT-002, NEP-UNIT-003 | #120  | `structureData.test.js` |
| NEP-TBL-001..003 (three N/% pairs, empty rows, empty population)             | NEP-TBL-001..003           | #120  | `structureData.test.js` |
| NEP-SCAT-003 (maximum visit and study day, degrading without a day column)   | NEP-SCAT-003               | #120  | `structureData.test.js` |
| NEP-ZONE-005 (axis floors, cut-point ticks, number formatting)               | NEP-ZONE-005               | #120  | `getScales.test.js`     |
| NEP-ZONE-001..003 (L geometry, paint order, ramp and labels)                 | NEP-ZONE-001..003          | #120  | `getPlugins.test.js`    |
| NEP-SCAT-001, NEP-SCAT-002, NEP-SCAT-004 (marks, tooltip lines, selection)   | NEP-SCAT-001, 002, 004     | #120  | `getPlugins.test.js`    |
| NEP-DATA-006 (required columns; a creatinine-free dataset is reported)       | NEP-DATA-006               | #120  | `export.test.js`        |
| NEP-API-001 (module export)                                                  | NEP-API-001                | #120  | `export.test.js`        |
| NEP-COHORT-001..012 (the synthetic AKI demo cohort's data shape)             | NEP-COHORT-001..012        | #120  | `cohort.test.js`        |

## The demo cohort (D8, #89 DEMO-6)

The KDIGO scatter cannot be _demonstrated_ on the pharmaverseadam population
however correctly it is implemented: all 208 stageable participants sit in the
no-stage box, the maximum fold change anywhere is 1.45×, and zero reach the 1.5×
Stage-1 line. Design decision D8 therefore injects a deterministic synthetic
acute-kidney-injury cohort (`AKI-*`, 46 participants, 368 rows) into the **shared**
`site/data/adbds.csv` on the `CLD-*` mechanism, rather than shipping a
nep-specific extract — the house approach, and what #89 DEMO-3 asks for across
every under-fed demo.

The consequence is deliberate and was planned for rather than discovered:
`adbds.csv` is read by ten renderers, so the injection regenerates their
canonical evidence baselines. The cohort adds rows and edits nothing, its
participants carry creatinine and no other measure, and it reuses the pilot's own
visit vocabulary — so no other renderer's display changes beyond the new
participants. `NEP-COHORT-012` pins that guard, and the generator itself fails
the build when a generated participant misses the stage its archetype promises.
Provenance is in [`docs/DATA_SOURCES.md`](DATA_SOURCES.md).

The demo population is **simulated injury**: it buys a chart that exercises every
zone at the price of a flagship kidney demo in which no participant is real. The
clinical guide says so plainly, as the hepatic composite view does.

## Known limits at this revision

- **No KDIGO time window.** KDIGO stages an acute injury — the 0.3 mg/dL rise
  within 48 hours, the fold change within 7 days. Neither the R source nor this
  port applies a window; both take the maximum over the whole study. That is a
  screening simplification, not the criteria, and the guide page says so.
- **D4's ladder is an agent-derived clinical call**, defensible from the criteria
  and from the source's own chart geometry, but changing the staging a
  nepExplorer user sees. It should be confirmed by someone who owns the clinical
  content before the evidence page claims KDIGO conformance.
- **Phase 2 is unbuilt.** The patient profile, the RhoInc dataset and the derived
  CKD-EPI eGFR (D1, D9) are tracked on the parent requirement; Phase 1 leaves the
  seam open by dispatching `participantsSelected`.
