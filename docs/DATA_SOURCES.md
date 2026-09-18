# Demo data sources

safety.viz demos and evidence run on eleven example datasets vendored under
[`site/data/`](../site/data):

| File              | Shape                                                   | Used by                                                                                                                                                          |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adbds.csv`       | One row per lab / vital-sign measurement (BDS)          | Histogram, Outlier Explorer, Paneled Outlier Explorer, Results Over Time, Shift Plot, Delta-Delta, Hep Explorer, Nep Explorer, Participant Profile, Web Codebook |
| `adae.csv`        | One row per adverse event                               | AE Explorer, AE Timelines, Time-to-Event Explorer (events)                                                                                                       |
| `adeg.csv`        | One row per ECG interval measurement (QT/QTc/HR)        | QT Safety Explorer                                                                                                                                               |
| `adsl.csv`        | One row per safety participant (id, arm, follow-up end) | Time-to-Event Explorer (population)                                                                                                                              |
| `adbds-abnbl.csv` | One row per liver-test measurement (BDS)                | Hep Waterfall                                                                                                                                                    |
| `pje-ex.csv`      | One row per dosing record (exposure)                    | Patient Journey Explorer                                                                                                                                         |
| `pje-ae.csv`      | One row per treatment-emergent adverse event            | Patient Journey Explorer                                                                                                                                         |
| `pje-lb.csv`      | One row per liver-panel lab result                      | Patient Journey Explorer                                                                                                                                         |
| `pje-cm.csv`      | One row per concomitant-medication course               | Patient Journey Explorer                                                                                                                                         |
| `pje-mh.csv`      | One row per medical-history record                      | Patient Journey Explorer                                                                                                                                         |
| `pje-ds.csv`      | One row per disposition event (SDTM DS)                 | Patient Journey Explorer                                                                                                                                         |

All are **generated**, not hand-maintained. The first four and the six `pje-*`
files are built from pharmaverse sources by
[`scripts/build-demo-data.mjs`](../scripts/build-demo-data.mjs); rerun it to
refresh the committed CSVs (`--only pje` rebuilds just the six journey files):

```bash
node scripts/build-demo-data.mjs
```

`adbds-abnbl.csv` has no published source at all — it is fully synthetic and has
its own generator; see
[Synthetic abnormal-baseline cohort](#synthetic-abnormal-baseline-cohort-hep-waterfall-93)
below.

`adbds.csv` is the pharmaverseadam build **plus two synthetic cohorts appended
after it** — the chronic-liver-disease population the composite plot needs
([`CLD-*`](#synthetic-composite-plot-cohort-hep-explorer-67)) and the
acute-kidney-injury population the KDIGO scatter needs
([`AKI-*`](#synthetic-acute-kidney-injury-cohort-nep-explorer-120)). Both
injectors are idempotent, so the full rebuild is:

```bash
node scripts/build-demo-data.mjs
node scripts/build-hep-composite-cohort.mjs
node scripts/build-nep-aki-cohort.mjs
```

## Source: pharmaverseadam (CDISC Pilot 01)

The data is built from **[pharmaverseadam](https://github.com/pharmaverse/pharmaverseadam)**,
the pharmaverse consortium's ADaM test-data package. Its datasets are derived
from the public **CDISC SDTM/ADaM Pilot 01** study (`CDISCPILOT01`) — a 254-subject
Alzheimer's trial randomized to Placebo / Xanomeline Low Dose / Xanomeline High
Dose, with real MedDRA-coded adverse events and reference-range–bearing labs and
vital signs.

The generator reads eight published CSVs from the package's `inst/extdata/`:

- `adlb.csv` (ADaM lab chemistry + hematology) → BDS lab rows, and the
  liver-panel rows of `pje-lb.csv`
- `advs.csv` (ADaM vital signs) → BDS vital-sign rows
- `adae.csv` (ADaM adverse events) → AE rows, and `pje-ae.csv`
- `adsl.csv` (ADaM subject-level) → AE placeholder rows for AE-free
  participants, the population extract, and the safety-population join for
  `pje-ds.csv`
- `adeg.csv` (ADaM ECG intervals) → QT/QTc/HR rows
- `adex.csv` (ADaM exposure) → `pje-ex.csv`
- `adcm.csv` (ADaM concomitant medications) → `pje-cm.csv`
- `admh.csv` (ADaM medical history) → `pje-mh.csv`

plus one file from the sibling SDTM package, `ds.csv` → `pje-ds.csv` (see
[Patient Journey Explorer extracts](#patient-journey-explorer-extracts-142)).

### Transform summary

- **BDS** is the row-bind of `adlb` + `advs`. Both ADaM datasets already carry
  participant demographics (`SITEID`, `SEX`, `RACE`), treatment arm (`ARM`),
  visit (`AVISIT`/`AVISITN`), the standardized numeric result (`AVAL`), units,
  and reference ranges (`ANRLO`/`ANRHI`), so no separate `adsl` join is needed.
  Columns are mapped to the safety.viz measure contract
  (`USUBJID, SITE, SITEID, SEX, RACE, ARM, VISIT, VISITNUM, TEST, STRESU,
