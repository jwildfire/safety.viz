# Requirement matrices

One Markdown matrix per renderer — the reviewed source of record for what each chart must do. Rows are harvested from the original [RhoInc](https://github.com/RhoInc) renderer wikis, reviewed, and then extended as the port adds capability beyond the original.

These matrices are the input to the evidence pages published with every release: `npm run requirements` extracts each row's text into `docs/requirements/<module>.json`, and the site build renders that text under the requirement IDs each test is keyed to.

| Matrix                                                     | Module                             | Rows |
| ---------------------------------------------------------- | ---------------------------------- | ---: |
| [safety-histogram.md](safety-histogram.md)                 | histogram                          |  134 |
| [hep-explorer.md](hep-explorer.md)                         | hep-explorer                       |  128 |
| [safety-outlier-explorer.md](safety-outlier-explorer.md)   | outlier-explorer                   |   88 |
| [aeexplorer.md](aeexplorer.md)                             | ae-explorer                        |   74 |
| [safety-results-over-time.md](safety-results-over-time.md) | results-over-time                  |   62 |
| [hep-waterfall.md](hep-waterfall.md)                       | hep-waterfall                      |   57 |
| [safety-delta-delta.md](safety-delta-delta.md)             | delta-delta                        |   48 |
| [qt-explorer.md](qt-explorer.md)                           | qt-explorer                        |   47 |
| [participant-profile.md](participant-profile.md)           | participant-profile                |   68 |
| [ae-timelines.md](ae-timelines.md)                         | ae-timelines                       |   43 |
| [safety-shift-plot.md](safety-shift-plot.md)               | shift-plot                         |   39 |
| [web-codebook.md](web-codebook.md)                         | web-codebook (planned)             |  223 |
| [paneled-outlier-explorer.md](paneled-outlier-explorer.md) | paneled-outlier-explorer (planned) |  114 |

Row counts are the rows the extractor recognizes; they move as requirements are added, split, or superseded.

## How a matrix is read

The extractor ([`scripts/requirements-lib.mjs`](../scripts/requirements-lib.mjs)) walks every Markdown table row in the file and keeps the ones whose **first cell is a requirement ID** — `<PREFIX>-<AREA>-<NUM>` with an optional `A`–`D` suffix, matched by `/^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$/`. The third cell is the requirement text. Header rows, separator rows, and the source-inventory bullets are skipped structurally, so a matrix can carry whatever prose and extra sections it needs around the table.

Consequences worth knowing before editing:

- **The ID column is the contract.** A row whose ID does not match the pattern is invisible to the extractor and its evidence page shows the bare ID from the test, with no text. That is the intended degradation, not a failure.
- **Split rows (`SH-FUNC-012A` / `012B`) resolve individually.** A test tagged with the un-suffixed base ID matches neither, so it degrades to IDs-only.
- **Shared IDs (`API-*`, `SH-API-*` reused across modules) resolve per matrix.** The extract is keyed by module, so a test evidencing another module's ID degrades to IDs-only there too.
- **Text is compared verbatim.** `npm run requirements:check` fails when a committed extract no longer matches its matrix, so a wording edit must be regenerated and committed.

## Adding or changing requirements

The matrix and the code that satisfies it live in the same repo, so they belong in the **same pull request**:

1. Edit `requirements/<matrix>.md` — add rows with the module's ID prefix, or amend existing text.
2. Run `npm run requirements` to regenerate `docs/requirements/<module>.json`.
3. Commit the matrix edit and the regenerated extract together with the implementation and its tests.

A new renderer needs no script changes: add its entry to [`site/config.json`](../site/config.json) with a `matrix` filename, drop the matrix here, and its extract appears on the next run. Until a matrix exists, the module's evidence page shows requirement IDs only.

The `Status` and `AI Review` columns record review provenance. A row is not Jeremy-approved just because AI review flagged it — AI review only makes the human review tractable by identifying likely artifacts, proposed splits, and open questions.

## Provenance

These matrices were harvested and reviewed in [`jwildfire/obot.agent`](https://github.com/jwildfire/obot.agent) and moved here in [obot.roadmap#64](https://github.com/jwildfire/obot.roadmap/issues/64) so that a safety.viz behavior change and its requirement rows land in one PR instead of two coordinated ones. Pre-move history for each file is in obot.agent under `docs/requirements/`. The harvest-phase review record stays there as [`docs/requirements/agentic-ai-review.md`](https://github.com/jwildfire/obot.agent/blob/main/docs/requirements/agentic-ai-review.md), alongside the Jeremy-facing [grill queue](https://github.com/jwildfire/obot.agent/blob/main/interviews/p004-grill-queue.md).
