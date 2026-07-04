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

qcthat itself doesn't support JS test frameworks yet; this issue-linked
naming convention future-proofs the evidence until full qcthat-compatible
reporting for the JS stack lands (tracked as
[obot.roadmap#15](https://github.com/jwildfire/obot.roadmap/issues/15)).
