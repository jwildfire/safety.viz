<!--
NEWS.md is the running release log and the draft of each release's notes.
Shape (per the hub's developer guidelines, Releases section): newest release first;
every release section opens with its demo-artifact link, then a text-only,
functionality-first account of what a user can now do. The GitHub release publishes
from the section here when the release-candidate PR (dev -> main) merges and is tagged.
-->

# safety.viz v1.11.0 (Upcoming)

**See it move:** the [demo app on `dev`](https://jwildfire.github.io/safety.viz/dev/demo/) is the release as it stands; the annotated demo page comes with the release candidate.

The demo app made ready to show: clearer on first open, and the defects found in the review of release 1.10 fixed. No chart and no metric is added, and nothing the app computes changes.

## What's new

- **The first screen says where you are.** Every tab has a colour, where Biomarkers and RBQM were grey and read as switched off. The Data tab names the loaded study, and a line on first open says whose data this is and where to load your own. [obot.roadmap#402](https://github.com/jwildfire/obot.roadmap/issues/402), [#268](https://github.com/jwildfire/safety.viz/issues/268), [#269](https://github.com/jwildfire/safety.viz/issues/269)
- **The app says how far to trust it.** A label in the header reads Exploratory; a click opens the disclaimer and the four rungs: Qualified, Exploratory, Experimental, Prototype. Nothing is Qualified. [obot.roadmap#403](https://github.com/jwildfire/obot.roadmap/issues/403), [#272](https://github.com/jwildfire/safety.viz/issues/272), [#273](https://github.com/jwildfire/safety.viz/issues/273)
- **A chart or tab below Exploratory says so on its card, with its reason.** Five charts and the RBQM tab carry an Experimental label: in the app, on the docs site's gallery cards and page titles, and in an R widget. The banners inside two charts and the RBQM tab's pill are gone. [obot.roadmap#403](https://github.com/jwildfire/obot.roadmap/issues/403), [#274](https://github.com/jwildfire/safety.viz/issues/274), [#275](https://github.com/jwildfire/safety.viz/issues/275)
- **R is started from one control, at the right end of the chart names.** It says why R is needed, what starting it costs and Start R; once R is up it is a chip that opens R's version and where R runs. When R does not start, both tabs say so the same way, with Try again beside it. [obot.roadmap#404](https://github.com/jwildfire/obot.roadmap/issues/404), [#276](https://github.com/jwildfire/safety.viz/issues/276), [#277](https://github.com/jwildfire/safety.viz/issues/277)
- **The RBQM tab reads like the other tabs.** Its metrics are a row of names with Overview first, each marked as run or not, each with a page and an address of its own. One press of the R control runs everything; Run details sits behind the R chip. The site overview is fitted to its numbers, with a count of sites and a key to its flags. [obot.roadmap#405](https://github.com/jwildfire/obot.roadmap/issues/405), [#278](https://github.com/jwildfire/safety.viz/issues/278), [#279](https://github.com/jwildfire/safety.viz/issues/279), [#280](https://github.com/jwildfire/safety.viz/issues/280)
- **All files come in on the Data tab.** It now recognises gsm raw files and keeps them as they are, and one card says which RBQM metrics the loaded data supports and why the others cannot run. The RBQM tab's own file box is gone. [obot.roadmap#406](https://github.com/jwildfire/obot.roadmap/issues/406), [#281](https://github.com/jwildfire/safety.viz/issues/281), [#282](https://github.com/jwildfire/safety.viz/issues/282)

## Also in this release

- **The wordmark leads back to the docs, and the browser tab names the open view,** under one favicon for the docs and the app. [obot.roadmap#402](https://github.com/jwildfire/obot.roadmap/issues/402), [#270](https://github.com/jwildfire/safety.viz/issues/270)
- **On a phone, a link to a tab opens with that tab in view,** and tabs and chart names are 44 pixels tall. [obot.roadmap#402](https://github.com/jwildfire/obot.roadmap/issues/402), [#271](https://github.com/jwildfire/safety.viz/issues/271)
- **The docs home page counts the site's charts:** thirteen, where it said nine. [obot.roadmap#407](https://github.com/jwildfire/obot.roadmap/issues/407), [#286](https://github.com/jwildfire/safety.viz/issues/286)
- **The Hepatic ALT Waterfall's titles fit a long arm name.** A long name is cut short with its count kept whole, and hovering shows all of it. [obot.roadmap#407](https://github.com/jwildfire/obot.roadmap/issues/407), [#283](https://github.com/jwildfire/safety.viz/issues/283)
- **Nothing runs off a phone's screen.** The QT Explorer's table, the Hepatic Explorer's composite tables and the API reference tables scroll inside their own boxes. [obot.roadmap#407](https://github.com/jwildfire/obot.roadmap/issues/407), [#284](https://github.com/jwildfire/safety.viz/issues/284), [#285](https://github.com/jwildfire/safety.viz/issues/285), [#162](https://github.com/jwildfire/safety.viz/issues/162)
- **The check on a pull request runs each test once.** It ran the unit and browser tests, then ran both again for the evidence guard. The guard now reads the results of the first run, and refuses results that are not a clean run of every test. [obot.roadmap#410](https://github.com/jwildfire/obot.roadmap/issues/410), [#291](https://github.com/jwildfire/safety.viz/issues/291)
- **The kit's `renderShell` takes an optional `module`**, so that the shell can draw a chart's status label; a caller that passes none sees no change. [obot.roadmap#403](https://github.com/jwildfire/obot.roadmap/issues/403), [#274](https://github.com/jwildfire/safety.viz/issues/274)
- **The RBQM tab gives up on an R that stops answering.** It says so, closes that R and offers to try again. [obot.roadmap#404](https://github.com/jwildfire/obot.roadmap/issues/404), [#261](https://github.com/jwildfire/safety.viz/issues/261)
- **A test walks the keynote's demo path** on the published demo, with real R: `npm run demo-path`. [obot.roadmap#407](https://github.com/jwildfire/obot.roadmap/issues/407), [#287](https://github.com/jwildfire/safety.viz/issues/287)
- **The app's conventions and the status ladder are in the contributing guide.** [obot.roadmap#408](https://github.com/jwildfire/obot.roadmap/issues/408), [#288](https://github.com/jwildfire/safety.viz/issues/288)

# safety.viz v1.10.0

**See it move:** the [annotated v1.10.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.10-demo/) has captures, try-it steps and the detail behind everything below.

The demo app gains an RBQM tab: gsm's site metrics, worked out by R in your browser and drawn with gsm.viz's own charts. It is Experimental. The histogram loses two deprecated settings; no other safety or biomarker chart changes.

## What's new

- **The demo app has an RBQM tab.** Press Start R: R runs gsm's own workflows in your browser and the tab draws a site overview, with a scatter plot and a bar chart for the metric you choose. A metric that could not run says which file or column it needs. [obot.roadmap#374](https://github.com/jwildfire/obot.roadmap/issues/374), [#234](https://github.com/jwildfire/safety.viz/issues/234), [#235](https://github.com/jwildfire/safety.viz/issues/235), PR [#251](https://github.com/jwildfire/safety.viz/pull/251)
- **The RBQM tab runs on the study the other charts use.** It reads the loaded study's subject-level and adverse events files through the mapping on the Data tab, so there is nothing more to load. Those two files support three of the eight metrics: adverse events, serious adverse events and study discontinuation. The pilot study's subject-level file gained a site column, `SITEID`. [obot.roadmap#398](https://github.com/jwildfire/obot.roadmap/issues/398), [#253](https://github.com/jwildfire/safety.viz/issues/253), PR [#254](https://github.com/jwildfire/safety.viz/pull/254)
- **The RBQM tab takes your own gsm raw files.** Drop CSV files on the tab: each is placed in a gsm raw domain by its name or its columns, and the tab says which metrics they support before R starts. A file it does not recognise, or one missing a column, is named. [obot.roadmap#374](https://github.com/jwildfire/obot.roadmap/issues/374), [#236](https://github.com/jwildfire/safety.viz/issues/236), PR [#252](https://github.com/jwildfire/safety.viz/pull/252)
- **The demo app has a fourth demo study, the RBQM study.** It is nine raw files in gsm's format, for a synthetic study of 150 sites and 765 enrolled participants, and supports all eight metrics. [obot.roadmap#374](https://github.com/jwildfire/obot.roadmap/issues/374), [#233](https://github.com/jwildfire/safety.viz/issues/233), PR [#249](https://github.com/jwildfire/safety.viz/pull/249)
- **In the demo app, each chart links to its clinical guide and its test evidence.** A footnote under the chart carries the links, which open in a new tab so a study you loaded stays loaded. [#246](https://github.com/jwildfire/safety.viz/issues/246), PR [#248](https://github.com/jwildfire/safety.viz/pull/248)

## Removed

- **The histogram's `test_normality` and `compare_distributions` settings are removed, as the v1.9.1 notes said.** Take both out of your histogram settings: nothing in safety.viz replaces them. A chart still given one draws without the p-value and says so once in the console. The histogram now draws no p-value; run the test in R. [#188](https://github.com/jwildfire/safety.viz/issues/188), PR [#256](https://github.com/jwildfire/safety.viz/pull/256)

## Also in this release

- **Starting R for the RBQM tab downloads about 55 MB, once, and takes a minute or two.** R comes from webr.r-wasm.org and its packages from repo.r-wasm.org, and the footer names both. Your files stay in the browser. [#235](https://github.com/jwildfire/safety.viz/issues/235), PR [#251](https://github.com/jwildfire/safety.viz/pull/251)
- **Everything of gsm's comes from a release tag.** Four packages are built for R in the browser: gsm.core, gsm.mapping, gsm.reporting and workr. gsm.kri is not installed: its v1.7.0 metric workflows are copied, with the workflows of gsm.mapping v1.1.6 and gsm.reporting v1.1.7, and gsm.viz v2.4.1's charts. CI holds each copy and pin to its tag. [obot.roadmap#373](https://github.com/jwildfire/obot.roadmap/issues/373), [#229](https://github.com/jwildfire/safety.viz/issues/229), [#230](https://github.com/jwildfire/safety.viz/issues/230), [#232](https://github.com/jwildfire/safety.viz/issues/232), PRs [#241](https://github.com/jwildfire/safety.viz/pull/241), [#242](https://github.com/jwildfire/safety.viz/pull/242), [#247](https://github.com/jwildfire/safety.viz/pull/247)
- **Not in this release.** Query, data entry and data change metrics; country-level metrics; the time series chart; the report; and mapping the column names of raw files that differ from gsm's. The single file cannot start R, and its RBQM tab says so. [obot.roadmap#375](https://github.com/jwildfire/obot.roadmap/issues/375)
- **The playbook for porting a legacy renderer now lives in this repository.** It is the `port-a-renderer` skill. [#228](https://github.com/jwildfire/safety.viz/issues/228), [#238](https://github.com/jwildfire/safety.viz/issues/238), PRs [#237](https://github.com/jwildfire/safety.viz/pull/237), [#239](https://github.com/jwildfire/safety.viz/pull/239)

## Tests and provenance

2,392 unit and 406 browser tests pass. R computes every rate, score and flag the RBQM tab shows; gsm.viz counts each site's flags. Browser tests start real R and hold all 1,186 site rows of the eight metrics on the RBQM study, and the 51 of three metrics on the pilot study, to desktop R's, to eight decimal places. Another holds every request the tab makes to three addresses: the page's own, webr.r-wasm.org and repo.r-wasm.org. `dist/safety.viz-1.10.0/` is the release bundle. [#231](https://github.com/jwildfire/safety.viz/issues/231), PR [#243](https://github.com/jwildfire/safety.viz/pull/243), [#255](https://github.com/jwildfire/safety.viz/issues/255), PR [#256](https://github.com/jwildfire/safety.viz/pull/256), [#258](https://github.com/jwildfire/safety.viz/issues/258), PR [#264](https://github.com/jwildfire/safety.viz/pull/264)

# safety.viz v1.9.2

**See it move:** the [annotated v1.9.0 demo's note on v1.9.2](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.9-demo/#v192) shows this patch release.

A patch release on v1.9.1. The demo app can be installed and run on your own machine with one script, and its biomarker charts are rebuilt on bio.viz v0.3.0 and gsm.bio v0.3.0. No safety chart changes, and nothing in the library's API changes.

## What's new

- **Run the demo app on your own machine.** Download `scripts/install-demo.mjs` and run it with Node: it clones the latest release, builds the demo app and opens it in your browser, served to your computer alone. In a clone, `npm run demo` does the same. Run end to end on macOS; its tests run on Linux; Windows is written for and not yet tried. [#214](https://github.com/jwildfire/safety.viz/issues/214), PR [#215](https://github.com/jwildfire/safety.viz/pull/215); [#219](https://github.com/jwildfire/safety.viz/issues/219), PR [#225](https://github.com/jwildfire/safety.viz/pull/225)
- **In the demo app, the group comparison opens on trends and drills down.** A tile per biomarker opens that biomarker across the visits, with R's test under each visit once you start R, and a visit opens alone. [obot.roadmap#367](https://github.com/jwildfire/obot.roadmap/issues/367), [#212](https://github.com/jwildfire/safety.viz/issues/212), PR [#213](https://github.com/jwildfire/safety.viz/pull/213)
- **The cross-tabulation joins the demo app as a fifth biomarker chart.** It is a two-way table of counts with R's chi-square or Fisher's exact test. The biomarker screen stays listed. [obot.roadmap#367](https://github.com/jwildfire/obot.roadmap/issues/367), [#212](https://github.com/jwildfire/safety.viz/issues/212), PR [#213](https://github.com/jwildfire/safety.viz/pull/213)

## Also in this release

- **Known and not fixed, each in bio.viz's backlog.** The biomarker screen tells a reader with no outcomes table to call `init()` ([bio.viz#119](https://github.com/jwildfire/bio.viz/issues/119)). On a phone, long row labels under the picture over time break inside a word ([bio.viz#120](https://github.com/jwildfire/bio.viz/issues/120)). bio.viz's sixth chart, the stratified survival chart, is not listed in the app ([bio.viz#63](https://github.com/jwildfire/bio.viz/issues/63)).
- **Not in this release: the group comparison's difference grid.** It is paused, with a requirement of its own. [obot.roadmap#371](https://github.com/jwildfire/obot.roadmap/issues/371)
- **Release bundles.** `dist/safety.viz-1.9.2/` is the release bundle, the library's bundle is byte for byte v1.9.1's, and the single file is 1.4 MB, up from 1.2 MB, because it carries bio.viz v0.3.0. [#216](https://github.com/jwildfire/safety.viz/issues/216), PR [#217](https://github.com/jwildfire/safety.viz/pull/217)

## Tests and provenance

2,242 unit and 385 browser tests pass. One browser test walks the Biomarkers tab with real R started in the browser and holds each of R's answers to desktop R's on the same rows. bio.viz's bundle and gsm.bio's statistics file are copied from their v0.3.0 tags, [4a85d61](https://github.com/jwildfire/bio.viz/releases/tag/v0.3.0) and [09743c7](https://github.com/jwildfire/gsm.bio/releases/tag/v0.3.0), and CI holds each copy to its tag. [#212](https://github.com/jwildfire/safety.viz/issues/212), [#214](https://github.com/jwildfire/safety.viz/issues/214), [#219](https://github.com/jwildfire/safety.viz/issues/219)

# safety.viz v1.9.1

**See it move:** the [annotated v1.9.0 demo's note on v1.9.1](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.9-demo/#v191) shows this patch release.

A patch release on v1.9.0. The demo app says plainly what happens to the data you load, the histogram's two JavaScript p-values are deprecated and say so on the chart, and a library chart can no longer take the data view's name. Nothing is removed.

## What's new

- **The demo app says what happens to your data.** The hosted app's footer says your files are never uploaded and starting R downloads R, not your data, and the single file's footer reads "This file loads nothing; files you add are read here and never leave this computer." [#196](https://github.com/jwildfire/safety.viz/issues/196), PR [#201](https://github.com/jwildfire/safety.viz/pull/201)
- **A library chart named `data` is refused.** The app keeps the name "data" for its data view: such a chart is left out, and the page says why. [#197](https://github.com/jwildfire/safety.viz/issues/197), PR [#203](https://github.com/jwildfire/safety.viz/pull/203)

## Deprecated

- **The histogram's `test_normality` and `compare_distributions` settings are deprecated, and v1.10.0 removes them.** Remove both from your histogram settings: nothing in safety.viz replaces them. Each puts a p-value on the chart that safety.viz works out in JavaScript with a shortcut, and neither can be relied on: the normality screen is only an approximation, and the group comparison's number is not a real p-value. safety.viz is leaving statistical tests to R, as the biomarker charts already do. Until v1.10.0 both still work, and the chart and the console say each is deprecated. The histogram demo no longer turns them on. [#188](https://github.com/jwildfire/safety.viz/issues/188), PR [#202](https://github.com/jwildfire/safety.viz/pull/202)

## Also in this release

- **Each requirement ID names one requirement.** The participant R-Ratio is now HEP-DISPLAY-007, the time-to-event shared filter contract is TTE-FILT-005 to 008, and a check fails on any ID with two rows. [#195](https://github.com/jwildfire/safety.viz/issues/195), PR [#200](https://github.com/jwildfire/safety.viz/pull/200)
- **Release bundles.** `dist/safety.viz-1.9.0/` is restored to the bytes v1.9.0 shipped, and `dist/safety.viz-1.9.1/` is the release bundle. The single file is 1,169,968 bytes. [#204](https://github.com/jwildfire/safety.viz/issues/204), PR [#205](https://github.com/jwildfire/safety.viz/pull/205)
- **Evidence refreshes on request.** The evidence workflow's `refresh` input names tests whose baselines are rewritten whatever the difference, for a change too small for the comparison limit to catch ([#204](https://github.com/jwildfire/safety.viz/issues/204)). The workflow also starts from an `evidence-update` repository_dispatch event naming a feature branch, so a contributor without permission to run workflows can refresh one. Such an event runs the workflow as it is on `dev`, the default branch. Either way, it refuses `dev`, `main` and `stable`, any name starting with `refs/`, a tag, and a branch that does not exist. [#207](https://github.com/jwildfire/safety.viz/issues/207), PR [#205](https://github.com/jwildfire/safety.viz/pull/205); [#210](https://github.com/jwildfire/safety.viz/issues/210), PR [#211](https://github.com/jwildfire/safety.viz/pull/211)

## Tests and provenance

2,185 unit and 374 browser tests pass. A browser test holds the demo app's footer to its word: from the first file chosen until the page goes quiet after the last action, it asks only its own host for the statistics file and webr.r-wasm.org for the files webR fetches, with no body, query, cookie or added header, and opens no socket. Each leak the release-candidate review found it would miss was put into the app and failed it. A check lists the 102 requirement IDs a module records but its evidence page does not show, to be filled under [#206](https://github.com/jwildfire/safety.viz/issues/206). [#196](https://github.com/jwildfire/safety.viz/issues/196), [#210](https://github.com/jwildfire/safety.viz/issues/210), PR [#211](https://github.com/jwildfire/safety.viz/pull/211)

# safety.viz v1.9.0

**See it move:** the [annotated v1.9.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.9-demo/) has captures and try-it steps for everything below.

safety.viz opens to a second chart library. The parts every chart is built from are exported as a kit, and the [demo app](https://jwildfire.github.io/safety.viz/demo/) carries bio.viz's four biomarker charts in a tab of their own, on the files and mapping a study already has, with R's tests when you ask for R. No existing chart or setting changes, and the API only grows: the kit is added, and the portfolio manifest's `version` goes from 1 to 2, which adds fields a second library can use and lets a library's chart list leave out the domains. A version-1 manifest still validates.

bio.viz v0.1.0 needs safety.viz v1.9.0: its charts are built from this release's kit.

## What's new

- **The kit.** The control sidebar, the filter contract, the record listing, the participant rail, the box drawing, the measure list, the Kaplan–Meier estimator and the bundled Chart.js, exported as `SafetyViz.kit` for a library on the same page: 36 members, each the very function the charts call. From this release the kit's members are public surface: a change to a member's name, signature, return value, or the elements and class names it produces is a breaking change, and the release notes will say so. One exception: the Kaplan–Meier estimator, `kmEstimate`, follows the Time-to-Event Explorer's Experimental status, so its estimates, intervals and at-risk counts may change after the external clinical review ([obot.roadmap#182](https://github.com/jwildfire/obot.roadmap/issues/182)) without counting as a breaking change. [Kit reference](https://jwildfire.github.io/safety.viz/kit/index.html) ([obot.roadmap#354](https://github.com/jwildfire/obot.roadmap/issues/354), [#154](https://github.com/jwildfire/safety.viz/issues/154), PR [#161](https://github.com/jwildfire/safety.viz/pull/161); the Experimental label, [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **Biomarker charts in the demo app.** The group comparison, association scatter, correlation matrix and biomarker screen sit in a Biomarkers tab, read the labs and subject files through the mapping already made, and draw with the labs file alone. The demo study reads 17 of 17. If bio.viz does not load, the page says so and why, and the safety charts are as before. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#182](https://github.com/jwildfire/safety.viz/issues/182), PR [#185](https://github.com/jwildfire/safety.viz/pull/185); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **R on request.** One control, Start R, brings R into the browser, about 13 MB once from webr.r-wasm.org, and the biomarker charts print R's tests. Until then the page fetches nothing from any other host, and the study's data never leaves the browser. If R cannot start, the control says so and offers to try again. A browser test compares the group comparison's answers for one measure with desktop R's. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#183](https://github.com/jwildfire/safety.viz/issues/183), PR [#186](https://github.com/jwildfire/safety.viz/pull/186); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))
- **Another library's charts, listed with safety.viz's.** The portfolio manifest goes to format version 2, so a second library can list its charts in the app with their own group, tables and settings; the [Domains page](https://jwildfire.github.io/safety.viz/domains/) describes the format and lists the biomarker charts. A chart list the app cannot use costs only its own charts, each of which says why. ([obot.roadmap#366](https://github.com/jwildfire/obot.roadmap/issues/366), [#181](https://github.com/jwildfire/safety.viz/issues/181), PR [#184](https://github.com/jwildfire/safety.viz/pull/184); [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194))

## Also in this release

- **The single file** carries bio.viz's charts inline and still loads nothing; it is now 1,168,524 bytes, about 1.2 MB. Its charts say statistics are unavailable there, since it cannot start R. [#182](https://github.com/jwildfire/safety.viz/issues/182), [#183](https://github.com/jwildfire/safety.viz/issues/183)
- **Copied, not rebuilt.** bio.viz's bundle and gsm.bio's statistics file are vendored by script from their `dev` branches, with commit and checksum recorded and checked against both in CI, along with each record's word that its commit is on `dev`. [#182](https://github.com/jwildfire/safety.viz/issues/182), [#183](https://github.com/jwildfire/safety.viz/issues/183), [#193](https://github.com/jwildfire/safety.viz/issues/193)
- **gsm.bio's statistics give a reason on degenerate inputs** (a constant column, every value tied, no events) instead of an "ok" whose number means nothing. No number changes on real data: the app's 17 recorded answers are identical. [#190](https://github.com/jwildfire/safety.viz/issues/190), PR [#191](https://github.com/jwildfire/safety.viz/pull/191)
- **Release bundles.** `dist/safety.viz-1.8.0/` is restored to the bytes v1.8.0 shipped, and `dist/safety.viz-1.9.0/` is the release bundle. [#187](https://github.com/jwildfire/safety.viz/issues/187), PR [#189](https://github.com/jwildfire/safety.viz/pull/189)

## Tests and provenance

2,176 unit and 373 browser tests pass. Some browser tests start real R in the browser, and one of them compares the group comparison's answers for one measure with desktop R's. The release candidate was reviewed in three parts, and every finding was fixed first: [#193](https://github.com/jwildfire/safety.viz/issues/193), PR [#194](https://github.com/jwildfire/safety.viz/pull/194).

# safety.viz v1.8.0

**See it move:** the [annotated v1.8.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.8-demo/) has captures and try-it steps for everything below.

safety.viz becomes something you can use on your own study. A [demo app](https://jwildfire.github.io/safety.viz/demo/) loads your files, maps their columns and draws the charts they support, all in your browser. Nine long-standing requests land on the existing charts. No existing API is removed or renamed.

## The demo app

- **Thirteen charts on one study.** Tabs by data domain say how many charts your data supports; a chart that cannot draw names what it is missing. [#150](https://github.com/jwildfire/safety.viz/issues/150)
- **Load your own study.** Drop CSV or JSON files: each is placed in a domain and its columns mapped, with every guess labelled. Nothing is uploaded. [#151](https://github.com/jwildfire/safety.viz/issues/151), [#165](https://github.com/jwildfire/safety.viz/issues/165)
- **A sidebar for the work.** Load, check the mapping, open a chart, with Reset and three demo studies to try. [#159](https://github.com/jwildfire/safety.viz/issues/159), [#163](https://github.com/jwildfire/safety.viz/issues/163)
- **One file to take with you.** The whole app as a single HTML file, under 1 MB, that runs offline. [#152](https://github.com/jwildfire/safety.viz/issues/152)
- **A standard domain set.** Four domains and what each chart reads from them, on the [Domains page](https://jwildfire.github.io/safety.viz/domains/) and in the bundle as `SafetyViz.portfolio`. [#138](https://github.com/jwildfire/safety.viz/issues/138), [#139](https://github.com/jwildfire/safety.viz/issues/139)

## Asked for by the original renderers' users

Nine requests the retired RhoInc and SafetyGraphics trackers left open. Who asked, and when: [#136](https://github.com/jwildfire/safety.viz/issues/136).

- **Filters mean the same thing in every chart:** `start`, `all` and `multiple`, in all twelve charts that have filters. [ae-timelines#83](https://github.com/RhoInc/ae-timelines/issues/83), [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **Choose and order the measures** with a `measures` setting, in five charts. [safety-results-over-time#5](https://github.com/RhoInc/safety-results-over-time/issues/5)
- **Reset chart** on nine charts. [safety-histogram#61](https://github.com/RhoInc/safety-histogram/issues/61)
- **Shift Plot:** a log scale. [safety-shift-plot#3](https://github.com/RhoInc/safety-shift-plot/issues/3)
- **QT Explorer:** its confidence intervals as a table, and its caution in every view. [qtexplorer#41](https://github.com/SafetyGraphics/qtexplorer/issues/41), [#51](https://github.com/SafetyGraphics/qtexplorer/issues/51)
- **Hepatic Safety Explorer:** include or exclude unscheduled visits. [hep-explorer#229](https://github.com/SafetyGraphics/hep-explorer/issues/229)
- **Adverse Event Explorer:** says what kind of empty an empty table is. [aeexplorer#153](https://github.com/RhoInc/aeexplorer/issues/153)

## Changed

- **A filter with a `start` value keeps its "All" option** in every chart; pass `all: false` to drop it. The Outlier Explorer used to drop it. [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **The QT Explorer averages replicate readings** to one value per participant and visit, so `n` counts participants. [#166](https://github.com/jwildfire/safety.viz/issues/166)
- **A chart's status means one thing.** Prototype: docs site only, not ready for production. Experimental: ships, and may change. No badge: stable. The Hepatic ALT Waterfall is now Experimental. [#165](https://github.com/jwildfire/safety.viz/issues/165)

## Fixed

- **Adverse Event Explorer:** a single-arm study with the per-group columns off drew no counts. [aeexplorer#148](https://github.com/RhoInc/aeexplorer/issues/148)
- **Text from a dataset is written to the page as text,** never as markup. [#166](https://github.com/jwildfire/safety.viz/issues/166)

## Prototype

- **[Patient Journey Explorer](https://jwildfire.github.io/safety.viz/patient-journey-explorer/index.html):** one participant's record as stacked lanes on a study-day axis; click an event to see what was recorded around it. Docs site only, not ready for production: known issues in [#167](https://github.com/jwildfire/safety.viz/issues/167). [#142](https://github.com/jwildfire/safety.viz/issues/142)

## Tests and provenance

2,100 unit and 344 browser tests pass. The release candidate was reviewed in three parts, and every finding in the charts and the app was fixed first: [#171](https://github.com/jwildfire/safety.viz/pull/171).

# safety.viz v1.7.0

**See it move:** the [annotated v1.7.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.7-demo/) walks the new chart with captures and try-it-yourself steps against the live demo.

The gallery learns to answer "how long until…". A thirteenth renderer brings Kaplan–Meier time-to-event displays to the safety portfolio: step curves, confidence bands, and the at-risk table the FDA Safety Tables & Figures guide mandates beneath every time-to-event plot. No existing API is removed or renamed.

**The Time-to-Event Explorer ships marked Experimental, and stays marked until an external clinical review confirms the Kaplan–Meier implementation.** That is a deliberate withholding of confidence rather than a formality: until that review lands, safety.viz does not assert that these curves, confidence bands and at-risk counts are correct, so treat the estimates as provisional. The badge is on the gallery card and on every one of the renderer's pages, and it comes off in a later release under [obot.roadmap#182](https://github.com/jwildfire/obot.roadmap/issues/182).

## What's new

- **Time-to-Event Explorer** — a new renderer for Kaplan–Meier safety displays ([obot.roadmap#161](https://github.com/jwildfire/obot.roadmap/issues/161), [#128](https://github.com/jwildfire/safety.viz/issues/128), PRs [#129](https://github.com/jwildfire/safety.viz/pull/129) and the sv#131 review rework). **You compose the endpoint yourself, from the event data**: flexible multiselect filters over the adverse events (body system, preferred term, seriousness, severity — configurable per study) define what counts as a qualifying event, and the chart shows time to each participant's first qualifying event, censored at end of follow-up from the population data. No endpoint list is hard-coded — the important events vary from study to study; configured one-click presets are a natural later release on the same filter state. Step curves by treatment group with censoring tick marks, **pointwise 95% confidence bands** (the `survival::survfit` default family, cross-validated against it), and the **at-risk / cumulative-events strip table** — all derived from one estimator pass, so the table cannot disagree with the curve, and drawn without intro animation so every frame the chart shows is an estimate, never a transition. It consumes ADAE-shaped event records plus an ADSL-shaped population extract, defaults to **cumulative incidence (1 − KM)** with the estimator always named on the axis, and states plainly — in-app and in the clinical guide — the fixed derivation rule and where that estimator overreads risk. Ships **Experimental** pending the external clinical review above, and pending review of the design decisions. [Try it live](https://jwildfire.github.io/safety.viz/time-to-event/index.html).

## Also in this release

- **NEWS.md becomes the running release log** — this file; unreleased work now accumulates under a `(Upcoming)` heading per the program-wide convention ([#125](https://github.com/jwildfire/safety.viz/pull/125), [#127](https://github.com/jwildfire/safety.viz/pull/127), convention: [obot.roadmap#155](https://github.com/jwildfire/obot.roadmap/discussions/155)).
- Evidence baselines for every module refreshed on the canonical Linux environment as part of the time-to-event landing.
- Release prep: `dist/safety.viz-1.7.0/` vendored, e2e fixtures repointed to the new bundle.

1 257 unit + 255 browser tests pass; `evidence:check`, `requirements:check`, `build:check-dist`, `prettier` and the site build all clean.

# safety.viz v1.6.0

**See it move:** the [annotated v1.6.0 demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.6-demo/) walks each update with captures and try-it-yourself steps against the live gallery.

The gallery crosses into nephrotoxicity. A twelfth renderer ports the KDIGO acute-kidney-injury creatinine scatter from [SafetyGraphics/nepExplorer](https://github.com/SafetyGraphics/nepExplorer), and the Hepatic Safety Explorer gets back the feature the original renderer was best known for — the study-day playback — alongside an opt-in hepatocyte-loss estimate and the last of its v1.2 polish list. No existing API is removed or renamed.

## What's new

- **Nephrotoxicity Explorer** — a new renderer for KDIGO acute-kidney-injury screening ([obot.roadmap#35](https://github.com/jwildfire/obot.roadmap/issues/35), [#120](https://github.com/jwildfire/safety.viz/issues/120), PR [#121](https://github.com/jwildfire/safety.viz/pull/121)). One point per participant at their maximum post-baseline **fold change** in serum creatinine against their maximum **absolute change**, over the L-shaped KDIGO stage zones — the fold bands at any absolute change, plus the ≥ 0.3 mg/dL arm below 1.5× — with the lower-left box, where both criteria are clear, left unpainted. The **≥ 4.0 mg/dL Stage-3 rule is a mark, not a zone**: a larger triangular point with its own tooltip line, so a high-baseline chronic-kidney-disease participant sitting in the Stage-1 band is still read as Stage 3 and says why. Units resolve per record (mg/dL and µmol/L can mix within one participant); a record that resolves to neither suppresses absolute-change staging chart-wide rather than guessing. Nothing is dropped silently — participants whose creatinine only fell stay on the chart below zero, and every dropped record and participant downloads as a CSV naming its reason. The stage summary table counts the population three ways, with **dashes, not zeroes**, where KDIGO defines no stage on absolute change. Marked **Experimental** pending clinical confirmation of the staging ladder. [Try it live](https://jwildfire.github.io/safety.viz/nep-explorer/index.html).

- **Study-day playback with motion trails** on the Hepatic Safety Explorer ([obot.roadmap#88](https://github.com/jwildfire/obot.roadmap/issues/88), [#46](https://github.com/jwildfire/safety.viz/issues/46), PRs [#118](https://github.com/jwildfire/safety.viz/pull/118), [#119](https://github.com/jwildfire/safety.viz/pull/119)). Press play and the eDISH cloud walks each participant along their own lab trajectory, motion trails accumulating behind the moving points; scrub the day slider and the playback yields to you rather than fighting for the day. The original's four drawing rules are ported verbatim: a point sits on its most recent result at or before the shown day, holds at its first result before it is measured, shrinks outside its own measured span, and is not drawn before its first record.

- **An opt-in P_ALT hepatocyte-loss estimate** (same requirement, [#49](https://github.com/jwildfire/safety.viz/issues/49) partial, PR [#118](https://github.com/jwildfire/safety.viz/pull/118)). With `calculate_palt: true`, the participant profile header shows the estimated fraction of hepatocytes lost, with the arithmetic behind it. Off by default on purpose: the estimate integrates ALT over study day × 24 hours and carries unit and sampling assumptions only the data owner can confirm.

- **The eDISH axes finish their v1.2 polish list** ([#54](https://github.com/jwildfire/safety.viz/issues/54), PR [#122](https://github.com/jwildfire/safety.viz/pull/122)). On log axes a **Log Base** picker chooses decades or doublings — a tick generator, not a transform, so the cloud never moves, only the gridlines. **Manual axis limits** on both axes load pre-filled with the limit actually in force; clear one to hand that side back to auto, and a limit typed for one measure never survives to another. The drill-down labs chart **names each measure in full** in its legend and writes each line's short key at its own last point. The Clinical guide links the R / nR primary sources and states the nR formula.

## Also in this release

- `HEP-ANIM-008` (scrub stops playback) had shipped implemented but unevidenced; [#119](https://github.com/jwildfire/safety.viz/pull/119) gives it a named, asserted browser test — under the done-gate a requirement row is only as good as the evidence it points at.
- Release prep [#123](https://github.com/jwildfire/safety.viz/pull/123): `dist/safety.viz-1.5.0/` is restored to the bytes v1.5.0 shipped, `dist/safety.viz-1.6.0/` is vendored fresh, fixtures and README repointed.

## The gallery

Twelve renderers are now available, up from eleven:

| Renderer                    | Factory              | What it shows                                                                                           |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Safety Histogram            | `histogram`          | Distribution of a lab or vital-sign measure, with a normal-range overlay and a linked listing           |
| Safety Outlier Explorer     | `outlierExplorer`    | One line per participant over time against a population normal-range band                               |
| Safety Results Over Time    | `resultsOverTime`    | Population distribution of a measure at each visit                                                      |
| Safety Shift Plot           | `shiftPlot`          | Baseline versus comparison-visit values on a scatter with an identity line                              |
| Safety Delta-Delta          | `deltaDelta`         | Paired change-from-baseline comparison of two measures                                                  |
| Hepatic Safety Explorer     | `hepExplorer`        | eDISH / mDISH scatter with Hy's-Law quadrants, composite and migration views, and study-day playback    |
| Hepatic ALT Waterfall       | `hepWaterfall`       | Baseline → maximum on-treatment ALT in absolute U/L, for abnormal-baseline trials                       |
| Participant Profile         | `participantProfile` | One participant's whole lab course, demographics and adverse events — standalone or as any chart's rail |
| **Nephrotoxicity Explorer** | **`nepExplorer`**    | **KDIGO creatinine scatter: fold vs absolute change over stage zones, with a stage summary table**      |
| Adverse Event Explorer      | `aeExplorer`         | Hierarchical adverse-event browser with rates and differences by arm                                    |
| Adverse Event Timelines     | `aeTimelines`        | One bar per event on the study-day axis, per participant                                                |
| QT Safety Explorer          | `qtExplorer`         | Central tendency Δ/ΔΔ with CIs against ICH E14 references, outliers and categorical views               |

## Tests and provenance

1 178 unit and 236 browser tests are green; every requirement row on the [evidence pages](https://jwildfire.github.io/safety.viz/nep-explorer/evidence.html) traces to a named test, with screenshots captured on the canonical Linux environment. The vendored `dist/safety.viz-1.6.0/` is byte-checked against a fresh build in CI.

# Earlier releases

Full notes for every earlier release live on its GitHub release page:

- [v1.5.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.5.0) (2026-07-26) — Participant Profile, a chart-agnostic drill-down module adopted by six renderers (v2 adds the right-hand rail and the adverse-event timeline); the Hepatic ALT Waterfall renderer for abnormal-baseline trials; the migration Sankey as a third hep-explorer view; the eDISH scatter regains draggable cut-lines, marginal box plots and self-describing quadrants. [Annotated demo](https://jwildfire.github.io/obot.roadmap/reports/sv-v1.5-demo/).
- [v1.4.1](https://github.com/jwildfire/safety.viz/releases/tag/v1.4.1) (2026-07-22) — QT demo data made internally consistent (QTcF/QTcB rederived from QT and RR, provenance documented); hep-explorer and qt-explorer share one view-selector builder.
- [v1.4.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.4.0) (2026-07-18) — QT Safety Explorer Phase 1 (central-tendency Δ/ΔΔ with CIs and the ICH-E14 metric, outlier scatter, categorical table); the composite ×BLN plot joins hep-explorer for abnormal-baseline populations; a persistent gallery link site-wide.
- [v1.3.1](https://github.com/jwildfire/safety.viz/releases/tag/v1.3.1) (2026-07-16) — test-evidence pages show the reviewed requirement text beside each ID, guarded against drift in CI.
- [v1.3.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.3.0) (2026-07-16) — Adverse Event Explorer: a hierarchical incidence table with per-arm rates, group differences with CIs, and drill-through listings.
- [v1.2.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.2.0) (2026-07-13) — Hepatic Safety Explorer (eDISH) with the coordinated participant drill-down, and the first per-renderer Clinical guide.
- [v1.1.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.1.0) (2026-07-12) — all-measures overview for the histogram; demo data regenerated from a scripted pharmaverse pipeline; user-first README.
- [v1.0.0](https://github.com/jwildfire/safety.viz/releases/tag/v1.0.0) (2026-07-12) — first stable release: six interactive charts with data contracts, live demos and test-evidence pages.
- [v0.1.0](https://github.com/jwildfire/safety.viz/releases/tag/v0.1.0) (2026-07-11) — the safety-histogram pilot as a library module plus the shared renderer shell.
