# Choosing a hepatic DILI graphic

A short decision note shared by the two hepatic renderers in safety.viz —
[Hepatic Safety Explorer](hep-explorer.md) and
[Hepatic ALT Waterfall](hep-waterfall.md). It exists to stop the most expensive
mistake a reviewer can make with these charts, which is not misreading one: it is
reading the **wrong one for their trial** and concluding, confidently, from a
frame that does not apply.

The organising idea comes from Table 1 of Amirzadegan et al., "Emerging Tools to
Support DILI Assessment in Clinical Trials with Abnormal Baseline Serum Liver
Tests or Pre-existing Liver Diseases", _Drug Safety_ 2025;48(5):443–453
([DOI](https://doi.org/10.1007/s40264-024-01511-8),
[PMID 39932652](https://pubmed.ncbi.nlm.nih.gov/39932652/)): **which graphic you
should use is decided by the population's baseline liver profile, not by
preference.** Each tool answers a different question, on a different scale, over
a different subset of participants.

## The decision table

Find your trial's **baseline** profile in the first column. Everything else
follows from it.

| Baseline liver profile at enrolment                                                                       | Reach for                                                                               | Vertical scale                       | Where it lives in safety.viz                                                 |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| **Normal ALT and normal bilirubin** (the ordinary case)                                                   | **eDISH scatter** — peak vs peak, Hy's-Law quadrants                                    | ×ULN                                 | Hepatic Safety Explorer, **eDISH / mDISH scatter** view                      |
| Normal baselines, but **no cases appear** in the Hy's-Law quadrant                                        | **mDISH** — the same scatter, baseline-corrected                                        | ×Baseline (3.8× ALT / 4.8× TB)       | Hepatic Safety Explorer, scatter view, **Display Type → mDISH**              |
| **Elevated ALT, normal bilirubin** (NASH/MASH, chronic hepatitis, oncology with hepatic involvement)      | **Modified ALT waterfall** — baseline → maximum on-treatment, per participant           | **Absolute U/L**                     | **Hepatic ALT Waterfall** (this module)                                      |
| **Both ALT and bilirubin abnormal**, including participants jaundiced at baseline                         | **Composite plot** — pretreatment and on-treatment panels plus the ×Baseline shift plot | ×ULN **and** ×Baseline, side by side | Hepatic Safety Explorer, **Composite plot** view                             |
| Any abnormal-baseline population, when the question is **how participants moved between severity states** | **Migration Sankey** — bidirectional, placebo left / active right                       | Categorical (severity states)        | Planned — [safety.viz#92](https://github.com/jwildfire/safety.viz/issues/92) |

## Why the scale is the whole argument

Each row changes the vertical scale, and the scale is what makes a tool right or
wrong for a population.

- **×ULN** compares every participant against the laboratory's normal limit. It
  is the right frame when everybody starts near normal, because then "4×ULN"
  means the same thing for everyone. In an abnormal-baseline trial it means
  nothing: a participant who enrolled at 3×ULN and never moved sits in the same
  quadrant as one who climbed there from 0.6×ULN, and the drug signal disappears
  into the enrolment criteria.

- **×Baseline** compares every participant against their own starting point,
  which is exactly what the abnormal-baseline problem calls for — and it
  destroys the severity ranking as a side effect. A rise from 20 to 100 U/L is a
  fivefold change in a liver that is still barely abnormal; a rise from 300 to
  700 U/L is barely more than double, in a liver that is in trouble. On a
  ×Baseline axis the first towers over the second. That is acceptable when you
  are classifying _movement_ between states (the composite plot's job); it is
  not acceptable when you are ranking _severity_.

- **Absolute reporting units (U/L)** keep every participant on one severity
  scale and let each one be read against their own baseline at the same time,
  which is what the waterfall's floating bars do. The price is that the chart
  needs a single unit for the plotted measure and a reference range to draw
  against — and the waterfall refuses to plot rather than mixing two units on
  one axis.

## The population rule, spelled out

The two abnormal-baseline tools are not interchangeable, and they deliberately
**disagree about who is in the cohort**:

- The **ALT waterfall** _excludes_ participants whose baseline total bilirubin
  is above the upper limit of normal. Its question — "did the drug arm push ALT
  further up, or bring it down?" — presumes bilirubin started normal, so that a
  new bilirubin rise is a genuine event rather than a continuation. The excluded
  count is reported in the notes above the chart.

- The **composite plot** _requires_ those same participants. Its question — "how
  did each participant migrate between baseline and on-treatment severity
  states, and does the drug arm show more benefit or more concern than placebo?"
  — is only answerable when the baseline-abnormal participants are in the frame.

So a single trial with a mixed population will often want both, on the two
different subsets. What it must not do is read one cohort's chart and describe it
as the other's.

## Two cautions that apply to all of them

**None of these graphics diagnoses anything.** Drug-induced liver injury is a
diagnosis of exclusion. Every one of these tools flags participants for review;
confirming a drug cause needs the full workup — timing and dechallenge,
alkaline phosphatase and the R-Ratio, competing diagnoses, serology — which the
[Hepatic Safety Explorer guide](hep-explorer.md) walks through step by step.

**Summarising a participant with one number loses the trajectory.** eDISH plots
peaks, and two peaks can fall on different visits; the waterfall plots the
maximum on-treatment value, and a rise that follows a larger decline never
exceeds the baseline. In both cases the mitigation is the same and is built into
the charts: click the participant and read their records before drawing a
conclusion about them.
