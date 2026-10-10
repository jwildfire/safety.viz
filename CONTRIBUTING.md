# Contributing

## Setup

```sh
npm ci
```

## Commands

| Command                                   | Purpose                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                           | esbuild `src/main.js` into versioned IIFE + ESM bundles under `dist/safety.viz-{version}/`                                                                                                                                                                                                                                        |
| `npm run build:check-dist`                | Rebuild to a temp dir and fail if committed `dist/` has drifted from `src/`                                                                                                                                                                                                                                                       |
| `npm run demo-data:check`                 | Rerun the demo-data generators to a temp dir and fail if `site/data/` has drifted                                                                                                                                                                                                                                                 |
| `npm run bio-viz:check` / `:check-source` | Fail if `site/vendor/bio.viz/`, bio.viz's vendored bundle for the demo app, differs from its record / from the bio.viz commit the record names; `node scripts/vendor-bio-viz.mjs` copies it again from bio.viz `dev`, or `--tag`                                                                                                  |
| `npm run statistics:check`                | Same for `site/vendor/gsm.bio/statistics.R`, the file R on request gives R (`:check-source` against the commit); `node scripts/vendor-statistics.mjs` copies it again from gsm.bio `dev`, or from a release with `--tag v0.3.0`                                                                                                   |
| `npm run gsm-workflows:check`             | Same for the gsm workflow files under `site/vendor/gsm.mapping/`, `gsm.kri/` and `gsm.reporting/` (`:check-source` against each release tag); `node scripts/vendor-gsm-workflows.mjs` copies them again                                                                                                                           |
| `npm run gsm-viz:check`                   | Same for gsm.viz's built bundle and licence in `site/vendor/gsm.viz/`, for the RBQM tab (`:check-source` against the release tag); `node scripts/vendor-gsm-viz.mjs` copies them again from the tag `scripts/vendor-lib.mjs` names                                                                                                |
| `npm run rbqm-study:check`                | Same for the RBQM demo study's raw files in `site/data/rbqm/` (`:check-source` against the demo-301 commit); after copying them again, `node scripts/rbqm-reference.mjs` writes desktop R's rows again, and `Rscript scripts/rbqm-labs-check.R` shows the four-column labs file still gives the lab metric the whole file's rows. |
| `node scripts/derive-app-statistics.mjs`  | Record what the app's biomarker charts ask R for, then `Rscript scripts/app-statistics.R` answers it in desktop R (`tests/fixtures/app-statistics/`)                                                                                                                                                                              |
| `npm run build:app`                       | Bundle the demo app (`src/app/`) into `build/app/` (gitignored): `safety.viz-app.js` for the browser tests and `safety.viz-app.html`, the single file that runs offline; the site build writes its own copies into `_site/demo/`                                                                                                  |
| `npm run demo`                            | Build the demo app's directory into `build/demo/` (gitignored), serve it to this machine only and open it; `scripts/install-demo.mjs` is the one-file installer that clones a release and runs this                                                                                                                               |
| `node scripts/build-app-fixture.mjs`      | Regenerate the renamed-column study under `tests/e2e/fixtures/app/` that the demo app's browser tests load                                                                                                                                                                                                                        |
| `npm test`                                | Vitest unit tests (`tests/unit/`)                                                                                                                                                                                                                                                                                                 |
| `npm run test:e2e`                        | Playwright browser tests (`tests/e2e/`)                                                                                                                                                                                                                                                                                           |
| `npm run format` / `npm run format:check` | Prettier write / check                                                                                                                                                                                                                                                                                                            |
| `npm run evidence` / `evidence:check`     | (Re)build `docs/evidence/<module>/evidence.json` from a fresh run / CI freshness guard                                                                                                                                                                                                                                            |
| `npm run requirements` / `:check`         | (Re)build `docs/requirements/<module>.json` requirement-text extracts / CI freshness guard                                                                                                                                                                                                                                        |
| `npm run docs:api`                        | Generate the `_api/<module>.json` API data artifact from JSDoc + the data schema, and `_api/kit.json` for the kit                                                                                                                                                                                                                 |
| `npm run site`                            | Build the docs site into `_site/` (gitignored); fails on broken links/missing screenshots                                                                                                                                                                                                                                         |

`dist/` is committed — after any change under `src/`, run `npm run build`
and commit the regenerated bundle alongside it. CI's drift check fails the
build otherwise.

## The kit is public surface

`src/kit.js` re-exports, unchanged, the shared parts every chart is built from — the shell and its control builders, the filter contract, the axis-limit helpers, the record listing, the participant rail functions, the box drawing, the measure list, the Kaplan–Meier estimator and the bundled Chart.js constructor — as `SafetyViz.kit`, for a second chart library loaded beside safety.viz. The members are listed in [`requirements/kit.md`](requirements/kit.md) and documented on the site's kit page.

From v1.9.0 a change to any kit member is a breaking change: its name, its signature, what it returns, or the elements and class names it produces. So before editing an exported function in `src/shell.js`, `src/filters.js`, `src/axis-limits.js`, `src/histogram/listing.js`, `src/profile-host.js`, `src/box-whisker.js`, `src/measure-list.js` or `src/time-to-event/km.js`, check whether it is on the kit; if it is, the change needs a NEWS entry that says it breaks the kit. Adding a member is not breaking: add it to `src/kit.js`, to its `Kit` typedef (`npm run docs:api` fails without it), to the matrix and to the list in `tests/unit/kit/kit.test.js`.

## How a pull request merges

Branch rulesets run the merge. An increment pull request targets `dev`, opens non-draft with auto-merge enabled, and GitHub lands it once CI is green — nobody is asked to review it. A release candidate targets `main` and merges only on @jwildfire's approving review, which `main`'s ruleset requires. The rules themselves are the obot program's GitHub-flows standard, applied from the hub's `scripts/github-flows.sh`.

