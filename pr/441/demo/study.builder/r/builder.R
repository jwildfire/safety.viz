# study.builder's R: given a few facts about a trial and the domains wanted,
# gsm.datasim simulates the study and this file returns it in layers: the raw
# tables, and each layer built off them by workr workflows. Every table comes
# with its columns and their types and what made it.
#
# gsm.datasim is not installed: it has no WebAssembly build, and it is plain R,
# so its own source files, copied from a release tag (vendor/gsm.datasim), are
# evaluated as they are. Two things follow from that and are done here: the
# packages gsm.datasim imports are attached, since its code calls their
# functions by bare name, and `system.file()` is answered for gsm.datasim from
# the copied `inst` folder, since an R that has not installed the package has
# nowhere else to look.
#
# R in the browser and desktop R source this one file. Nothing here makes up a
# row, changes one or derives a column: every raw row is gsm.datasim's, and
# every table built off raw is a workflow's. This file asks for the study,
# takes a snapshot, runs the workflows and writes the tables out.
#
# Three things gsm.datasim is asked for, and `builder_notes` says each:
# - Columns under gsm's names, as gsm.mapping's own workflow specs say
#   (`source_col`), where it would name them as the source system does.
# - Site ids that begin "SITE", where it would write "0X1234". R reads a column
#   of such values from a CSV file as hexadecimal numbers.
# - A study table whose `phase` and `therapeutic_area` are what was asked for,
#   and study results shaped by them a little: gsm.datasim's study profile.
#   A protocol's own indication is handed on for the study table.

# The packages gsm.datasim's code calls by bare name, or by package.
builder_packages <- c(
  "dplyr", "lubridate", "purrr", "glue", "logger", "magrittr", "rlang",
  "stringr", "tictoc", "yaml", "workr", "gsm.core", "gsm.mapping", "gsm.reporting"
)

# The domains every study has: gsm.datasim builds every other from them.
builder_core <- c("STUDY", "SITE", "SUBJ", "ENROLL")

# The domains a study may be asked to hold besides, by gsm's name for each.
# VS is made by gsm.datasim's own generator from a spec handed in (`vitals`).
# EG (ECGs) and QS (scores) are made by gsm.datasim's study results, with the
# arms and lab results.
builder_optional <- c(
  "VISIT", "AE", "LB", "VS", "EG", "QS", "PD", "STUDCOMP", "SDRGCOMP", "IE", "PK",
  "Randomization", "OverallResponse", "Death", "QUERY", "DATAENT", "DATACHG"
)

# A domain that needs another: gsm.datasim makes each from the other's rows.
builder_needs <- list(VS = "VISIT", EG = "VISIT", QS = "VISIT", OverallResponse = "VISIT", Death = "STUDCOMP")

# What a study may be asked to hold. The page holds the same limits.
builder_limits <- list(
  participants = c(20L, 500L),
  sites = c(2L, 100L),
  months = c(3L, 12L),
  outlier_intensity = c(0.25, 3)
)

# What was changed in the raw tables, one sentence each.
builder_notes <- c(
  "Arms, lab results, ECGs and adverse event terms are the study results that the modified copy of gsm.datasim adds (they are not in Gilead's gsm.datasim 2.1.0): a lab's toxicity grade is not worked out from its result, and the terms are a short list of its own, not MedDRA.",
  "The modified copy of gsm.datasim is asked for columns under gsm's names, as gsm.mapping's specs say, where Gilead's gsm.datasim names them as the source system does.",
  "The modified copy of gsm.datasim is asked for site ids that begin SITE, where Gilead's gsm.datasim writes 0X1234, which R would read back from a file as a number."
)

.builder_state <- new.env()

#' Attach the packages gsm.datasim's code needs.
#' @return `TRUE`, invisibly.
builder_attach <- function() {
  for (package in builder_packages) {
    suppressPackageStartupMessages(library(package, character.only = TRUE))
  }
  invisible(TRUE)
}

