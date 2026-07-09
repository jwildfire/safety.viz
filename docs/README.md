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

No renderer modules exist yet (the histogram lands via #2), so no
`<module>-coverage.md` file exists yet either — add one alongside each
module's first PR.