## How the check is laid out

`dev` requires one check, "Build, format, and test". It is the last of four jobs in `.github/workflows/ci.yml`:

| Job                                | What it runs                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Static checks and unit tests       | Formatting, the build, the fresh-build check, the six vendored-source checks, the unit tests, the docs site build, the requirement-text guard |
| Browser tests without real R       | Every browser test that does not carry the tag `@real-r`                                                                                      |
| Browser tests with real R          | Every browser test that carries it                                                                                                            |
| Build, format, and test (the gate) | Fails unless the three jobs above succeeded, then merges the two browser reports and runs the evidence guard on every result                  |

The first three run side by side, so each test runs once and the check takes about as long as its longest job. What keeps it honest:

- The gate always runs, and its first step fails unless each of the three jobs ended in success. GitHub counts a required job that was skipped as passed, so a gate that could be skipped, or that left a job out of its `needs`, would report green without every test having run.
- The two browser jobs take their tests from one value, `REAL_R_TAG`: one runs the tests that carry the tag and the other the rest, so every browser test runs in exactly one job.
- The evidence guard reads the unit results and the merged browser results. A test that ran in neither browser job is missing from them and the guard names it; a test that ran in both appears twice and the guard refuses the results.
- Results pass between jobs as artifacts of the same run, under fixed names, and are unpacked in the runner's temporary directory, never in the checkout.
- Every job names the `ubuntu-24.04` image and has a time limit, and the browser is installed with its system packages. The screenshots are compared on that image, so it changes by a commit to the workflow and not when GitHub moves `ubuntu-latest`.
- The check runs on `pull_request` and `push` with a read-only token. It never moves to `pull_request_target` or `workflow_run`, and nothing in it continues on error.

`tests/unit/ci-workflow.test.js` reads the workflow file and fails unless all of this is true, so a change to the layout is a change to that test, made in the same pull request.

To tag a browser test that starts real R, give `test` the tag as its second argument and leave the name as it is, because the evidence files are keyed on the name:

```js
// prettier-ignore
test('APP-R-032: R in the browser installs …', { tag: '@real-r' }, async ({ page }) => {
```

- Tag a test when it starts R with gsm's packages; those take about a minute each. The `// prettier-ignore` line keeps Prettier from re-indenting the whole test to fit the tag.
- A real-R test left untagged still runs, in the other browser job. That job gets slower; no test is skipped.
- When a browser test fails, the merged HTML report is the `playwright-report` artifact of the run.

## Traceability convention

Test names are keyed to requirement IDs from the
[requirement matrices](https://github.com/jwildfire/safety.viz/tree/HEAD/requirements)
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
than fetched at build time. The matrices themselves live in this repo under
[`requirements/`](requirements/README.md) — one Markdown file per renderer,
the reviewed source of record. `npm run requirements` regenerates the extracts
from them (`REQUIREMENTS_SRC` overrides the source directory if you ever need
to point it elsewhere). The set of modules is data-driven from
`site/config.json`, so a new renderer needs no edits — add its config entry
with the `matrix` filename and its extract appears on the next run. A module
whose matrix has not been harvested yet is skipped and its evidence page simply
shows requirement IDs. `npm run requirements:check` (a CI step) fails if a
committed extract has drifted from its matrix.

Because matrix and code are now in the same repo, a behavior change and the
requirement rows that describe it belong in the **same PR**: edit
`requirements/<matrix>.md`, run `npm run requirements`, and commit the
regenerated extract alongside the implementation.

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

That run rewrites only the baselines whose capture now differs beyond the 2%
comparison limit. A visible change that stays under the limit leaves its
baseline stale. To rewrite named baselines whatever the difference, give the
workflow's optional `refresh` input a Playwright `--grep` pattern: after the
default run it reruns the matching tests with `--update-snapshots=all`, then
rebuilds `evidence.json`. Every other baseline is left as the default run left
it.

```bash
gh workflow run evidence-update.yml -R jwildfire/safety.viz --ref <branch> -f refresh='SH-CTRL-006'
```

Besides `module` and `records`, each `evidence.json` carries provenance in
three top-level keys — `generatedAt` (ISO timestamp), `environment`
(`{ os, node, playwright, chromium }` versions), and `run` (`{ id, url }` of
the GitHub Actions run, `null` for local runs). The freshness guard
(`npm run evidence:check`, run by CI) ignores provenance and compares only the
record set and pass/fail statuses, keyed by test title — so don't rename tests
without regenerating evidence.

Run by hand, `npm run evidence:check` runs both suites itself. CI runs each
suite once, in jobs of their own (see "How the check is laid out"), and its
gate hands the guard the two JSON reports:
`npm run evidence:check -- --vitest-json=<file> --playwright-json=<file>`.
Given the reports it runs no suite, and it exits with an error, naming the
file, on a report that is missing, empty or not a clean run of every test.

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
- [ ] **R widget**: the renderer's `gsm.safety` widget is delivered — or its
      delivery is a **filed, milestoned requirement** on the hub, named in the
      renderer's own requirement from the start (@jwildfire, 2026-08-15:
      "Every renderer gets an R widget"; hub
      [obot.roadmap#164](https://github.com/jwildfire/obot.roadmap/issues/164)).
      An informal "widget follows later" does not satisfy this pillar;
      gsm.safety's `safety-viz-parity` CI enforces it against every release,
      with `.github/parity-allowlist.yaml` there holding the cited deferrals.

`npm run site` must build clean (it validates internal links and screenshot
references), and the renderer's requirement moves to Released on the hub board
only after the site entry deploys.
