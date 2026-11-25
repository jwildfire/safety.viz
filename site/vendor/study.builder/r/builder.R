# study.builder's R: given a few facts about a trial and the domains wanted,
# gsm.datasim simulates the study and this file returns each domain as a
# table, with its columns and their types, and the standard files made from
# them, each with a line for every column saying where it came from.
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
# row: every row is gsm.datasim's. This file asks for the study, takes the last
# snapshot, and writes it out.
#
# Three things are changed in the raw tables, and `builder_notes` says each:
# - A column gsm.datasim names as the source system does is given gsm's name
#   for it, as gsm.mapping's own workflow specs say (`source_col`).
# - A site id gsm.datasim writes as "0X1234" is written "SITE1234". R reads a
#   column of such values from a CSV file as hexadecimal numbers.
# - Raw_STUDY's `phase` and `therapeutic_area` are set to what was asked for.
#   gsm.datasim draws both at random and neither shapes its data.

# The packages gsm.datasim's code calls by bare name, or by package.
builder_packages <- c(
  "dplyr", "lubridate", "purrr", "glue", "logger", "magrittr", "rlang",
  "stringr", "tictoc", "yaml", "workr", "gsm.core", "gsm.mapping"
)

# The domains every study has: gsm.datasim builds every other from them.
builder_core <- c("STUDY", "SITE", "SUBJ", "ENROLL")

# The domains a study may be asked to hold besides, by gsm's name for each.
# VS is made by gsm.datasim's own generator from a spec handed in (`vitals`).
builder_optional <- c(
  "VISIT", "AE", "LB", "VS", "PD", "STUDCOMP", "SDRGCOMP", "IE", "PK",
  "Randomization", "OverallResponse", "Death", "QUERY", "DATAENT", "DATACHG"
)

# A domain that needs another: gsm.datasim makes each from the other's rows.
builder_needs <- list(VS = "VISIT", OverallResponse = "VISIT", Death = "STUDCOMP")

# What a study may be asked to hold. The page holds the same limits.
builder_limits <- list(
  participants = c(20L, 500L),
  sites = c(2L, 100L),
  months = c(3L, 12L),
  outlier_intensity = c(0.25, 3)
)

