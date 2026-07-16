# Contributing

## Setup

```sh
npm ci
```

## Commands

| Command                                   | Purpose                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run build`                           | esbuild `src/main.js` into versioned IIFE + ESM bundles under `dist/safety.viz-{version}/` |
| `npm run build:check-dist`                | Rebuild to a temp dir and fail if committed `dist/` has drifted from `src/`                |
| `npm test`                                | Vitest unit tests (`tests/unit/`)                                                          |
| `npm run test:e2e`                        | Playwright browser tests (`tests/e2e/`)                                                    |
| `npm run format` / `npm run format:check` | Prettier write / check                                                                     |
| `npm run evidence` / `evidence:check`     | (Re)build `docs/evidence/<module>/evidence.json` from a fresh run / CI freshness guard     |
| `npm run requirements` / `:check`         | (Re)build `docs/requirements/<module>.json` requirement-text extracts / CI freshness guard |
| `npm run docs:api`                        | Generate the `_api/<module>.json` API data artifact from JSDoc + the data schema           |
| `npm run site`                            | Build the docs site into `_site/` (gitignored); fails on broken links/missing screenshots  |

`dist/` is committed — after any change under `src/`, run `npm run build`
and commit the regenerated bundle alongside it. CI's drift check fails the
build otherwise.

## Traceability convention

Test names are keyed to requirement IDs from the
[safety.agent matrices](https://github.com/jwildfire/safety.agent/tree/main/docs/requirements)
and reference the GitHub issue(s) they evidence, in qcthat's `(#N)` style:

```js
test('SH-CTRL-004: normal range checkbox displays overlay when available (#N)', …)
```

where `#N` is the safety.viz implementation issue for the work. The
matrix's `Evidence Type` column routes each row: `unit` rows → Vitest,
`browser` rows → Playwright.

Scaffold/infrastructure tests that aren't tied to a specific safety.agent
requirement (like the placeholder smoke tests in this repo) omit the `SH-*`
prefix but still carry the `(#N)` issue reference, e.g. `tests/unit/main.test.js`
and `tests/e2e/smoke.spec.js` both reference `(#1)`.

Each renderer module also maintains a coverage table under `docs/` mapping
requirement ID → issue → test file — see [docs/README.md](docs/README.md)
for the template. Development follows red-green TDD: matrix row → failing
test → minimal implementation.

### Requirement text on the evidence pages

So the evidence pages can show what each test evidences without leaving the
page, the reviewed requirement **text** is vendored into
`docs/requirements/<module>.json` (`{ module, matrix, requirements: { id: text } }`)
and rendered beneath each ID in the evidence table's Requirement column. The
site build is a pure function of the repo tree, so the text is committed rather
than fetched at build time. `npm run requirements` regenerates the extracts
from the matrices; it reads them from `REQUIREMENTS_SRC` (default the sibling
`../obot.agent/docs/requirements` checkout). The set of modules is data-driven
from `site/config.json`, so a new renderer needs no edits — add its config
entry with the `matrix` filename and its extract appears on the next run. A
module whose matrix has not been harvested yet is skipped and its evidence page
simply shows requirement IDs. `npm run requirements:check` (a CI step that
checks out the public `obot.agent`) fails if a committed extract has drifted
from its matrix.

qcthat itself doesn't support JS test frameworks yet; this issue-linked
naming convention future-proofs the evidence until full qcthat-compatible
reporting for the JS stack lands (tracked as
[obot.roadmap#15](https://github.com/jwildfire/obot.roadmap/issues/15)).

## Evidence pipeline

Each renderer module owns one evidence set: `docs/evidence/<module>/` holds
`evidence.json` plus the canonical screenshots. `npm run evidence` runs Vitest
and Playwright **once each** and routes every test record to its module by
test-file path:

- `tests/unit/<module>/**` → `<module>`
- `tests/e2e/<module>.spec.js` → `<module>`
- everything else (`site.spec.js`, `smoke.spec.js`, `tests/unit/main.test.js`,
  `tests/unit/evidence.test.js`, `tests/unit/api/`, `tests/unit/site/`) is
  shared scaffold evidence, included in **every** module's `evidence.json`

`<module>` must match a `module` entry in `site/config.json` (any status) —
that registry is the module universe, so plugging a new renderer in takes no
pipeline edits: add the config entry, name the test paths as above, and its
`docs/evidence/<module>/evidence.json` appears on the next `npm run evidence`.

In browser specs, capture evidence screenshots with the shared helper — the
module (and so the output directory) is derived from the spec's file name:

```js
import { captureEvidence } from './evidence.js';
await captureEvidence(page, 'SSP-CHART-001', 'baseline-scatter');
// → docs/evidence/shift-plot/SSP-CHART-001-baseline-scatter.png (from shift-plot.spec.js)
```

Baselines are canonical to the Linux CI runner: on Linux `captureEvidence` is
a visual-regression assertion; on macOS it writes a preview under
`test-results/evidence-preview/<module>/` instead. Refresh baselines with the
**evidence-update workflow** (Actions tab), which runs
`npm run evidence:update` on the canonical environment and commits
`docs/evidence/` back to the branch.

Besides `module` and `records`, each `evidence.json` carries provenance in
three top-level keys — `generatedAt` (ISO timestamp), `environment`
(`{ os, node, playwright, chromium }` versions), and `run` (`{ id, url }` of
the GitHub Actions run, `null` for local runs). The freshness guard
(`npm run evidence:check`, run by CI) ignores provenance and compares only the
record set and pass/fail statuses, keyed by test title — so don't rename tests
without regenerating evidence.

## Renderer definition of done

Per [obot.roadmap#21](https://github.com/jwildfire/obot.roadmap/issues/21), a
renderer module is **not done** — and its migration requirement is not
Released — until its entry on the
[docs site](https://jwildfire.github.io/safety.viz/) is complete:

- [ ] **Gallery card**: `site/config.json` entry flipped to `available`, with
      a hero screenshot chosen from the committed evidence set.
- [ ] **Live demo page**: mounts the committed `dist/` bundle against
      committed real example data (`site/data/`, built from the canonical
      pharmaverseadam CDISC Pilot 01 source — see
      [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)) with the full control
      panel active (`site/demo/<module>.js`).
- [ ] **Shared shell chrome**: the module renders into the shared layout from
      `src/shell.js` (collapsible `sv-*` control sidebar + main-column slots,
      see #17) rather than rolling its own shell or styles — enforced per
      available renderer by `tests/e2e/site.spec.js`.
- [ ] **Evidence page**: `docs/<module>-coverage.md` +
      `docs/evidence/<module>/` (evidence.json + screenshots) green for every
      matrix-routed row.
- [ ] **API reference**: JSDoc on the whole public surface —
      `npm run docs:api` fails on gaps — plus the schema-derived data
      contract.

`npm run site` must build clean (it validates internal links and screenshot
references), and the renderer's requirement moves to Released on the hub board
only after the site entry deploys.
