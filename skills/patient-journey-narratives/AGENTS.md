# patient-journey-narratives skills

Prompt templates, output schemas and eval anchors for the AI narrative layer of the safety.viz Patient Journey Explorer ([safety.viz#146](https://github.com/jwildfire/safety.viz/issues/146), requirement [obot.roadmap#351](https://github.com/jwildfire/obot.roadmap/issues/351)). The runtime that executes them is `src/patientJourneyNarratives/`; this folder is data, compiled into `src/patientJourneyNarratives/skills.generated.js` by `scripts/narratives/build-skills.mjs` (run by `npm run build`). Edit the files here, never the generated module.

## Layout

```
shared/system-prompt.md      the base system prompt every skill starts from
shared/style-guide.md        register, hedging vocabulary, the forbidden-phrase block the validator loads
shared/refusal-catalog.md    the refused:<reason> flags and what the card says for each
<skill>/prompt.md            YAML front matter (skill, version, model_hint, tools, grounding) + the skill prompt
<skill>/schema.json          definitions.Input (the run() inputs), definitions.Draft (what the model submits), definitions.Output
<skill>/examples.jsonl       one JSON object per line: { inputs, reference } eval anchors on CDISC Pilot 01
<skill>/README.md            what the skill is for, when not to use it, what it renders as
```

## The five skills

| Slug              | Scope                                         | Grounding tool              | Renders as                                     |
| ----------------- | --------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `event-context`   | one anchored event and its ±window            | `get_context_window`        | card at the top of the context panel           |
| `subject-summary` | the whole journey of one participant          | `get_subject_overview`      | card above the lanes: blurb, expandable        |
| `lab-trajectory`  | one lab test over the study                   | `get_lab_series`            | card in the tray beneath the lanes, on request |
| `dose-journey`    | exposure and every dose change                | `get_dose_history`          | card in the tray beneath the lanes, on request |
| `disposition`     | what the record shows around end of treatment | `get_events(DS)` + overview | card in the tray beneath the lanes, on request |

## How a skill is invoked

1. The runtime validates the inputs against `definitions.Input`.
2. It runs the skill's **grounding** tool itself (front matter `grounding`) and hashes the rows: that hash is the cache key and the draft's `input_hash`. Nothing in scope → `refused:insufficient-data`, no model call.
3. It builds the system prompt: `shared/system-prompt.md`, then the skill prompt body, then the sentence cap from the schema.
4. The first user message carries the inputs and the grounding rows. The model may call the other declared tools; every row a tool returns joins the citation scope.
5. The model calls `submit_draft` (its `input_schema` is `definitions.Draft`). The validator checks the schema, resolves every citation against the scope, applies the forbidden-phrase block, and truncates to the cap. One retry with the errors fed back; then a refusal draft.
6. The runtime attaches `provenance` and `status: "draft"` and caches by `skill@version` + `input_hash`.

## Safety rules (enforced, not advisory)

- The model reads rows through the tools and nothing else. There is no retrieval index and no free-text data.
- A sentence with a citation that no tool returned in this generation is dropped and the drop is recorded in `provenance.dropped`.
- The forbidden-phrase block in the style guide rejects causal, diagnostic, treatment, prognostic and re-identifying language.
- `status` is `draft` on every emit. Acceptance is a host-application decision surfaced through `on_narrative_action`; the runtime never marks anything accepted.

## Refusal cases

See `shared/refusal-catalog.md`. A refusal is a schema-valid draft with no sentences and one `refused:<reason>` flag, with full provenance, so it is reproducible and the card can say why.

## Versioning

Bump `version` in a skill's front matter whenever its prompt or schema changes in a way that could change output. The eval harness (`tests/evals/patient-journey-narratives/`) keys its thresholds by `skill@version`; a bump must clear them before it merges.
