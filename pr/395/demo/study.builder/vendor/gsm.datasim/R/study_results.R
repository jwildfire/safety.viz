#' Study results: treatment arms, lab results and ECGs for a simulated study
#'
#' @description
#' `r lifecycle::badge("experimental")`
#'
#' The simulator's raw data says who was seen and when, and grades each lab
#' test, but holds no treatment arm, no lab value and no ECG. Charts of
#' participant safety read all three. `apply_study_results()` adds them to one
#' snapshot's raw data:
#'
#' - `Raw_SUBJ$arm`: the arm of each enrolled participant. A participant who
#'   was not enrolled has none.
#' - `Raw_LB`: `lbresn` (the result), `lbresu` (its unit), `lbnrlo` and
#'   `lbnrhi` (the normal range) for every row.
#' - `Raw_EG`, a table of its own: one row per participant, visit and ECG
#'   measure (QTcF, QTcB and heart rate), with `egresn` and `egresu`.
#'
#' @section What the values are:
#' Each lab test has a normal range and a unit of its own; a test the simulator
#' does not know has a plain range and no unit. A participant has a level of
#' their own for each test, and each visit varies around it. Most values are
#' within the range.
#'
#' On an arm that is not the placebo arm, a few participants have a rise in
#' ALT and AST after the first dose that peaks and fades, a few of those a rise
#' in bilirubin with it, and a few a rise in creatinine that stays. Some
#' participants on every arm have ALT and AST above the range from the start.
#' QTcF and QTcB are a little longer after the first dose on an arm that is not
#' placebo. The placebo arm is the first arm whose name holds "placebo" or
#' "control", or the first arm when none does.
#'
#' Every value depends only on the participant, the test and the visit, never
#' on the random number stream, so a participant's visit is the same in every
#' snapshot that holds it.
#'
#' @section What is not modelled:
#' A lab's toxicity grade (`toxgrg_nsv`) is the simulator's own and is not
#' worked out from the result beside it. Adverse events do not follow the arm.
#'
#' @param lRaw A named list of one snapshot's raw data frames, as in
#'   `study$raw_data[[1]]`. It needs `Raw_SUBJ`.
#' @param results `TRUE` for the default (two arms, "Placebo" and "Active",
#'   and ECGs), or a list with `arms` (character vector of arm names) and
#'   `ecg` (logical). `NULL` or `FALSE` adds nothing.
#'
#' @return `lRaw` with the columns and the table above. Applying it twice gives
#'   what applying it once gives.
#'
#' @examples
#' validate_study_results(TRUE)$arms
#'
#' @export
apply_study_results <- function(lRaw, results = TRUE) {
  results <- validate_study_results(results)
  if (is.null(results) || !("Raw_SUBJ" %in% names(lRaw))) {
    return(lRaw)
  }
  subj <- as.data.frame(lRaw$Raw_SUBJ, stringsAsFactors = FALSE)
  if (!nrow(subj)) {
    return(lRaw)
  }
  as_date <- function(x) as.Date(substr(as.character(x), 1, 10))
  id <- as.character(subj$subjid)
  key <- .results_key(id)
  enrolled <- "enrollyn" %in% names(subj) & !is.na(subj$enrollyn) & subj$enrollyn == "Y"

  # Arms: an enrolled participant's arm depends on the participant alone.
  arms <- results$arms
  arm_at <- floor(.results_unif(key, salt = 11) * length(arms)) + 1L
  arm <- ifelse(enrolled, arms[arm_at], NA_character_)
  subj$arm <- arm
  lRaw$Raw_SUBJ[["arm"]] <- arm
  placebo <- grep("placebo|control", arms, ignore.case = TRUE)
  placebo <- if (length(placebo)) arms[placebo[1]] else arms[1]
  active <- enrolled & !is.na(arm) & arm != placebo

  day_one <- as.Date(rep(NA_character_, nrow(subj)))
  for (column in intersect(c("firstdosedate", "enrolldt", "firstparticipantdate"), names(subj))) {
    value <- as_date(subj[[column]])
    day_one[is.na(day_one)] <- value[is.na(day_one)]
  }

  # The date of each visit of each participant, to count study days from.
  visit <- if ("Raw_VISIT" %in% names(lRaw)) as.data.frame(lRaw$Raw_VISIT, stringsAsFactors = FALSE) else NULL
  visit_name <- if (is.null(visit)) NULL else .design_column(visit, "instancename", "visit", "visnam", "foldername")
  visit_key <- if (is.null(visit) || is.null(visit_name)) {
    character(0)
  } else {
    paste(visit$subjid, visit[[visit_name]], sep = "\r")
  }
  # Days since day one, by participant and visit name; 0 on day one.
  days_at <- function(subjid, name) {
    at <- match(paste(subjid, name, sep = "\r"), visit_key)
    date <- if (length(visit_key)) as_date(visit$visit_dt)[at] else as.Date(rep(NA_character_, length(at)))
    as.numeric(date - day_one[match(subjid, id)])
  }
  # A rise that begins at the first dose, peaks at `peak` days and fades.
  bump <- function(days, peak, width) {
    out <- exp(-((days - peak) / width)^2)
    out[is.na(days) | days <= 0] <- 0
    out
  }

  # Lab results.
  if ("Raw_LB" %in% names(lRaw) && nrow(lRaw$Raw_LB)) {
    lb <- as.data.frame(lRaw$Raw_LB, stringsAsFactors = FALSE)
    lb_visit <- .design_column(lb, "visnam", "instancename", "visit", "foldername")
    test <- as.character(lb$lbtstnam)
    ranges <- .results_lab_ranges(unique(test))
    range <- ranges[match(test, ranges$test), , drop = FALSE]
    who <- match(as.character(lb$subjid), id)
    s <- key[who]
    t <- .results_key(test)
    v <- if (is.null(lb_visit)) rep(0, nrow(lb)) else .results_key(as.character(lb[[lb_visit]]))
    days <- if (is.null(lb_visit)) rep(NA_real_, nrow(lb)) else days_at(as.character(lb$subjid), as.character(lb[[lb_visit]]))
    spread <- log(range$hi / range$lo) / 4
    level <- stats::qnorm(.results_unif(s, t, salt = 21))
    noise <- stats::qnorm(.results_unif(s, t, v, salt = 22))
    value <- exp(log(sqrt(range$lo * range$hi)) + spread * (0.8 * level + 0.6 * noise))

    is_active <- active[who]
    is_enrolled <- enrolled[who]
    liver <- .results_unif(s, salt = 31)
    liver_size <- 5 + 20 * .results_unif(s, salt = 32)
    liver_peak <- 30 + 60 * .results_unif(s, salt = 33)
    chronic <- .results_unif(s, salt = 34)
    chronic_size <- 2.5 + 2.5 * .results_unif(s, salt = 35)
    kidney <- .results_unif(s, salt = 36)
    kidney_size <- 1.5 + 1.0 * .results_unif(s, salt = 37)
    rise <- bump(days, liver_peak, 35)
    stays <- ifelse(is.na(days) | days <= 0, 0, 1 - exp(-days / 30))

    transaminase <- range$kind %in% c("alt", "ast")
    factor <- rep(1, nrow(lb))
    # Above the range from the start, on every arm.
    from_start <- transaminase & is_enrolled & chronic < 0.12
    factor[from_start] <- chronic_size[from_start]
    # A rise after the first dose on an arm that is not placebo; a small one, rarely, on placebo.
    drug <- transaminase & is_active & liver < 0.12
    factor[drug] <- factor[drug] * (1 + (liver_size[drug] - 1) * rise[drug])
    mild <- transaminase & is_enrolled & !is_active & liver < 0.03
    factor[mild] <- factor[mild] * (1 + 1.2 * rise[mild])
    bili <- range$kind == "tb" & is_active & liver < 0.06
    factor[bili] <- 1 + (3 + liver_size[bili] / 3) * rise[bili]
    alp <- range$kind == "alp" & is_active & liver < 0.06
    factor[alp] <- 1 + 0.4 * rise[alp]
    creat <- range$kind == "creat" & is_active & kidney < 0.06
    factor[creat] <- 1 + (kidney_size[creat] - 1) * stays[creat]

    lRaw$Raw_LB[["lbresn"]] <- signif(value * factor, 3)
    lRaw$Raw_LB[["lbresu"]] <- range$unit
    lRaw$Raw_LB[["lbnrlo"]] <- range$lo
    lRaw$Raw_LB[["lbnrhi"]] <- range$hi
  }

  # ECGs: QTcF, QTcB and heart rate at every visit.
  if (isTRUE(results$ecg) && length(visit_key) && nrow(visit)) {
    who <- match(as.character(visit$subjid), id)
    keep <- !is.na(who)
    visit <- visit[keep, , drop = FALSE]
    who <- who[keep]
    name <- as.character(visit[[visit_name]])
    s <- key[who]
    v <- .results_key(name)
    days <- as.numeric(as_date(visit$visit_dt) - day_one[who])
    after <- ifelse(is.na(days) | days <= 0, 0, 1 - exp(-days / 14))
    is_active <- active[who]
    long <- is_active & .results_unif(s, salt = 44) < 0.04
    rate <- 68 + 8 * stats::qnorm(.results_unif(s, salt = 41)) + 5 * stats::qnorm(.results_unif(s, v, salt = 42))
    rate <- pmin(pmax(rate, 42), 130)
    qtcf <- 408 + 15 * stats::qnorm(.results_unif(s, salt = 43)) + 8 * stats::qnorm(.results_unif(s, v, salt = 45)) +
      ifelse(is_active, 7, 0) * after + ifelse(long, 25 + 20 * .results_unif(s, salt = 46), 0) * after
    qtcb <- qtcf + (rate - 60) * 0.3 + 3 * stats::qnorm(.results_unif(s, v, salt = 47))
    study <- if ("studyid" %in% names(visit)) as.character(visit$studyid) else rep(NA_character_, nrow(visit))
    one <- function(measure, value, unit) {
      data.frame(
        studyid = study, subjid = as.character(visit$subjid), visnam = name,
        eg_dt = as_date(visit$visit_dt), egtstnam = measure, egresn = round(value), egresu = unit,
        stringsAsFactors = FALSE
      )
    }
    eg <- rbind(
      one("QTcF Interval, Aggregate", qtcf, "msec"),
      one("QTcB Interval, Aggregate", qtcb, "msec"),
      one("ECG Mean Heart Rate", rate, "beats/min")
    )
    eg <- eg[order(eg$subjid, as.character(eg$eg_dt), eg$egtstnam), , drop = FALSE]
    rownames(eg) <- NULL
    lRaw$Raw_EG <- eg
  }
  lRaw
}

