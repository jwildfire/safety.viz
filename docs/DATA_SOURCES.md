# Demo data sources

safety.viz demos and evidence run on three example datasets vendored under
[`site/data/`](../site/data):

| File        | Shape                                            | Used by                                                                                                                       |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `adbds.csv` | One row per lab / vital-sign measurement (BDS)   | Histogram, Outlier Explorer, Paneled Outlier Explorer, Results Over Time, Shift Plot, Delta-Delta, Hep Explorer, Web Codebook |
| `adae.csv`  | One row per adverse event                        | AE Explorer, AE Timelines                                                                                                     |
| `adeg.csv`  | One row per ECG interval measurement (QT/QTc/HR) | QT Safety Explorer                                                                                                            |

Both are **generated**, not hand-maintained. The generator is
[`scripts/build-demo-data.mjs`](../scripts/build-demo-data.mjs); rerun it to
refresh the committed CSVs:

```bash
node scripts/build-demo-data.mjs
```

## Source: pharmaverseadam (CDISC Pilot 01)

The data is built from **[pharmaverseadam](https://github.com/pharmaverse/pharmaverseadam)**,
the pharmaverse consortium's ADaM test-data package. Its datasets are derived
from the public **CDISC SDTM/ADaM Pilot 01** study (`CDISCPILOT01`) — a 254-subject
Alzheimer's trial randomized to Placebo / Xanomeline Low Dose / Xanomeline High
Dose, with real MedDRA-coded adverse events and reference-range–bearing labs and
vital signs.

The generator reads five published CSVs from the package's `inst/extdata/`:

- `adlb.csv` (ADaM lab chemistry + hematology) → BDS lab rows
- `advs.csv` (ADaM vital signs) → BDS vital-sign rows
- `adae.csv` (ADaM adverse events) → AE rows
- `adsl.csv` (ADaM subject-level) → AE placeholder rows for AE-free participants
- `adeg.csv` (ADaM ECG intervals) → QT/QTc/HR rows

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
- **QTc is derived here, not taken from the pilot (#79).** The pilot ships
  pre-derived corrections as `QTCFR`/`QTCBR` ("Rederived"), but both were computed
  upstream from the ADEG `RR` column, which is corrupt: its median of 528 ms
  implies a heart rate of 113.6 bpm, contradicting the recorded `HR` (median
  72 bpm). The pilot's `RRR` parameter is the sound one — it equals 60000/`HR`
  exactly, for every record. The build therefore recomputes
  `QTcF = QT / (RRR/1000)^(1/3)` and `QTcB = QT / (RRR/1000)^(1/2)`, and derives
  `BASE`/`CHG` from each participant's own `ABLFL='Y'` reading (the source
  `BASE`/`CHG` belong to the discarded values). Passing `QTCFR` through had
  inflated QTcF by ~80 ms — median 561 vs 468 — which saturated every ICH E14
  threshold in the demo. `assertRrSane()` in `scripts/demo-data-lib.mjs` fails the
  build if the RR source ever disagrees with `HR` by more than 1 bpm again.
- **The pilot's QT is long regardless.** Even correctly derived, the CDISC Pilot 01
  ECG data is not a realistic thorough-QT population: the _measured_ QT has a
  median of 444 ms, so QTcF still centres near 468 ms and a majority of
  participants cross the 450/480/500 ms categories. That is a property of the
  synthetic source, not of the derivation — the QT Explorer demo exercises every
  view and threshold, but its crossing rates should not be read as clinically
  typical.

Resulting sizes: `adbds.csv` ≈ 5.5 MB (≈ 56k rows, 254 participants, 28 measures);
`adae.csv` ≈ 0.1 MB (1,122 treatment-emergent events + 37 placeholder rows,
254 participants, 23 body systems); `adeg.csv` ≈ 0.5 MB (5,361 rows, 254
participants, 3 ECG parameters).

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

## License and attribution

- **pharmaverseadam** is licensed **Apache-2.0**
  ([LICENSE](https://github.com/pharmaverse/pharmaverseadam/blob/main/LICENSE)).
  The CSVs under `site/data/` are a column-selected, row-filtered derivative of
  its `adlb`/`advs`/`adae`/`adeg` datasets; this file provides the attribution.
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
