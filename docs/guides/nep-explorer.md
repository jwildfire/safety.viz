## What the Nephrotoxicity Explorer shows

The Nephrotoxicity Explorer screens trial laboratory data for **acute kidney injury (AKI)** — an abrupt fall in kidney function, which in a clinical trial is detected as a rise in **serum creatinine**. Creatinine is a muscle-metabolism waste product cleared almost entirely by glomerular filtration, so when filtration falls, creatinine rises. It is an imperfect marker (it lags the injury by a day or more, and its baseline depends on muscle mass, age and sex), but it is measured in essentially every chemistry panel, which makes it the practical screening measure.

The chart is one point per participant. Its two axes are the two ways the **KDIGO** acute-kidney-injury criteria describe a rise:

- **x — maximum fold change**: the participant's highest post-baseline creatinine divided by their own baseline. A ratio, so it is unit-free, and it reads the same for a small person and a large one.
- **y — maximum absolute change**: the same highest value minus their baseline, in mg/dL. An absolute quantity, and the axis where the units matter.

The coloured background regions are the KDIGO stages. A point's region is the **worse** of what its two axes say, which is what gives the plot its L-shaped silhouette: the whole 1.5–2× fold band is Stage 1 at any absolute change, and so is everything at or above a 0.3 mg/dL rise below 1.5× fold. The unpainted box in the lower left is the one region where both criteria are clear.

Beside the chart, the **stage summary** counts the population three ways — by the fold change, by the absolute change, and by the combined stage the zones show.

This tool is **exploratory**. It flags participants for review; it does not diagnose acute kidney injury, which requires the clinical context the chart cannot see — hydration status, concomitant nephrotoxins, obstruction, sepsis, contrast exposure, and the timing of each relative to the rise.

## The KDIGO criteria, and how they are drawn here

KDIGO stages an AKI on serum creatinine three ways:

| Stage | Fold change (value ÷ baseline) | Absolute criteria                                                                   |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------- |
| 1     | 1.5 – 1.9×                     | **or** an increase of ≥ 0.3 mg/dL                                                   |
| 2     | 2.0 – 2.9×                     | —                                                                                   |
| 3     | ≥ 3.0×                         | **or** an increase _to_ ≥ 4.0 mg/dL, or the initiation of renal replacement therapy |

Two consequences shape the display, and both are worth knowing before reading it.

**The absolute-change axis carries exactly one cut-point.** The 0.3 mg/dL rise produces Stage 1 and nothing else — KDIGO defines no Stage 2 or Stage 3 on absolute _change_. That is why the summary table's absolute-change column shows a dash for Stages 2 and 3 rather than a zero: those cells are not empty, they do not exist.

**The ≥ 4.0 mg/dL rule is about the value reached, not the change.** It is therefore not a region of the plane at all, and a participant can trip it while sitting well inside the Stage-1 zone — a chronic-kidney-disease baseline of 2.7 mg/dL rising to 4.4 mg/dL is a 1.6× change, Stage 1 on the ladder, and Stage 3 by the rule. Those participants are drawn with a **larger, differently-shaped mark**, their tooltip says which rule staged them, and the summary table counts them as Stage 3. If you are reading the chart by region alone, these are the points you would otherwise miss.

**No time window is applied.** KDIGO's 0.3 mg/dL rise is defined _within 48 hours_ and the fold change _within 7 days_. This chart — like the original nepExplorer — takes each participant's maximum over their whole post-baseline course, so a slow drift across six months stages the same as an acute injury across two days. That is a deliberate screening simplification, and it means a flagged participant's **timing** has to be checked before the flag means anything. Their tooltip names the visit the maximum came from for exactly that reason.

## Reading the chart

**Start with the cloud, not the corners.** Most of any real cohort sits in the unpainted no-stage box, and the shape of that cloud tells you whether the assay and the population are behaving. Participants whose creatinine only ever _fell_ plot below the zero line — they are kept deliberately, because a chart that starts its axis at zero silently drops them, and their spread is the best available sense of how much of the upward scatter is noise.

**Then read the bands, left to right.** Each vertical boundary is a fold cut-point and is labelled on the axis. A participant one pixel into the Stage-2 band is a 2.0× rise; the band is not a gradient.

**Then look for the odd marks.** The differently-shaped points are the ≥ 4.0 mg/dL rule, wherever they sit.

**Then click.** Selecting a point names the participant, their stage, their baseline and maximum values and the visits both came from, and dispatches the selection to anything mounted alongside the chart.

Two questions the chart is good at answering, and one it is not. It is good at _who_ rose and _by how much relative to themselves_. It is good at whether a treatment arm carries more of them than its comparator — use the **Treatment Group** filter and watch the summary table. It is **not** good at _when_, because of the time window above, or at _why_, which needs the participant's whole course rather than one point.

## Baseline, and why it matters more here than elsewhere

