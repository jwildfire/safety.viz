# Data schemas

JSON Schema data contracts for each renderer module's public `data` input land
here, one file per module (e.g. `histogram.schema.json` via #2). Each module's
`checkInputs.js` validates against its schema.

Current schemas:

- [`histogram.json`](histogram.json) — the histogram module's data contract (#2)
- [`shift-plot.json`](shift-plot.json) — the shift-plot module's data contract (#14)
- [`results-over-time.json`](results-over-time.json) — the results-over-time module's data contract (#27)