STRESN, STNRLO, STNRHI`).
- **Analysis records only.** Rows are kept where the result is numeric, the
  record is not ADaM-derived (`DTYPE` blank), and it is either the primary
  analysis record (`ANL01FL='Y'`) or the baseline (`ABLFL='Y'`). This
  de-duplicates the intra-visit vital-sign timepoints to one value per visit
  while retaining the baseline visit that change-from-baseline displays need.
- **Curated measure panel.** The full pilot carries 55 measures, including
  sparse cell-morphology and qualitative-urinalysis labs. The demo keeps a
  clinically-meaningful continuous panel of **28 measures** (core chemistry,
  the CBC, and key vitals), all of which carry reference ranges for the
  normal-range overlay. The allowlist lives in `build-demo-data.mjs`.
- **AE** keeps **treatment-emergent** events (`TRTEMFL='Y'`) — the standard focus
  of an AE safety display, which also drops a handful of pre-existing conditions
  whose onset is years before treatment (and would otherwise dominate the timeline
  axis). Columns projected: `USUBJID`, arm, verbatim term (`AETERM`, required by AE
  Timelines), MedDRA body system / preferred term (`AEBODSYS`/`AEDECOD`, the AE
  Explorer hierarchy), severity, seriousness, and start/stop study day.
- **AE placeholder rows.** One all-blank AE row per safety-population subject
  (`adsl` `SAFFL='Y'`) with no treatment-emergent AEs — the AE renderers'
  shared convention (per the original RhoInc data guidelines) that keeps
  participant denominators at the treated population rather than only
  participants with events. AE Explorer counts them toward its group
  denominators (AE-DATA-001); AE Timelines keeps them in its participant
  total while dropping the blank-term record with a reported count.
- **ECG (QT)** projects `adeg` to the QT measure contract
  (`USUBJID, SITE, SITEID, SEX, RACE, AGE, ARM, VISIT, VISITNUM, PARAMCD, TEST,