Every number on this chart is relative to one record: the participant's baseline creatinine. When the dataset carries a baseline flag, the module uses the flagged record. When it does not — which is the common case, and the case on this page — it falls back to the participant's earliest record by study day, then visit number, then the order the records arrived, and it **reports how many participants were resolved that way** in the note above the chart.

Read that number. If a participant's earliest record was drawn after dosing began, their "baseline" is already an on-treatment value and both of their axes are understated.

## Units

Creatinine is reported in **mg/dL** in some regions and **µmol/L** in most others (1 mg/dL = 88.4 µmol/L). The fold-change axis is a ratio and is unaffected either way. The absolute axis and both absolute cut-points are not, so the module converts **every record individually** rather than assuming one unit for the dataset — a study whose central lab and one site lab report in different units is a real thing, and a per-dataset assumption would stage it wrongly and silently.

When a record's unit is missing or unrecognized, the module refuses to guess. The fold-change axis stays — it is still exact — and the absolute-change staging, the 0.3 mg/dL boundary and the ≥ 4.0 mg/dL rule are all withheld, with a line above the chart saying so and the y-axis labelled in whatever unit the data actually used. An incomplete staging is recoverable; a confidently wrong one is not.

## How this maps to the controls on this page

- **Filters** (Treatment Group, Sex, Race, Site) narrow the plotted population; the stage summary recounts on the filtered set, so its percentages always describe what is on screen.
- **Stage zone labels** hides the lettering without removing the regions, for reading the cloud rather than the bands.
- The **note above the chart** carries the plotted-participant count, the baseline-fallback count, and — where anything could not be plotted — a count with a **CSV download** of exactly which records and participants left, and why. A count tells you how much data is missing; the download tells you which.

## About this page's demo data

The demo runs on the vendored CDISC Pilot 01 extract **plus a synthetic acute-kidney-injury cohort** (`AKI-*` participants, `Nephrology Research Unit`). The cohort exists because the pilot population cannot demonstrate this chart at all: all 208 of its stageable participants land in the no-stage box, its largest fold change anywhere is 1.45×, and not one reaches the 1.5× Stage-1 line.

So the coloured zones on this page are populated by **simulated injury**. No `AKI-*` participant is a real person, their trajectories were designed to exercise every zone rather than to be clinically typical, and the two participants tripping the ≥ 4.0 mg/dL rule exist because no real dataset available here reaches 4.0 mg/dL at all. Read the page as a demonstration of the display, not as a study finding. Provenance and the full cohort specification are in [`docs/DATA_SOURCES.md`](https://github.com/jwildfire/safety.viz/blob/main/docs/DATA_SOURCES.md).

## What is not yet on this page

- **The patient-profile drill-down** — the original app's per-participant panels for creatinine and cystatin C, eGFR and eGFRcys, related electrolytes, blood pressure and urine albumin/creatinine, with KDIGO reference lines. Phase 2. Clicking a point already dispatches the selection event the profile will mount onto.
- **eGFR** in any form. The demo extract carries creatinine only; the estimated filtration rate needs age and sex, and the dataset that carries them arrives with Phase 2.
- **A time window** on the criteria, as above.
- **Renal replacement therapy**, the third KDIGO Stage-3 criterion, which is not a lab value and so is not in this data domain at all. A participant on dialysis is Stage 3 regardless of what their creatinine does, and this chart cannot know it.

## Where this differs from the original nepExplorer

This is a behaviour port, not a pixel port, and three differences are deliberate.

The **staging ladder** is read worst-match-first from parameterized cut-points defaulting to the KDIGO criteria. The R source stages its summary table with a `case_when` whose branches ascend — and `case_when` returns the first match, so its Stage 2 and Stage 3 branches are unreachable and every rise above the lowest cut is labelled Stage 1. Its chart paints the same three numbers in the opposite order, so the shipped app plots a participant inside the Stage-2 rectangle and labels them "Stage 1" in the table beside it. The chart's geometry was right and the table was wrong; porting either alone would have carried the disagreement forward. A sponsor who wants the original rectangles back sets three numbers in the `stages` setting.

The **absolute-change axis extends below zero**. The source's axis starts at zero, so participants whose creatinine only fell are dropped by the plotting library rather than drawn — a fifth of the cohort in the dataset the original was built against, with nothing on screen to say so.

The **≥ 4.0 mg/dL rule is a mark**, as described above, rather than being folded into the regions or dropped.

## Source and attribution

Ported from [SafetyGraphics/nepExplorer](https://github.com/SafetyGraphics/nepExplorer) (R Shiny, v1.0.0), which is the behavioural specification for this module. Staging follows the KDIGO Clinical Practice Guideline for Acute Kidney Injury (KDIGO AKI Work Group, _Kidney International Supplements_ 2012;2:1–138), Section 2.1.
