## What the eDISH plot shows

The Hepatic Safety Explorer is an interactive version of the eDISH ("evaluation of Drug-Induced Serious Hepatotoxicity") plot. Each point is one study participant, placed at that participant's **peak transaminase** on the x-axis and **peak total bilirubin** on the y-axis. Both values are fold-change units, so a value of `3` means three times the upper limit of normal (ULN). Because the two peaks can occur on different study days, a single point summarizes a participant's worst observed liver chemistry over the whole study.

Two dashed cut-lines divide the plane into four regions. The vertical line sits at the transaminase threshold (ALT at `3x` ULN by convention) and the horizontal line at the bilirubin threshold (`2x` ULN). The four named quadrants read as follows:

- **Normal** (lower-left): neither transaminase nor bilirubin is meaningfully elevated.
- **Isolated hyperbilirubinemia** (upper-left): bilirubin is up but transaminase is not, which points away from hepatocellular injury and toward causes such as cholestasis, hemolysis, or benign unconjugated hyperbilirubinemia.
- **Temple's Corollary / isolated ALT** (lower-right): transaminase is elevated without qualifying bilirubin, i.e. hepatocellular signal that has not (yet) produced jaundice.
- **Possible Hy's Law** (upper-right): both transaminase and bilirubin are elevated, the pattern historically associated with serious drug-induced liver injury.

A point in the upper-right quadrant is only a **potential** Hy's Law case: the plot flags it for review, it does not diagnose. Drug-induced liver injury (DILI) is a diagnosis of exclusion, so every upper-right case needs the evaluation below before any conclusion is drawn.

## The evaluation workflow

Start from a quadrant of interest and gather evidence for or against a drug cause. The workflow forks by quadrant, but each branch asks the same question: is the timing, pattern, and magnitude of the liver signal consistent with drug injury, or is it better explained by the population, a competing diagnosis, or an artifact?

### Quadrant orientation

Locate the case. Possible Hy's Law (upper-right), Temple's Corollary (lower-right), and isolated hyperbilirubinemia (upper-left) each open a distinct decision path. Note how many participants sit in each region before drilling in.

### Step 1: potential Hy's-Law cases and population confounders

If the default ULN plot shows no upper-right cases, re-examine the data on a baseline-corrected scale before concluding there is no signal, because participants who start with low-normal chemistry can develop a large **relative** rise that never crosses an absolute ULN threshold. If cases do appear upper-right, ask whether the population explains them. An oncology population with liver metastases, for example, can carry elevated baseline chemistry, and the thresholds should be raised to account for it. On a baseline-corrected (mDISH) scale, suggested boundaries are roughly `3.8x` baseline for ALT and `4.8x` baseline for total bilirubin.

### Step 2a: timing coincidence and cholestasis screen

Confirm that the transaminase and bilirubin elevations are plausibly linked. The peaks should fall within about **2 to 4 weeks** of each other, with bilirubin rising after transaminase. Then screen out cholestasis: alkaline phosphatase (ALP) should stay **below `2x` ULN**. A coincident ALP elevation suggests a cholestatic component rather than pure hepatocellular injury, though it does not by itself rule out a drug cause.

### R-Ratio and nR: hepatocellular versus cholestatic pattern

Characterize the injury type with the R-Ratio, defined as `R = (ALT/ULN) / (ALP/ULN)`. As a rule of thumb, `R > 5` indicates a hepatocellular pattern, `R` of `2 to 5` a mixed pattern, and `R < 2` a cholestatic pattern. A newer variant, nR, also incorporates AST so that injury with prominent AST is not missed.

### Step 2b: onset window and rate of rise

Read when and how fast the transaminase rose. The first **12 weeks** of dosing is generally the highest-risk window; peaks well beyond it are less often drug-attributable. A steeper climb across the `3x`, `5x`, `10x`, and `20x` ULN levels suggests a more acute insult.

