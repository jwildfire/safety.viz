# The RBQM pipeline, as one R function (#231, obot.roadmap#373). Given a
# folder of raw files with gsm's standard names (Raw_SUBJ.csv, Raw_AE.csv, ...)
# and the folders that hold the gsm packages' own workflow YAML, it runs the
# mapping workflows, then the metric workflows, then the reporting workflows,
# each through workr, and returns the four reporting tables: Results, Bounds,
# Groups and Metrics.
#
# R in the browser and desktop R source this one file, so the two runs differ
# only in the R that runs them. Nothing here computes a number: every number
# is a gsm.core function's, called by a workflow step. This file reads the
# files, decides which workflows have their inputs, and hands the lists on.
#
# The workflows are the packages' own, copied from their release tags, with
# one line changed: the Results workflow's last step is named
# `FilterByLatestSnapshotDate` without gsm.kri's prefix, because gsm.kri is
# not installed in the browser. `helpers` is gsm.kri's own file that defines
# that function, sourced here so the name resolves.

#' Run the mapping, metric and reporting workflows on a folder of raw files.
#'
#' @param data Folder holding the raw files, each named `Raw_<DOMAIN>.csv`.
#' @param mappings Folder of mapping workflows (gsm.mapping `1_mappings`).
#' @param metrics Folder of metric workflows (gsm.kri `2_metrics`).
#' @param reporting Folder of reporting workflows (gsm.reporting `3_reporting`).
#' @param helpers gsm.kri's `R/util-Report.R`, which defines
#'   `FilterByLatestSnapshotDate`.
#' @param metric_ids Metric workflows to run, by ID (`"kri0001"`); `NULL` for
#'   every one in `metrics`.
#' @param snapshot_date The snapshot's date, as text (`"2026-10-07"`) or a Date.
#'
#' @return A list: `Results`, `Bounds`, `Groups` and `Metrics`, each a data
#'   frame with dates as text; `ran`, the mapping and metric workflows that
#'   ran; `seconds`, how long each stage took; `versions`, the R and package
#'   versions; and `warnings`, what R warned of along the way.
rbqm_run <- function(data, mappings, metrics, reporting, helpers,
                     metric_ids = NULL, snapshot_date = Sys.Date()) {
  warned <- character()
  seconds <- list()
  # Run one stage: time it, keep workr's log out of the way, and collect what
  # R warns of instead of printing it.
  stage <- function(name, expr) {
    started <- Sys.time()
    value <- withCallingHandlers(
      suppressMessages(expr),
      warning = function(w) {
        warned <<- c(warned, conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    )
    seconds[[name]] <<- round(as.numeric(Sys.time() - started, units = "secs"), 2)
    value
  }

  # A metric workflow may name a gsm.core function without its package, so the
  # packages are attached, not only loaded. The first run pays for loading
  # them and everything they stand on.
  stage("attach", for (package in c("workr", "gsm.core", "gsm.mapping", "gsm.reporting")) {
    if (!paste0("package:", package) %in% search()) {
      suppressPackageStartupMessages(library(package, character.only = TRUE))
    }
  })
  place <- "rbqm:gsm.kri"
  if (place %in% search()) detach(place, character.only = TRUE)
  kri <- new.env(parent = globalenv())
  sys.source(helpers, envir = kri)
  attach(kri, name = place, warn.conflicts = FALSE)
  on.exit(if (place %in% search()) detach(place, character.only = TRUE), add = TRUE)

  # The mapping workflows run their SQL through workr on duckdb. Asking it one
  # question first says in its own words if it cannot start, and is timed apart
  # from the workflows: the first query carries the cost of starting it.
  stage("duckdb", workr::RunQuery("SELECT COUNT(*) AS n FROM df", data.frame(n = 1L)))

  # Read as R reads a CSV, guessing each column's type: the mapping workflows'
  # SQL then sees numbers as numbers and dates as text it can cast.
  lRaw <- stage("read", {
    files <- list.files(data, pattern = "^Raw_.+\\.csv$")
    stats::setNames(
      lapply(file.path(data, files), utils::read.csv, stringsAsFactors = FALSE),
      sub("\\.csv$", "", files)
    )
  })

  # A workflow runs when everything its spec names is there. Mapping workflows
  # come sorted by priority, so one that reads another's output follows it.
  has_inputs <- function(workflow, available) all(names(workflow$spec) %in% available)
  lMappings <- stage("mapping", {
    all_mappings <- workr::MakeWorkflowList(strPath = mappings)
    available <- names(lRaw)
    runnable <- list()
    for (id in names(all_mappings)) {
      if (has_inputs(all_mappings[[id]], available)) {
        runnable[[id]] <- all_mappings[[id]]
        available <- c(available, paste0("Mapped_", all_mappings[[id]]$meta$ID))
      }
    }
    list(workflows = runnable, mapped = workr::RunWorkflows(runnable, lRaw))
  })
  lMapped <- lMappings$mapped

  lMetrics <- stage("metrics", {
    all_metrics <- workr::MakeWorkflowList(strPath = metrics)
    if (!is.null(metric_ids)) {
      all_metrics <- all_metrics[names(all_metrics) %in% unlist(metric_ids)]
    }
    runnable <- Filter(function(workflow) has_inputs(workflow, names(lMapped)), all_metrics)
    list(
      workflows = runnable,
      analyzed = workr::RunWorkflows(runnable, c(lMapped, list(lWorkflows = runnable)))
    )
  })

  lReporting <- stage("reporting", {
    workr::RunWorkflows(
      workr::MakeWorkflowList(strPath = reporting),
      c(lMapped, list(
        lAnalyzed = lMetrics$analyzed,
        lWorkflows = lMetrics$workflows,
        dSnapshotDate = as.Date(snapshot_date)
      ))
    )
  })

  # Dates and factors leave as text, so a table reads the same wherever it is
  # read; numbers leave as they are.
  as_table <- function(df) {
    df <- as.data.frame(df, stringsAsFactors = FALSE)
    for (column in names(df)) {
      value <- df[[column]]
      if (inherits(value, c("Date", "POSIXt")) || is.factor(value)) {
        df[[column]] <- as.character(value)
      }
    }
    rownames(df) <- NULL
    df
  }
  packages <- c("workr", "gsm.core", "gsm.mapping", "gsm.reporting", "duckdb", "DBI", "dplyr")
  list(
    Results = as_table(lReporting$Reporting_Results),
    Bounds = as_table(lReporting$Reporting_Bounds),
    Groups = as_table(lReporting$Reporting_Groups),
    Metrics = as_table(lReporting$Reporting_Metrics),
    ran = list(
      mappings = as.list(names(lMapped)),
      metrics = as.list(names(lMetrics$workflows))
    ),
    seconds = seconds,
    versions = c(
      list(R = paste(R.version$major, R.version$minor, sep = ".")),
      stats::setNames(
        lapply(packages, function(package) as.character(utils::packageVersion(package))),
        packages
      )
    ),
    warnings = as.list(unique(warned))
  )
}
