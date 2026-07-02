# safety.viz

Consolidated JavaScript charting library for clinical safety graphics, built on
[Chart.js](https://www.chartjs.org/). Part of the
[safetyGraphics → gsm modernization](https://obot-claw.github.io/) (project P004),
mirroring the architecture of [gsm.viz](https://github.com/Gilead-BioStats/rbm-viz)
(the JS library behind [gsm.kri](https://github.com/Gilead-BioStats/gsm.kri)).

## Status

**Pre-scaffold.** The repo was created ahead of development so work can land as it
happens. The planned shape:

- One module per safety renderer, migrated from the
  [RhoInc safety-* charts](https://github.com/obot-claw) in order:
  histogram (pilot) → shift plot → the remaining seven.
- Chart.js v4, bundled with esbuild; unit tests with Vitest, rendering evidence
  with Playwright.
- Tests keyed to requirement IDs from the
  [safety-agent](https://github.com/obot-claw/safety-agent) requirement matrices.
- Consumed by `Widget_*.R` htmlwidget bindings in
  [gsm.safety](https://github.com/obot-claw/gsm.safety).

Requirements and design live in the
[obot-claw hub](https://github.com/obot-claw/obot-claw.github.io/issues?q=label%3Atype%3Arequirement).

> Note: hosted under `jwildfire` for now; may transfer to the `obot-claw` org later.
