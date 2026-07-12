# Demo data sources

safety.viz demos and evidence run on two example datasets vendored under
[`site/data/`](../site/data):

| File        | Shape                                          | Used by                                                                                                         |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `adbds.csv` | One row per lab / vital-sign measurement (BDS) | Histogram, Outlier Explorer, Paneled Outlier Explorer, Results Over Time, Shift Plot, Delta-Delta, Web Codebook |
| `adae.csv`  | One row per adverse event                      | AE Explorer, AE Timelines                                                                                       |

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

The generator reads three published CSVs from the package's `inst/extdata/`:

- `adlb.csv` (ADaM lab chemistry + hematology) → BDS lab rows
- `advs.csv` (ADaM vital signs) → BDS vital-sign rows
- `adae.csv` (ADaM adverse events) → AE rows

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

Resulting sizes: `adbds.csv` ≈ 5.5 MB (≈ 56k rows, 254 participants, 28 measures);
`adae.csv` ≈ 0.1 MB (1,122 treatment-emergent events, 23 body systems).

## License and attribution

- **pharmaverseadam** is licensed **Apache-2.0**
  ([LICENSE](https://github.com/pharmaverse/pharmaverseadam/blob/main/LICENSE)).
  The CSVs under `site/data/` are a column-selected, row-filtered derivative of
  its `adlb`/`advs`/`adae` datasets; this file provides the attribution.
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
