# safety.viz

Consolidated JavaScript charting library for clinical safety graphics, built on
[Chart.js](https://www.chartjs.org/). Part of the safetyGraphics → gsm
modernization (project P004), mirroring the architecture of
[gsm.viz](https://github.com/Gilead-BioStats/rbm-viz) (the JS library behind
[gsm.kri](https://github.com/Gilead-BioStats/gsm.kri)).

Design: [obot.roadmap#1](https://github.com/jwildfire/obot.roadmap/issues/1) ·
[design doc](https://jwildfire.github.io/obot.roadmap/requirements/design/1_design.html).

## Status

**Scaffolded** ([#1](https://github.com/jwildfire/safety.viz/issues/1)) — repo
layout, build/test stack, and CI are in place. No renderer modules yet; the
histogram lands via [#2](https://github.com/jwildfire/safety.viz/issues/2).

## Layout

```
src/
├── main.js               # public module collection; renderer modules land here
└── data/schema/          # JSON Schema data contracts, one per module
tests/
├── unit/                 # Vitest specs
└── e2e/                  # Playwright specs + fixtures/demo pages
examples/                 # static demo pages (deferred — see examples/README.md)
dist/                     # committed, versioned esbuild bundles
```

## Stack

Chart.js v4 · esbuild (IIFE + ESM bundles to `dist/safety.viz-{version}/`) ·
Vitest · Playwright · Prettier. See [CONTRIBUTING.md](CONTRIBUTING.md) for
commands and the test-naming / traceability conventions.

## Distribution

`dist/safety.viz-{version}/` is committed (not published to npm). Consumers
like `gsm.safety` vendor a specific version at
`inst/htmlwidgets/lib/safety.viz-{version}/`, the precedent set by gsm.kri
vendoring gsm.viz.

Tests are keyed to requirement IDs from the
[safety.agent](https://github.com/jwildfire/safety.agent) requirement
matrices and reference the GitHub issue(s) they evidence — see
[CONTRIBUTING.md](CONTRIBUTING.md).