STRESU, STRESN, BASE, CHG, ABLFL`). Three parameters are kept for the QT Safety
  Explorer's Phase-1 scope — **QTcF** (`QTCF`, Fridericia), **QTcB** (`QTCB`,
  Bazett), and **Heart Rate** (`HR`, the source `AVAL` as recorded). The pilot
  records each visit at three postural timepoints plus a `DTYPE=AVERAGE` roll-up;
  the build keeps the **supine reading**
  (`ATPT='AFTER LYING DOWN FOR 5 MINUTES'`, the resting posture ICH-E14 analyses
  use). As with the BDS build, only analysis records are kept (`DTYPE` blank,
  `ANL01FL='Y'` or the `ABLFL='Y'` baseline). The pilot ADEG has **no PR/QRS/JT
  intervals and no moxifloxacin positive-control arm**, so the demo covers
  QTc + HR only — expected for CDISC Pilot 01, and the QT Explorer's Phase-2
  items sit on a richer dataset.
- **QTc is derived here, not taken from the pilot — a data-cleaning step (#79).**
  The pilot collects `RR` and `HR` as separate ECG measurements, and in this source
  the two contradict each other. They should be one fact expressed two ways
  (`RR` ms × `HR` bpm = 60000), but they were generated independently:
  `corr(RR, 60000/HR) = 0.0095`, and only 0.8% of the 8,220 paired readings agree
  within 5%. Collected `RR` has a median of 528 ms (implying 113.6 bpm) against a
  recorded `HR` median of 72 bpm (implying 833 ms).

  Nothing downstream is misbehaving. admiral's ADEG template deliberately derives
  `QTCFR`/`QTCBR` from the collected `RR` (`rr_code = "RR"`), and pharmaverseadam
  runs that template faithfully — "Rederived" in the parameter label means the QTc
  was rederived, not that it came from the rederived RR. Both do exactly what they
  document; they are propagating an inconsistency that is already in the source.

  So the build chooses. `HR` is the more credible of the two contradictory inputs —
  72 bpm suits this elderly Alzheimer's population where 114 bpm does not, and
  correcting against the collected `RR` puts median QTcF at 561 ms, which is not a
  plausible population value. The build therefore computes
  `QTcF = QT / (RRR/1000)^(1/3)` and `QTcB = QT / (RRR/1000)^(1/2)` against `RRR`
  (the pilot's RR rederived as 60000/`HR`, exact for every record), and derives
  `BASE`/`CHG` from each participant's own `ABLFL='Y'` reading, since the source
  `BASE`/`CHG` belong to the values we do not carry forward. Taking `QTCFR` at face
  value had put QTcF ~80 ms high — median 561 vs 468 — saturating every ICH E14
  threshold in the demo. `assertRrSane()` in `scripts/demo-data-lib.mjs` fails the
  build if the RR source ever disagrees with `HR` by more than 1 bpm again.

  This is a judgment between contradictory inputs, not the repair of a
  known-broken one: in synthetic data neither is verifiably correct. Inconsistent
  collected values are routine in real trials, and cleaning them at the point of
  ingestion — explicitly, with a guard — is the normal handling.

- **The pilot's QT is long regardless.** Even correctly derived, the CDISC Pilot 01
  ECG data is not a realistic thorough-QT population: the _measured_ QT has a
  median of 444 ms, so QTcF still centres near 468 ms and a majority of
  participants cross the 450/480/500 ms categories. That is a property of the
  synthetic source, not of the derivation — the QT Explorer demo exercises every
  view and threshold, but its crossing rates should not be read as clinically
  typical.

- **`adsl.csv` is the Time-to-Event Explorer's population extract (#128, revised
  by the sv#131 review).** The renderer composes its endpoint live from
  multiselect filters over `adae.csv` — time to each participant's first
  qualifying event — so what it needs from `adsl` is the analysis denominator:
  one row per safety participant (`SAFFL='Y'` with a usable `TRTSDT`, 254
  participants) with the actual-treatment arm, the follow-up-end study day, and
  the end-of-study status. Day 1 = `TRTSDT` (the source's `ASTDY` convention),
  so `EOSDY = EOSDT − TRTSDT + 1` (range 1–213 days in this source), falling
  back to `TRTEDT` when `EOSDT` is missing; `EOSSTT` feeds the censor-mark
  tooltips. Note the population censors at end of study regardless of reason —
  including death (`DTHDT` is populated for some participants) — so the demo is
  also the worked example of the 1 − KM competing-risks caveat the Time-to-Event
  Explorer's clinical guide states. With every event qualifying the demo shows
  time to first treatment-emergent AE (217 events / 37 censored); the serious-only
  selection (3 events / 251 censored) is deliberately sparse — the wide,
  early-terminating confidence band it produces is the honest display for a rare
  endpoint. The derivation is `buildAdslRecords()` in
  [`scripts/demo-data-lib.mjs`](../scripts/demo-data-lib.mjs), unit-tested in
  `tests/unit/demo-data/adsl.test.js`, and the committed file is guarded there
  against silent upstream drift (participant count, arms, follow-up-day range).
  Rebuild just this file with `node scripts/build-demo-data.mjs --only adsl`.
  (An earlier increment vendored a pre-derived `adtte.csv` with three fixed
  endpoints; the sv#131 review replaced it with this live composition. The
  frozen copy at `tests/unit/time-to-event/fixtures/adtte.csv` remains the
  input for the `survival::survfit` cross-validation fixture.)

Resulting sizes: `adbds.csv` ≈ 5.5 MB (≈ 56k rows, 254 participants, 28 measures);
`adae.csv` ≈ 0.1 MB (1,122 treatment-emergent events + 37 placeholder rows,
254 participants, 23 body systems); `adeg.csv` ≈ 0.5 MB (5,361 rows, 254
participants, 3 ECG parameters); `adsl.csv` ≈ 10 KB (254 rows, one per safety
participant).

## Patient Journey Explorer extracts (#142)

The Patient Journey Explorer ([safety.viz#142](https://github.com/jwildfire/safety.viz/issues/142),
requirement [obot.roadmap#349](https://github.com/jwildfire/obot.roadmap/issues/349))
shows one participant's whole safety record across six domains, so it ships
**six per-domain extracts** rather than one merged file (design D26: 32%
smaller, self-describing headers, one data-contract section per file). Each
file's header is exactly the module's default column names for that domain
plus `TRTSDT`, so the demo needs no column overrides and calendar-date mode
needs no ADSL join; `NA` is never written (blank instead). All six are
restricted to the 254 safety participants. Together they add ≈ 1.1 MB:

| File         | Source                       | Rows  | Size   | Key derivation                                                                                                                                                                                                                                                                |
| ------------ | ---------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pje-ex.csv` | pharmaverseadam `adex.csv`   | 591   | 33 KB  | `PARAMCD = 'DOSE'` only — the file replicates each dosing record across five record-level parameters; days from `ASTDY`/`AENDY`                                                                                                                                               |
| `pje-ae.csv` | pharmaverseadam `adae.csv`   | 1,122 | 168 KB | `TRTEMFL = 'Y'`; days from `ASTDY`/`AENDY`; `AEOUT` carried for the end-state rule                                                                                                                                                                                            |
| `pje-lb.csv` | pharmaverseadam `adlb.csv`   | 6,639 | 560 KB | the BDS analysis filter (`DTYPE` blank, `ANL01FL = 'Y'` or `ABLFL = 'Y'`, numeric `AVAL`) restricted to the four-test liver panel, renamed `AVAL → LBSTRESN`, `ANRLO/ANRHI → LBSTNRLO/LBSTNRHI`, `ADY → LBDY`, `ADT → LBDTC`, `ANRIND ?? LBNRIND → LBNRIND`; `ABLFL` verbatim |
| `pje-cm.csv` | pharmaverseadam `adcm.csv`   | 1,081 | 89 KB  | de-duplicated on (participant, `CMTRT`, `CMDECOD`, `ASTDY`, `AENDY`, `CMSTDTC`, `CMENDTC`, `CMDOSE`) keeping the lowest `CMSEQ` — the raw 7,510 rows repeat each medication once per collection visit                                                                         |
| `pje-mh.csv` | pharmaverseadam `admh.csv`   | 1,818 | 175 KB | day = `MHDY`, the collection day (100% populated, −37…−2); onset `ASTDY` ships separately as `MHONSDY` (17% populated) and never places a mark                                                                                                                                |
| `pje-ds.csv` | **pharmaversesdtm** `ds.csv` | 798   | 66 KB  | restricted to the safety population with `TRTSDT` joined from `adsl`; `DSSTDY` and `DSCAT` pass straight through (both real, populated columns in this file)                                                                                                                  |

