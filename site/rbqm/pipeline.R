# The RBQM pipeline, as one R function (#231, #234, obot.roadmap#374). Given a
# folder of raw files with gsm's standard names (Raw_SUBJ.csv, Raw_AE.csv, ...)
# and the folders that hold the gsm packages' own workflow YAML, it runs each
# mapping workflow whose inputs are there, then each metric workflow whose
# mapped inputs are there, then the reporting workflows, each through workr,
# and returns the four reporting tables, Results, Bounds, Groups and Metrics,
# and one line of status for each metric: that it ran, or which file it needs,
# or which column a loaded file lacks.
#
# R in the browser and desktop R source this one file, so the two runs differ
# only in the R that runs them. Nothing here computes a number: every number
# is a gsm.core function's, called by a workflow step. This file reads the
# files, decides which workflows have their inputs, hands the lists on, and
# says in words why a workflow was not run.
#
# What a workflow needs is its own spec, read from its YAML: the tables the
# spec names, and for each the columns it names. Nothing about a domain or a
# column is written here.
#
# The workflows are the packages' own, copied from their release tags, with
# one line changed: the Results workflow's last step is named
# `FilterByLatestSnapshotDate` without gsm.kri's prefix, because gsm.kri is
# not installed in the browser. `helpers` is gsm.kri's own file that defines
# that function, sourced here so the name resolves.

# The packages a workflow may name a function of. A metric workflow may name a
# gsm.core function without its package, so they are attached, not only loaded.
rbqm_packages <- c("workr", "gsm.core", "gsm.mapping", "gsm.reporting")

