> **Prototype.** This chart is a prototype shipping alongside the v1.5 release for evaluation. It is fully tested and documented, but its settings and behaviour may change before it is finalized — pin a version if you depend on the exact API.

## When to use this chart — and when not to

The Hepatic ALT Waterfall is an interactive version of the **modified waterfall plot** published as Figure 5 of Amirzadegan et al., "Emerging Tools to Support DILI Assessment in Clinical Trials with Abnormal Baseline Serum Liver Tests or Pre-existing Liver Diseases" (_Drug Safety_ 2025;48(5):443–453). It exists for one specific problem: **a trial that deliberately enrols participants whose liver tests are already abnormal at baseline.**

The classic eDISH plot places each participant at their peak ALT and peak total bilirubin, both expressed as multiples of the laboratory's upper limit of normal (×ULN). That works when everybody starts near normal, because then a peak of 4×ULN means the same thing for every participant. It stops working when baselines are abnormal. A participant who enters the study at 3×ULN and never moves lands in the same quadrant as one who climbed from 0.6×ULN to 3×ULN — the first has no drug effect at all, the second has a fivefold rise. In an abnormal-baseline population the eDISH quadrants fill up with participants who were already there on day one, and the drug signal is buried inside them.

The paper's Table 1 answers this by assigning different graphics to different baseline profiles. This chart is the one assigned to:

> **elevated baseline ALT, with normal baseline bilirubin.**

**Use it when** your population was enrolled with raised transaminases — NASH/MASH, chronic viral hepatitis, alcohol-related liver disease, oncology populations with hepatic involvement — but bilirubin was required to be normal at entry, and you want to know whether the drug arm pushes ALT up more than placebo does, or brings it down.

**Do not use it when** participants are jaundiced at baseline. Baseline bilirubin above the upper limit of normal is an _exclusion_ here, applied by default and reported in the notes above the chart: those participants belong on the **composite plot** in the [Hepatic Safety Explorer](../hep-explorer/guide.html), which references everything to each participant's own baseline. Do not use it as a substitute for eDISH in a baseline-normal trial either — there the ×ULN quadrants are exactly the right frame, and this chart just makes the same data harder to read. The companion note, [Choosing a hepatic DILI graphic](https://github.com/jwildfire/safety.viz/blob/dev/docs/guides/hepatic-dili-tools.md), lays the choice out as a single decision table.

## How to read it

### The black line is everyone's baseline

Each participant occupies one slot on the horizontal axis, and the participants are **ranked by their baseline value**: the placebo arm runs left to right in ascending order, then the active arm continues right-to-left in descending order, so the two arms' highest baselines meet at the seam in the middle. The continuous black line traces those baselines across the ordering, which is why it forms a single "mountain" that rises to a peak at the arm divider and falls away again.

That shape is not decoration. It is what lets you read the rest of the chart. Because the line is monotone within each arm, a participant's position on the axis tells you how sick their liver already was before the first dose — far left and far right are the mildest baselines, the centre is the most abnormal. A bar's meaning therefore depends on where it sits, and the chart puts that context in front of you without a second display.

### The bars are what happened on treatment

One vertical bar per participant spans from **their own baseline** to **their maximum on-treatment value**. So:

- a bar pointing **up** means the participant's worst on-treatment value was higher than their baseline — a rise, and the taller the bar the larger it was;
- a bar pointing **down** means their worst on-treatment value was still _below_ where they started — the liver test improved on treatment.

The downward bars are half the point of the figure. In the paper's Study 2 the active arm produced many more of them than placebo did, which is a therapeutic-benefit signal you cannot see at all on an eDISH plot: eDISH plots peaks, and a peak below baseline is invisible there.

The "maximum on-treatment" value deliberately **excludes the baseline record itself** — by record identity, not merely by study day. That sounds pedantic and is not: when a participant has no scheduled day-0 draw and their baseline resolves to an early unscheduled visit, a naive "day > 0" rule counts that record as on-treatment, their maximum can then never fall below their own baseline, and every downward bar for those participants silently disappears.

### The bars' colours

| Colour                 | Meaning                                      |
| ---------------------- | -------------------------------------------- |
| **Blue** (`#1f78b4`)   | Placebo arm                                  |
| **Bronze** (`#b5651d`) | Active treatment arm                         |
| **Green** (`#2e8b3d`)  | Developed **new-onset jaundice**, either arm |