#' @rdname apply_study_results
#' @return `validate_study_results()` returns the results asked for with every
#'   field filled in, or `NULL` for none; it stops with a message when they
#'   cannot be used.
#' @export
validate_study_results <- function(results) {
  if (is.null(results) || identical(results, FALSE)) {
    return(NULL)
  }
  if (isTRUE(results)) results <- list()
  if (!is.list(results)) {
    stop("`results` must be TRUE, or a list with `arms` and `ecg`.", call. = FALSE)
  }
  arms <- if (is.null(results$arms)) c("Placebo", "Active") else trimws(as.character(unlist(results$arms)))
  arms <- unique(arms[nzchar(arms)])
  if (!length(arms)) {
    stop("`results$arms` must name at least one arm.", call. = FALSE)
  }
  list(arms = arms, ecg = is.null(results$ecg) || isTRUE(as.logical(results$ecg)[1]))
}

# A number below 2147483647 for each text, the same wherever it is worked out.
# Only the different texts are walked, so a long column of few values is quick.
.results_key <- function(x) {
  x <- as.character(x)
  unique_x <- unique(x)
  hashed <- vapply(unique_x, function(text) {
    h <- 7
    for (code in utf8ToInt(text)) h <- (h * 31 + code) %% 2147483647
    h
  }, numeric(1), USE.NAMES = FALSE)
  hashed[match(x, unique_x)]
}

