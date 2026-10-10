---
name: port-a-renderer
description: "Use when porting a legacy SafetyGraphics (RhoInc, Webcharts) renderer into safety.viz, or deciding whether Chart.js fits a display. Sequences the work: harvest the requirement matrix from the wiki, review it, extract pure logic and test it, then build the Chart.js module. Covers the Chart.js fit questions, the module pattern taken from gsm.viz, the matrix vocabularies, and the hard don'ts. Do NOT use for a new chart with no legacy renderer (start from a hub requirement) or for a change to a chart that is already available (edit its matrix and tests in one pull request, per CONTRIBUTING.md)."
---

# Port a renderer

How a legacy SafetyGraphics renderer becomes a safety.viz module. Two are still planned in
[`site/config.json`](../../../site/config.json): `web-codebook` and
`paneled-outlier-explorer`. Their matrices are harvested and AI-reviewed but carry rows
marked `needs-jeremy-review`.

This skill holds what is specific to a port. The rest is already written down, and those
documents win where they disagree with this one:

- [`CONTRIBUTING.md`](../../../CONTRIBUTING.md): the traceability convention, the evidence
  pipeline, the demo app's conventions, and the renderer definition of done.
- [`requirements/README.md`](../../../requirements/README.md): how a matrix is read and
  how to change one.
- The hub's [developer guidelines](https://github.com/jwildfire/obot.roadmap/blob/main/docs/developer-guidelines.md):
  the six test layers, the definition of done for a chart, and the GxP stance.

## Sequence

1. Build the requirements matrix first. Harvest it ([`harvesting.md`](harvesting.md)),
   then run the AI review, then put the rows that need a decision in front of @jwildfire.
2. Establish the baseline: a legacy demo to compare against, and the build and test
   commands green before anything changes.
3. Define the chart's inputs independently of Chart.js: schemas for settings and data,
   and deterministic fixtures.
4. Extract the pure data and settings logic from the Webcharts callbacks (data
   preparation, binning, statistics, domain calculations) and test it.
5. Build the Chart.js module around the tested data structures, following the module
   pattern below. One display state first.
6. Add browser tests for the interactions and screenshots for the default and edge
   states.
7. Flip the `site/config.json` entry to `available` only when the definition of done in
   `CONTRIBUTING.md` holds, with the matrix, the coverage table and the evidence set in
   the same pull request as the code.
8. Set the chart's rung of the status ladder in that same entry, as `tier`. The ladder is
   Qualified, Exploratory, Experimental, Prototype. `exploratory` is the default and
   needs no field. A chart whose settings or layout may still change, or that waits on a
   clinical review, is `experimental`, and carries `tierNote`: one sentence saying why,
   which the status label shows in the app and on the docs site. Ask @jwildfire which
   rung a new chart stands on. Then run `npm run tiers` and commit the file it writes.
   The chart draws no status banner of its own: the shared shell shows the label.

Development is red-green: matrix row, failing test, minimal implementation.

## Do not

- Rewrite the renderer before baseline tests exist.
- Remove legacy behavior without a documented requirement decision. Behavior that is
  awkward in Chart.js gets a `replaced` or `deferred` row with a reason, not silence.
- Silently drop a requirement because it depended on Webcharts.
- Invent behavior for an ambiguous row. Mark it `needs-jeremy-review` and ask.
- Claim validation. The words are "GxP-oriented" and "qualification-ready evidence",
  never "validated".
- Set `tier` to `qualified`, or call a chart qualified, validated or stable. Nothing in
  safety.viz has been through qualification, and the build stops on an entry that says
  so.

## Does Chart.js fit this display?

Ask before committing to it:

- Is the display a standard chart type that Chart.js supports well?
- Are the required interactions available through Chart.js events or plugins?
- Are the overlays easier as Chart.js plugins or as custom SVG or HTML layers?
- Can small multiples be represented as multiple Chart.js instances?
- Does the accessibility model remain acceptable?

Keep the Chart.js layer thin, so that another renderer could replace it, and keep the
clinical requirements outside opaque Chart.js configuration: they belong in the matrix
and in tests.

## The module pattern

safety.viz modules follow the flow gsm.viz established
([`gsm-viz-reference.md`](gsm-viz-reference.md)). `src/histogram/` is the reference
module in this repository:

1. The entry function (`src/<module>.js`) receives the element, the data and the
   settings.
2. `checkInputs.js` validates the data and settings against the schemas.
3. `configure.js` merges the defaults, the metadata and the user's settings.
4. `structureData.js` turns input records into Chart.js datasets.
5. `getPlugins.js` and `getScales.js` build the Chart.js options.
6. The chart is created, with explicit update methods for whatever can change after the
   first render.

The module renders into the shared shell from `src/shell.js` rather than building its
own controls or styles, and anything it shares with other modules goes through the kit
(`src/kit.js`), which is public surface.

What a SafetyGraphics renderer needs that a generic chart does not, and which must
therefore be rows and tests rather than configuration:

- dynamic measure selection
- binning algorithms and bin-boundary controls
- normal range overlays
- linked detail listings
- grouped small multiples
- statistical annotations, such as normality or distribution-comparison p-values
- browser warnings and errors for invalid mappings

## Decisions already made

@jwildfire answered the cross-renderer policy questions in May 2026. They are recorded in
[`requirements/history/`](../../../requirements/history/) and apply to every port:

- Legacy API compatibility is recorded twice, and the two records disagree. On
  2026-05-20 (`p004-open-questions.md`, P004-API-Q004): no compatibility wrapper by
  default, breaking changes are fine, design a clean new API. On 2026-05-26
  (`p004-grill-queue.md`, Q-P004-001): keep a thin legacy factory wrapper where
  practical, around a clean new API. Both agree on the clean new API. Ask @jwildfire
  before building or dropping a wrapper for a renderer.
- Translate a documented subset of legacy Webcharts settings (data mapping, filters,
  controls, display). Mark the rest `replaced` or `deferred`.
- Rewrite CAT and viz-library regression tests as standalone browser tests, unless they
  describe behavior the R widgets still need.
- Browser QA runs in Chromium at 1440×900. Vertical scrolling is allowed unless a source
  requirement says otherwise.
- Preserve a legacy statistical method only if the exact method and fixture-level expected
  outputs can be identified. Otherwise mark the p-value rows `blocked` and carry on with
  the non-statistical work.

Read the per-renderer sections of
[`p004-grill-queue.md`](../../../requirements/history/p004-grill-queue.md) before starting
either planned renderer: its questions for that renderer are already written.

## When behavior is approximated

If the port approximates a legacy statistical or visual feature, say so in the row's
notes and in the pull request:

- what is approximated;
- why exact parity is not implemented yet;
- whether the approximation is acceptable for review only;
- what evidence would be required before production use.

A screening approximation is never presented as a validated statistical procedure. A
threshold or rule an agent derived needs @jwildfire's sign-off before anything claims
conformance.

## Provenance

Merged on 2026-10-07 from three skills in `jwildfire/obot.agent`
(`renderer-modernization`, `chartjs-migration`, `requirements-harvesting`) and its
`docs/gsm-viz-reference.md`, `docs/requirements-harvesting.md`, `docs/test-framework.md`
and `docs/gxp-framework.md`, which that repository removed in v0.5.0. The originals are
in its `v0.4.0` tag.
