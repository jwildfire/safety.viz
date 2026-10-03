# Desktop R's answers to what the demo app's group comparison asks R for
# (#183, obot.roadmap#366). Reads tests/fixtures/app-statistics/requests.json,
# written from the app itself by scripts/derive-app-statistics.mjs; sources the
# vendored gsm.bio statistics file, site/vendor/gsm.bio/statistics.R, the same
# file R in the browser is given when the reader starts R; calls each function
# on each request's rows; and writes tests/fixtures/app-statistics/expected.json.
#
#   Rscript scripts/app-statistics.R
#
# Each answer is written in the shape bio.viz's connection gives a value from R
# in the browser (bio.viz docs/r-connection.md, "What R receives and returns"),
# with base R and jsonlite, so the browser test compares like with like. No
# number is computed anywhere but in R.

suppressPackageStartupMessages(library(jsonlite))

strDir <- "tests/fixtures/app-statistics"
strStatistics <- "site/vendor/gsm.bio/statistics.R"
source(strStatistics, local = globalenv())

# One R value as bio.viz's connection carries it to JavaScript: a data frame as
# an array of row objects; a named list or a named vector as an object; an
# unnamed list as an array; an unnamed vector of length one as a single value,
# of any other length as an array; a factor, date or date-time as text; NULL
# and NA as null.
ToJs <- function(x) {
  if (is.null(x)) return(NULL)
  if (is.data.frame(x)) {
    lRows <- lapply(seq_len(nrow(x)), function(i) {
      stats::setNames(lapply(names(x), function(strCol) ToJs(x[[strCol]][[i]])), names(x))
    })
    return(lRows)
  }
  if (is.factor(x) || inherits(x, c("Date", "POSIXt"))) x <- as.character(x)
  if (is.list(x)) {
    lOut <- lapply(x, ToJs)
    if (is.null(names(x))) return(unname(lOut))
    return(lOut)
  }
  if (!is.null(names(x))) {
    return(stats::setNames(lapply(unname(x), function(v) if (is.na(v)) NULL else v), names(x)))
  }
  if (length(x) == 1L) return(if (is.na(x)) NULL else x)
  lapply(x, function(v) if (is.na(v)) NULL else v)
}

lRequests <- jsonlite::fromJSON(file.path(strDir, "requests.json"), simplifyVector = FALSE)
lAnswers <- lapply(lRequests$requests, function(lRequest) {
  dfData <- do.call(rbind, lapply(lRequest$data, function(lRow) {
    as.data.frame(lapply(lRow, function(v) if (is.null(v)) NA else v), stringsAsFactors = FALSE)
  }))
  xValue <- do.call(lRequest$name, c(list(dfData), lRequest$args))
  list(name = lRequest$name, args = lRequest$args, rows = length(lRequest$data), value = ToJs(xValue))
})

lExpected <- list(
  chart = lRequests$chart,
  measure = lRequests$measure,
  derived_from = lRequests$derived_from,
  r = paste(R.version$major, R.version$minor, sep = "."),
  statistics = strStatistics,
  answers = lAnswers
)
writeLines(
  jsonlite::toJSON(lExpected, auto_unbox = TRUE, null = "null", na = "null", digits = NA, pretty = 1),
  file.path(strDir, "expected.json")
)
cat(sprintf("Wrote %s/expected.json: %d answers\n", strDir, length(lAnswers)))