Green **overrides** the arm colour, exactly as the paper's caption describes, and the legend says so out loud. If you do not know that green wins, you will miscount each arm — a jaundiced active-arm participant is drawn green, not bronze. New-onset jaundice means the participant's baseline total bilirubin was at or below the threshold (2×ULN by default, the Hy's-Law bilirubin cut) and their on-treatment maximum crossed it. Those bars are the ones to open first: a substantial ALT rise plus new jaundice in a participant who was not jaundiced at entry is the pattern that may represent drug-induced liver injury, and the whole chart exists to let you find them and prioritise them for in-depth review.

### Why the axis is absolute U/L, not ×ULN or ×baseline

Both vertical axes — the chart is scaled identically on the left and the right, so you can read a bar against whichever edge is nearer — are in the measure's **own reporting units**, U/L for ALT. Neither ratio scale would work here:

- **×ULN** is what eDISH uses, and it is precisely the scale that fails in this population, for the reason in the first section.
- **×baseline** (the mDISH / composite scale) fixes the "already abnormal" problem but destroys the severity ranking. A participant who goes from 20 to 100 U/L has quintupled and is still barely abnormal; one who goes from 300 to 700 U/L has barely more than doubled and is in serious territory. On a ×baseline axis the first bar towers over the second, which is backwards.

Absolute units keep every participant on one severity scale, which is what makes a tall bar near the centre — a large rise on top of an already-high baseline — read as the alarming thing it is.

The **reference range** is drawn as a grey line when every participant shares one upper limit of normal, and as a shaded band labelled with its span when the limit varies across the cohort (it genuinely does vary in real studies, which is why a single line would be a fiction). The **Reference range** control switches this to a per-participant dash or turns it off.

### The flanking summary panels

A box-and-whisker panel sits on each side of the waterfall — placebo on the left, active on the right — sharing the main chart's vertical scale, so the boxes line up with the bars and can be read straight across. By default each panel carries **two** boxes, the arm's distribution of baseline values and its distribution of maximum on-treatment values, so the panel summarises the _shift_ the bars show one participant at a time. Boxes show the quartiles with the median rule, whiskers to the 5th and 95th percentiles, and a mean marker. The **Arm summary** control reduces each panel to the single on-treatment box if you prefer the plainer reading.

## Working the chart

1. **Check the notes line first.** It reports how many participants are plotted per arm, how many were excluded for abnormal baseline bilirubin (the Table-1 rule), how many were excluded because their arm was designated neither placebo nor active, and how many records were dropped for a missing reference range. If the excluded counts are large, that is information about your population, not a defect — and it may tell you that you are looking at the wrong graphic.
2. **Confirm the arm mapping.** The **Placebo arm** and **Active arm** controls list every arm value in the data. Auto-detection matches values that name themselves placebo or control; it is a convenience, not a contract. A trial with several dose levels can isolate one of them here.
3. **Read the two arms' downward bars against each other.** More bronze than blue below the line is the improvement signal.
4. **Read the tall upward bars, then the green ones.** Hover for the participant's identifier, arm, baseline, maximum on-treatment value with the study day it occurred, the change in both absolute and ×baseline terms, their peak total bilirubin in ×ULN, and their jaundice status.
5. **Click a bar** to select that participant and open a listing of their own records, and to emit a `participantsSelected` event that a host application can use to open its own case review. Click it again to clear.
6. **Vary the thresholds** if your protocol uses different ones. **Jaundice threshold** moves the bilirubin cut that decides which bars are green; the **Exclude baseline bilirubin** checkbox turns the Table-1 cohort rule off for exploratory use, and says loudly in the notes that it is off.

## What this chart cannot tell you

**The maximum can hide a rise.** This is the paper's own acknowledged limitation, and it is worth stating plainly: because the bar is drawn to the _maximum_ on-treatment value, a participant whose ALT falls a long way and then climbs back — 300 → 60 → 250 U/L — has a maximum below their baseline and draws a bar pointing **down**. The trajectory contains a fourfold rise from the nadir, and the chart does not show it. Screening on the change from baseline alone will miss that case. The mitigation is in the chart: click the bar to see the participant's records, and treat a large downward bar in an actively-dosed participant as something to look at rather than something to skip.

**A bar is not a diagnosis.** Drug-induced liver injury is a diagnosis of exclusion. A green bar flags a participant for review; confirming a drug cause requires the full workup — timing, dechallenge, alkaline phosphatase and the R-Ratio, competing diagnoses, serology — described in the [Hepatic Safety Explorer guide](../hep-explorer/guide.html).

**One value per participant, per arm side.** The chart summarises each participant with two numbers. It says nothing about when the rise happened, how fast it climbed, whether it resolved on continued dosing, or whether alkaline phosphatase moved with it. Those are eDISH-explorer and lab-over-time questions.

## About the demo data on this page

**The demo cohort is synthetic.** Every other renderer on this site demonstrates against an extract of the CDISC Pilot 01 study, and this one cannot: that study is an Alzheimer's trial whose participants have essentially normal baseline liver tests, so the population this chart serves is _empty_ in it. Measured directly: after the paper's baseline-bilirubin exclusion, **zero** of its 234 surviving participants reach a baseline ALT of 3×ULN; the whole file contains **two** new-onset-jaundice participants; and its baseline values are flat and discontinuous, so the unimodal baseline "mountain" cannot form at all.

The demo therefore runs on `adbds-abnbl.csv`, a fully synthetic 80-participant cohort (identifiers prefixed `ABL-`, site `Hepatology ABN-BL Unit (synthetic)`) generated deterministically for this figure and documented in [DATA_SOURCES.md](https://github.com/jwildfire/safety.viz/blob/dev/docs/DATA_SOURCES.md). It is not derived from any real subject, and its numbers carry no clinical meaning whatsoever. Read the shapes, the controls and the notes; do not read the values.
