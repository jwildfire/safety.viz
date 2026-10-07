# Desktop R's rows for the RBQM pipeline (#231, obot.roadmap#373). Sources
# site/rbqm/pipeline.R, the same file R in the browser is given, calls
# `rbqm_run` with the arguments it is handed, on the repository's own copies of
# the workflows and the demo study's raw files, and writes what it returns as
# JSON. No number is computed anywhere but in the gsm packages' functions.
#
#   Rscript scripts/rbqm-reference.R <arguments.json> <out.json>
#
# Run by scripts/rbqm-reference.mjs, which writes the arguments and adds the
# checksums of what the rows are derived from. Numbers are written with every
# digit a double holds, so a comparison to eight decimal places is of R's
# numbers and not of their printing.

suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("Usage: Rscript scripts/rbqm-reference.R <arguments.json> <out.json>")
request <- jsonlite::fromJSON(args[[1]], simplifyVector = FALSE)

source(request$pipeline, local = globalenv())
answer <- do.call(request$call, request$args)

writeLines(
  jsonlite::toJSON(answer, dataframe = "rows", auto_unbox = TRUE, digits = NA, na = "null", null = "null", pretty = 1),
  args[[2]]
)