#' Attach the packages the workflows call.
#'
#' The first call pays for loading them and everything they stand on, duckdb
#' most of all; `rbqm_run` makes the same call, so a page may make it first to
#' say what R is doing while it waits.
#'
#' @return The packages attached, as a list of names.
rbqm_attach <- function() {
  for (package in rbqm_packages) {
    if (!paste0("package:", package) %in% search()) {
      suppressPackageStartupMessages(library(package, character.only = TRUE))
    }
  }
  as.list(rbqm_packages)
}

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
#'   frame with dates as text, and with no rows when the workflow that makes it
#'   was not run; `status`, one entry per metric workflow, in the workflows'
#'   order, each its `id`, its `metric` and `abbreviation`, its `state` (`ran`,
#'   `no file`, `no column` or `stopped`), the `files` it needs that are not
#'   loaded, the `columns` it needs that a loaded file lacks, and the `message`
#'   that says so in a sentence; `groups`, the same for the Groups table;
#'   `thresholds`, for each metric that ran, by its ID in the tables, its
#'   thresholds as numbers, for the bar chart's lines;
#'   `notes`, sentences about how the run was made; `ran`, the mapping and
#'   metric workflows that ran; `seconds`, how long each stage took;
#'   `versions`, the R and package versions; and `warnings`, what R warned of
#'   along the way.
rbqm_run <- function(data, mappings, metrics, reporting, helpers,
                     metric_ids = NULL, snapshot_date = Sys.Date()) {
  warned <- character()
  notes <- character()
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

  stage("attach", rbqm_attach())
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

  # ---- Why a workflow was not run, in terms of the files a reader loads ----

  # "a", "a and b", "a, b and c".
  listed <- function(x) {
    if (length(x) < 2) return(paste(x))
    paste(paste(x[-length(x)], collapse = ", "), "and", x[length(x)])
  }
  no_reason <- function() list(files = character(), columns = list(), stopped = character())
  # Two reasons as one: every file not loaded, and every column a file lacks.
  both <- function(a, b) {
    columns <- a$columns
    for (file in names(b$columns)) columns[[file]] <- unique(c(columns[[file]], b$columns[[file]]))
    list(
      files = unique(c(a$files, b$files)),
      columns = columns,
      stopped = unique(c(a$stopped, b$stopped))
    )
  }
  has_reason <- function(why) {
    length(why$files) > 0 || length(why$columns) > 0 || length(why$stopped) > 0
  }
  # What a workflow's own spec asks for that is not there. A raw table that is
  # not there is a file that is not loaded; a mapped table that is not there
  # was not made, for the reason its mapping workflow was not run; a column
  # the spec names that a table lacks is named with the table's file.
  gaps <- function(workflow, tables, unmade) {
    why <- no_reason()
    for (table in names(workflow$spec)) {
      if (!table %in% names(tables)) {
        if (table %in% names(unmade)) {
          why <- both(why, unmade[[table]])
        } else {
          why$files <- unique(c(why$files, paste0(table, ".csv")))
        }
        next
      }
      lacking <- setdiff(setdiff(names(workflow$spec[[table]]), "_all"), names(tables[[table]]))
      if (length(lacking)) {
        file <- if (startsWith(table, "Raw_")) paste0(table, ".csv") else table
        why$columns[[file]] <- unique(c(why$columns[[file]], lacking))
      }
    }
    why
  }
  # The reason in a sentence, of the thing named: a metric, or the Groups table.
  sentence <- function(name, why) {
    said <- character()
    if (length(why$files)) {
      said <- c(said, paste0(
        name, " needs ", listed(why$files), ", which ",
        if (length(why$files) == 1) "is" else "are", " not loaded."
      ))
    }
    for (file in names(why$columns)) {
      columns <- why$columns[[file]]
      said <- c(said, paste0(
        name, " needs the ", if (length(columns) == 1) "column " else "columns ",
        listed(columns), ", which ", file, " does not have."
      ))
    }
    for (message in why$stopped) {
      said <- c(said, paste0(name, " stopped in R: ", sub("[.]*$", ".", message)))
    }
    paste(said, collapse = " ")
  }
  state_of <- function(why) {
    if (length(why$files)) return("no file")
    if (length(why$columns)) return("no column")
    if (length(why$stopped)) return("stopped")
    "ran"
  }
  # One line of status, as it leaves R.
  status_line <- function(id, name, abbreviation, why) {
    list(
      id = id,
      metric = name,
      abbreviation = abbreviation,
      state = state_of(why),
      files = as.list(why$files),
      columns = lapply(names(why$columns), function(file) {
        list(file = file, columns = as.list(why$columns[[file]]))
      }),
      message = sentence(name, why)
    )
  }
  # Run one workflow by itself, so one that stops does not stop the rest; what
  # it returns is named as workr names it, by its type and ID.
  run_one <- function(workflow, lData) {
    tryCatch(
      workr::RunWorkflows(list(workflow), lData),
      error = function(e) structure(list(message = conditionMessage(e)), class = "rbqm_stopped")
    )
  }
  made_by <- function(workflow) paste0(workflow$meta$Type, "_", workflow$meta$ID)

  # ---- Mapping: each workflow whose spec is met, in the workflows' order ----

  # The workflows come sorted by priority, so one that reads another's output
  # follows it. Each is checked against the tables there are by then.
  lMapped <- list()
  unmade <- list()
  stage("mapping", {
    for (workflow in workr::MakeWorkflowList(strPath = mappings)) {
      output <- made_by(workflow)
      why <- gaps(workflow, c(lRaw, lMapped), unmade)
      if (!has_reason(why)) {
        made <- run_one(workflow, c(lRaw, lMapped))
        if (inherits(made, "rbqm_stopped")) {
          why$stopped <- made$message
        } else {
          lMapped[[output]] <- made[[output]]
        }
      }
      if (has_reason(why)) unmade[[output]] <- why
    }
  })

  # ---- Metrics: each workflow whose mapped inputs are there ----

  all_metrics <- workr::MakeWorkflowList(strPath = metrics)
  if (!is.null(metric_ids)) {
    all_metrics <- all_metrics[names(all_metrics) %in% unlist(metric_ids)]
  }
  lAnalyzed <- list()
  lRan <- list()
  status <- list()
  stage("metrics", {
    for (id in names(all_metrics)) {
      workflow <- all_metrics[[id]]
      output <- made_by(workflow)
      why <- gaps(workflow, lMapped, unmade)
      if (!has_reason(why)) {
        made <- run_one(workflow, c(lMapped, list(lWorkflows = all_metrics[id])))
        if (inherits(made, "rbqm_stopped")) {
          why$stopped <- made$message
        } else {
          lAnalyzed[[output]] <- made[[output]]
          lRan[[id]] <- workflow
        }
      }
      status[[length(status) + 1]] <- status_line(
        workflow$meta$ID, workflow$meta$Metric, workflow$meta$Abbreviation, why
      )
    }
  })

  # ---- Reporting: Results, Metrics and Bounds for the metrics that ran, and
  # Groups when the site, study and country tables were all made ----

  all_reporting <- workr::MakeWorkflowList(strPath = reporting)
  groups_why <- gaps(all_reporting$Groups, lMapped, unmade)
  lReporting <- list()
  if (length(lRan)) {
    lReporting <- stage("reporting", {
      lData <- lMapped
      # The Results workflow reads the study's ID from the mapped study table.
      # With no study file loaded there is no such table, so it is handed the
      # one value it reads, from the loaded files' own study ID column, and
      # the run says so.
      if (!"Mapped_STUDY" %in% names(lData)) {
        ids <- unique(unlist(lapply(lRaw, function(df) {
          if ("studyid" %in% names(df)) as.character(df$studyid)
        })))
        ids <- ids[!is.na(ids) & nzchar(ids)]
        if (!length(ids)) ids <- "Unknown"
        lData$Mapped_STUDY <- data.frame(GroupID = ids[[1]], stringsAsFactors = FALSE)
        notes <- c(notes, paste0(
          "No study table was made, so the study's ID, ", ids[[1]],
          ", is read from the study ID column of the loaded files.",
          if (length(ids) > 1) " The files name more than one study; the first is used." else ""
        ))
      }
      runnable <- all_reporting[names(all_reporting) != "Groups" | !has_reason(groups_why)]
      workr::RunWorkflows(
        runnable,
        c(lData, list(
          lAnalyzed = lAnalyzed,
          lWorkflows = lRan,
          dSnapshotDate = as.Date(snapshot_date)
        ))
      )
    })
  }

  # Dates and factors leave as text, so a table reads the same wherever it is
  # read; numbers leave as they are. A table that was not made has no rows.
  as_table <- function(df) {
    if (is.null(df)) return(data.frame())
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
  # A metric's thresholds are text in its workflow ("-2,-1,2,3"). gsm's bar
  # chart draws a line at each, and is handed them as numbers by gsm's own R
  # binding, which parses them with this gsm.core function, in the order they
  # are written. It is the one gsm function named here: it is no workflow's
  # step to run, and the page parses no number itself.
  thresholds <- stage("thresholds", stats::setNames(
    lapply(lRan, function(workflow) {
      as.list(gsm.core::ParseThreshold(workflow$meta$Threshold, bSort = FALSE))
    }),
    vapply(lRan, made_by, character(1))
  ))
  packages <- c(rbqm_packages, "duckdb", "DBI", "dplyr")
  groups_made <- !is.null(lReporting$Reporting_Groups)
  list(
    Results = as_table(lReporting$Reporting_Results),
    Bounds = as_table(lReporting$Reporting_Bounds),
    Groups = as_table(lReporting$Reporting_Groups),
    Metrics = as_table(lReporting$Reporting_Metrics),
    status = status,
    groups = if (!groups_made && !has_reason(groups_why)) {
      # Its inputs are there, and nothing was reported: no metric ran.
      list(
        state = "not run", files = list(), columns = list(),
        message = "The Groups table was not made: no metric ran."
      )
    } else {
      status_line("Groups", "The Groups table", "Groups", groups_why)[
        c("state", "files", "columns", "message")
      ]
    },
    thresholds = thresholds,
    notes = as.list(notes),
    ran = list(
      mappings = as.list(names(lMapped)),
      metrics = as.list(names(lRan))
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
