# The study builder, as R functions (the demo app's Build a study tab). Given a
# few facts about a trial, it has gsm.datasim simulate the study and returns
# the nine raw files the RBQM tab reads, as text, with one line of what was
# made.
#
# gsm.datasim is not installed: it has no WebAssembly build, and it is plain R,
# so its own source files, copied from a release tag (site/vendor/gsm.datasim),
# are evaluated as they are. Two things follow from that and are done here:
# the packages gsm.datasim imports are attached, since its code calls their
# functions by bare name, and `system.file()` is answered for gsm.datasim from
# the copied `inst` folder, since an R that has not installed the package has
# nowhere else to look.
#
# R in the browser and desktop R source this one file, so the two runs differ
# only in the R that runs them. Nothing here makes up a row: every row is
# gsm.datasim's. This file asks for the study, picks the last snapshot, keeps
# the tables the RBQM tab reads, and writes them out.
#
# Five things are changed in the raw files after the simulation, and the tab
# says each. The standard domains' files are written further down.
# - A site id gsm.datasim writes as "0X1234" is written "SITE1234". R reads a
#   column of such values from a CSV file as hexadecimal numbers, so the RBQM
#   pipeline, which reads the files as R does by default, would lose the ids.
# - A column gsm.datasim names as the source system does is given gsm's name
#   for it, as gsm.mapping's own workflow specs say (`source_col`).
# - Raw_STUDY's `phase` and `therapeutic_area` are set to what the reader
#   chose. gsm.datasim draws both at random and neither shapes its data.
# - Raw_LB keeps four columns (studyid, subjid, lb_dt, toxgrg_nsv), as the
#   RBQM demo study's labs file does. They are the columns gsm's lab metric
#   reads, and the whole file is too large to hand a browser tab.
# - Only the last snapshot is returned. The RBQM tab reads one set of files.

# The packages gsm.datasim's code calls by bare name, or that its generators
# call by package: attached, not only loaded.
builder_packages <- c(
  "dplyr", "lubridate", "purrr", "glue", "logger", "magrittr", "rlang",
  "stringr", "tictoc", "yaml", "workr", "gsm.core", "gsm.mapping"
)

# The raw tables the RBQM tab reads, in the order its demo study lists them.
builder_tables <- c(
  "Raw_SUBJ", "Raw_AE", "Raw_PD", "Raw_LB", "Raw_STUDCOMP", "Raw_SDRGCOMP",
  "Raw_SITE", "Raw_STUDY", "Raw_ENROLL"
)

# The columns of the labs file that are kept.
builder_lab_columns <- c("studyid", "subjid", "lb_dt", "toxgrg_nsv")

# What a study may be asked to hold. The page holds the same limits and says
# them; they are checked again here because R is where they matter.
builder_limits <- list(
  participants = c(20L, 500L),
  sites = c(2L, 100L),
  months = c(3L, 12L),
  outlier_intensity = c(0.25, 3)
)

.builder_state <- new.env()

#' Attach the packages gsm.datasim's code needs.
#'
#' The first call pays for loading them; `builder_run` makes the same call, so
#' a page may make it first to say what R is doing.
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

# gsm.datasim names some columns as the source system does, and gsm.mapping's
# own workflow specs say which: a spec column with a `source_col` is that
# column under gsm's name. gsm's pipelines read gsm's names, so each raw table
# is renamed by the spec of the mapping workflows installed with gsm.mapping.
# Nothing about a domain or a column is written here.
.builder_gsm_names <- function(tables) {
  folder <- base::system.file("workflow", "1_mappings", package = "gsm.mapping")
  for (file in list.files(folder, pattern = "\\.yaml$", full.names = TRUE)) {
    spec <- yaml::read_yaml(file)$spec
    for (table in intersect(names(spec), names(tables))) {
      for (column in names(spec[[table]])) {
        source <- spec[[table]][[column]]$source_col
        if (is.null(source) || identical(source, column)) next
        have <- names(tables[[table]])
        if (source %in% have && !(column %in% have)) {
          names(tables[[table]])[have == source] <- column
        }
      }
    }
  }
  tables
}

# A site id that R would read back from a CSV file as a hexadecimal number
# ("0X1234"), under a name it reads as text ("SITE1234"). Any other id is left.
.builder_site_id <- function(id) {
  id <- as.character(id)
  hex <- !is.na(id) & grepl("^0[xX][0-9A-Fa-f]+$", id)
  id[hex] <- sub("^0[xX]", "SITE", id[hex])
  id
}

# ---- The standard domains' files, for the app's other charts ----
#
# The app's charts of participants read standard domains (Subject-level,
# Adverse events, Labs and vitals), not gsm's raw tables. These functions write
# a file for each from the raw tables. No value is made up: each column is a
# raw column under the standard name, or one of three plain derivations that
# the tab states:
# - A study day is the date less the participant's first dose date, plus one
#   (less one day before it, with no day nought); a participant with no dose
#   date is counted from enrolment.
# - An event's severity is its toxicity grade in words, as CTCAE grades are
#   named: 1 mild, 2 moderate, 3 or more severe.
# - A vital sign's unit is the one gsm.datasim's own averages are in. Its
#   generator states none.
# One column is a label of ours: gsm.datasim makes no treatment arms, and the
# charts that compare groups need one, so every participant is in one group,
# named for what it is.

