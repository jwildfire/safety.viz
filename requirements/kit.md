# kit requirements matrix

> Requirement matrix for the safety.viz **kit**: the parts every chart already shares, exported from the bundle as one object so a second chart library on the same page builds from them instead of copying them. Not a renderer: it is what the renderers are built from. Requirement IDs use the prefix **KIT** with these areas: **API** (what the kit holds and that each member is the function the charts use), **USE** (a page built from the committed bundle and the kit alone), **DOC** (the API reference).

## Requirement context

- Requirement: [obot.roadmap#354](https://github.com/jwildfire/obot.roadmap/issues/354) — safety.viz's shared parts opened to a second library. Objective: [obot.roadmap#353](https://github.com/jwildfire/obot.roadmap/issues/353). Design: [353_design.html](https://jwildfire.github.io/obot.roadmap/requirements/design/353_design.html) (Decisions, Repositories, The boundary).
- Implementation: [safety.viz#154](https://github.com/jwildfire/safety.viz/issues/154).
- Who uses it: bio.viz, a second chart library that is loaded beside safety.viz on a page and never bundles it.

## Scope

**This matrix** covers one additive change: `src/main.js` gains the named export `kit`, assembled in `src/kit.js`. Nothing is moved, renamed or given a new signature; no chart, schema or settings default changes; the committed bundle differs only by the added export.

**The kit is public surface from v1.9.0.** A change to any member — its name, its signature, what it returns, or the elements and class names it produces — is a breaking change. Adding a member is not.

**One member follows a chart's Experimental status.** `kmEstimate` is the Time-to-Event Explorer's estimator, and the Explorer ships Experimental until an external clinical review confirms its Kaplan–Meier implementation ([obot.roadmap#182](https://github.com/jwildfire/obot.roadmap/issues/182)). Its estimates, intervals and at-risk counts may change after that review without counting as a breaking change; its name and arguments are kept. The other thirty-five members are public surface in full ([#193](https://github.com/jwildfire/safety.viz/issues/193)).

## The shape, and why

- **Flat.** Members sit directly on the kit under the names their modules already export (`SafetyViz.kit.renderShell`, not `SafetyViz.kit.shell.renderShell`). The names are unique across the eight modules, and a flat list keeps the layout of `src/` out of the contract: a function can move between files without its path on the kit changing.
- **Frozen.** Two libraries share the object on one page, so neither can replace, add or remove a member for the other.
- **Named and on the default collection.** `kit` is a named export of `src/main.js` and, like every other export, a key of the default export, so `SafetyViz.kit`, `SafetyViz.default.kit` and `import { kit }` are the same object.

## Members

Thirty-six, in the kit's own order.

| From | Members |
|---|---|
| `chart.js` | `Chart` |
| `src/shell.js` | `createElement`, `option`, `multiSelect`, `applyShellStyles`, `renderShell`, `controlBuilders`, `renderViewSelector` |
| `src/filters.js` | `ALL_VALUE`, `normalizeFilterSpec`, `initFilterState`, `reconcileFilters`, `filterMatches`, `renderFilterControl` |
| `src/axis-limits.js` | `limitDigits`, `formatLimit`, `syncAxisLimits`, `seedLimitInput`, `applyLimitEdit`, `clearAxisLimits` |
| `src/histogram/listing.js` | `renderListing`, `searchRows`, `sortRows`, `paginate`, `buildCsv`, `exportCsv` |
| `src/profile-host.js` | `buildProfileRows`, `mountProfileRail`, `unmountProfileRail`, `syncProfileRail`, `resetProfileRail` |
| `src/box-whisker.js` | `drawBoxWhisker`, `boxWhiskerPlugin` |
| `src/measure-list.js` | `resolveMeasureList`, `presentMeasures` |
| `src/time-to-event/km.js` | `kmEstimate` |

**One member joined after the task was written.** The task lists thirty-five members. While this work waited for v1.8.0, the v1.8.0 review ([safety.viz#166](https://github.com/jwildfire/safety.viz/issues/166), [#171](https://github.com/jwildfire/safety.viz/pull/171)) added `reconcileFilters` to `src/filters.js` and made every chart call it as it builds its filter controls. It is part of the filter contract the task names, and a second library whose filters reconciled differently would be exactly the drift the kit exists to prevent, so it is the thirty-sixth member. The same review changed what `normalizeFilterSpec` does with `start`: it now only sets what the filter opens on, and only `all: false` removes the All option.

**Left out, deliberately.** Two things those modules export are not on the kit: the status label (`statusLabel`, `chartStatus` and their helpers in `src/shell.js`, which replaced `prototypeBanner` and `experimentalBanner` in v1.11.0), whose wording is safety.viz's own release status, and `hexToRgba` (`src/box-whisker.js`), a colour helper private to the box drawing. Neither is in the task's list. Either can be added later without breaking anything; a member cannot be taken away.

## Requirements

| ID | Area | Requirement | Source | Evidence Type | Test/Evidence Link | Status | AI Review | Notes |
|---|---|---|---|---|---|---|---|---|
| KIT-API-001 | API | `src/main.js` exports the kit by name, and the default collection carries the same object. | safety.viz src/main.js; src/kit.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | So the script-tag bundle's global carries `SafetyViz.kit`. |
| KIT-API-002 | API | The kit holds exactly the thirty-six listed members, flat, under the names their modules export. | safety.viz src/kit.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | The list in the test is the list above; one cannot change without the other. |
| KIT-API-003 | API | The element, option, multi-select, style-injector, shell, control-builder and view-selector members are the functions `src/shell.js` exports. | safety.viz src/shell.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Identity, not equivalence: the same function object. |
| KIT-API-004 | API | The filter contract's members are the ones `src/filters.js` exports. | safety.viz src/filters.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Includes `reconcileFilters`, which joined the contract after the task was written. |
| KIT-API-005 | API | The axis-limit helpers are the functions `src/axis-limits.js` exports. | safety.viz src/axis-limits.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-006 | API | The record listing and its search, sort, paging and CSV functions are the ones `src/histogram/listing.js` exports. | safety.viz src/histogram/listing.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-007 | API | The participant rail functions are the ones `src/profile-host.js` exports. | safety.viz src/profile-host.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-008 | API | The box drawing and its plugin are the functions `src/box-whisker.js` exports. | safety.viz src/box-whisker.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-009 | API | The measure list functions are the ones `src/measure-list.js` exports. | safety.viz src/measure-list.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-010 | API | The Kaplan–Meier estimator is the function `src/time-to-event/km.js` exports. | safety.viz src/time-to-event/km.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Re-exported unchanged; nothing statistical is added. |
| KIT-API-011 | API | `kit.Chart` is the Chart.js constructor the charts import. | safety.viz src/kit.js; chart.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | So a second library draws with the same copy. |
| KIT-API-012 | API | Nothing else the eight modules export is on the kit: the status label and the colour helper stay internal, and every other export is a member. | safety.viz src/kit.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | A new export in one of the modules fails this until it is listed or excluded on purpose. |
| KIT-API-013 | API | The kit cannot be changed from outside: a member cannot be replaced, added or removed. | safety.viz src/kit.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Frozen. |
| KIT-API-014 | API | The kit is the only export added: every other export of `src/main.js` is still there under its name. | safety.viz src/main.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | |
| KIT-API-015 | API | The committed script-tag bundle carries `SafetyViz.kit` with the same members, and no other export of the bundle has changed. | safety.viz dist/safety.viz-{version}/safety.viz.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Read from the built file. |
| KIT-API-016 | API | The committed ES module bundle exports `kit` with the same members, and no other export of the bundle has changed. | safety.viz dist/safety.viz-{version}/safety.viz.esm.js | unit | tests/unit/kit/kit.test.js | ai-reviewed | OK for human review. | Read from the built file. |
| KIT-USE-001 | USE | A page that loads the committed bundle and no other script builds the shared shell with its collapsible sidebar from the kit, with no console errors. | safety.viz tests/e2e/fixtures/kit.html | browser | tests/e2e/kit.spec.js | ai-reviewed | OK for human review. | The page is a second library in miniature. |
| KIT-USE-002 | USE | That page reads nothing from the bundle's global but `kit`: no chart module is called directly. | safety.viz tests/e2e/fixtures/kit.html | browser | tests/e2e/kit.spec.js | ai-reviewed | OK for human review. | Every property read from `SafetyViz` is recorded; a read of a chart module fails the test. |
| KIT-USE-003 | USE | The page's bar chart is drawn with `kit.Chart`, and its one filter, reconciled and built by the filter contract, narrows the chart. | safety.viz tests/e2e/fixtures/kit.html | browser | tests/e2e/kit.spec.js | ai-reviewed | OK for human review. | Expected counts are derived from the fixture data. |
| KIT-USE-004 | USE | Clicking a bar fills the record listing with that bar's records, and the listing's search, paging and sort work. | safety.viz tests/e2e/fixtures/kit.html | browser | tests/e2e/kit.spec.js | ai-reviewed | OK for human review. | |
| KIT-USE-005 | USE | Clicking a listing row opens the participant rail on that participant, and the rail's own chart is drawn by the same copy of Chart.js the kit hands out. | safety.viz tests/e2e/fixtures/kit.html | browser | tests/e2e/kit.spec.js | ai-reviewed | OK for human review. | The rail opens on the `participantsSelected` event. |
| KIT-DOC-001 | DOC | Every kit member is documented once, with a description, its signature and the module it comes from, and the API data build fails on a gap. | safety.viz src/kit.js; scripts/api/kit.mjs | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | The source module is found by identity with that module's export. |
| KIT-DOC-002 | DOC | A member's signature is read from the member itself: a function's parameters, the Chart constructor, a constant's value. | safety.viz scripts/api/kit.mjs::signatureOf | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | Never typed into a page. |
| KIT-DOC-003 | DOC | The reference says which Chart.js the bundle carries and which controllers, elements, scales and plugins the charts registered on it, read from the committed bundle. | safety.viz scripts/api/kit.mjs::loadKit | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | What `kit.Chart` can draw with nothing more registered. |
| KIT-DOC-004 | DOC | A member that is undocumented, has no description, is documented but absent, or is not a source module's export is reported as missing. | safety.viz scripts/api/kit.mjs::buildKitModel | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | |
| KIT-DOC-005 | DOC | The kit page lists every member with its signature and description, under the module it comes from. | safety.viz scripts/site-lib.mjs::renderKitPage | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | |
| KIT-DOC-006 | DOC | The kit page says how a second library reaches the kit from each bundle, and which file to load. | safety.viz scripts/site-lib.mjs::renderKitPage | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | |
| KIT-DOC-007 | DOC | The kit page states that the kit is public surface and that a change to any member is a breaking change, from the release named in the typedef, and names what was left out. | safety.viz scripts/site-lib.mjs::renderKitPage | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | |
| KIT-DOC-008 | DOC | The kit page is reachable from the architecture page and from every chart's API reference. | safety.viz scripts/site-lib.mjs | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | |
| KIT-DOC-009 | DOC | On the built site the kit page opens from the architecture page and from a chart's API reference, lists every member the bundle carries, and fits a 390px phone with no sideways page scroll. | safety.viz scripts/site.mjs | browser | tests/e2e/site.spec.js | ai-reviewed | OK for human review. | |
| KIT-DOC-010 | DOC | The kit page says `kmEstimate` follows the Time-to-Event Explorer's Experimental status: its estimates, intervals and at-risk counts may change after the external clinical review without counting as a breaking change, its row says so in a note styled as one, and the other members are public surface in full. | safety.viz scripts/site-lib.mjs::renderKitPage | unit | tests/unit/kit/reference.test.js | ai-reviewed | OK for human review. | RC1 review (#193), S1. |