#' Evaluate gsm.datasim's own source, once.
#' @param simulator The folder that holds the copy of gsm.datasim: its `R`
#'   and `inst` folders and its DESCRIPTION.
#' @return The version the DESCRIPTION names, invisibly.
builder_load <- function(simulator) {
  if (identical(.builder_state$simulator, simulator)) {
    return(invisible(.builder_state$version))
  }
  files <- sort(list.files(file.path(simulator, "R"), pattern = "\\.R$", full.names = TRUE))
  if (!length(files)) stop("No gsm.datasim source was found under ", simulator, ".")
  builder_attach()
  inst <- file.path(simulator, "inst")
  # An R that has not installed gsm.datasim answers "" for its files. Its
  # generators read two templates from it, so the copied folder answers.
  assign("system.file", function(..., package = "base", lib.loc = NULL, mustWork = FALSE) {
    if (identical(package, "gsm.datasim")) {
      found <- file.path(inst, ...)
      if (length(found) == 1 && file.exists(found)) return(found)
      if (isTRUE(mustWork)) stop("no file found")
      return("")
    }
    base::system.file(..., package = package, lib.loc = lib.loc, mustWork = mustWork)
  }, envir = globalenv())
  for (file in files) sys.source(file, envir = globalenv())
  # gsm.datasim narrates each step through logger; only its warnings are kept.
  logger::log_threshold(logger::WARN)
  description <- file.path(simulator, "DESCRIPTION")
  version <- if (file.exists(description)) unname(read.dcf(description, fields = "Version")[1, 1]) else NA_character_
  .builder_state$simulator <- simulator
  .builder_state$version <- version
  invisible(version)
}

# One whole number within its limits, or a sentence saying why it is not one.
.builder_whole <- function(value, name, limits) {
  number <- suppressWarnings(as.numeric(value))
  if (length(number) != 1 || is.na(number) || number != round(number)) {
    stop(name, " must be a whole number.", call. = FALSE)
  }
  if (number < limits[1] || number > limits[2]) {
    stop(name, " must be from ", limits[1], " to ", limits[2], ".", call. = FALSE)
  }
  as.integer(number)
}

# A table as the text of a CSV file. Written to a file and read back: a text
# connection is far slower for a file of this many rows.
.builder_csv <- function(table) {
  file <- tempfile(fileext = ".csv")
  on.exit(unlink(file))
  utils::write.csv(table, file, row.names = FALSE, na = "")
  readChar(file, file.info(file)$size, useBytes = TRUE)
}

# A table as what is handed back: its rows, its columns with their types, and
# its text.
.builder_table <- function(table, more = list()) {
  table <- as.data.frame(table, stringsAsFactors = FALSE)
  columns <- lapply(names(table), function(name) {
    list(name = name, type = class(table[[name]])[1])
  })
  c(more, list(rows = nrow(table), columns = columns, text = .builder_csv(table)))
}

# ==== TO MOVE TO gsm.datasim: begin ====
#
# study.builder makes no data: every row is gsm.datasim's. Nothing that makes
# or changes a table may be written in this file (tests/architecture.test.js
# holds that). This fence held what broke the rule, and is empty: each piece is
# now gsm.datasim's own, asked for in `builder_run`.
#
#   Was here             gsm.datasim does it when asked
#   .builder_gsm_names   create_longitudinal_study(column_names = "gsm")
#   .builder_site_id     create_longitudinal_study(site_id_prefix = "SITE")
#   .builder_study       create_longitudinal_study(phase =, therapeutic_area =)
#   .builder_vitals      create_longitudinal_study(domains = "VS", specs = list(Raw_VS = ...))
#
# ==== TO MOVE TO gsm.datasim: end ====

# ---- The layers built off raw ----
#
# Every table that is not raw is made by a workr workflow: a YAML file with a
# spec (the tables and columns it reads) and steps. Nothing is derived in this
# file. Two layers are built here:
#
# - Raw.RBQM: gsm's own mapping workflows, as installed with gsm.mapping, run
#   on the raw tables. gsm calls these tables Mapped. One that comes out the
#   same as its raw table is not kept: the site metrics are fed the raw table.
# - ADaM: study.builder's own workflows (workflows/adam), which write the
#   tables charts of participants read. Each says, in a `columns` block, where
#   every column came from.
#
# A workflow is run only when every table its spec names is there, so a study
# with no adverse events has no ADAE and nothing fails.

# The layers a study may be asked for besides raw, in the order they are shown.
builder_layers <- list(
  list(id = "raw.rbqm", label = "Raw.RBQM", type = "Mapped"),
  list(id = "adam", label = "ADaM", type = "ADaM"),
  list(id = "analysis", label = "Analysis", type = "Analysis"),
  list(id = "reporting", label = "Reporting", type = "Reporting")
)

