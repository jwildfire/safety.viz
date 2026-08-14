## What the Time-to-Event Explorer shows

An adverse-event table answers _how many_; this display answers _when_. For a chosen time-to-event endpoint — time to first adverse event of interest, time to first serious adverse event, time to discontinuation — it draws one **Kaplan–Meier** curve per treatment group: the estimated fraction of participants who have had the event by each study day, accounting correctly for participants whose follow-up ended before any event (censoring). Whether the curves separate early, late, or not at all is information no incidence table carries.

The display's parts:

- **Step curves** — the Kaplan–Meier product-limit estimate per group. The curve moves only at event times and holds flat between them; that is a property of the estimator, not a smoothing choice. By default the display is **cumulative incidence (1 − KM)**, the safety convention: curves rise, and the group with more events sits higher. A control flips to event-free (survival) orientation; the axis names the estimator either way.
- **Censor tick marks** — a small tick on the curve at each time a participant left follow-up without the event. A curve that runs flat for a long stretch full of tick marks is flat because people stopped being watched, not because risk stopped; the marks are what let you tell the difference.
- **Pointwise 95% confidence band** — Greenwood's variance with the log-log transform, the same interval `survival::survfit` produces by default family. **Pointwise** means the interval is valid at each time separately; it is _not_ a statement about the whole curve at once, and eyeballing whether two bands overlap is not a hypothesis test.
- **The strip table** below the axis — **number at risk** and **cumulative events** per group at each axis tick. Every number in it comes from the same estimator pass that drew the curves, so the table cannot disagree with the picture.

This tool is **exploratory**. It flags timing patterns for review; it does not establish absolute risk or a treatment effect.

## What 1 − KM does and does not claim

The Kaplan–Meier estimator answers a precise question: _what fraction of participants would have had the event by day t, if censoring were unrelated to event risk and nothing else could intervene?_ Two of its assumptions deserve attention in a safety context, and both matter for this demo's own data.

**Competing events make 1 − KM an overestimate of absolute risk.** When a participant dies, or discontinues for an unrelated reason, they are censored here — treated as if they were still at risk of the event afterwards, when in fact they no longer are. The Kaplan–Meier arithmetic redistributes their remaining "risk" onto participants still under observation, which pushes 1 − KM **above** the true cumulative incidence. The size of the bias grows with the competing-event rate. The estimator that answers the absolute-risk question under competing events is **Aalen–Johansen** (cumulative incidence function), which this module does not yet offer — a deliberate Phase-1 scope line, stated here rather than papered over. Until then: read these curves as _event timing under the KM convention_, not as absolute risk, and say "cumulative incidence (1 − KM)" — as the axis does — rather than "risk".

The demo data is itself the worked example: participants without a qualifying event are censored at end of study _regardless of reason_ — including the study's on-study deaths. A participant who died on day 60 contributes "at risk" time they did not have, so the demo's curves sit slightly above the truth their own data implies. In this dataset the effect is small; in an oncology trial it would not be.

**Censoring is assumed uninformative.** The estimator assumes that participants censored at day t have the same future event risk as those still observed. Administrative end-of-study censoring usually satisfies this; censoring by discontinuation-due-to-toxicity does not — a participant who left _because of_ toxicity was likelier than average to have the event next. If a large share of censorings are informative, the curve is biased in a direction you cannot determine from the plot alone. The censor marks and the `CNSDTDSC` tooltip reasons exist so a reviewer can see _what kind_ of censoring dominates.

## Reading the display

**Start with the risk table, not the curves.** The right-hand tail of a KM curve is estimated from whoever is left, and "whoever is left" can be a handful of participants. A curve that jumps 10 points at day 170 when 3 participants remain at risk is not a signal; the at-risk row tells you so immediately. As a working rule, be increasingly skeptical of any part of the curve where the at-risk number has fallen below roughly 10–15% of the starting group.

**Read separation against the bands, remembering they are pointwise.** Bands that separate cleanly over a sustained interval are worth attention; a transient gap at one time point is what pointwise intervals produce by chance. Formal comparison (log-rank, hazard ratios) is analysis-dataset territory, deliberately not drawn here.

**Sparse endpoints look like this on purpose.** The demo's serious-adverse-event endpoint has three events in 254 participants: a nearly flat curve with a wide band that ends early. That _is_ the honest display of a rare endpoint — a module that smoothed or extrapolated it would be lying. The band simply stops where the mathematics stops supporting it (before the first event, and wherever the estimate reaches 0 or the risk set is exhausted).

**The curve's flat right end is not "no more risk".** The curve extends flat to the last observed time and then stops. Beyond the last event time it is not evidence of safety — it is the absence of further information, usually visible as a cluster of censor marks.

## Where the numbers come from

The module consumes an **ADTTE-shaped analysis dataset**: one row per participant per endpoint, with a time (`AVAL`, days from the analysis time origin) and an ADaM censor flag (`CNSR`: 0 = event, ≥ 1 = censored). Which events qualify, the earliest-qualifying-event rule, and the censoring date hierarchy are **decisions made upstream in that dataset by the data owner** — exactly as in regulated practice — and the renderer never re-derives them. What the renderer does compute (the estimator, the variance, the bands, the strip table) is pinned by unit tests to hand-computed textbook values and cross-validated against R's `survival::survfit` at full precision on the committed demo data.

The demo's endpoints are derived from the CDISC Pilot 01 study (pharmaverseadam): time to first **dermatologic** event — the actual safety concern of that dermal-patch trial, and the endpoint where its arms genuinely separate — plus time to first serious adverse event and time to first any treatment-emergent adverse event. The derivation, including its censoring convention and its known limitations, is documented in `docs/DATA_SOURCES.md`.

## What this module deliberately does not do (yet)

- **Aalen–Johansen competing-risk curves** — the Phase-2 answer to the overestimation above.
- **Log-rank tests, hazard ratios, or any between-group inference** — analysis territory, not display territory.
- **Median time-to-event annotation** — for safety endpoints the median is usually never reached, and a half-drawn annotation misleads more than it informs.
- **Simultaneous confidence bands** — the drawn bands are pointwise and labelled as such.
- **Deriving time-to-event from raw AE and disposition domains in the browser** — the censoring rules that requires are clinical decisions, kept with the data owner.