# The one group every participant is in.
builder_arm <- "All participants"

# gsm.datasim's vital signs, by its own generator, for the study as it stands.
.builder_vitals <- function(snapshot, spec_file, intensity) {
  spec <- yaml::read_yaml(spec_file)$spec
  if (is.null(spec$Raw_VS)) stop("The vital signs spec names no Raw_VS table.", call. = FALSE)
  if (is.null(snapshot$Raw_VISIT)) stop("gsm.datasim made no visits to take vital signs at.", call. = FALSE)
  context <- list(
    data = snapshot,
    previous_data = list(),
    combined_specs = list(Raw_VS = spec$Raw_VS),
    n = nrow(snapshot$Raw_SUBJ),
    start_date = NULL,
    end_date = NULL,
    snapshot_idx = 1,
    snapshot_count = 1,
    snapshot_width = "months",
    study_id = NULL,
    risk_profile = NULL,
    total_site_count = nrow(snapshot$Raw_SITE)
  )
  made <- as.data.frame(generate_domain_from_registry("Raw_VS", context))
  # Under gsm's names, as the spec gives them.
  for (column in names(spec$Raw_VS)) {
    source <- spec$Raw_VS[[column]]$source_col
    if (!is.null(source) && source %in% names(made) && !(column %in% names(made))) {
      names(made)[names(made) == source] <- column
    }
  }
  made
}

# Each participant's day one: the first dose date, or enrolment without one.
.builder_day_one <- function(subjects) {
  day_one <- as.Date(as.character(subjects$firstdosedate))
  enrolled <- as.Date(as.character(subjects$enrolldt))
  day_one[is.na(day_one)] <- enrolled[is.na(day_one)]
  stats::setNames(day_one, as.character(subjects$subjid))
}

# A study day: day one is 1 and the day before it is -1.
.builder_day <- function(date, subjid, day_one) {
  days <- as.integer(as.Date(as.character(date)) - day_one[as.character(subjid)])
  ifelse(is.na(days), NA_integer_, ifelse(days >= 0L, days + 1L, days))
}

# The Subject-level file: one row per participant.
.builder_subject <- function(subjects) {
  data.frame(
    USUBJID = as.character(subjects$subjid),
    ARM = builder_arm,
    SITEID = as.character(subjects$invid),
    SEX = as.character(subjects$sex),
    RACE = as.character(subjects$race),
    EOSDY = suppressWarnings(as.integer(subjects$timeonstudy)),
    stringsAsFactors = FALSE
  )
}

# The Adverse events file: one row per event, numbered within a participant
# in the order the events started.
.builder_events <- function(events, day_one) {
  events <- as.data.frame(events)
  events <- events[order(as.character(events$subjid), as.character(events$aest_dt)), , drop = FALSE]
  grade <- suppressWarnings(as.integer(events$aetoxgr))
  severity <- ifelse(is.na(grade), NA_character_,
    ifelse(grade <= 1L, "MILD", ifelse(grade == 2L, "MODERATE", "SEVERE")))
  data.frame(
    USUBJID = as.character(events$subjid),
    ARM = builder_arm,
    AESEQ = stats::ave(seq_len(nrow(events)), as.character(events$subjid), FUN = seq_along),
    AEBODSYS = as.character(events$mdrsoc_nsv),
    AEDECOD = as.character(events$mdrpt_nsv),
    AETERM = as.character(events$mdrpt_nsv),
    AESEV = severity,
    AESER = as.character(events$aeser),
    ASTDY = .builder_day(events$aest_dt, events$subjid, day_one),
    AENDY = .builder_day(events$aeen_dt, events$subjid, day_one),
    stringsAsFactors = FALSE
  )
}

# The vital signs gsm.datasim makes, each with the name the Labs and vitals
# file gives it and the unit its averages are in.
builder_vital_signs <- list(
  weight = c("Weight", "kg"),
  height = c("Height", "cm"),
  bsa = c("Body surface area", "m2"),
  sysbp = c("Systolic blood pressure", "mmHg"),
  diabp = c("Diastolic blood pressure", "mmHg"),
  pulse = c("Pulse", "beats/min"),
  temp = c("Temperature", "C"),
  resp = c("Respiratory rate", "breaths/min")
)