# A layer that is made from another's tables: asking for it brings the other.
builder_layer_needs <- list(analysis = c("raw.rbqm", "adam"), reporting = "analysis")

# The workflows of a list whose inputs are all there. A workflow may read
# another's output (Type_ID), so the list is walked in order of priority.
.builder_runnable <- function(workflows, have) {
  order_of <- order(vapply(workflows, function(workflow) {
    as.numeric(if (is.null(workflow$meta$Priority)) 1 else workflow$meta$Priority)
  }, numeric(1)))
  keep <- list()
  for (workflow in workflows[order_of]) {
    if (all(names(workflow$spec) %in% have)) {
      keep[[length(keep) + 1]] <- workflow
      have <- c(have, paste0(workflow$meta$Type, "_", workflow$meta$ID))
    }
  }
  keep
}

# Run a layer's workflows on what is there, and hand back each one's table with
# what made it. A workflow that stops is named in `notes` and leaves no table.
# A workflow as it is written, to be shown: what it says of itself, the tables
# and columns it reads, and its steps in order, each with the function it calls
# and what that function is told. Nothing is run or changed here.
.builder_definition <- function(workflow) {
  said <- function(value) {
    if (is.null(value)) return("")
    if (is.atomic(value) && length(value) == 1) return(as.character(value))
    if (is.atomic(value)) return(paste(as.character(value), collapse = ", "))
    trimws(yaml::as.yaml(value))
  }
  list(
    meta = lapply(names(workflow$meta), function(key) list(key = key, value = said(workflow$meta[[key]]))),
    spec = lapply(names(workflow$spec), function(table) {
      columns <- workflow$spec[[table]]
      list(
        table = table,
        columns = lapply(names(columns), function(column) {
          one <- columns[[column]]
          list(
            name = column,
            type = if (is.list(one)) said(one$type) else "",
            required = is.list(one) && isTRUE(one$required)
          )
        })
      )
    }),
    steps = lapply(workflow$steps, function(step) {
      list(
        output = said(step$output),
        name = said(step$name),
        params = lapply(names(step$params), function(key) list(key = key, value = said(step$params[[key]])))
      )
    })
  )
}

.builder_layer <- function(layer, workflows, data) {
  workflows <- .builder_runnable(workflows, names(data))
  tables <- list()
  notes <- character(0)
  if (length(workflows)) {
    names(workflows) <- vapply(workflows, function(workflow) workflow$meta$ID, character(1))
    run <- suppressMessages(workr::RunWorkflows(workflows, lData = data, bContinueOnError = TRUE))
    for (workflow in workflows) {
      name <- paste0(workflow$meta$Type, "_", workflow$meta$ID)
      made <- run$results[[name]]
      if (!is.data.frame(made)) {
        notes <- c(notes, paste0(name, " was not made: its workflow stopped."))
        next
      }
      columns <- workflow$columns
      mapping <- if (is.null(columns)) {
        NULL
      } else {
        lapply(intersect(names(made), names(columns)), function(column) {
          list(
            column = column,
            label = if (is.null(columns[[column]]$label)) "" else columns[[column]]$label,
            from = if (is.null(columns[[column]]$from)) "" else columns[[column]]$from,
            how = columns[[column]]$how
          )
        })
      }
      file <- if (is.null(workflow$meta$File)) paste0(name, ".csv") else workflow$meta$File
      tables[[length(tables) + 1]] <- .builder_table(made, c(
        list(
          id = workflow$meta$ID, table = name, name = file, layer = layer$id,
          description = workflow$meta$Description,
          made = list(workflow = name, from = as.list(names(workflow$spec))),
          definition = .builder_definition(workflow)
        ),
        if (is.null(workflow$meta$Domain)) list() else list(domain = workflow$meta$Domain),
        if (is.null(workflow$meta$Keys)) list() else list(keys = as.list(workflow$meta$Keys)),
        if (is.null(mapping)) list() else list(mapping = mapping)
      ))
    }
  }
  list(tables = tables, notes = notes, data = if (length(workflows)) run$results else list())
}

