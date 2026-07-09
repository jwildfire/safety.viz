# Histogram requirement coverage

Traceability for the histogram module, per the convention in
[CONTRIBUTING.md](../CONTRIBUTING.md). Two requirement-ID schemes appear.

## Browser evidence (Playwright — `tests/e2e/histogram.spec.js`)

| Requirement ID | Source matrix rows         | Issue | Test                                                              |
| -------------- | -------------------------- | ----- | ----------------------------------------------------------------- |
| SH-CTRL-004    | SH-FUNC-004A, SH-FUNC-004B | #2    | normal range checkbox toggles a stable overlay region             |
| —              | SH-FUNC-011                | #2    | selecting a bar de-emphasizes the bars outside the linked listing |

## Unit evidence (Vitest — `tests/unit/histogram/`)

| Requirement ID             | Source matrix rows | Issue | Test file           |
| -------------------------- | ------------------ | ----- | ------------------- |
| SH-CFG-004..006 (defaults) | SH-CFG-004..006    | #2    | `configure.test.js` |
| SH-LIST-002/003            | —                  | #2    | `listing.test.js`   |

## Source-matrix routing status (125 rows)

- **`manual` (8 rows):** SH-REG-044 carries manual review evidence and is out
  of scope for automated coverage.
- **`planned` (106 rows):** not yet routed to `unit`/`browser` in the
  [source matrix](https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-histogram.md).

**Legacy-API note:** the module ships the pilot's lifecycle API instead.
