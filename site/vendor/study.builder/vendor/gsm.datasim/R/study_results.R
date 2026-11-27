# NOTICE. This file is not part of gsm.datasim v2.1.0 (https://github.com/Gilead-Public/gsm.datasim, commit 29fc61c), Copyright Gilead Sciences, Apache License 2.0.
# Added in November 2026 by Jeremy Wildfire, in the modified copy at
# https://github.com/jwildfire/gsm.datasim (branch safety-results-2.1),
# under the same licence. Not reviewed or endorsed by gsm.datasim's maintainers.

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
#' - `Raw_QS`, when `results$scores` names any: one row per enrolled
#'   participant, visit and score, with `qsresn`. See Scores.
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
#' @section Scores:
#' A study may be given one or more scores to follow: a questionnaire or
#' rating total such as ADAS-Cog (11), measured at some visits. Each is a list
#' with a `name`; the `visits` it is measured at (every visit when left out);
#' the mean `baseline`; `sd`, the standard deviation of the change from
#' baseline; `change`, the mean change on the reference arm by `day`;
#' `effects`, a named vector giving, for any other arm, its mean difference
#' from the reference arm by `day`; `day`, the study day by which the full
#' change is reached (the last day measured when left out); and `min` and
#' `max`, the score's range. They are written to `Raw_QS`: one row per
#' enrolled participant, visit and score, with `qsresn`.
#'
#' A participant has a baseline of their own. Before the first dose a score
#' varies a little around it. After the first dose it moves in a straight
#' line toward the arm's mean change, reached at `day`, with a spread of `sd`
#' that is part the participant's own and part the visit's. The reference arm
#' is the placebo arm above. A score is measured only at visits the
#' participant has, so a participant who leaves early has no later scores.
#'
#' @section Adverse events:
#' The simulator's adverse events keep their participants, dates and
#' seriousness, and are given terms: a preferred term and a system organ class
#' from a short list written for this package (about 40 terms in 10 classes).
#' The list is not MedDRA and is not coded to it. Some terms are marked as
#' typical of a study drug (nausea, dizziness, a skin reaction where a patch is
#' worn and so on); on an arm that is not the placebo arm an event is one of
#' those `results$events$ratio` times as often as on placebo (1.5 unless
#' told). A serious event is given a grade of 3 or more, and an event that is
#' not serious a grade of 3 or less, so the two agree. A participant with a
#' simulated rise in liver tests, in creatinine, or a long QTc usually has an
#' event that says so ("Alanine aminotransferase increased", "Blood creatinine
#' increased", "Electrocardiogram QT prolonged"): their first event that
#' starts once the rise is under way is given that term, when they have one.
#' No event is added, removed or moved, so the number of events a participant
#' or a site has is as the simulator made it. `results$events = FALSE` leaves
#' the adverse events as they were.
#'
#' @section Dropout:
#' `results$dropout` makes participants leave early: a list with `rate`, the
#' share of enrolled participants who leave by `day`; optionally `arms`, a
#' named vector of rates for arms that differ; and `day`, the study day by
#' which that share has left (the last day anything is dated when left out).
#' Who leaves and when depends on the participant alone, and the day is spread
#' evenly from day 1 to `day`. After a participant's last day they have no
#' visits, labs, vital signs, ECGs, scores, deviations or new adverse events.
#' `Raw_STUDCOMP` and `Raw_SDRGCOMP`, where the snapshot has them, are written
#' again to agree for enrolled participants: a row saying "N" with a reason
#' for each who has left by the snapshot date, and a row saying "Y" for each
#' who reached `day`. Rows for people who were never enrolled are kept.
#' The participant table's own days-on-study columns are left as they were.
#'
#' @section Profile:
#' `results$profile` is the study's profile, as [study_profile()] returns one:
#' what its phase and therapeutic area change. It widens or narrows the spread
#' of lab results, changes the share of participants with a rise in liver or
#' kidney tests, makes some classes of adverse event commoner, and moves a
#' share of adverse events to or from serious and a grade up or down.
#' `create_longitudinal_study()` sets it from its `phase` and
#' `therapeutic_area`; `FALSE` is the neutral profile, which changes nothing.
#'
#' @section What is not modelled:
#' A lab's toxicity grade (`toxgrg_nsv`) is the simulator's own and is not
#' worked out from the result beside it. An adverse event's term does not
#' depend on its grade or its dates, and the number of events a participant has
#' does not depend on the arm.
#'
#' @param lRaw A named list of one snapshot's raw data frames, as in
#'   `study$raw_data[[1]]`. It needs `Raw_SUBJ`.
#' @param results `TRUE` for the default (two arms, "Placebo" and "Active",
#'   and ECGs), or a list with `arms` (character vector of arm names), `ecg`
#'   (logical), `scores` (a list of scores to follow; see Scores), `events`
#'   (see Adverse events), `dropout` (see Dropout) and `profile` (see
#'   Profile). `NULL` or `FALSE` adds nothing.
#' @param snapshot_date The snapshot's date, for what has happened by then. The
#'   last date in the snapshot when left out.
#'
#' @return `lRaw` with the columns and the table above. Applying it twice gives
#'   what applying it once gives.
#'
#' @examples
#' validate_study_results(TRUE)$arms
#'
#' @export
apply_study_results <- function(lRaw, results = TRUE, snapshot_date = NULL) {
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

  # What the study's phase and therapeutic area change (see `study_profile()`).
  # The shares of participants with each lab pattern are worked out once, so
  # the labs and the adverse events that say so agree.
  profile <- if (is.null(results$profile)) study_profile() else results$profile
  share_chronic <- min(0.5, 0.12 * profile$chronic)
  share_liver <- min(0.5, 0.12 * profile$liver)
  share_liver_more <- min(0.25, 0.06 * profile$liver)
  share_kidney <- min(0.5, 0.06 * profile$kidney)

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
    spread <- log(range$hi / range$lo) / 4 * profile$spread
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
    from_start <- transaminase & is_enrolled & chronic < share_chronic
    factor[from_start] <- chronic_size[from_start]
    # A rise after the first dose on an arm that is not placebo; a small one, rarely, on placebo.
    drug <- transaminase & is_active & liver < share_liver
    factor[drug] <- factor[drug] * (1 + (liver_size[drug] - 1) * rise[drug])
    mild <- transaminase & is_enrolled & !is_active & liver < 0.03
    factor[mild] <- factor[mild] * (1 + 1.2 * rise[mild])
    bili <- range$kind == "tb" & is_active & liver < share_liver_more
    factor[bili] <- 1 + (3 + liver_size[bili] / 3) * rise[bili]
    alp <- range$kind == "alp" & is_active & liver < share_liver_more
    factor[alp] <- 1 + 0.4 * rise[alp]
    creat <- range$kind == "creat" & is_active & kidney < share_kidney
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

  # Scores: one row per enrolled participant, visit and score.
  if (length(results$scores) && length(visit_key)) {
    all_visits <- as.data.frame(lRaw$Raw_VISIT, stringsAsFactors = FALSE)
    who <- match(as.character(all_visits$subjid), id)
    keep <- !is.na(who) & enrolled[who]
    all_visits <- all_visits[keep, , drop = FALSE]
    who <- who[keep]
    name <- as.character(all_visits[[visit_name]])
    date <- as_date(all_visits$visit_dt)
    days <- as.numeric(date - day_one[who])
    study <- if ("studyid" %in% names(all_visits)) as.character(all_visits$studyid) else rep(NA_character_, nrow(all_visits))
    tables <- lapply(results$scores, function(score) {
      at <- if (length(score$visits)) name %in% score$visits else rep(TRUE, length(name))
      if (!any(at)) {
        return(NULL)
      }
      s <- key[who][at]
      v <- .results_key(name[at])
      q <- .results_key(rep(score$name, sum(at)))
      d <- days[at]
      full <- if (is.null(score$day)) max(c(d, 1), na.rm = TRUE) else score$day
      # How far along the way to the full change: 0 before the first dose, 1 at `day`.
      along <- pmin(pmax(ifelse(is.na(d), 0, d) / full, 0), 1)
      effect <- unname(score$effects[arm[who][at]])
      effect[is.na(effect)] <- 0
      own <- stats::qnorm(.results_unif(s, q, salt = 51))
      baseline <- score$baseline + score$sd * own
      before <- 0.25 * score$sd * stats::qnorm(.results_unif(s, q, v, salt = 52))
      spread <- score$sd * sqrt(1 - 0.25^2) *
        (0.7 * stats::qnorm(.results_unif(s, q, salt = 53)) + sqrt(1 - 0.7^2) * stats::qnorm(.results_unif(s, q, v, salt = 54)))
      after <- (score$change + effect) * along + spread
      value <- baseline + ifelse(along > 0, after, before)
      data.frame(
        studyid = study[at], subjid = as.character(all_visits$subjid)[at], visnam = name[at],
        qs_dt = date[at], qststnam = score$name,
        qsresn = round(pmin(pmax(value, score$min), score$max)),
        stringsAsFactors = FALSE
      )
    })
    tables <- tables[!vapply(tables, is.null, logical(1))]
    if (length(tables)) {
      qs <- do.call(rbind, tables)
      qs <- qs[order(qs$subjid, as.character(qs$qs_dt), qs$qststnam), , drop = FALSE]
      rownames(qs) <- NULL
      lRaw$Raw_QS <- qs
    }
  }

  # A date written as the column it joins is: a date, a date-time, or text.
  dated_like <- function(like, dates) {
    if (inherits(like, "Date")) {
      return(dates)
    }
    if (inherits(like, "POSIXct")) {
      zone <- attr(like, "tzone")
      return(as.POSIXct(as.character(dates), tz = if (is.null(zone) || !nzchar(zone[1])) "UTC" else zone[1]))
    }
    as.character(dates)
  }

  # What has happened by this snapshot: its date, or the last date it holds.
  asof <- if (is.null(snapshot_date)) as.Date(NA) else as_date(snapshot_date)
  if (is.na(asof)) {
    dates <- c(
      if (!is.null(visit) && nrow(visit)) as.character(as_date(visit$visit_dt)),
      if ("Raw_AE" %in% names(lRaw) && "aest_dt" %in% names(lRaw$Raw_AE)) as.character(as_date(lRaw$Raw_AE$aest_dt))
    )
    dates <- dates[!is.na(dates)]
    asof <- if (length(dates)) as.Date(max(dates)) else Sys.Date()
  }

  # Adverse events: terms, a grade that agrees with seriousness, and an event
  # for a rise that was simulated. Done once: a snapshot whose events already
  # have terms from the list is left as it is.
  if (!is.null(results$events) && "Raw_AE" %in% names(lRaw) && nrow(lRaw$Raw_AE) &&
    all(c("subjid", "mdrpt_nsv", "mdrsoc_nsv") %in% names(lRaw$Raw_AE))) {
    ae <- as.data.frame(lRaw$Raw_AE, stringsAsFactors = FALSE)
    terms <- .results_ae_terms()
    # A class the study's profile makes commoner is drawn that many times as often.
    more <- unname(profile$classes[terms$soc])
    terms$weight <- terms$weight * ifelse(is.na(more), 1, more)
    if (!all(as.character(ae$mdrpt_nsv) %in% terms$term)) {
      ae_subj <- as.character(ae$subjid)
      who <- match(ae_subj, id)
      s <- .results_key(ae_subj)
      # The event's place among the participant's own, which later snapshots keep.
      nth <- stats::ave(seq_len(nrow(ae)), ae_subj, FUN = seq_along)
      on_active <- !is.na(who) & active[who]
      drug_share <- sum(terms$weight[terms$drug]) / sum(terms$weight)
      share <- ifelse(on_active, pmin(0.9, drug_share * results$events$ratio), drug_share)
      is_drug <- .results_unif(s, nth, salt = 71) < share
      pick <- .results_unif(s, nth, salt = 72)
      choose <- function(u, set) {
        cut_at <- cumsum(set$weight) / sum(set$weight)
        at <- pmin(findInterval(u, cut_at) + 1L, nrow(set))
        set[at, , drop = FALSE]
      }
      term <- rep(NA_character_, nrow(ae))
      soc <- rep(NA_character_, nrow(ae))
      for (flag in c(TRUE, FALSE)) {
        rows <- which(is_drug == flag)
        if (!length(rows)) next
        chosen <- choose(pick[rows], terms[terms$drug == flag & terms$weight > 0, , drop = FALSE])
        term[rows] <- chosen$term
        soc[rows] <- chosen$soc
      }
      ae$mdrpt_nsv <- term
      ae$mdrsoc_nsv <- soc
      # A serious event is grade 3 or more; one that is not serious, 3 or less.
      # The study's profile moves a share of events to serious, or from it.
      if ("aeser" %in% names(ae) && profile$serious != 0) {
        was <- !is.na(ae$aeser) & ae$aeser == "Y"
        move <- .results_unif(s, nth, salt = 75) < abs(profile$serious)
        if (profile$serious > 0) ae$aeser[!was & !is.na(ae$aeser) & move] <- "Y"
        if (profile$serious < 0) ae$aeser[was & move] <- "N"
      }
      if (all(c("aeser", "aetoxgr") %in% names(ae))) {
        grade <- suppressWarnings(as.integer(ae$aetoxgr))
        serious <- !is.na(ae$aeser) & ae$aeser == "Y"
        up <- .results_unif(s, nth, salt = 73)
        raise <- serious & !is.na(grade) & grade < 3L
        grade[raise] <- ifelse(up[raise] < 0.6, 3L, ifelse(up[raise] < 0.9, 4L, 5L))
        lower <- !serious & !is.na(grade) & grade > 3L
        grade[lower] <- 3L
        # The study's profile moves a share of events a grade up, or down,
        # within what seriousness allows: 3 or more when serious, 3 or less when not.
        if (profile$severe != 0) {
          step <- .results_unif(s, nth, salt = 76) < abs(profile$severe) & !is.na(grade)
          if (profile$severe > 0) {
            grade[step & ((serious & grade < 5L) | (!serious & grade < 3L))] <-
              grade[step & ((serious & grade < 5L) | (!serious & grade < 3L))] + 1L
          } else {
            grade[step & ((serious & grade > 3L) | (!serious & grade > 1L))] <-
              grade[step & ((serious & grade > 3L) | (!serious & grade > 1L))] - 1L
          }
        }
        ae$aetoxgr <- grade
      }

      # An event for a rise that was simulated: the participant's first event
      # that starts once the rise is under way is the one that says so. No
      # event is added or moved, so how many events a site has is unchanged.
      if (isTRUE(results$events$signals) && "aest_dt" %in% names(ae)) {
        started <- as_date(ae$aest_dt)
        liver_day <- 30 + 60 * .results_unif(key, salt = 33)
        told <- .results_unif(key, salt = 74) < 0.8
        signals <- list(
          list(
            who = active & .results_unif(key, salt = 31) < share_liver & told, day = liver_day - 21,
            term = "Alanine aminotransferase increased"
          ),
          list(
            who = active & .results_unif(key, salt = 36) < share_kidney & told, day = rep(21, length(key)),
            term = "Blood creatinine increased"
          ),
          list(
            who = active & .results_unif(key, salt = 44) < 0.04 & told, day = rep(7, length(key)),
            term = "Electrocardiogram QT prolonged"
          )
        )
        taken <- rep(FALSE, nrow(ae))
        for (signal in signals) {
          from <- (day_one + signal$day)[who]
          fits <- !is.na(who) & signal$who[who] & !is.na(started) & !is.na(from) & started >= from & !taken
          rows <- which(fits)
          rows <- rows[!duplicated(ae_subj[rows])]
          if (!length(rows)) next
          ae$mdrpt_nsv[rows] <- signal$term
          ae$mdrsoc_nsv[rows] <- terms$soc[match(signal$term, terms$term)]
          if ("aerel" %in% names(ae)) ae$aerel[rows] <- "Y"
          taken[rows] <- TRUE
        }
      }
      rownames(ae) <- NULL
      lRaw$Raw_AE <- ae
    }
  }

  # Dropout: nothing is dated after a participant's last day, and the
  # completion tables say who has left and who has finished.
  if (!is.null(results$dropout)) {
    dropout <- results$dropout
    rate <- rep(dropout$rate, length(id))
    by_arm <- unname(dropout$arms[arm])
    rate[!is.na(by_arm)] <- by_arm[!is.na(by_arm)]
    full <- dropout$day
    if (is.null(full)) {
      seen <- if (!is.null(visit) && nrow(visit)) {
        as.numeric(as_date(visit$visit_dt) - day_one[match(as.character(visit$subjid), id)])
      } else {
        numeric(0)
      }
      full <- max(c(seen, 2), na.rm = TRUE)
    }
    leaves <- enrolled & !is.na(day_one) & .results_unif(key, salt = 61) < rate
    last_date <- day_one + 1 + floor(.results_unif(key, salt = 62) * (full - 1))
    last_date[!leaves] <- as.Date(NA)
    dated <- list(
      Raw_VISIT = c("visit_dt"), Raw_LB = c("lb_dt"), Raw_VS = c("vs_dt"), Raw_EG = c("eg_dt"),
      Raw_QS = c("qs_dt"), Raw_AE = c("aest_dt"), Raw_PD = c("dvdtm", "deviationdate")
    )
    for (table in intersect(names(dated), names(lRaw))) {
      frame <- lRaw[[table]]
      who_column <- .design_column(frame, "subjid", "subjectenrollmentnumber")
      date_column <- do.call(.design_column, c(list(frame), as.list(dated[[table]])))
      if (is.null(who_column) || is.null(date_column) || !nrow(frame)) next
      until <- last_date[match(as.character(frame[[who_column]]), id)]
      on <- as_date(frame[[date_column]])
      keep <- is.na(until) | is.na(on) | on <= until
      lRaw[[table]] <- frame[keep, , drop = FALSE]
      rownames(lRaw[[table]]) <- NULL
    }
    left <- which(leaves & last_date <= asof)
    finished <- which(enrolled & !leaves & !is.na(day_one) & day_one + full <= asof)
    reason_u <- .results_unif(key, salt = 63)
    reason <- ifelse(reason_u < 0.4, "Withdrew Consent", ifelse(reason_u < 0.7, "Lost to Follow-Up", "Adverse Event"))
    at <- c(left, finished)
    said <- c(rep("N", length(left)), rep("Y", length(finished)))
    when <- c(last_date[left], day_one[finished] + full)
    rewrite <- function(table, answer) {
      if (!(table %in% names(lRaw))) {
        return(invisible(NULL))
      }
      old <- as.data.frame(lRaw[[table]], stringsAsFactors = FALSE)
      rows <- old[rep(NA_integer_, length(at)), , drop = FALSE]
      put <- function(column, value) {
        if (column %in% names(rows)) rows[[column]] <<- value
      }
      put("subjid", id[at])
      put(answer, said)
      put("compreas", c(reason[left], rep("", length(finished))))
      for (column in intersect(c("studyid", "invid"), names(subj))) put(column, as.character(subj[[column]])[at])
      if ("mincreated_dts" %in% names(rows)) {
        rows$mincreated_dts <- dated_like(old$mincreated_dts, when)
      }
      # A row the simulator wrote for someone who was never enrolled is kept.
      others <- old[!(as.character(old$subjid) %in% id[enrolled]), , drop = FALSE]
      rows <- rbind(others, rows)
      rownames(rows) <- NULL
      lRaw[[table]] <<- rows
    }
    rewrite("Raw_STUDCOMP", "compyn")
    rewrite("Raw_SDRGCOMP", "sdrgyn")
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
  number <- function(value, default, what, score) {
    if (is.null(value)) {
      return(default)
    }
    out <- suppressWarnings(as.numeric(value[[1]]))
    if (is.na(out)) stop("The score '", score, "' needs a number for `", what, "`.", call. = FALSE)
    out
  }
  scores <- lapply(results$scores, function(score) {
    name <- if (is.null(score$name)) "" else trimws(as.character(score$name[[1]]))
    if (!nzchar(name)) stop("Each of `results$scores` needs a `name`.", call. = FALSE)
    sd <- number(score$sd, 10, "sd", name)
    if (sd <= 0) stop("The score '", name, "' needs an `sd` above 0.", call. = FALSE)
    day <- if (is.null(score$day)) NULL else number(score$day, NULL, "day", name)
    if (!is.null(day) && day < 1) stop("The score '", name, "' needs a `day` of 1 or more.", call. = FALSE)
    effects <- unlist(score$effects)
    effects <- if (length(effects)) stats::setNames(suppressWarnings(as.numeric(effects)), names(effects)) else numeric(0)
    if (anyNA(effects) || (length(effects) && is.null(names(effects)))) {
      stop("The score '", name, "' needs `effects` as numbers named by arm.", call. = FALSE)
    }
    low <- number(score$min, -Inf, "min", name)
    high <- number(score$max, Inf, "max", name)
    if (low >= high) stop("The score '", name, "' needs `min` below `max`.", call. = FALSE)
    list(
      name = name,
      visits = unique(trimws(as.character(unlist(score$visits)))),
      baseline = number(score$baseline, 50, "baseline", name),
      sd = sd,
      change = number(score$change, 0, "change", name),
      effects = effects,
      day = day,
      min = low,
      max = high
    )
  })
  names_of <- vapply(scores, function(score) score$name, character(1))
  if (anyDuplicated(names_of)) stop("Each of `results$scores` needs a name of its own.", call. = FALSE)
  # Adverse events: on unless told otherwise.
  events <- results$events
  if (identical(events, FALSE)) {
    events <- NULL
  } else {
    if (is.null(events) || isTRUE(events)) events <- list()
    if (!is.list(events)) {
      stop("`results$events` must be FALSE, or a list with `ratio` and `signals`.", call. = FALSE)
    }
    ratio <- if (is.null(events$ratio)) 1.5 else suppressWarnings(as.numeric(events$ratio[[1]]))
    if (is.na(ratio) || ratio <= 0) stop("`results$events$ratio` must be a number above 0.", call. = FALSE)
    events <- list(ratio = ratio, signals = is.null(events$signals) || isTRUE(as.logical(events$signals)[1]))
  }
  # Dropout: none unless asked for.
  dropout <- results$dropout
  if (!is.null(dropout)) {
    if (is.numeric(dropout) && length(dropout) == 1) dropout <- list(rate = dropout)
    if (!is.list(dropout)) {
      stop("`results$dropout` must be a rate, or a list with `rate`, `arms` and `day`.", call. = FALSE)
    }
    share <- function(value, what) {
      out <- suppressWarnings(as.numeric(value))
      if (anyNA(out) || any(out < 0 | out > 1)) {
        stop("`results$dropout$", what, "` must be from 0 to 1.", call. = FALSE)
      }
      out
    }
    by_arm <- unlist(dropout$arms)
    by_arm <- if (length(by_arm)) {
      if (is.null(names(by_arm))) stop("`results$dropout$arms` must be rates named by arm.", call. = FALSE)
      stats::setNames(share(by_arm, "arms"), names(by_arm))
    } else {
      numeric(0)
    }
    day <- if (is.null(dropout$day)) NULL else suppressWarnings(as.numeric(dropout$day[[1]]))
    if (!is.null(day) && (is.na(day) || day < 2)) stop("`results$dropout$day` must be 2 or more.", call. = FALSE)
    dropout <- list(
      rate = if (is.null(dropout$rate)) 0 else share(dropout$rate[[1]], "rate"),
      arms = by_arm,
      day = day
    )
    if (dropout$rate == 0 && !any(by_arm > 0)) dropout <- NULL
  }
  list(
    arms = arms, ecg = is.null(results$ecg) || isTRUE(as.logical(results$ecg)[1]), scores = scores,
    events = events, dropout = dropout, profile = validate_study_profile(results$profile)
  )
}

# Adverse event terms: a preferred term, its system organ class, how often it
# is drawn, and whether it is typical of a study drug. The three terms of
# weight 0 are never drawn: they are given only for a rise that was simulated.
# Written for this package; it is not MedDRA and is not coded to it.
.results_ae_terms <- function() {
  rows <- list(
    list("Nausea", "Gastrointestinal disorders", 6, TRUE),
    list("Diarrhoea", "Gastrointestinal disorders", 5, TRUE),
    list("Vomiting", "Gastrointestinal disorders", 3, TRUE),
    list("Constipation", "Gastrointestinal disorders", 3, FALSE),
    list("Abdominal pain", "Gastrointestinal disorders", 3, FALSE),
    list("Dyspepsia", "Gastrointestinal disorders", 2, FALSE),
    list("Headache", "Nervous system disorders", 7, FALSE),
    list("Dizziness", "Nervous system disorders", 4, TRUE),
    list("Somnolence", "Nervous system disorders", 2, TRUE),
    list("Syncope", "Nervous system disorders", 1, FALSE),
    list("Application site pruritus", "General disorders and administration site conditions", 4, TRUE),
    list("Application site erythema", "General disorders and administration site conditions", 3, TRUE),
    list("Fatigue", "General disorders and administration site conditions", 5, TRUE),
    list("Pyrexia", "General disorders and administration site conditions", 2, FALSE),
    list("Oedema peripheral", "General disorders and administration site conditions", 2, FALSE),
    list("Nasopharyngitis", "Infections and infestations", 6, FALSE),
    list("Upper respiratory tract infection", "Infections and infestations", 5, FALSE),
    list("Urinary tract infection", "Infections and infestations", 3, FALSE),
    list("Influenza", "Infections and infestations", 2, FALSE),
    list("Rash", "Skin and subcutaneous tissue disorders", 3, TRUE),
    list("Pruritus", "Skin and subcutaneous tissue disorders", 2, TRUE),
    list("Hyperhidrosis", "Skin and subcutaneous tissue disorders", 2, TRUE),
    list("Erythema", "Skin and subcutaneous tissue disorders", 1, FALSE),
    list("Back pain", "Musculoskeletal and connective tissue disorders", 4, FALSE),
    list("Arthralgia", "Musculoskeletal and connective tissue disorders", 3, FALSE),
    list("Myalgia", "Musculoskeletal and connective tissue disorders", 2, FALSE),
    list("Pain in extremity", "Musculoskeletal and connective tissue disorders", 2, FALSE),
    list("Cough", "Respiratory, thoracic and mediastinal disorders", 3, FALSE),
    list("Dyspnoea", "Respiratory, thoracic and mediastinal disorders", 2, FALSE),
    list("Oropharyngeal pain", "Respiratory, thoracic and mediastinal disorders", 2, FALSE),
    list("Insomnia", "Psychiatric disorders", 3, FALSE),
    list("Anxiety", "Psychiatric disorders", 2, FALSE),
    list("Confusional state", "Psychiatric disorders", 1, FALSE),
    list("Hypertension", "Vascular disorders", 3, FALSE),
    list("Hypotension", "Vascular disorders", 1, FALSE),
    list("Palpitations", "Cardiac disorders", 1, FALSE),
    list("Decreased appetite", "Metabolism and nutrition disorders", 2, TRUE),
    list("Fall", "Injury, poisoning and procedural complications", 2, FALSE),
    list("Contusion", "Injury, poisoning and procedural complications", 2, FALSE),
    list("Alanine aminotransferase increased", "Investigations", 0, FALSE),
    list("Blood creatinine increased", "Investigations", 0, FALSE),
    list("Electrocardiogram QT prolonged", "Investigations", 0, FALSE)
  )
  data.frame(
    term = vapply(rows, function(row) row[[1]], character(1)),
    soc = vapply(rows, function(row) row[[2]], character(1)),
    weight = vapply(rows, function(row) as.numeric(row[[3]]), numeric(1)),
    drug = vapply(rows, function(row) isTRUE(row[[4]]), logical(1)),
    stringsAsFactors = FALSE
  )
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
