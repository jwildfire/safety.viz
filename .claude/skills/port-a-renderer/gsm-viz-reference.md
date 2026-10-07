> Moved verbatim from `jwildfire/obot.agent` `docs/gsm-viz-reference.md` on 2026-10-07. It was written in May 2026, before the renderers were consolidated into safety.viz: the "Testing pattern" section describes Jest where this repository uses Vitest and Playwright, and the "Implications for Safety Histogram" layout became `src/histogram/`.

# gsm.viz Reference Notes

Reference implementation: https://github.com/Gilead-BioStats/gsm.viz
Examples site: https://gilead-biostats.github.io/gsm.viz/

## Why it matters

`gsm.viz` is the main JavaScript visualization framework used underneath GSM reporting. It is the best current reference for how nextgen SafetyGraphics renderers should be structured when replacing legacy `webcharts` renderers with modern Chart.js-based modules.

## Technology pattern to reuse

`gsm.viz` uses:

- ES modules
- Chart.js 3
- D3 7 for data utilities where useful
- Chart.js plugins for annotations, datalabels, and box/violin plots
- esbuild for bundling
- Jest 29 with jsdom and `jest-canvas-mock`
- Prettier for formatting
- static examples deployed to GitHub Pages

These choices are a good starting point for migrated renderers unless a specific clinical display needs a different rendering layer.

## Module architecture

Each chart follows a consistent flow:

1. entry function receives element, data, config, and optional auxiliary data
2. `checkInputs()` validates data/config against JSON schemas
3. `configure()` merges defaults, metadata, and user config
4. `addCanvas()` creates or replaces a canvas and attaches custom events
5. `structureData()` transforms input records into Chart.js datasets
6. `getPlugins()` and `getScales()` build Chart.js options
7. `new Chart(canvas, { data, options, plugins })` renders the chart
8. helper methods are attached to the returned chart for updates

This is the preferred nextgen pattern for SafetyGraphics renderers.

## Files to mirror conceptually

- `src/main.js` exports the public module collection and registers global Chart.js plugins.
- `src/<chart>.js` is the public entrypoint for one chart.
- `src/<chart>/checkInputs.js` validates arguments.
- `src/<chart>/configure.js` defines defaults and derived config.
- `src/<chart>/structureData.js` maps domain data to Chart.js datasets.
- `src/<chart>/getPlugins.js` defines tooltip/title/annotation behavior.
- `src/<chart>/getScales.js` defines axes.
- `src/<chart>/updateData.js` and `updateConfig.js` preserve update lifecycle.
- `src/data/schema/*.json` stores machine-readable data requirements.
- `tests/` verifies schemas, configuration, data transforms, and integration behavior.
- `examples/` provides reviewable static HTML examples.

## Testing pattern to reuse

`gsm.viz` tests use Jest with a strong emphasis on:

- schema/data shape checks
- configuration output checks
- pure transformation checks
- jsdom/canvas-backed renderer tests
- coverage for helper utilities

For SafetyGraphics nextgen work, combine this pattern with the harvested RhoInc wiki functional requirements. The wiki defines what must happen; the `gsm.viz` pattern defines how to make that behavior testable.

## Implications for Safety Histogram

The Safety Histogram migration should use a `gsm.viz`-style structure:

```text
src/main.js
src/safetyHistogram.js
src/safetyHistogram/checkInputs.js
src/safetyHistogram/configure.js
src/safetyHistogram/structureData.js
src/safetyHistogram/getPlugins.js
src/safetyHistogram/getScales.js
src/safetyHistogram/updateData.js
src/safetyHistogram/updateConfig.js
src/data/schema/safetyHistogram*.json
examples/safetyHistogram/
tests/safetyHistogram/
```

The first implementation pass should not directly rewrite every Webcharts callback. Instead:

1. harvest requirements from the RhoInc wiki,
2. define schemas and fixtures,
3. extract pure data/binning/statistics functions,
4. test those functions,
5. then build the Chart.js rendering adapter around tested data structures.

## Differences from gsm.viz to handle explicitly

SafetyGraphics renderers have requirements that are more clinically display-specific than generic RBQM charts:

- dynamic measure selection
- binning algorithms and bin-boundary controls
- normal range overlays
- linked detail listings
- grouped small multiples
- statistical annotations such as normality/distribution comparison p-values
- browser warnings/errors for invalid mappings

These should be represented as requirements and tests, not hidden inside Chart.js config.
