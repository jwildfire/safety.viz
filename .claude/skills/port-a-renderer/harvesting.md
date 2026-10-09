# Harvesting a requirement matrix

How the functional requirements of a legacy renderer become a matrix under
[`requirements/`](../../../requirements/). The format the extractor reads, and how to edit
a matrix afterwards, are in [`requirements/README.md`](../../../requirements/README.md).

## Source priority

1. Functional specs in the upstream RhoInc wiki.
2. The data specification and `settings-schema.json`.
3. Existing regression tests and test notes.
4. Example pages and default settings.
5. The README and package metadata.
6. Historical issues and pull requests, where they clarify expected behavior.

## The harvest script

[`scripts/harvest-wiki-requirements.py`](../../../scripts/harvest-wiki-requirements.py)
turns a wiki clone into a first-draft matrix:

```bash
git clone https://github.com/RhoInc/<renderer>.wiki.git ../<renderer>.wiki
python3 scripts/harvest-wiki-requirements.py
npm run requirements
```

- It reads `<renderer>.wiki/` directories beside this checkout; set `WIKI_ROOT` to read
  them from somewhere else, which a linked worktree needs.
- It writes `requirements/<renderer>.md`; set `REQUIREMENTS_OUT` to write elsewhere.
- It never overwrites an existing matrix: those have been reviewed and extended well past
  the raw harvest. `--force` re-harvests a matrix you intend to lose.
- A renderer it does not know needs a row in its `RENDERERS` list: the repository name
  and the ID prefix.

## Extraction rules

- Split compound bullets into atomic requirements, each with a stable ID.
- Preserve the exact clinical intent, but rewrite it as a testable statement.
- Keep a source URL or source file path for every requirement.
- Do not silently drop a requirement that depends on Webcharts behavior.
- Flag an ambiguous requirement for @jwildfire instead of inventing behavior.

## The AI review

Raw harvesting is deliberately broad. Before @jwildfire sees a matrix, review it with one
or more subagents on disjoint renderer scopes. This is a judgment step, not a parser: do
not implement it as a script. Each reviewer gets the harvested matrix, the package's
README and configuration and API docs, the source wiki pages, and the instruction to
review every row as a potential standalone requirement. The reviewer:

- verifies that each row is a standalone, testable requirement;
- merges line-break and settings fragments into the correct parent row;
- removes link, image and overview rows that are not requirements;
- proposes wording for confusing rows;
- flags legacy CAT, viz-library and Webcharts-specific rows that need a scope decision;
- flags statistical or validation-sensitive rows that need explicit review;
- marks anything it cannot settle `needs-jeremy-review` and writes the question down.

AI review is not approval. It makes his review tractable by naming the likely artifacts,
the proposed splits and the open questions. Rows marked `needs-jeremy-review` do not block
documentation, but they are resolved before the renderer's implementation is called
complete. The record of the first review, across all nine renderers, is
[`requirements/history/agentic-ai-review.md`](../../../requirements/history/agentic-ai-review.md).

## Review sequence

1. Harvest the wiki into a broad, source-backed matrix.
2. AI review, row by row.
3. Ask @jwildfire only the decisions that remain ambiguous or product-sensitive.
4. Clean the matrix: apply the accepted splits, merges, drops and rewordings.
5. Implement: map reviewed requirements to tests, demos and evidence, in the same pull
   request as the matrix edit.

## The matrix header

The harvest writes this table without the `AI Review` column; the review adds it.

```markdown
| ID          | Area     | Requirement                                                     | Source                         | Evidence Type | Test/Evidence Link | Status      | AI Review            | Notes |
| ----------- | -------- | --------------------------------------------------------------- | ------------------------------ | ------------- | ------------------ | ----------- | -------------------- | ----- |
| SH-CTRL-001 | Controls | Changing the measure filter changes the displayed distribution. | Upstream wiki functional specs | browser       | TBD                | ai-reviewed | OK for human review. |       |
```

## Vocabularies

Use these values consistently; the matrices already do.

### ID areas

`<PREFIX>-<AREA>-<NUM>`, with the renderer's own prefix (`SH`, `SOE`, `POE`, `WCB`, …):

| Area    | Covers                         |
| ------- | ------------------------------ |
| `DATA`  | data shape and mapping         |
| `CTRL`  | controls                       |
| `CHART` | chart rendering behavior       |
| `LIST`  | listing and detail behavior    |
| `STAT`  | statistical tests, annotations |
| `WARN`  | warnings and errors            |
| `A11Y`  | accessibility                  |
| `PERF`  | performance and responsiveness |

The harvest script also assigns `FUNC`, `CFG`, `API`, `INT`, `EXPORT`, `COUNT`, `REG`,
`USER` and `REQ` from wiki headings; keep an ID once a test is keyed to it.

### Evidence type

| Value            | Meaning                                              |
| ---------------- | ---------------------------------------------------- |
| `unit`           | deterministic pure-function test (Vitest)            |
| `integration`    | DOM or renderer lifecycle test                       |
| `browser`        | end-to-end rendered UI test (Playwright)             |
| `visual`         | screenshot or image comparison                       |
| `manual`         | SME or reviewer confirmation                         |
| `deferred`       | intentionally out of scope, with a rationale         |
| `not-applicable` | legacy behavior intentionally removed or replaced    |
| `planned`        | what the harvest writes before a row has been routed |

### Status

| Value                 | Meaning                                          |
| --------------------- | ------------------------------------------------ |
| `harvested`           | extracted from the wiki, not reviewed yet        |
| `ai-reviewed`         | passed the AI review; not his approval           |
| `needs-jeremy-review` | waiting on a decision from @jwildfire            |
| `reviewed`            | accepted as a real requirement and de-duplicated |
| `implemented`         | the behavior exists in safety.viz                |
| `tested`              | automated or manual evidence exists              |
| `deferred`            | explicitly not part of the current migration     |
| `replaced`            | legacy behavior has a documented replacement     |
| `blocked`             | implementation needs a decision or a dependency  |

## Browser QA note

For a row whose evidence is a manual browser check, record it in this shape:

```markdown
## Browser QA evidence

- Renderer:
- URL:
- Cache token / commit:
- Browser/tool:
- Requirements checked:
- Controls checked:
- Interactions checked:
- Listing/export checked:
- Console result:
- Visible-data sanity check:
- Known gaps:
```
