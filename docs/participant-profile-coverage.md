# Participant-profile requirement coverage

Traceability for the participant-profile module — the standardized-lab
participant drill-down (demographics header, labs-over-time spaghetti, and
per-measure summary table with sparklines and an expandable inset) that the
original SafetyGraphics
[hep-explorer](https://github.com/SafetyGraphics/hep-explorer) welded into its
eDISH renderer, lifted into a standalone, chart-agnostic module — built under
[#98](https://github.com/jwildfire/safety.viz/issues/98); parent requirement
[obot.roadmap#45](https://github.com/jwildfire/obot.roadmap/issues/45), per the
convention in [CONTRIBUTING.md](../CONTRIBUTING.md).

Requirement IDs use the module's **`PPRF-*`** area scheme, mapped onto the
issue's PPRF-1..9 requirements: `PPRF-CORE-*` (the two mounts, ingest, and the
data contract — PPRF-1), `PPRF-HDR-*` (the participant header — PPRF-2),
`PPRF-SPAG-*` (the labs-over-time spaghetti — PPRF-3), `PPRF-TBL-*` (the
measure table, sparklines, inset, and optional listing — PPRF-4), `PPRF-STEP-*`
(the worst-first cohort stepper — PPRF-5), `PPRF-EVT-*` (the
`participantsSelected` event contract — PPRF-6), and `PPRF-HEP-*` (the
hep-explorer adoption that replaced the legacy welded drill-down — PPRF-7).
The hep-explorer adoption tests live in this module's spec file deliberately:
the evidence pipeline routes browser captures by spec filename, and the
adoption is this module's behaviour even though the fixtures drive hep-explorer.

## Browser evidence (Playwright — `tests/e2e/participant-profile.spec.js`)

| Requirement ID              | Source matrix rows          | Issue | Test                                                                                                                          |
| --------------------------- | --------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| PPRF-HEP-001, PPRF-CORE-001 | PPRF-HEP-001, PPRF-CORE-001 | #98   | scatter click opens the docked profile below the chart — header, spaghetti, and measure table replace the legacy detail panel |
| PPRF-HEP-005                | PPRF-HEP-005                | #98   | background click clears the selection and hides the dock                                                                      |
| PPRF-HEP-002, PPRF-STEP-001 | PPRF-HEP-002, PPRF-STEP-001 | #98   | composite multi-select collapses the dock to a stepper, stepping renders each profile and keeps the chart highlight in sync   |
| PPRF-HEP-003                | PPRF-HEP-003                | #98   | composite single focus (point click or selector) opens the full profile, not the stepper                                      |
| PPRF-HEP-004                | PPRF-HEP-004                | #98   | the migration ribbon hand-off arrives in the composite view with the dock opened on the carried cohort                        |
| PPRF-EVT-001, PPRF-CORE-002 | PPRF-EVT-001, PPRF-CORE-002 | #98   | the standalone demo wires the profile to a chart via participantsSelected                                                     |

## Unit evidence (Vitest — `tests/unit/participant-profile/`)

| Requirement ID                                                        | Source matrix rows | Issue | Test file                                       |
| --------------------------------------------------------------------- | ------------------ | ----- | ----------------------------------------------- |
| PPRF-CORE-001 (module export: factory + dock)                         | PPRF-CORE-001      | #98   | `export.test.js`                                |
| PPRF-CORE-002 (standalone long-lab contract guard)                    | PPRF-CORE-002      | #98   | `checkInputs.test.js`                           |
| PPRF-CORE-003 (defaults + settings normalization)                     | PPRF-CORE-003      | #98   | `configure.test.js`                             |
| PPRF-CORE-004 (standalone chrome: shell mount, hidden chart card)     | PPRF-CORE-004      | #98   | `events.test.js`                                |
| PPRF-CORE-005 (docked mount: pre-cleaned rows, imperative feed)       | PPRF-CORE-005      | #98   | `dock.test.js`                                  |
| PPRF-HDR-001 (demographics, R Ratio, P_ALT pass-through, Clear)       | PPRF-HDR-001       | #98   | `header.test.js`, `structureData.test.js`       |
| PPRF-HDR-002 ({id}-templated link-out, closes #53)                    | PPRF-HDR-002       | #98   | `configure.test.js`                             |
| PPRF-SPAG-001 (series building, cut lines, spaghetti render)          | PPRF-SPAG-001      | #98   | `spaghetti.test.js`, `structureData.test.js`    |
| PPRF-SPAG-002 (×ULN/×Baseline and lab-subset controls)                | PPRF-SPAG-002      | #98   | `controls.test.js`                              |
| PPRF-SPAG-003 (measure color palette)                                 | PPRF-SPAG-003      | #98   | `configure.test.js`                             |
| PPRF-TBL-001 (per-measure summary model + table render)               | PPRF-TBL-001       | #98   | `measureTable.test.js`, `structureData.test.js` |
| PPRF-TBL-002 (sparklines with normal-range and population bands)      | PPRF-TBL-002       | #98   | `sparkline.test.js`                             |
| PPRF-TBL-003 (sparkline → inset expansion lifecycle)                  | PPRF-TBL-003       | #98   | `inset.test.js`                                 |
| PPRF-TBL-004 (non-key-measure "show N additional" toggle)             | PPRF-TBL-004       | #98   | `controls.test.js`                              |
| PPRF-TBL-005 (optional shared record listing)                         | PPRF-TBL-005       | #98   | `measureTable.test.js`                          |
| PPRF-STEP-001 (stepper render, wrap/clamp, keyboard operation)        | PPRF-STEP-001      | #98   | `stepper.test.js`                               |
| PPRF-STEP-002 (worst-quadrant-first ordering, peak-severity fallback) | PPRF-STEP-002      | #98   | `rank.test.js`                                  |
| PPRF-EVT-001 (participantsSelected listener on the configured target) | PPRF-EVT-001       | #98   | `events.test.js`                                |
| PPRF-EVT-002 (programmatic selection + on_clear/on_step callbacks)    | PPRF-EVT-002       | #98   | `events.test.js`                                |

## Source-matrix routing status

The source matrix (`participant-profile.md`) is **authored as a companion PR to
the requirements repo** (`obot.agent/docs/requirements/`) and not yet merged —
until it lands, `docs/requirements/participant-profile.json` is absent and the
evidence page renders requirement IDs alone; the config's `matrix` link
resolves on merge. The matrix rows use the same `PPRF-<AREA>-<NUM>` IDs as the
tables above, so no re-keying is needed when the extract arrives.

- **Implemented (`browser`/`unit` above):** both mounts (standalone factory
  with its own ingest and shell chrome; docked mount consuming a host's
  pre-cleaned rows), the participant header with R Ratio, P_ALT pass-through
  and the `{id}`-templated link-out, the standardized labs-over-time spaghetti
  with per-display cut lines, the measure table with banded sparklines and the
  expandable inset, the worst-first cohort stepper, the one-way
  `participantsSelected` event contract (listen, never dispatch), and the
  hep-explorer adoption that deleted the legacy `.hep-detail` drill-down in
  favour of the shared `sv-profile` shell slot.
- **Note (`PPRF-HEP-*` fixtures):** the adoption records in the browser table
  drive hep-explorer fixture pages; they live in this spec file so their
  captures land in this module's evidence set. The adoption's unit coverage
  (`tests/unit/hep-explorer/profile-adoption.test.js`, tagged PPRF-HEP-001)
  routes to the hep-explorer evidence set by directory, so it appears there
  rather than in the unit table above. hep-explorer's own selection
  regression suite (`tests/e2e/hep-explorer.spec.js`, HEP-SELECT-\*) was
  rewritten against the docked profile and remains in the hep-explorer
  evidence set.
- **Accessibility (PPRF-8):** keyboard operation is asserted in the stepper and
  inset unit suites; a dedicated `PPRF-ACC-*` browser pass (tab order,
  focus-visible rings, labeled regions, reduced motion) is planned alongside
  the requirements-matrix PR.
- **Done-gate (PPRF-9):** this document, the gallery card, the linked-charts
  demo, the schema, and the generated API reference are the gate's artifacts;
  evidence baselines regenerate on the canonical Linux environment via the
  evidence-update workflow after merge.