# A number strictly between 0 and 1 for each row, from the row's keys and a
# salt. The arithmetic is exact in a double, so it is the same on every machine.
# The step that multiplies the halves of the number keeps keys that differ by
# little from landing near each other.
.results_unif <- function(..., salt = 1) {
  m <- 2147483647
  parts <- list(...)
  h <- rep((salt * 2654435) %% m, length(parts[[1]]))
  for (part in parts) {
    h <- ((h * 48271) %% m + part) %% m
    h <- ((h * 48271) %% m + (h %% 65536) * (h %/% 65536) * 3 + 12345) %% m
  }
  for (round in 1:3) {
    h <- ((h * 69621) %% m + (h %% 65536) * (h %/% 65536) + salt) %% m
  }
  (h + 0.5) / m
}

# The unit and normal range of each lab test, by its name. `kind` marks the
# tests a rise is modelled for.
.results_lab_ranges <- function(tests) {
  known <- list(
    list("\\balt\\b|sgpt|alanine", "alt", "U/L", 7, 40),
    list("\\bast\\b|sgot|aspartate", "ast", "U/L", 8, 40),
    list("alkaline|\\balp\\b", "alp", "U/L", 40, 130),
    list("direct bili", "", "mg/dL", 0.05, 0.3),
    list("indirect bili", "", "mg/dL", 0.1, 0.9),
    list("bilirubin|\\bbili\\b", "tb", "mg/dL", 0.2, 1.2),
    list("creatine kinase|\\bck\\b", "", "U/L", 30, 200),
    list("creatinine", "creat", "mg/dL", 0.6, 1.2),
    list("urea|\\bbun\\b", "", "mg/dL", 7, 20),
    list("albumin", "", "g/dL", 3.5, 5.2),
    list("globulin", "", "g/dL", 2, 3.5),
    list("total protein|^protein", "", "g/dL", 6, 8.3),
    list("calcium", "", "mg/dL", 8.6, 10.2),
    list("cholesterol", "", "mg/dL", 125, 200),
    list("\\bggt\\b|gamma", "", "U/L", 8, 60),
    list("glucose", "", "mg/dL", 70, 100),
    list("a1c", "", "%", 4, 6),
    list("hematocrit", "", "%", 36, 50),
    list("hemoglobin", "", "g/dL", 12, 17),
    list("\\bldh\\b|lactate dehydrogenase", "", "U/L", 120, 250),
    list("basophils \\(%\\)", "", "%", 0.1, 1.5),
    list("basophils", "", "10^9/L", 0.01, 0.1),
    list("eosinophils \\(%\\)", "", "%", 0.5, 6),
    list("eosinophils", "", "10^9/L", 0.03, 0.5),
    list("lymphocytes \\(%\\)", "", "%", 20, 45),
    list("lymphocytes", "", "10^9/L", 1, 4),
    list("monocytes \\(%\\)", "", "%", 2, 10),
    list("monocytes", "", "10^9/L", 0.2, 0.9),
    list("neutrophils \\(%\\)", "", "%", 40, 75),
    list("neutrophils", "", "10^9/L", 1.8, 7.5),
    list("\\bmchc\\b", "", "g/dL", 32, 36),
    list("\\bmch\\b", "", "pg", 27, 33),
    list("\\bmcv\\b", "", "fL", 80, 100),
    list("magnesium", "", "mg/dL", 1.7, 2.3),
    list("phosph", "", "mg/dL", 2.5, 4.5),
    list("platelet", "", "10^9/L", 150, 400),
    list("\\brbc\\b|erythrocyte", "", "10^12/L", 4, 5.8),
    list("bicarbonate", "", "mmol/L", 22, 29),
    list("chloride", "", "mmol/L", 98, 107),
    list("potassium", "", "mmol/L", 3.5, 5.1),
    list("sodium", "", "mmol/L", 136, 145),
    list("uric acid|urate", "", "mg/dL", 3, 7.2),
    list("triglyceride", "", "mg/dL", 40, 150),
    list("\\bwbc\\b|leukocyte", "", "10^9/L", 4, 11)
  )
  rows <- lapply(tests, function(test) {
    for (one in known) {
      if (grepl(one[[1]], test, ignore.case = TRUE)) {
        return(data.frame(test = test, kind = one[[2]], unit = one[[3]], lo = one[[4]], hi = one[[5]], stringsAsFactors = FALSE))
      }
    }
    data.frame(test = test, kind = "", unit = "", lo = 10, hi = 50, stringsAsFactors = FALSE)
  })
  do.call(rbind, rows)
}