# A mapped table that is its raw table again, row for row and column for
# column, is not kept: the raw table is used in its place, and whatever read
# the mapped one says it read raw. Only the mapped tables that differ stay.
.builder_same_table <- function(one, other) {
  one <- as.data.frame(one, stringsAsFactors = FALSE)
  other <- as.data.frame(other, stringsAsFactors = FALSE)
  nrow(one) == nrow(other) && setequal(names(one), names(other)) &&
    isTRUE(all.equal(one[names(other)], other, check.attributes = FALSE))
}
.builder_drop_copies <- function(built, data) {
  same <- character(0)
  keep <- list()
  for (table in built$tables) {
    from <- unlist(table$made$from)
    if (length(from) == 1 && is.data.frame(data[[from]]) &&
      .builder_same_table(built$data[[table$table]], data[[from]])) {
      same[[table$table]] <- from
      built$data[[table$table]] <- data[[from]]
    } else {
      keep[[length(keep) + 1]] <- table
    }
  }
  built$tables <- keep
  built$same <- same
  built
}

# Where a table says what it was made from, a dropped copy is named as the raw
# table it was.
.builder_from_raw <- function(tables, same) {
  lapply(tables, function(table) {
    from <- unlist(table$made$from)
    if (length(from)) {
      table$made$from <- as.list(unique(ifelse(from %in% names(same), same[from], from)))
    }
    table
  })
}

# ---- Analysis and Reporting ----
#
# Analysis works statistics out of a data layer; Reporting shapes results for a
# chart or a table to read. Neither belongs to one domain. Two kinds of
# analysis are run here, to show it:
#
# - gsm's site metrics (gsm.kri's metric workflows, copied from its release
#   tag), which read Raw.RBQM. Each leaves the participant-level input it
#   counted from and the site-level summary it came to.
# - study.builder's own analysis workflows (workflows/analysis), which read
#   ADaM.
#
# Reporting is gsm.reporting's four workflows over every metric that ran:
# Results, Bounds, Groups and Metrics.

# gsm's metric workflows on the mapped tables. A metric runs when every table
# its spec names is there; one that stops is named and leaves no table.
.builder_metrics <- function(layer, folder, mapped) {
  workflows <- suppressMessages(workr::MakeWorkflowList(
    strPath = file.path(folder, "workflow", "2_metrics"), strPackage = NULL
  ))
  tables <- list()
  notes <- character(0)
  analyzed <- list()
  ran <- list()
  for (id in names(workflows)) {
    workflow <- workflows[[id]]
    if (!all(names(workflow$spec) %in% names(mapped))) next
    name <- paste0(workflow$meta$Type, "_", workflow$meta$ID)
    made <- tryCatch(
      suppressWarnings(suppressMessages(workr::RunWorkflows(
        list(workflow), c(mapped, list(lWorkflows = workflows[id]))
      ))),
      error = function(e) e
    )
    if (inherits(made, "error") || !is.list(made[[name]])) {
      notes <- c(notes, paste0(name, " was not made: its workflow stopped."))
      next
    }
    analyzed[[name]] <- made[[name]]
    ran[[id]] <- workflow
    about <- paste0(
      workflow$meta$Metric, ": ", workflow$meta$Numerator, " over ", workflow$meta$Denominator,
      ", by ", tolower(workflow$meta$GroupLevel), "; ", workflow$meta$Model, "."
    )
    from <- as.list(names(workflow$spec))
    for (part in c("Summary", "Input")) {
      table <- made[[name]][[paste0("Analysis_", part)]]
      if (!is.data.frame(table)) next
      tables[[length(tables) + 1]] <- .builder_table(table, list(
        id = if (part == "Summary") workflow$meta$ID else paste0(workflow$meta$ID, "_input"),
        table = paste0(name, "_", part),
        name = paste0(name, "_", part, ".csv"),
        layer = layer$id,
        description = if (part == "Summary") workflow$meta$Metric else paste0(workflow$meta$Metric, ": input"),
        about = if (part == "Summary") about else paste0("One row per participant: what ", workflow$meta$Metric, " was counted from."),
        made = list(workflow = name, from = from),
        definition = .builder_definition(workflow)
      ))
    }
  }
  list(tables = tables, notes = notes, analyzed = analyzed, ran = ran)
}

