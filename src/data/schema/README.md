# Data schemas

JSON Schema data contracts for each renderer module's public `data` input land
here, one file per module (e.g. `histogram.schema.json` via #2). Each module's
`checkInputs.js` validates against its schema.

Current schemas:

- [`histogram.json`](histogram.json) — the histogram module's data contract (#2)
- [`shift-plot.json`](shift-plot.json) — the shift-plot module's data contract (#14)
- [`results-over-time.json`](results-over-time.json) — the results-over-time module's data contract (#27)
- [`hep-explorer.json`](hep-explorer.json) — the hep-explorer module's data contract (#43)
- [`ae-explorer.json`](ae-explorer.json) — the ae-explorer module's data contract (#60)
- [`patient-journey-explorer.json`](patient-journey-explorer.json) — the patient-journey-explorer module's data contract (#142): six per-domain row schemas as local `$defs`; documentation plus each domain's `requiredSettings`, not a row validator

One file here is not a chart's data contract:

- [`portfolio.json`](portfolio.json) — the shape of the portfolio manifest, [`../portfolio.json`](../portfolio.json) (#138): the standard domain set (`subject`, `ae`, `bds`, `eg`) and, for every chart module, the domains it reads and the column each of its settings defaults to. `tests/unit/portfolio/manifest.test.js` fails when a chart's schema and the manifest disagree.
