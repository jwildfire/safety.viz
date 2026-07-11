# docs/

Per-module requirement-coverage tables live here: one `<module>-coverage.md`
file per renderer, mapping [safety.agent requirement-matrix](https://github.com/jwildfire/safety.agent/tree/main/docs/requirements)
rows to the safety.viz issue that implements them and the test file that
evidences them. This is the qcthat-style traceability artifact on the JS side
(see [CONTRIBUTING.md](../CONTRIBUTING.md) for the full convention).

Template:

| Requirement ID | Issue | Test file                     |
| -------------- | ----- | ----------------------------- |
| SH-CTRL-004    | #12   | `tests/e2e/histogram.spec.js` |

Current coverage tables:

- [`histogram-coverage.md`](histogram-coverage.md) — the histogram module (#2)
- [`shift-plot-coverage.md`](shift-plot-coverage.md) — the shift-plot module (#14)
- [`delta-delta-coverage.md`](delta-delta-coverage.md) — the delta-delta module (#25)
- [`results-over-time-coverage.md`](results-over-time-coverage.md) — the results-over-time module (#27)
