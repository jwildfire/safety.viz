# Demo data sources

safety.viz demos and evidence run on four example datasets vendored under
[`site/data/`](../site/data):

| File              | Shape                                            | Used by                                                                                                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `adbds.csv`       | One row per lab / vital-sign measurement (BDS)   | Histogram, Outlier Explorer, Paneled Outlier Explorer, Results Over Time, Shift Plot, Delta-Delta, Hep Explorer, Web Codebook |
| `adae.csv`        | One row per adverse event                        | AE Explorer, AE Timelines                                                                                                     |
| `adeg.csv`        | One row per ECG interval measurement (QT/QTc/HR) | QT Safety Explorer                                                                                                            |
| `adbds-abnbl.csv` | One row per liver-test measurement (BDS)         | Hep Waterfall                                                                                                                 |

All are **generated**, not hand-maintained. The first three are built from
pharmaverseadam by [`scripts/build-demo-data.mjs`](../scripts/build-demo-data.mjs);
rerun it to refresh the committed CSVs:

```bash
node scripts/build-demo-data.mjs
```

`adbds-abnbl.csv` has no published source at all — it is fully synthetic and has
its own generator; see
[Synthetic abnormal-baseline cohort](#synthetic-abnormal-baseline-cohort-hep-waterfall-93)
below.

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