# What was changed in the raw tables, one sentence each.
builder_notes <- c(
  "Columns gsm.datasim names as the source system does are given gsm's names, as gsm.mapping's specs say.",
  "Site ids are written SITE1234 where gsm.datasim writes 0X1234, which R would read back from a file as a number.",
  "The study table's phase and therapeutic area are what was asked for. gsm.datasim does not shape the data by either."
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

# Each raw table under gsm's column names, as the spec of the mapping workflows
# installed with gsm.mapping says, and the spec handed in for vital signs.
.builder_gsm_names <- function(tables, more = list()) {
  folder <- base::system.file("workflow", "1_mappings", package = "gsm.mapping")
  specs <- lapply(list.files(folder, pattern = "\\.yaml$", full.names = TRUE), function(file) {
    yaml::read_yaml(file)$spec
  })
  for (spec in c(specs, list(more))) {
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

# gsm.datasim's vital signs, by its own generator, for the study as it stands
# at the last snapshot, so every row is of a participant and a visit it has.
.builder_vitals <- function(snapshot, spec) {
  if (is.null(spec$Raw_VS)) stop("The vital signs spec names no Raw_VS table.", call. = FALSE)
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
  as.data.frame(generate_domain_from_registry("Raw_VS", context))
}

# ---- The standard files, for charts of participants ----
#
# Charts of participants read standard domains (Subject-level, Adverse events,
# Labs and vitals), not gsm's raw tables. These functions write a file for each
# from the raw tables. No value is made up. Each column is a raw column under
# the standard name, or one of the plain derivations below, and every file is
# handed back with a line for each of its columns saying which (`mapping`).

# The one group every participant is in: gsm.datasim makes no treatment arms.
builder_arm <- "All participants"

# The vital signs gsm.datasim makes, each with the name the Labs and vitals
# file gives it and the unit its averages are in. Its generator states none.
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

# How each kind of column came to be, in the words the mapping says.
.builder_how <- list(
  copied = "Copied",
  day = "Derived: the date less the participant's first dose date, plus one; from enrolment for a participant with no dose",
  label = "A label of study.builder's: gsm.datasim makes no treatment arms",
  severity = "Derived: the toxicity grade in words, 1 mild, 2 moderate, 3 or more severe",
  sequence = "Derived: the event's number within the participant, in order of start date",
  long = "Reshaped: one row for each vital sign that was taken",
  unit = "The unit gsm.datasim's own averages are in; its generator states none",
  visit_number = "Derived: the visit's place in the order of first visit dates across the study",
  joined = "Joined from the participant's row"
)
.builder_line <- function(column, from, how) list(column = column, from = from, how = .builder_how[[how]])

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
    ARM = rep(builder_arm, nrow(subjects)),
    SITEID = as.character(subjects$invid),
    SEX = as.character(subjects$sex),
    RACE = as.character(subjects$race),
    EOSDY = suppressWarnings(as.integer(subjects$timeonstudy)),
    stringsAsFactors = FALSE
  )
}
.builder_subject_mapping <- list(
  .builder_line("USUBJID", "Raw_SUBJ.subjid", "copied"),
  .builder_line("ARM", "", "label"),
  .builder_line("SITEID", "Raw_SUBJ.invid", "copied"),
  .builder_line("SEX", "Raw_SUBJ.sex", "copied"),
  .builder_line("RACE", "Raw_SUBJ.race", "copied"),
  .builder_line("EOSDY", "Raw_SUBJ.timeonstudy", "copied")
)

# The Adverse events file: one row per event.
.builder_events <- function(events, day_one) {
  events <- as.data.frame(events)
  events <- events[order(as.character(events$subjid), as.character(events$aest_dt)), , drop = FALSE]
  grade <- suppressWarnings(as.integer(events$aetoxgr))
  severity <- ifelse(is.na(grade), NA_character_,
    ifelse(grade <= 1L, "MILD", ifelse(grade == 2L, "MODERATE", "SEVERE")))
  data.frame(
    USUBJID = as.character(events$subjid),
    ARM = rep(builder_arm, nrow(events)),
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
.builder_events_mapping <- list(
  .builder_line("USUBJID", "Raw_AE.subjid", "copied"),
  .builder_line("ARM", "", "label"),
  .builder_line("AESEQ", "Raw_AE.aest_dt", "sequence"),
  .builder_line("AEBODSYS", "Raw_AE.mdrsoc_nsv", "copied"),
  .builder_line("AEDECOD", "Raw_AE.mdrpt_nsv", "copied"),
  .builder_line("AETERM", "Raw_AE.mdrpt_nsv", "copied"),
  .builder_line("AESEV", "Raw_AE.aetoxgr", "severity"),
  .builder_line("AESER", "Raw_AE.aeser", "copied"),
  .builder_line("ASTDY", "Raw_AE.aest_dt", "day"),
  .builder_line("AENDY", "Raw_AE.aeen_dt", "day")
)

# The Labs and vitals file: one row per participant, visit and vital sign that
# was taken.
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
      ARM = rep(builder_arm, sum(keep)),
      SITEID = subject$SITEID[who][keep],
      SEX = subject$SEX[who][keep],
      RACE = subject$RACE[who][keep],
      VISIT = as.character(vitals$visit)[keep],
      VISITNUM = unname(order_of[as.character(vitals$visit)])[keep],
      TEST = rep(builder_vital_signs[[column]][1], sum(keep)),
      STRESU = rep(builder_vital_signs[[column]][2], sum(keep)),
      STRESN = value[keep],
      DY = .builder_day(vitals$vs_dt, vitals$subjid, day_one)[keep],
      stringsAsFactors = FALSE
    )
  })
  do.call(rbind, long)
}
.builder_results_mapping <- list(
  .builder_line("USUBJID", "Raw_VS.subjid", "copied"),
  .builder_line("ARM", "", "label"),
  .builder_line("SITEID", "Raw_SUBJ.invid", "joined"),
  .builder_line("SEX", "Raw_SUBJ.sex", "joined"),
  .builder_line("RACE", "Raw_SUBJ.race", "joined"),
  .builder_line("VISIT", "Raw_VS.visit", "copied"),
  .builder_line("VISITNUM", "Raw_VS.vs_dt", "visit_number"),
  .builder_line("TEST", paste0("Raw_VS: ", paste(names(builder_vital_signs), collapse = ", ")), "long"),
  .builder_line("STRESU", "", "unit"),
  .builder_line("STRESN", paste0("Raw_VS: ", paste(names(builder_vital_signs), collapse = ", ")), "long"),
  .builder_line("DY", "Raw_VS.vs_dt", "day")
)

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
#' @param standard Whether the standard files are made as well.
#' @return A list: `study_id`, `snapshot_date`, `snapshots`, `seconds`,
#'   `simulator` (gsm.datasim's version), `notes`, `domains`, one entry per
#'   raw table with its `id`, `table`, `name`, `rows`, `columns` and `text`,
#'   and `standard`, the same for each standard file with its `mapping`.
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
  standard = TRUE
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
    c("VISIT", "AE", "LB", "VS", "PD", "STUDCOMP", "SDRGCOMP")
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
  vitals_spec <- if (with_vitals) yaml::read_yaml(vitals)$spec else list()

  version <- builder_load(simulator)
  if (!is.null(seed)) set.seed(.builder_whole(seed, "Seed", c(0L, .Machine$integer.max)))

  started <- Sys.time()
  study <- suppressMessages(create_longitudinal_study(
    study_id = gsub("[^A-Za-z0-9]", "-", toupper(trimws(study_name))),
    participants = participants,
    sites = sites,
    snapshots = months,
    interval = "1 month",
    domains = setdiff(wanted, "VS"),
    run_analytics = FALSE,
    run_reporting = FALSE,
    outlier_intensity = intensity,
    verbose = FALSE
  ))
  dates <- names(study$raw_data)
  snapshot <- study$raw_data[[length(dates)]]
  if (with_vitals) snapshot$Raw_VS <- .builder_vitals(snapshot, vitals_spec)

  made <- paste0("Raw_", c(builder_core, intersect(builder_optional, wanted)))
  missing <- setdiff(made, names(snapshot))
  if (length(missing)) {
    stop("gsm.datasim did not make ", paste(missing, collapse = ", "), ".", call. = FALSE)
  }
  snapshot <- .builder_gsm_names(snapshot[made], vitals_spec)
  snapshot <- lapply(snapshot, function(table) {
    table <- as.data.frame(table, stringsAsFactors = FALSE)
    if ("invid" %in% names(table)) table$invid <- .builder_site_id(table$invid)
    table
  })
  if (!is.null(phase) && "phase" %in% names(snapshot$Raw_STUDY)) {
    snapshot$Raw_STUDY$phase <- as.character(phase)
  }
  if (!is.null(therapeutic_area) && "therapeutic_area" %in% names(snapshot$Raw_STUDY)) {
    snapshot$Raw_STUDY$therapeutic_area <- as.character(therapeutic_area)
  }

  raw <- lapply(made, function(table) {
    .builder_table(snapshot[[table]], list(
      id = sub("^Raw_", "", table), table = table, name = paste0(table, ".csv")
    ))
  })

  files <- list()
  if (isTRUE(standard)) {
    subject <- .builder_subject(snapshot$Raw_SUBJ)
    day_one <- .builder_day_one(snapshot$Raw_SUBJ)
    files <- list(.builder_table(subject, list(
      id = "subject", name = "adsl.csv", label = "Subject-level", from = list("SUBJ"),
      mapping = .builder_subject_mapping
    )))
    if ("Raw_AE" %in% made) {
      files <- c(files, list(.builder_table(.builder_events(snapshot$Raw_AE, day_one), list(
        id = "ae", name = "adae.csv", label = "Adverse events", from = list("AE", "SUBJ"),
        mapping = .builder_events_mapping
      ))))
    }
    if (with_vitals) {
      files <- c(files, list(.builder_table(.builder_results(snapshot$Raw_VS, subject, day_one), list(
        id = "bds", name = "advs.csv", label = "Labs and vitals", from = list("VS", "SUBJ"),
        mapping = .builder_results_mapping
      ))))
    }
  }

  list(
    study_id = as.character(study$study_id),
    snapshot_date = as.character(dates[length(dates)]),
    snapshots = length(dates),
    seconds = round(as.numeric(difftime(Sys.time(), started, units = "secs")), 1),
    simulator = version,
    notes = as.list(builder_notes),
    domains = raw,
    standard = files
  )
}
