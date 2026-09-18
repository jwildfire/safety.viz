# Patient Journey narrative evals

The eval harness of the AI narrative layer ([safety.viz#146](https://github.com/jwildfire/safety.viz/issues/146), requirement [obot.roadmap#351](https://github.com/jwildfire/obot.roadmap/issues/351)). It runs the five skills in `skills/patient-journey-narratives/` through the runtime in `src/patientJourneyNarratives/` over a fixed set of cases from the vendored CDISC Pilot 01 extracts, and scores every draft.

```
build-golden.mjs      derives the golden set from the demo data (no model involved)
golden/<skill>.jsonl  the derived cases, one JSON object per line — committed
thresholds.json       the per-skill gate, keyed by skill slug
lib.mjs               runEvals(): the graders, callable in-process (the Vitest test uses it)
run.mjs               the CLI: runs, prints the table, writes the report, sets the exit code
demo-data.mjs         loads site/data/pje-*.csv into the arrays init() takes
```

## Running it

```bash
npm run eval:narratives                                   # offline: stub adapter, rules judge
node tests/evals/patient-journey-narratives/run.mjs --skill lab-trajectory --limit 2
node tests/evals/patient-journey-narratives/run.mjs --adapter claude --judge claude
node tests/evals/patient-journey-narratives/build-golden.mjs   # re-derive the cases
```

Offline is the default and needs no key: the stub adapter composes its sentences from the real rows, so the whole loop — grounding, tool calls, citation scope, validator, thresholds — runs on a laptop and in CI in under a second. A live run needs `ANTHROPIC_API_KEY` (`--adapter claude` or `--judge claude`) or `OPENAI_API_KEY` (`--adapter openai`); the CLI exits **2** with the variable name when one is named but absent, **1** when a skill is below a threshold, **0** when every skill clears. Reports land in `tests/evals/reports/` (gitignored) as `<ISO>-<adapter>-<judge>.json` and `.md`.

## How the golden set was built

`build-golden.mjs` picks 30 cases — 12 `event-context`, 6 `subject-summary`, 4 `lab-trajectory`, 4 `dose-journey`, 4 `disposition` — by scanning the 254 participants **in index order** and taking the first that matches a stated property, never a hand-picked row number:

- the demo participant's ERYTHEMA anchor on day 30 (the one the Explorer opens on), and the same anchor at a ±7-day window;
- the three participants with a serious adverse event on record;
- anchors whose ±window holds nothing but the anchor;
- an anchor on a dose interruption, one on a disposition event, one with an earlier record of the same preferred term on a different day, one with a crowded window;
- an anchor id that resolves to no row (the `anchor-not-found` refusal);
- participants with no adverse events, with unplaceable records, with a `DEATH` disposition, with an unrecorded exposure end;
- a lab series that fires the change-from-baseline rule, a single-point series, and a test the participant has no rows for (the `insufficient-data` refusal);
- participants whose dose is interrupted, and whose disposition is `ADVERSE EVENT` (the Pilot's discontinuation-for-adverse-event record), `DEATH` or `STUDY TERMINATED BY SPONSOR`.

Anchors are chosen by **what they are** (label + day), and the chosen row ids are written into the case. The derivation is pure: the same extracts produce byte-identical files, which the Vitest suite asserts. Re-running it also refreshes `skills/patient-journey-narratives/<skill>/examples.jsonl` with the first three cases of each skill as `{ inputs, reference }` anchors.

Two properties the brief asked for are **not** in the demo data: no participant has zero exposure rows, and no `DSDECOD` is literally `DISCONTINUED` — the Pilot codes a discontinuation as its reason (`ADVERSE EVENT`, `DEATH`, `WITHDRAWAL BY SUBJECT`), which is what the disposition cases use.

### Provenance caveat

Every reference is **machine-derived and AI-selected, and no clinician has reviewed it**. `required_facts` are read straight out of the skill's grounding tool (the anchor's term and day, con-med names, the counts and offsets the tool computed, ratios, values with their units); `required_citations` and `scope_row_ids` are the row ids that tool returned. They say what the rows carry, not what a safety reviewer would consider the point of the narrative. Each case repeats the caveat in its `notes`.

A clinical reviewer's references replace these **under the same file shape**: edit `reference.required_facts` / `required_citations` / `expected_flags` in `golden/<skill>.jsonl` (or add cases), and the graders and the CI gate work unchanged. Reviewed cases will drift from `build-golden.mjs` by design — re-run it only to add cases, and re-apply the reviewed references afterwards.

## What the graders measure

The **rules judge** (`--judge rules`, the default and the CI gate) needs no network and no model:

| metric             | how it is scored                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `faithfulness`     | the share of sentences whose every citation resolves in the rebuilt scope **and** whose every number appears in the rows that sentence cites. Sentences the runtime's validator dropped count against the denominator, so its cleanup cannot hide a model that cited rows no tool returned.            |
| `coverage`         | the share of `required_facts` present in `summary` + sentences, case-insensitively. A fact may not start inside a longer word or number, and one ending in a digit may not run into another digit — `day 1` does not match `day 184`, while `day 111.` at the end of a sentence does.                  |
| `hallucination`    | the share of sentences naming a capitalised term the record does not carry: an ALL-CAPS token of three letters or more, or a Title-case token that does not open a sentence. Checked against every string the scope rows carry (labels, tests, details, categories, units, flags, directions, limits). |
| `style`            | the share of sentences with no match in the forbidden-phrase block of `shared/style-guide.md`, through the runtime's own `forbiddenMatch()`.                                                                                                                                                           |
| `refusals_correct` | 1 when a case that expects a refusal carries that `refused:<reason>` flag, and when a case that expects none is not a refusal.                                                                                                                                                                         |
| `citation_recall`  | the share of `required_citations` some sentence cites. **Reported, not gated.**                                                                                                                                                                                                                        |
| `flags_ok`         | the share of `expected_flags` the draft carries. **Reported, not gated** — the flags are advisory in the skill prompts.                                                                                                                                                                                |

The scope is rebuilt per generation, not trusted: `lib.mjs` re-runs the skill's grounding tool through the runtime's own `scope()`, re-runs each declared tool the draft's `provenance.tool_calls` names, and resolves anything still outstanding through `get_events` / `get_source_row` — the same reads the model itself was allowed to make. A citation therefore proves the row exists and is reachable for this participant; the number check is what ties the claim to it.

The **LLM judge** (`--judge claude`) sends the grounding rows and the draft to the Claude adapter in a plain messages call (no tools) and parses a JSON verdict for faithfulness, coverage, hallucination and style, with a one-line reason each. Its scores replace the rule scores for those four metrics in the report; `refusals_correct`, `citation_recall` and `flags_ok` stay mechanical, and the rule scores are kept alongside under `rules` for comparison. A judge that fails or answers unparseably falls back to the rule scores with a note. It is a second opinion on phrasing a substring check cannot see; it never gates CI.

## The CI gate

`thresholds.json` holds the floors (`faithfulness` 0.95, `coverage` 0.9, `style` 1.0, `refusals_correct` 1.0) and the one ceiling (`hallucination` 0.0), per skill, applied to the **mean across that skill's cases**. `npm test` runs the same gate in-process (`tests/unit/patient-journey-explorer/narratives-evals.test.js`), which also asserts that the committed golden files match a fresh derivation and that the graders fail a draft that invents a name, a number or a citation, or writes a causal claim.

Bumping a skill's `version` in `skills/patient-journey-narratives/<slug>/prompt.md` means re-running the harness and clearing these numbers before the change merges.
