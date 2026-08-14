#!/usr/bin/env Rscript
# build-tte-fixture.R — regenerate the survival::survfit reference fixture that
# cross-validates src/time-to-event/km.js (safety.viz#128; design obot.roadmap
# requirements/design/161_design.html §7).
#
# For every PARAMCD × ARM in the committed demo dataset site/data/adtte.csv this runs
# the reference implementation — survfit(Surv(AVAL, CNSR == 0) ~ 1, conf.type =
# "log-log"), i.e. the product-limit estimator with Greenwood variance and
# complementary log-log pointwise 95% bounds — and writes each event time's
# n.risk / n.event / surv / lower / upper to
# tests/unit/time-to-event/fixtures/survfit-reference.json at full precision.
# tests/unit/time-to-event/survfit.test.js replays the same inputs through km.js and
# asserts agreement.
#
# The fixture is committed; this script is regeneration-only (like the pharmaverseadam
# fetch in build-demo-data.mjs) so CI needs no R toolchain. Rerun after regenerating
# adtte.csv:
#   Rscript scripts/build-tte-fixture.R

suppressPackageStartupMessages({
  library(survival)
  library(jsonlite)
})

repo_root <- normalizePath(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), ".."))
adtte <- read.csv(file.path(repo_root, "site", "data", "adtte.csv"), stringsAsFactors = FALSE)

groups <- list()
for (paramcd in unique(adtte$PARAMCD)) {
  for (arm in sort(unique(adtte$ARM))) {
    rows <- adtte[adtte$PARAMCD == paramcd & adtte$ARM == arm, ]
    fit <- survfit(Surv(AVAL, CNSR == 0) ~ 1, data = rows, conf.type = "log-log")
    keep <- fit$n.event > 0
    groups[[length(groups) + 1]] <- list(
      paramcd = paramcd,
      arm = arm,
      n = nrow(rows),
      time = fit$time[keep],
      n_risk = fit$n.risk[keep],
      n_event = fit$n.event[keep],
      surv = fit$surv[keep],
      lower = fit$lower[keep],
      upper = fit$upper[keep]
    )
  }
}

fixture <- list(
  provenance = list(
    generator = "scripts/build-tte-fixture.R",
    generated = format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"),
    r_version = R.version.string,
    survival_version = as.character(packageVersion("survival")),
    call = 'survfit(Surv(AVAL, CNSR == 0) ~ 1, conf.type = "log-log") per PARAMCD x ARM',
    source = "site/data/adtte.csv"
  ),
  groups = groups
)

out <- file.path(repo_root, "tests", "unit", "time-to-event", "fixtures", "survfit-reference.json")
dir.create(dirname(out), recursive = TRUE, showWarnings = FALSE)
write_json(fixture, out, digits = NA, auto_unbox = TRUE, pretty = TRUE)
cat(sprintf("wrote %s: %d groups\n", out, length(groups)))
