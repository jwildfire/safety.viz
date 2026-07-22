# Hep-waterfall requirement coverage

Traceability for the hep-waterfall module — the **modified ALT waterfall** of
Amirzadegan et al., "Emerging Tools to Support DILI Assessment in Clinical
Trials with Abnormal Baseline Serum Liver Tests or Pre-existing Liver Diseases",
_Drug Safety_ 2025;48(5):443–453
([DOI](https://doi.org/10.1007/s40264-024-01511-8),
[PMID 39932652](https://pubmed.ncbi.nlm.nih.gov/39932652/)), **Figure 5** — built
under [#93](https://github.com/jwildfire/safety.viz/issues/93); parent
requirement
[obot.roadmap#43](https://github.com/jwildfire/obot.roadmap/issues/43), per the
convention in [CONTRIBUTING.md](../CONTRIBUTING.md).

Unlike the other renderers here, this module is **not a port of a legacy
RhoInc/SafetyGraphics renderer** — it is a new renderer derived from a published
figure, so the requirement matrix cites the paper's figure caption, its Table-1
applicability rule and its body text rather than a source repository.
Requirement IDs use the module's condensed **`HWF-*`** scheme cited in the source
and test names — `HWF-CFG-*` (settings normalization), `HWF-DATA-*` (data
contract, the cohort rules, the baseline/on-treatment split, units),
`HWF-ORDER-*` (the baseline ranking and the mountain invariant), `HWF-BAR-*`
(the floating bars and the baseline trace), `HWF-AXIS-*` (the absolute-unit
mirrored axes and the reference range), `HWF-COLOR-*` (the semantic arm palette
and the jaundice override), `HWF-BOX-*` (the flanking summary panels),
`HWF-CTRL-*` (controls), `HWF-SELECT-*` (tooltip, selection, event),
`HWF-API-*` (factory and lifecycle), and `HWF-COHORT-*` (the invariants the
synthetic demo cohort must keep for the figure to be demonstrable at all).

## Browser evidence (Playwright — `tests/e2e/hep-waterfall.spec.js`)

| Requirement ID                                 | Source matrix rows                          | Issue | Test                                                                                                      |
| ---------------------------------------------- | ------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| HWF-BAR-001/002/003/004, HWF-ORDER-001/002/003 | HWF-BAR-001..004, HWF-ORDER-001..003        | #93   | one floating bar per participant from baseline to on-treatment maximum, under a continuous baseline trace |
| HWF-COLOR-001, HWF-COLOR-002, HWF-COLOR-004    | HWF-COLOR-001, HWF-COLOR-002, HWF-COLOR-004 | #93   | blue placebo, bronze active, green for new-onset jaundice in either arm, with the precedence stated       |
| HWF-COLOR-003                                  | HWF-COLOR-003                               | #93   | the arm divider splits the plot at the seam and captions each half with its arm and n                     |
| HWF-AXIS-002, HWF-AXIS-003, HWF-AXIS-004       | HWF-AXIS-002, HWF-AXIS-003, HWF-AXIS-004    | #93   | mirrored absolute-unit axes and a single-value reference line                                             |
| HWF-BOX-001, HWF-BOX-002, HWF-BOX-003          | HWF-BOX-001, HWF-BOX-002, HWF-BOX-003       | #93   | a summary panel flanks each arm, pinned to the main chart domain                                          |
| HWF-DATA-003, HWF-DATA-005, HWF-DATA-008       | HWF-DATA-003, HWF-DATA-005, HWF-DATA-008    | #93   | both cohort exclusions and the dropped records are reported separately in the notes                       |
| HWF-DATA-003                                   | HWF-DATA-003                                | #93   | turning the Table-1 cohort rule off admits the excluded participants and says so                          |
| HWF-DATA-007                                   | HWF-DATA-007                                | #93   | two units for the plotted measure suppress the chart with a warning naming them                           |
| HWF-CTRL-001, HWF-CTRL-002                     | HWF-CTRL-001, HWF-CTRL-002                  | #93   | the control panel exposes the display settings and the arm mapping                                        |
| HWF-CTRL-001                                   | HWF-CTRL-001                                | #93   | changing the plotted measure redraws in that measure and its own units                                    |
| HWF-CTRL-001                                   | HWF-CTRL-001                                | #93   | the jaundice threshold reclassifies which bars are green                                                  |
| HWF-CTRL-003                                   | HWF-CTRL-003                                | #93   | a filter restricts the plotted cohort and the counts follow it                                            |
| HWF-CTRL-004                                   | HWF-CTRL-004                                | #93   | reset restores every control-derived setting and redraws the full cohort                                  |
| HWF-SELECT-001                                 | HWF-SELECT-001                              | #93   | the bar tooltip names the participant, arm, both values, the change and the jaundice status               |
| HWF-SELECT-002, HWF-SELECT-003                 | HWF-SELECT-002, HWF-SELECT-003              | #93   | clicking a bar highlights the participant, opens the listing, and dispatches participantsSelected         |

## Unit evidence (Vitest — `tests/unit/hep-waterfall/`)

| Requirement ID                                                                        | Source matrix rows      | Issue | Test file               |
| ------------------------------------------------------------------------------------- | ----------------------- | ----- | ----------------------- |
| HWF-CFG-001..005 (defaults, thresholds, arm designation, the two enum settings)       | HWF-CFG-001..005        | #93   | `configure.test.js`     |
| HWF-DATA-001, HWF-DATA-005 (schema required columns, arm required)                    | HWF-DATA-001, -005      | #93   | `checkInputs.test.js`   |
| HWF-DATA-001/002/003/004/005/008 (the shared reduction, cohort rules, counted drops)  | HWF-DATA-001..005, -008 | #93   | `structureData.test.js` |
| HWF-ORDER-001/002/003/004 (the mountain, and the mandatory identifier tie-break)      | HWF-ORDER-001..004      | #93   | `structureData.test.js` |
| HWF-BAR-001/002/003/004 (floating-bar pairs, direction, the trace and its draw order) | HWF-BAR-001..004        | #93   | `structureData.test.js` |
| HWF-BOX-003/004, HWF-CTRL-003 (staged box specs, R-7 statistics, filters)             | HWF-BOX-003, -004       | #93   | `structureData.test.js` |
| HWF-AXIS-001/002/003, HWF-BOX-002, HWF-DATA-006/007 (domain, mirroring, units)        | HWF-AXIS-001..003       | #93   | `getScales.test.js`     |
| HWF-COLOR-001..004, HWF-AXIS-004, HWF-SELECT-001 (palette, divider, band, tooltip)    | HWF-COLOR-001..004      | #93   | `getPlugins.test.js`    |
| HWF-API-002, HWF-API-003, HWF-BOX-001, HWF-CTRL-001..004, HWF-SELECT-002/003          | HWF-API-002, -003       | #93   | `render.test.js`        |
| HWF-API-001 (module export)                                                           | HWF-API-001             | #93   | `export.test.js`        |
| HWF-COHORT-001..011 (the synthetic demo cohort's invariants)                          | HWF-COHORT-001..011     | #93   | `abnbl.test.js`         |

## Source-matrix routing status

The source matrix (`hep-waterfall.md`, 54 rows) is **authored but not yet
merged** in the requirements repo — it was written before implementation so that
`npm run requirements` publishes real requirement text rather than degrading the
evidence page to IDs-only. Until it lands, `docs/requirements/hep-waterfall.json`
is absent and the evidence page renders requirement IDs alone; the config's
`matrix` link resolves on merge. Two of its rows carry a
`needs-jeremy-review` flag and are called out below.

- **Implemented (`browser`/`unit` above):** the settings surface and its
  normalization, including the two thresholds that do two different jobs —
  `jaundice_uln` (the new-onset event, 2×ULN) and `baseline_tb_max` (the paper's
  Table-1 cohort rule, 1×ULN) — and the arm designation carried as arm _values_
  rather than positions (HWF-CFG-001..005); the per-participant reduction to one
  baseline and one maximum on-treatment value in **absolute reporting units**,
  taken from the shared `src/hep-core/subjects.js` reduction so the waterfall,
  the migration Sankey and the composite plot can never disagree about what a
  participant's baseline is (HWF-DATA-001, HWF-DATA-002); the two separately
  counted cohort exclusions — baseline bilirubin above the Table-1 rule, and an
  arm designated neither placebo nor active — reported in on-page notes so the
  applicability rule is demonstrable evidence rather than a claim
  (HWF-DATA-003, HWF-DATA-005); the new-onset-jaundice predicate with both
  clauses evaluated (HWF-DATA-004); modal unit resolution with a mixed-unit
  cohort warned and suppressed rather than plotted (HWF-DATA-006,
  HWF-DATA-007); the counted reference-range drops (HWF-DATA-008); the ranking —
  placebo ascending, active descending, identifier tie-break — and the unimodal
  baseline-trace invariant it produces (HWF-ORDER-001..004); the floating
  `[baseline, maximum]` bars with direction alone separating a rise from a fall,
  under a continuous black baseline trace painted on top of them
  (HWF-BAR-001..004); the absolute-unit domain assigned to **both** the left and
  right axes from one computation, with the measure and its unit in both titles
  and the reference range drawn as a line, a band or per participant
  (HWF-AXIS-001..004); the fixed semantic palette with green overriding the arm
  colour and the legend stating that precedence out loud (HWF-COLOR-001..004);
  the arm divider and its per-half counts (HWF-COLOR-003); the two flanking
  box-and-whisker panels, drawn by the shared `src/box-whisker.js` renderer from
  R-7 statistics and pinned to the main chart's domain (HWF-BOX-001..004); the
  control panel, arm mapping, filters and reset (HWF-CTRL-001..004); the
  tooltip, the click-to-select drill-down and the `participantsSelected` event
  (HWF-SELECT-001..003); the factory and lifecycle API (HWF-API-001..003); and
  the synthetic demo cohort's own invariants (HWF-COHORT-001..011).

- **Two judgement calls a human reviewer must check against the published
  figure** (recorded as open calls in the
  [obot.roadmap#43 design](https://jwildfire.github.io/obot.roadmap/requirements/design/43_design.html)
  §K and flagged `needs-jeremy-review` in the matrix):

  1. **Participant ordering (HWF-ORDER-002, HWF-ORDER-003).** The Figure 5
     caption contradicts itself. Read literally, "active drug subjects run
     right-to-center highest-to-lowest" puts the _lowest_ active baselines at the
     centre, which contradicts the same sentence's controlling clause that the
     highest baselines meet in the centre. This implementation takes the latter
     as intent and pins it as a testable invariant, because it is the
     arrangement that makes the figure readable — the two arms' comparable
     participants sit next to each other at the seam.
  2. **Two boxes per flanking panel (HWF-BOX-003).** The caption says only
     "summary box-and-whisker plots, one per arm" and never states how many
     boxes each panel carries. This implementation reads the panel's job as
     summarising the _shift_ — the arm-level answer to the question the bars
     answer per participant — and draws a baseline box and a
     maximum-on-treatment box. The `summary: 'peak'` setting exposes the
     single-box alternative.

- **Deferred (recorded costs, not part of the claim):** selection does not carry
  between `hep-waterfall` and `hep-explorer` — the two modules serve different
  trials, and a cross-link in the gallery and the guides is all the relationship
  they get. The figure's own acknowledged limitation is not engineered around
  either: using the **maximum** on-treatment value can miss a drug-related rise
  that is smaller than a preceding decline, so a participant who falls from 300
  to 60 U/L and then climbs back to 250 draws a bar that points _down_. Reviewing
  the participant's trajectory — click the bar for their records — is the
  mitigation.

## Demo data

The demo runs on `site/data/adbds-abnbl.csv`, a **fully synthetic** 80-participant
cohort with no published source, because the shared `adbds.csv` extract
verifiably cannot carry this figure: after the paper's baseline-bilirubin
exclusion, zero of its 234 surviving participants reach a baseline ALT of 3×ULN,
it holds two new-onset-jaundice participants in total, and its baseline trace is
flat and discontinuous. Provenance, composition and the regeneration command are
in [DATA_SOURCES.md](DATA_SOURCES.md); the cohort's invariants are asserted
against the committed CSV by `tests/unit/hep-waterfall/abnbl.test.js`
(HWF-COHORT-001..011), so a regeneration that loses the signal fails the suite
rather than quietly degrading the demo.
