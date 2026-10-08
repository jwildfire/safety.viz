# Shows that the RBQM demo study's labs file, kept to four columns (#233,
# obot.roadmap#374), gives the lab metric the Results rows the whole file
# gives. Sources site/rbqm/pipeline.R, runs the grade 3+ lab abnormality rate
# (kri0005) twice through the copied workflows, once on the study as the
# repository keeps it and once with the whole labs file in place of the cut
# one, and stops unless the two Results tables are identical.
#
#   Rscript scripts/rbqm-labs-check.R <the whole Raw_LB.csv, from demo-301 input/>
#
# The whole file is 7.3 MB and is not kept here: fetch it from
# jwildfire/demo-301 at the commit site/data/rbqm/SOURCE.json names. Needs
# desktop R with gsm.core, gsm.mapping, gsm.reporting, workr and duckdb.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1) stop("Usage: Rscript scripts/rbqm-labs-check.R <the whole Raw_LB.csv>")
whole <- args[[1]]
kept <- "site/data/rbqm"

source("site/rbqm/pipeline.R", local = globalenv())
run <- function(data) {
  rbqm_run(
    data = data,
    mappings = "site/vendor/gsm.mapping/workflow/1_mappings",
    metrics = "site/vendor/gsm.kri/workflow/2_metrics",
    reporting = "site/vendor/gsm.reporting/workflow/3_reporting",
    helpers = "site/vendor/gsm.kri/R/util-Report.R",
    metric_ids = "kri0005",
    snapshot_date = "2026-10-07"
  )
}

# The study again, with the whole labs file where the cut one is.
other <- file.path(tempfile("rbqm-labs-"), "data")
dir.create(other, recursive = TRUE)
files <- list.files(kept, pattern = "^Raw_.+\\.csv$")
invisible(file.copy(file.path(kept, setdiff(files, "Raw_LB.csv")), other))
invisible(file.copy(whole, file.path(other, "Raw_LB.csv")))

columns <- function(file) names(utils::read.csv(file, nrows = 1))
rows <- function(file) length(readLines(file)) - 1L
cat("Kept labs file: ", rows(file.path(kept, "Raw_LB.csv")), " rows, columns ",
  paste(columns(file.path(kept, "Raw_LB.csv")), collapse = ", "), "\n",
  sep = ""
)
cat("Whole labs file: ", rows(whole), " rows, ", length(columns(whole)), " columns\n", sep = "")

from_kept <- run(kept)
from_whole <- run(other)
stopifnot(identical(from_kept$ran$metrics, list("kri0005")))
cat("Results rows for ", unique(from_kept$Results$MetricID), ": ", nrow(from_kept$Results),
  " from the kept file, ", nrow(from_whole$Results), " from the whole file\n",
  sep = ""
)
same <- identical(from_kept$Results, from_whole$Results)
cat("Identical Results tables:", same, "\n")
cat("Identical Bounds tables:", identical(from_kept$Bounds, from_whole$Bounds), "\n")
cat("Sites flagged:", sum(from_kept$Results$Flag != 0, na.rm = TRUE), "in both\n")
if (!same) stop("The lab metric's Results rows differ between the kept labs file and the whole one.")