### Step 2c: hepatocyte-loss magnitude

A peak-ALT / exposure-derived estimate of hepatocyte loss (P_ALT) can grade severity beyond raw peak ALT, distinguishing mild from moderate injury and from loss sufficient to produce Hy's Law. This estimate and its exposure track are coming in a later release, not part of this chart yet.

### Step 2d to 2f: AST corroboration and resolution

Cross-check the AST time course and the AST:ALT ratio to separate hepatocellular injury from mitochondrial, muscle, alcohol, or hemolysis-related sources, and confirm that values resolve after (or despite continued) dosing.

### Temple's Corollary branch

For an isolated transaminase elevation without qualifying bilirubin, judge whether it reflects real hepatocellular injury that could later progress into the Hy's Law quadrant, running the analogous timing, rate-of-rise, and AST checks.

### Isolated hyperbilirubinemia branch

For an isolated bilirubin elevation without transaminase, weigh non-hepatocellular explanations such as cholestasis, hemolysis, or benign unconjugated hyperbilirubinemia, which can place a participant in this quadrant without any drug injury.

## How this maps to the controls on this page

- **Named quadrants and per-quadrant counts** → the Quadrants overlay with named corners, live per-quadrant percentages, and the Quadrant / # / % summary table.
- **Moving the ALT and bilirubin thresholds** → the X and Y Reference Line number inputs, which reposition the two dashed cut-lines and reclassify points live (draggable cut-lines are coming in a later release; use the numeric inputs for now).
- **Baseline-corrected (mDISH) reasoning** → the Display Type toggle, eDISH (÷ ULN) versus mDISH (÷ day-0 baseline).
- **Which analyte is on each axis** → the measure pickers for ALT, AST, total bilirubin, and ALP, plus the linear/log Axis Type toggle.
- **Timing coincidence between peaks** → the timing-window days input, which renders in-window points filled and out-of-window ones hollow, alongside the day-gap in the tooltip.
- **Injury pattern (hepatocellular versus cholestatic)** → the R-Ratio value in the tooltip and the R-Ratio range filter; point size can also encode R-Ratio via the Point Size toggle (Uniform / rRatio).
- **Onset window and rate of rise** → click a point to open the Standardized Lab Values by Study Day line chart and read each peak's study day.
- **AST corroboration and per-measure detail** → the same drill-down, with its Measure / N / Min / Median / Max summary table and linked record listing.
- **Population and subgroup context** → the Group color-by control with its legend, plus the categorical data filters.
- **Hepatocyte-loss (P_ALT) magnitude and the exposure track** → not yet on this page; both are planned for a later release, so no control corresponds to them today.

## Try it in the demo

Open the [Live demo](index.html) and work a few of the steps against real data.

- Switch the Display Type from eDISH to mDISH to see who moves into the upper-right quadrant once values are read against each participant's own baseline.
- Nudge the X (ALT) Reference Line upward, toward an oncology-adjusted value, and watch the per-quadrant percentages update as points are reclassified.
- Set an R-Ratio range filter to isolate the hepatocellular cases (`R > 5`) from mixed and cholestatic ones.
- Click a point in the possible Hy's Law quadrant to open its lab trajectory, then check whether the transaminase and bilirubin peaks fall within a few weeks of each other and whether ALP stayed below `2x` ULN.

## Source and attribution

This guide is adapted, in our own words, from the "Interactive Safety Graphic – Hepatic Safety Explorer User's Manual" (v1.2.1), a product of the DIA-ASA Interactive Safety Graphics Working Group. It summarizes the workflow structure and clinical rationale rather than reproducing the manual. For the full workflow, citations, and clinical detail, see the authoritative manual: [HepExplorerWorkflow v1.2.1 (PDF)](https://github.com/SafetyGraphics/SafetyGraphics.github.io/raw/master/guide/HepExplorerWorkflow_v1_2_1.pdf).