# The Labs and vitals file: one row per participant, visit and vital sign that
# was taken. Visits are numbered in the order of their dates across the study.
.builder_results <- function(vitals, subject, day_one) {
  vitals <- as.data.frame(vitals)
  first_seen <- tapply(as.numeric(as.Date(as.character(vitals$vs_dt))), as.character(vitals$visit), min, na.rm = TRUE)
  order_of <- stats::setNames(seq_along(first_seen) - 1L, names(sort(first_seen)))
  who <- match(as.character(vitals$subjid), subject$USUBJID)
  long <- lapply(intersect(names(builder_vital_signs), names(vitals)), function(column) {
    value <- suppressWarnings(as.numeric(vitals[[column]]))
    keep <- !is.na(value)
    data.frame(
      USUBJID = as.character(vitals$subjid)[keep],
      ARM = builder_arm,
      SITEID = subject$SITEID[who][keep],
      SEX = subject$SEX[who][keep],
      RACE = subject$RACE[who][keep],
      VISIT = as.character(vitals$visit)[keep],
      VISITNUM = unname(order_of[as.character(vitals$visit)])[keep],
      TEST = builder_vital_signs[[column]][1],
      STRESU = builder_vital_signs[[column]][2],
      STRESN = value[keep],
      DY = .builder_day(vitals$vs_dt, vitals$subjid, day_one)[keep],
      stringsAsFactors = FALSE
    )
  })
  do.call(rbind, long)
}

#' Simulate one study and return the RBQM tab's raw files.
#'
#' @param simulator The folder that holds the copy of gsm.datasim.
#' @param study_name The study's name; gsm.datasim makes its id from it.
#' @param participants Number of participants.
#' @param sites Number of sites, no more than the participants.
#' @param months Months of study; gsm.datasim makes one snapshot a month.
#' @param outlier_intensity gsm.datasim's one dial for outlier-like values.
#' @param phase,therapeutic_area What the study file says of each, or `NULL`
#'   to keep what gsm.datasim drew.
#' @param seed A whole number to seed R's random numbers with, or `NULL`.
#' @param vitals The path of gsm.mapping's vital signs mapping workflow
#'   (VS.yaml), whose spec gsm.datasim's vital signs generator is given, or
#'   `NULL` to make no vital signs.
#' @return A list: `study_id`, `snapshot_date`, `snapshots`, `seconds`,
#'   `simulator` (gsm.datasim's version), `files`, one entry per raw table
#'   with its `name`, its `rows` and its `text`, and `standard`, the same for
#'   each file of a standard domain the other charts read.
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
  vitals = NULL
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

  version <- builder_load(simulator)
  if (!is.null(seed)) set.seed(.builder_whole(seed, "Seed", c(0L, .Machine$integer.max)))

  started <- Sys.time()
  study <- suppressMessages(quick_longitudinal_study(
    study_name = trimws(study_name),
    participants = participants,
    sites = sites,
    months_duration = months,
    study_type = "standard",
    include_pipeline = FALSE,
    outlier_intensity = intensity,
    verbose = FALSE
  ))
  dates <- names(study$raw_data)
  snapshot <- study$raw_data[[length(dates)]]

  missing <- setdiff(builder_tables, names(snapshot))
  if (length(missing)) {
    stop("gsm.datasim did not make ", paste(missing, collapse = ", "), ".", call. = FALSE)
  }

  # Vital signs, when their spec is given: gsm.datasim's own generator, run on
  # the study as it stands at the last snapshot, so every row is of a
  # participant and a visit the study has.
  raw_vitals <- if (is.null(vitals)) NULL else .builder_vitals(snapshot, vitals, intensity)

  snapshot <- .builder_gsm_names(snapshot[builder_tables])

  snapshot <- lapply(snapshot, function(table) {
    if ("invid" %in% names(table)) table$invid <- .builder_site_id(table$invid)
    table
  })

  if (!is.null(phase) && "phase" %in% names(snapshot$Raw_STUDY)) {
    snapshot$Raw_STUDY$phase <- as.character(phase)
  }
  if (!is.null(therapeutic_area) && "therapeutic_area" %in% names(snapshot$Raw_STUDY)) {
    snapshot$Raw_STUDY$therapeutic_area <- as.character(therapeutic_area)
  }
  lab_missing <- setdiff(builder_lab_columns, names(snapshot$Raw_LB))
  if (length(lab_missing)) {
    stop("gsm.datasim's labs table lacks ", paste(lab_missing, collapse = ", "), ".", call. = FALSE)
  }
  snapshot$Raw_LB <- snapshot$Raw_LB[, builder_lab_columns, drop = FALSE]

  as_file <- function(name, table) {
    table <- as.data.frame(table)
    list(name = name, rows = nrow(table), text = .builder_csv(table))
  }
  files <- lapply(builder_tables, function(name) as_file(paste0(name, ".csv"), snapshot[[name]]))

  # The standard domains' files, made from the raw tables above.
  subject <- .builder_subject(snapshot$Raw_SUBJ)
  day_one <- .builder_day_one(snapshot$Raw_SUBJ)
  standard <- list(
    as_file("adsl.csv", subject),
    as_file("adae.csv", .builder_events(snapshot$Raw_AE, day_one))
  )
  if (!is.null(raw_vitals)) {
    standard <- c(standard, list(as_file("advs.csv", .builder_results(raw_vitals, subject, day_one))))
  }

  list(
    study_id = as.character(study$study_id),
    snapshot_date = as.character(dates[length(dates)]),
    snapshots = length(dates),
    seconds = round(as.numeric(difftime(Sys.time(), started, units = "secs")), 1),
    simulator = version,
    files = files,
    standard = standard
  )
}