Header, row count, participant count, the absence of `NA`, and the three
seeded participants' key values (`01-716-1447`, `01-705-1310`, `01-701-1203`)
are guarded by
[`tests/unit/patient-journey-explorer/demo-data.test.js`](../tests/unit/patient-journey-explorer/demo-data.test.js)
(`PJE-DEMO-001`), and the six builders (`buildPjeExRecords` … `buildPjeDsRecords`
in [`scripts/demo-data-lib.mjs`](../scripts/demo-data-lib.mjs)) are
unit-tested there on hand-made rows. Rebuild with
`node scripts/build-demo-data.mjs --only pje`.

These six files have a second consumer. The AI narrative layer's evaluation
harness ([safety.viz#146](https://github.com/jwildfire/safety.viz/issues/146))
builds its golden set on exactly these extracts, loading them through
[`tests/evals/patient-journey-narratives/demo-data.mjs`](../tests/evals/patient-journey-narratives/demo-data.mjs)
with the demo page's own parser and settings, so a narrative case and the demo
page describe the same rows. Rebuilding the extracts therefore moves the golden
set's expected facts as well as the demo: regenerate the golden files
(`node tests/evals/patient-journey-narratives/build-golden.mjs`) and re-run
`npm run eval:narratives` in the same change.

### Source: pharmaversesdtm (disposition)

pharmaverseadam ships **no ADaM DS dataset**, and without disposition the
journey has no discontinuation rule. `pje-ds.csv` is therefore taken from the
sibling package **[pharmaversesdtm](https://github.com/pharmaverse/pharmaversesdtm)**
(`inst/extdata/ds.csv`) — the SDTM side of the same CDISC Pilot 01 study, also
licensed **Apache-2.0**
([LICENSE](https://github.com/pharmaverse/pharmaversesdtm/blob/main/LICENSE)).
This is the repository's first use of that package (design D24). The extract
was taken at commit
[`9c12f0c580e7223ec3cee280ecd3ab728f0718e6`](https://github.com/pharmaverse/pharmaversesdtm/commit/9c12f0c580e7223ec3cee280ecd3ab728f0718e6)
(2026-01-31, the file's last change on `main`), whose `ds.csv` is byte-identical
(SHA-256 `9c90933c42a0acaa4b98b3e37e24a3ce2238767e713f4d621ac41c3197d11f20`) to the
copy in release tag `v1.5.0`. The source file holds 850 rows for 306 subjects
including screen failures; the safety restriction keeps 798 rows for 254
participants, three per participant in almost every case (`PROTOCOL MILESTONE`
RANDOMIZED at day 1, one `DISPOSITION EVENT`, and an `OTHER EVENT` final lab
visit). The module draws its cross-stack disposition rule only for the
`DISPOSITION EVENT` rows (`ds_reference_cats`); the other categories still
render marks and source rows.

### What this demo data cannot show

Three honest caveats, stated on the demo page and in the clinical guide because
they make two controls look sparse by construction:

- **81% of con-med records are `UNCODED`** (`CMCLAS`; 83% of the de-duplicated
  courses), so the ATC-class filter is mostly one bucket. `UNCODED` is kept as an
  ordinary selectable value rather than hidden.
- **Medical-history verbatim terms are scrubbed** to `VERBATIM_nnnn` placeholders
  (1,564 of 1,818 rows) while `MHDECOD` carries real text — except on the 254
  `PRIMARY DIAGNOSIS` rows, where `MHDECOD` is blank and `MHTERM` is real. The
  module labels from `MHDECOD` and falls back to `MHTERM`.
- **The study has only 3 serious adverse events**, so the serious-only filter is
  near-empty; the sidebar label carries that count. Relatedly, 438 of the 1,122
  treatment-emergent events have no end day, and every one of them carries
  `AEOUT = 'NOT RECOVERED/NOT RESOLVED'`, which is what lets the module call them
  ongoing on evidence rather than by inference; the con-med file has no outcome
  column at all, so every blank con-med end is shown as "end not recorded". The
  lab indicator carries only `LOW`/`NORMAL`/`HIGH` — no `HH`/`LL` tier exists in
  this study.

Two data traps, recorded so they are not rediscovered: bilirubin is `BILI` /
"Bilirubin" in **µmol/L** (not `TBILI`, not mg/dL); alkaline phosphatase's
`PARAMCD` is `ALKPH` while its `LBTESTCD` is `ALP`; and ALT's upper limit varies
by lab (32/34/35/43 U/L), so any "× ULN" figure is computed per record.

## Synthetic composite-plot cohort (hep-explorer #67)

The hep-explorer **composite plot** (Tesfaldet et al., _Drug Safety_ 2024;47:699–710)
is designed for the population with **abnormal baseline liver tests** — a population
the pharmaverseadam Pilot 01 data does not contain (its baseline liver labs are
essentially normal). To make the composite view demonstrable, `site/data/adbds.csv`
carries a small **synthetic chronic-liver-disease cohort** (64 subjects, `USUBJID`
prefix `CLD-`, `SITE` `Hepatology Research Unit`, arms `CLD: Study Drug` / `CLD:
Placebo`) appended by [`scripts/build-hep-composite-cohort.mjs`](../scripts/build-hep-composite-cohort.mjs).

- The cohort is **fully synthetic** — not derived from any real subject — generated
  deterministically (a fixed-seed PRNG) so re-runs reproduce byte-identical rows.
  Baseline (`VISITNUM 0`) liver tests span the full pretreatment range: most
  subjects start with elevated ALT/AST/ALP and many with elevated bilirubin, while a
  subset begin in the Normal & Near-Normal quadrant (baseline bilirubin near 1×ULN)
  so migrations _from_ normal are also exercised. A 12-week on-treatment course
  drives migrations that cover every composite quadrant and level of DILI concern,
  with the study arm skewed toward benefit vs. the placebo arm (mirroring the
  paper's finding).
- The generator is **idempotent**: it strips any previously injected `CLD-*` rows
  before appending, so it can be re-run after `scripts/build-demo-data.mjs`
  regenerates `adbds.csv` from pharmaverseadam. The two steps together (build the
  pharmaverseadam BDS, then inject the composite cohort) reproduce the committed
  `adbds.csv`.
- The synthetic rows are clearly labeled and confined to the four liver analytes;
  they add a realistic abnormal-baseline subgroup to the otherwise baseline-normal
  demo population.

## Synthetic acute-kidney-injury cohort (nep-explorer #120)

`site/data/adbds.csv` also carries a **synthetic acute-kidney-injury cohort** —
46 participants, 368 rows, `USUBJID` prefix `AKI-`, `SITE`
`Nephrology Research Unit`, arms `AKI: Study Drug` / `AKI: Placebo` — appended by
[`scripts/build-nep-aki-cohort.mjs`](../scripts/build-nep-aki-cohort.mjs). It is
not derived from any real subject.

It exists because the **KDIGO creatinine scatter** (nep-explorer, [#120](https://github.com/jwildfire/safety.viz/issues/120);
design [obot.roadmap#35](https://jwildfire.github.io/obot.roadmap/requirements/design/35_design.html))
cannot be _demonstrated_ on the pilot population, however correctly it is
implemented. Measured over the pharmaverseadam rows: **208** participants have a
baseline plus a post-baseline creatinine, the maximum fold change anywhere is
**1.45×**, **zero** reach the 1.5× Stage-1 line, and only 9 clear the 0.3 mg/dL
absolute trigger. Every point lands in the white no-stage box, the three coloured
stage zones stay empty, and the summary table reads 208 / 0 / 0 / 0.

Decision **D8** on the design chose injection into the shared extract over a
nep-specific `adnep.csv`, on the `CLD-` mechanism above: it is the house
approach, it is what [#89](https://github.com/jwildfire/safety.viz/issues/89)
DEMO-3 asks for across every under-fed demo, and it keeps DEMO-4's _one versioned
extract_ intact. The accepted cost is that injecting rows regenerates canonical
evidence baselines for every `adbds.csv` consumer.

The cohort is a **chart-driven spec**, not a plausible-population one. It is
built to contain:

- **Creatinine in `umol/L`**, like every other lab in the file, so the demo runs
  _through_ the module's per-record mg/dL conversion (1 mg/dL = 88.4 µmol/L)
  rather than around it — that path is the one place a silent staging error can
  hide. One unit spelling for the measure across the whole file, so no other
  renderer's display of creatinine changes.
- **All four fold-change stages populated** — 19 / 12 / 8 / 7 across Stage 0–3 —
  with enough participants per stage that the summary table's percentages mean
  something. On the combined stage the zones show, that reads 15 / 14 / 8 / 9.
- **Four participants who reach ≥ 4.0 mg/dL**, the KDIGO Stage-3 rule on the
  value reached (design D5). No real dataset here can supply one: the RhoInc
  renderer-specific set's maximum creatinine is 1.93 mg/dL. **Two of the four**
  are built so their fold change alone is only Stage 1 — a high (chronic-kidney-
  disease) baseline with a modest proportional rise — so the demo shows the rule,
  and not the zone under the point, doing the staging.
- **Three participants whose creatinine only falls**, whose maximum post-baseline
  value is still below their own baseline (delta −0.18 to −0.30 mg/dL). The R
  source's `scale_y_continuous(limits = c(0, max))` drops that population off the
  plot unannounced — 21 of 110 in the RhoInc data — and design D6 keeps them by
  extending the domain below zero.
- **Fold and delta stagings that disagree in both directions**: four participants
  are Stage 1 on the absolute axis only (a CKD baseline where a modest
  proportional rise is a large absolute one), and two are Stage 1 on the fold axis
  only. The second case needs a baseline below ~0.6 mg/dL — a low-muscle-mass
  participant — because KDIGO's two Stage-1 criteria are not nested; both are
  present so the summary table's three columns are three genuinely different
  distributions rather than one repeated.
- **No baseline flag.** `adbds.csv` has no such column, so the demo runs on
  design D7's earliest-record fallback — the path most real studies take too.
- **Eight visits per participant** (`Baseline` plus seven on-treatment), using the
  pilot's own visit labels and numbers verbatim, so the injection adds no new
  visit to the other renderers that read this file. Peaks rotate across the
  on-treatment visits rather than all landing on one.

**Deterministic and idempotent.** A fixed-seed mulberry32 PRNG drives all jitter,
so re-running reproduces byte-identical rows; the generator strips any existing
`AKI-*` rows before appending, so it is safe to re-run after
`scripts/build-demo-data.mjs` and after the composite-cohort injector. The
generator additionally **fails the build** when a generated participant does not
land in the stage its archetype promises — the cohort's whole purpose is which
zones it populates, so a jitter band that drifted across a cut-point would
otherwise produce a demo that renders perfectly and demonstrates the wrong thing.
Regenerate with:

```bash
node scripts/build-nep-aki-cohort.mjs
```

The invariants above are asserted against the committed CSV by
[`tests/unit/nep-explorer/cohort.test.js`](../tests/unit/nep-explorer/cohort.test.js)
(`NEP-COHORT-001`…`012`), including a guard that the pharmaverseadam and `CLD-`
row counts are untouched — the cohort **adds** rows, it does not edit the source
extract. As with the ALT waterfall's cohort tests, these live under the module's
own directory rather than a `demo-data/` one: the evidence pipeline routes
`tests/unit/<module>/**` to that module and duplicates everything else into
_every_ module's evidence page.

The demo population is **simulated injury**. The cohort buys a chart that
exercises every zone, and a single shared extract, at the price of a flagship
kidney demo in which no participant is real; the nep-explorer guide page says so
plainly, as the hepatic composite view does.

## Synthetic abnormal-baseline cohort (hep-waterfall #93)

`site/data/adbds-abnbl.csv` is a **separate, fully synthetic dataset** — 80
participants, 1,600 rows, `USUBJID` prefix `ABL-`, `SITE` `Hepatology ABN-BL Unit
(synthetic)`, arms `ABL: Placebo` / `ABL: Study Drug` — generated by
[`scripts/build-hep-abnbl-cohort.mjs`](../scripts/build-hep-abnbl-cohort.mjs).
It is not derived from any real subject and carries no source data.

It exists because the **modified ALT waterfall** (Figure 5 of Amirzadegan et al.,
_Drug Safety_ 2025;48:443–453) cannot be demonstrated on `adbds.csv`. The figure
plots, per participant, a floating bar from baseline ALT to maximum on-treatment
ALT over the population with **abnormal baseline liver tests and normal baseline
bilirubin**. Measured against the vendored demo data, each of these is on its own
fatal:

- **The target population is empty.** After the paper's mandated
  baseline-bilirubin exclusion, 61 of 295 participants are dropped and **zero** of
  the 234 survivors have baseline ALT ≥ 3×ULN — only 19 exceed 1×ULN.
- **The jaundice signal is absent.** The whole file contains exactly **two**
  new-onset-jaundice participants, one per arm, which contradicts rather than
  illustrates the paper's "several developed jaundice" on active drug.
- **The baseline trace is flat and discontinuous.** 215 of the 234 survivors sit
  between 6 and 40 U/L before 11 stragglers jump to 62–85 U/L, so the figure's
  unimodal baseline "mountain" cannot form; the pilot arms' ALT-decrease contrast
  also runs backwards versus the paper.

So the cohort is **purpose-built to carry the figure's signal**, and the generator
writes a new file rather than appending to `adbds.csv`: that file is the demo
dataset for six shipped renderers, and injecting a hepatic cohort into it would
churn their evidence baselines for a figure none of them draws.

- **Composition.** Every participant has a real day-0 `Baseline` record plus four
  on-treatment visits (`VISITNUM` 1–4, the visit sequence used as the study-day
  surrogate) for all four liver analytes — ALT, AST, total bilirubin and ALP —
  so the cohort cannot reproduce the baseline-fallback defect that affects 24 of
  318 participants in `adbds.csv`. ALT carries a **single cohort-wide reference
  range** (6–40 U/L) in a single unit, so the absolute-axis ULN reference is a
  well-defined line rather than a band.
- **Two sub-populations.** 58 participants have baseline bilirubin ≤ 0.8×ULN —
  clear of the exclusion boundary with margin — and baseline ALT spread smoothly
  across 1.0–8.0×ULN (40–319 U/L, no gap wider than 0.18×ULN), which is what
  produces a unimodal baseline trace instead of a staircase. The other 22 have
  baseline bilirubin 1.6–3.9×ULN, so the paper's Table-1 baseline-jaundice
  exclusion has something real to report and the exclusion note becomes
  demonstrable evidence rather than a claim.
- **The signal, as generated.** The active arm skews to ALT decreases (24 of 40
  versus 10 of 40 on placebo — the caption's bars dropping below the baseline
  trace); **six active and one placebo** participant develop new-onset jaundice
  (baseline bilirubin ≤ 1×ULN, peak 2.6–3.5×ULN, alongside a 2.3–2.8× ALT rise),
  the asymmetric drug-attributable green-bar signature; and eight active
  participants carry a peak ALT of 3–4.4× their own baseline, the "substantial
  increases over baseline" tail. Rise magnitudes are scaled down for participants
  who already start high, so the plotted domain stays readable (peak ALT ≤ 700
  U/L against a trace topping out at 319 U/L).
- **Deterministic and idempotent.** A fixed-seed mulberry32 PRNG drives all
  jitter, so re-running reproduces byte-identical rows; the generator strips any
  existing `ABL-*` rows before writing, so it is safe to re-run over its own
  output. Regenerate with:

  ```bash
  node scripts/build-hep-abnbl-cohort.mjs
  ```

  The invariants above are asserted against the committed CSV by
  [`tests/unit/hep-waterfall/abnbl.test.js`](../tests/unit/hep-waterfall/abnbl.test.js)
  (`HWF-COHORT-001`…`011`), so a regeneration that loses the signal fails the
  suite rather than quietly degrading the demo. The tests live under the
  module's own directory rather than a `demo-data/` one deliberately: the
  evidence pipeline routes `tests/unit/<module>/**` to that module and treats
  everything else as shared scaffold, so a `demo-data/` directory would have
  copied these eleven cohort records into **every** renderer's evidence page.

## License and attribution

- **pharmaverseadam** is licensed **Apache-2.0**
  ([LICENSE](https://github.com/pharmaverse/pharmaverseadam/blob/main/LICENSE)).
  The CSVs under `site/data/` are a column-selected, row-filtered derivative of
  its `adlb`/`advs`/`adae`/`adeg`/`adsl`/`adex`/`adcm`/`admh` datasets; this
  file provides the attribution.
- **pharmaversesdtm** is likewise licensed **Apache-2.0**
  ([LICENSE](https://github.com/pharmaverse/pharmaversesdtm/blob/main/LICENSE));
  `pje-ds.csv` is a row-filtered, column-selected derivative of its `ds`
  dataset at the revision named above.
- The underlying study data is the **CDISC SDTM/ADaM Pilot 01** reference study,
  redistributed by pharmaverse; the same study is also mirrored under a permissive
  license by [PHUSE](https://github.com/phuse-org/phuse-scripts).

## History

These datasets replaced an earlier stopgap — a column-trimmed copy of a synthetic
dataset from [`RhoInc/data-library`](https://github.com/RhoInc/data-library) with
generic treatment arms and non-MedDRA adverse-event terms — with a canonical,
licensed, maintained source. See the migration requirement
[obot.roadmap#25](https://github.com/jwildfire/obot.roadmap/issues/25).

The frozen Albumin reference used by the original-renderer binning QC
(`tests/unit/histogram/fixtures/adbds-albumin-reference.csv`) is deliberately kept
from the old dataset — it anchors that cross-validation to the exact values the
original renderer's bin parameters were validated against, independent of the
demo data.