# gsm.reporting's workflows over the metrics that ran.
.builder_reporting <- function(layer, folder, helpers, mapped, metrics, snapshot_date) {
  if (!length(metrics$ran)) return(list(tables = list(), notes = character(0)))
  # gsm.kri is not installed where gsm has no WebAssembly build of it: the one
  # function of it the Results workflow calls is in this file, copied from it.
  sys.source(helpers, envir = globalenv())
  workflows <- suppressMessages(workr::MakeWorkflowList(
    strPath = file.path(folder, "workflow", "3_reporting"), strPackage = NULL
  ))
  # One reads another's table (Bounds reads Results), so a table one of them
  # makes counts as there.
  theirs <- vapply(workflows, function(workflow) {
    paste0(workflow$meta$Type, "_", workflow$meta$ID)
  }, character(1))
  workflows <- workflows[vapply(workflows, function(workflow) {
    all(names(workflow$spec) %in% c(names(mapped), theirs))
  }, logical(1))]
  made <- tryCatch(
    suppressWarnings(suppressMessages(workr::RunWorkflows(workflows, c(mapped, list(
      lAnalyzed = metrics$analyzed, lWorkflows = metrics$ran,
      dSnapshotDate = as.Date(snapshot_date)
    ))))),
    error = function(e) e
  )
  if (inherits(made, "error")) {
    return(list(tables = list(), notes = paste0("gsm's reporting workflows stopped: ", conditionMessage(made))))
  }
  tables <- list()
  for (workflow in workflows) {
    name <- paste0(workflow$meta$Type, "_", workflow$meta$ID)
    if (!is.data.frame(made[[name]])) next
    # What it read: the tables its spec names, and every metric's analysis
    # where it binds them.
    reads_metrics <- any(grepl(
      "lAnalyzed|lWorkflows", unlist(lapply(workflow$steps, function(step) step$params))
    ))
    tables[[length(tables) + 1]] <- .builder_table(made[[name]], list(
      id = workflow$meta$ID, table = name, name = paste0(name, ".csv"), layer = layer$id,
      description = workflow$meta$Description,
      made = list(
        workflow = name,
        from = as.list(c(names(workflow$spec), if (reads_metrics) names(metrics$analyzed)))
      ),
      definition = .builder_definition(workflow)
    ))
  }
  list(tables = tables, notes = character(0))
}

#' Simulate one study and return its domains.
#'
#' @param simulator The folder that holds the copy of gsm.datasim.
#' @param study_name The study's name; its id is the name in capitals, with a
#'   hyphen for anything that is not a letter or a digit.
#' @param participants Number of participants.
#' @param sites Number of sites, no more than the participants.
#' @param months Months of study; gsm.datasim makes one snapshot a month.
#' @param outlier_intensity gsm.datasim's one dial for outlier-like values.
#' @param phase,therapeutic_area What the study table says of each, or `NULL`
#'   to keep what gsm.datasim drew.
#' @param seed A whole number to seed R's random numbers with, or `NULL`.
#' @param domains The domains wanted besides the four every study has, by
#'   gsm's names (`builder_optional`), or `NULL` for adverse events, labs,
#'   deviations, visits, vital signs and the two completion tables.
#' @param vitals The path of gsm.mapping's vital signs mapping workflow
#'   (VS.yaml), whose spec gsm.datasim's vital signs generator is given.
#'   Needed when `domains` holds "VS".
#' @param layers The layers wanted besides raw: "raw.rbqm" (gsm's mapped
#'   tables), "adam", "analysis" and "reporting". A layer made from
#'   another brings it.
#' @param workflows The folder that holds study.builder's own workflows (its
#'   `adam` and `analysis` folders). Needed when `layers` holds "adam".
#' @param kri,reporting The folders that hold the copies of gsm.kri's metric
#'   workflows and gsm.reporting's reporting workflows. Needed for the
#'   analysis and the reporting layer.
#' @param efficacy The scores the study follows, as text: a list with `scores`,
#'   each as gsm.datasim's study results take one (`name`, `visits`,
#'   `baseline`, `sd`, `change`, `effects` by arm, `day`, `min`, `max`). They
#'   are gsm.datasim's to make, as the QS domain. `NULL` for none.
#' @param assumptions What the simulator assumes of the study, as text: a list
#'   with `dropout` (`rate`, optionally `arms` and `day`) and `events`
#'   (`ratio`), each as gsm.datasim's study results take it. `NULL` for
#'   gsm.datasim's own.
#' @param history `TRUE` to keep every monthly snapshot and not only the last:
#'   each earlier snapshot is put through the same workflows, and returned
#'   under `history`.
#' @return A list: `study_id`, `snapshot_date`, `snapshots`, `seconds`,
#'   `simulator` (gsm.datasim's version), `packages` (the version of each
#'   package that had a hand in it), `notes`, and `layers`: raw first, then
#'   each layer asked for, each with its `id`, its `label` and its `tables`.
#'   A table has its `id`, `table`, `name`, `layer`, `rows`, `columns` and
#'   `text`; a table built off raw also has `made` (the workflow and the
#'   tables it read) and, where its workflow says, a `mapping` line for each
#'   column. With `history`, also `history`: the snapshots before the last,
#'   oldest first, each with its `snapshot_date` and its `layers`, or a
#'   `problem` in a sentence when its workflows could not be run.
builder_run <- function(
  simulator,
  study_name = "BUILT-001",
  participants = 200,
  sites = 15,
  months = 6,
  outlier_intensity = 1,
  phase = NULL,
  therapeutic_area = NULL,
  seed = NULL,
  domains = NULL,
  vitals = NULL,
  layers = c("raw.rbqm", "adam", "analysis", "reporting"),
  workflows = NULL,
  kri = NULL,
  reporting = NULL,
  protocol = NULL,
  efficacy = NULL,
  assumptions = NULL,
  history = FALSE
) {
  participants <- .builder_whole(participants, "Participants", builder_limits$participants)
  sites <- .builder_whole(sites, "Sites", builder_limits$sites)
  months <- .builder_whole(months, "Months", builder_limits$months)
  if (sites > participants) stop("Sites must be no more than participants.", call. = FALSE)
  intensity <- suppressWarnings(as.numeric(outlier_intensity))
  if (length(intensity) != 1 || is.na(intensity) ||
    intensity < builder_limits$outlier_intensity[1] ||
    intensity > builder_limits$outlier_intensity[2]) {
    stop(
      "Outlier intensity must be from ", builder_limits$outlier_intensity[1], " to ",
      builder_limits$outlier_intensity[2], ".",
      call. = FALSE
    )
  }
  if (!is.character(study_name) || length(study_name) != 1 || !nzchar(trimws(study_name))) {
    stop("The study needs a name.", call. = FALSE)
  }
  wanted <- if (is.null(domains)) {
    c("VISIT", "AE", "LB", "VS", "EG", "PD", "STUDCOMP", "SDRGCOMP")
  } else {
    setdiff(as.character(unlist(domains)), builder_core)
  }
  unknown <- setdiff(wanted, builder_optional)
  if (length(unknown)) stop("Not a domain study.builder makes: ", paste(unknown, collapse = ", "), ".", call. = FALSE)
  if (!length(wanted)) {
    stop("Choose at least one domain besides the four every study has.", call. = FALSE)
  }
  # A domain that needs another brings it.
  for (domain in intersect(names(builder_needs), wanted)) wanted <- union(wanted, builder_needs[[domain]])
  with_vitals <- "VS" %in% wanted
  if (with_vitals && is.null(vitals)) stop("Vital signs need the vital signs spec (vitals).", call. = FALSE)
  # The spec of the vital signs table is handed to gsm.datasim, which makes
  # vital signs as it makes any other domain: the installed gsm.mapping has no
  # workflow of its own to say it.
  vitals_spec <- if (with_vitals) yaml::read_yaml(vitals)$spec else list()
  if (with_vitals && is.null(vitals_spec$Raw_VS)) {
    stop("The vital signs spec names no Raw_VS table.", call. = FALSE)
  }

  version <- builder_load(simulator)
  if (!is.null(seed)) set.seed(.builder_whole(seed, "Seed", c(0L, .Machine$integer.max)))

  # The protocol arrives as text, with the plan the page worked out: each
  # visit's name, day and window, whether vital signs are taken, and the lab
  # panels drawn. That plan is gsm.datasim's study design.
  design <- NULL
  arms <- NULL
  indication <- NULL
  if (!is.null(protocol)) {
    if (!("VISIT" %in% wanted)) stop("A protocol's schedule needs the visits domain.", call. = FALSE)
    read <- yaml::yaml.load(as.character(protocol))
    design <- list(visits = read$plan)
    arms <- as.character(unlist(read$arms))
    # The protocol's own indication is what the study table says.
    if (is.character(read$indication) && length(read$indication) == 1 && nzchar(read$indication)) {
      indication <- read$indication
    }
  }
  # Arms, lab results and ECGs are gsm.datasim's to make: its `results`. The
  # arms are the protocol's when there is one, and gsm.datasim's own otherwise.
  results <- list(ecg = "EG" %in% wanted)
  if (length(arms)) results$arms <- arms
  # Scores are gsm.datasim's too: what the page asked for is handed on as it is.
  if ("QS" %in% wanted) {
    if (is.null(efficacy)) stop("The scores domain needs the scores to follow (efficacy).", call. = FALSE)
    results$scores <- yaml::yaml.load(as.character(efficacy))$scores
  }
  # So are dropout and how adverse events follow the arm: handed on as they are.
  if (!is.null(assumptions)) {
    assumed <- yaml::yaml.load(as.character(assumptions))
    if (!is.null(assumed$dropout)) results$dropout <- assumed$dropout
    if (!is.null(assumed$events)) results$events <- assumed$events
  }
  started <- Sys.time()
  study <- suppressMessages(create_longitudinal_study(
    study_id = gsub("[^A-Za-z0-9]", "-", toupper(trimws(study_name))),
    participants = participants,
    sites = sites,
    snapshots = months,
    interval = "1 month",
    domains = setdiff(wanted, c("EG", "QS")),
    run_analytics = FALSE,
    run_reporting = FALSE,
    outlier_intensity = intensity,
    # A protocol's schedule is gsm.datasim's to follow: its `design`.
    design = design,
    results = results,
    # The study table says the phase and the area asked for, and gsm.datasim
    # shapes the study results by them: its study profile.
    phase = phase,
    therapeutic_area = therapeutic_area,
    indication = indication,
    # Vital signs, by the spec handed in; gsm's column names; ids a CSV keeps.
    specs = if (with_vitals) vitals_spec["Raw_VS"] else NULL,
    column_names = "gsm",
    site_id_prefix = "SITE",
    verbose = FALSE
  ))
  dates <- names(study$raw_data)
  # What the phase and the area changed, in gsm.datasim's own words.
  profile_note <- paste0(
    "Phase and therapeutic area shape the study results a little, by the study profile that the modified copy of gsm.datasim adds. ",
    study_profile(phase, therapeutic_area)$said,
    " The numbers are guesses at believable sizes, not fitted to data."
  )

  # One snapshot, through every layer asked for. gsm.datasim made each
  # snapshot; the same workflows are run on whichever is asked for.
  one <- function(index) {
    snapshot <- study$raw_data[[index]]

    made <- paste0("Raw_", c(builder_core, intersect(builder_optional, wanted)))
    missing <- setdiff(made, names(snapshot))
    if (length(missing)) {
      stop("gsm.datasim did not make ", paste(missing, collapse = ", "), ".", call. = FALSE)
    }
    snapshot <- snapshot[made]
    # What gsm.datasim called each column it was asked to name as gsm does.
    renames <- lapply(snapshot, function(table) attr(table, "renamed"))

    schedule_note <- if (is.null(design)) {
      NULL
    } else {
      paste0(
        "Visits, vital signs and labs follow the protocol's schedule: ", length(design$visits),
        " planned visits, ", nrow(snapshot$Raw_VISIT),
        " made, by the study design that the modified copy of gsm.datasim adds. Activities of no domain are not simulated."
      )
    }

    raw <- lapply(made, function(table) {
      .builder_table(snapshot[[table]], list(
        id = sub("^Raw_", "", table), table = table, name = paste0(table, ".csv"), layer = "raw",
        made = list(workflow = "gsm.datasim (modified copy)", from = list()),
        renamed = lapply(names(renames[[table]]), function(column) {
          list(column = column, was = unname(renames[[table]][[column]]))
        })
      ))
    })
    out <- list(list(id = "raw", label = "Raw", tables = raw))
    notes <- c(builder_notes, profile_note, schedule_note)

    # "raw" may be named among them and asks for nothing more: a page always
    # names it, so that a study of raw alone is not asked for with an empty list.
    wanted_layers <- setdiff(as.character(unlist(layers)), "raw")
    unknown_layers <- setdiff(wanted_layers, vapply(builder_layers, function(layer) layer$id, character(1)))
    if (length(unknown_layers)) {
      stop("Not a layer study.builder makes: ", paste(unknown_layers, collapse = ", "), ".", call. = FALSE)
    }
    # A layer made from another brings it.
    repeat {
      more <- unique(unlist(builder_layer_needs[intersect(names(builder_layer_needs), wanted_layers)]))
      if (all(more %in% wanted_layers)) break
      wanted_layers <- union(wanted_layers, more)
    }
    data <- snapshot
    metrics <- NULL
    same <- character(0)
    for (layer in builder_layers) {
      if (!(layer$id %in% wanted_layers)) next
      if (layer$id == "raw.rbqm") {
        # gsm's own mapping workflows for the domains made, the one that lists
        # countries from them, and the vital signs one handed in.
        found <- suppressMessages(workr::MakeWorkflowList(
          strPath = "workflow/1_mappings", strPackage = "gsm.mapping",
          strNames = c(sub("^Raw_", "", made), "COUNTRY")
        ))
        if (with_vitals) {
          found <- c(found, suppressMessages(workr::MakeWorkflowList(
            strPath = dirname(vitals), strPackage = NULL
          )))
        }
        built <- .builder_drop_copies(.builder_layer(layer, found, data), data)
        same <- built$same
      } else if (layer$id == "adam") {
        if (is.null(workflows)) stop("The ADaM layer needs study.builder's workflows (workflows).", call. = FALSE)
        found <- suppressMessages(workr::MakeWorkflowList(
          strPath = file.path(workflows, "adam"), strPackage = NULL
        ))
        built <- .builder_layer(layer, found, data)
      } else if (layer$id == "analysis") {
        if (is.null(kri) || is.null(workflows)) {
          stop("The analysis layer needs gsm.kri's workflows (kri) and study.builder's (workflows).", call. = FALSE)
        }
        metrics <- .builder_metrics(layer, kri, data)
        # A workflow step may call a function kept beside the workflows.
        for (file in list.files(file.path(workflows, "analysis"), pattern = "\\.R$", full.names = TRUE)) {
          sys.source(file, envir = globalenv())
        }
        own <- .builder_layer(layer, suppressMessages(workr::MakeWorkflowList(
          strPath = file.path(workflows, "analysis"), strPackage = NULL
        )), data)
        built <- list(
          tables = c(metrics$tables, own$tables), notes = c(metrics$notes, own$notes), data = own$data
        )
      } else {
        if (is.null(reporting) || is.null(kri)) {
          stop("The reporting layer needs gsm.reporting's workflows (reporting) and gsm.kri's (kri).", call. = FALSE)
        }
        built <- .builder_reporting(
          layer, reporting, file.path(kri, "R", "util-Report.R"), data, metrics, dates[index]
        )
        built$data <- list()
      }
      notes <- c(notes, built$notes)
      # What a layer made is there for the layers after it.
      for (name in names(built$data)) if (is.data.frame(built$data[[name]])) data[[name]] <- built$data[[name]]
      out[[length(out) + 1]] <- list(
        id = layer$id, label = layer$label, tables = .builder_from_raw(built$tables, same)
      )
    }
    list(layers = out, notes = notes)
  }

  # The last snapshot is the study. It is built first, so that what it holds
  # for a seed does not depend on whether the earlier ones are kept.
  last <- one(length(dates))
  out <- last$layers
  notes <- last$notes
  earlier <- list()
  if (isTRUE(history) && length(dates) > 1) {
    earlier <- lapply(seq_len(length(dates) - 1), function(index) {
      tryCatch(
        list(snapshot_date = as.character(dates[index]), layers = one(index)$layers),
        error = function(problem) {
          list(snapshot_date = as.character(dates[index]), problem = conditionMessage(problem), layers = list())
        }
      )
    })
  }

  versions <- c(
    list(gsm.datasim = version),
    lapply(
      stats::setNames(nm = c("gsm.mapping", "gsm.core", "gsm.reporting", "workr")),
      function(package) as.character(utils::packageVersion(package))
    ),
    list(R = paste(R.version$major, R.version$minor, sep = "."))
  )

  list(
    study_id = as.character(study$study_id),
    snapshot_date = as.character(dates[length(dates)]),
    snapshots = length(dates),
    seconds = round(as.numeric(difftime(Sys.time(), started, units = "secs")), 1),
    simulator = version,
    packages = versions,
    notes = as.list(notes),
    layers = out,
    history = earlier
  )
}
