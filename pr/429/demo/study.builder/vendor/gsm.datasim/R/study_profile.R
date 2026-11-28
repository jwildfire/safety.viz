# NOTICE. This file is not part of gsm.datasim v2.1.0 (https://github.com/Gilead-Public/gsm.datasim, commit 29fc61c), Copyright Gilead Sciences, Apache License 2.0.
# Added in November 2026 by Jeremy Wildfire, in the modified copy at
# https://github.com/jwildfire/gsm.datasim (branch safety-results-2.1),
# under the same licence. Not reviewed or endorsed by gsm.datasim's maintainers.

#' Study profile: what a study's phase and therapeutic area change
#'
#' @description
#' `r lifecycle::badge("experimental")`
#'
#' A study's phase and therapeutic area were labels on the study table. A
#' profile makes them shape the study results a little: which adverse events
#' are commoner, how many are serious and how severe they are, how often a lab
#' is out of range, how many participants have a rise in liver or kidney tests,
#' and what the study table says the indication is.
#'
#' Every number is a guess at a believable direction and size, written here in
#' one place so it can be read, argued with and changed. None is fitted to
#' data.
#'
#' @section Neutral:
#' Phase 2 with no therapeutic area is neutral: every multiplier is 1 and every
#' shift is 0, and the study results are what they are with no profile.
#' `study_profile()` with no arguments, or with a phase or an area it does not
#' know, is neutral for that part.
#'
#' @section What a phase changes:
#' | Phase | Lab spread | Serious events | Severity |
#' |---|---|---|---|
#' | 1 | x 0.85 | 30% of serious events are not serious | 20% of events are a grade lower |
#' | 2 | x 1 | as made | as made |
#' | 3 | x 1.10 | as made | as made |
#' | 4 | x 1.15 | as made | as made |
#'
#' Lab spread is how far a participant's values spread around the middle of
#' the normal range. Before a result is rounded, with x 1 about 4.6% of
#' results are outside the range, with x 0.85 about 1.9%, with x 1.10 about
#' 6.9% and with x 1.15 about 8.2%. Results are rounded to three figures, so a
#' test with a narrow range shows fewer: measured on 24,000 sodium results,
#' 0.9% at Phase 1, 2.5% at Phase 2 and 4.3% at Phase 3. An early study is of
#' fewer, healthier people; a late one of a wider population.
#'
#' @section What a therapeutic area changes:
#' | Area | Commoner events (class, times as common) | Serious | Severity | Labs |
#' |---|---|---|---|---|
#' | Oncology | Gastrointestinal 1.4, General 1.4, Metabolism and nutrition 1.5, Infections 1.2 | 8% of events that are not serious are | 15% of events are a grade higher | spread x 1.15; liver rises on a drug x 1.5; kidney rises x 1.5; raised liver tests from the start x 1.5 |
#' | Virology | Infections 1.5, Gastrointestinal 1.2, Nervous system 1.2 | as made | as made | raised liver tests from the start x 2; liver rises on a drug x 1.25 |
#' | Inflammation | Musculoskeletal 1.4, Infections 1.3, Skin 1.3 | as made | as made | as made |
#'
#' The indication the study table says is "Advanced solid tumours",
#' "Chronic hepatitis B" or "Rheumatoid arthritis".
#'
#' A phase's and an area's lab spreads multiply; their shifts add.
#'
#' @section What it does not change:
#' How many participants, sites, visits or adverse events a study has, who
#' leaves early, the vital signs, the ECGs, any score, and anything a site
#' metric counts except how many events are serious. An explicit setting wins:
#' `results$events$ratio`, `results$dropout` and `results$scores` are used as
#' given.
#'
#' @param phase The study's phase: `"P1"` to `"P4"`, `"Phase 2"`, `2` or
#'   `"II"`. `NULL` or anything else is neutral.
#' @param therapeutic_area `"Oncology"`, `"Virology"` or `"Inflammation"`, in
#'   any case. `NULL` or anything else is neutral.
#'
#' @return A list: `phase` and `therapeutic_area` as read (or `NA`); `spread`
#'   (lab spread multiplier); `chronic`, `liver`, `kidney` (multipliers on the
#'   share of participants with each lab pattern); `classes` (a named vector:
#'   how many times as common each system organ class is); `serious` (the share
#'   of events moved to serious when above 0, or from serious when below);
#'   `severe` (the share of events a grade higher when above 0, lower when
#'   below); `indication` (text, or `NULL`); and `said`, one sentence saying
#'   what the profile changes.
#'
#' @examples
#' study_profile("P3", "Oncology")$spread
#' study_profile()$said
#'
#' @export
study_profile <- function(phase = NULL, therapeutic_area = NULL) {
  read_phase <- function(value) {
    if (is.null(value) || !length(value) || is.na(value[[1]])) {
      return(NA_integer_)
    }
    text <- toupper(trimws(as.character(value[[1]])))
    text <- sub("^(PHASE|P)\\s*", "", text)
    roman <- c(I = 1L, II = 2L, III = 3L, IV = 4L)
    if (text %in% names(roman)) {
      return(unname(roman[text]))
    }
    number <- suppressWarnings(as.integer(text))
    if (is.na(number) || number < 1L || number > 4L) NA_integer_ else number
  }
  by_phase <- list(
    list(spread = 0.85, serious = -0.30, severe = -0.20),
    list(spread = 1, serious = 0, severe = 0),
    list(spread = 1.10, serious = 0, severe = 0),
    list(spread = 1.15, serious = 0, severe = 0)
  )
  by_area <- list(
    oncology = list(
      spread = 1.15, serious = 0.08, severe = 0.15, chronic = 1.5, liver = 1.5, kidney = 1.5,
      classes = c(
        "Gastrointestinal disorders" = 1.4,
        "General disorders and administration site conditions" = 1.4,
        "Metabolism and nutrition disorders" = 1.5,
        "Infections and infestations" = 1.2
      ),
      indication = "Advanced solid tumours"
    ),
    virology = list(
      spread = 1, serious = 0, severe = 0, chronic = 2, liver = 1.25, kidney = 1,
      classes = c(
        "Infections and infestations" = 1.5,
        "Gastrointestinal disorders" = 1.2,
        "Nervous system disorders" = 1.2
      ),
      indication = "Chronic hepatitis B"
    ),
    inflammation = list(
      spread = 1, serious = 0, severe = 0, chronic = 1, liver = 1, kidney = 1,
      classes = c(
        "Musculoskeletal and connective tissue disorders" = 1.4,
        "Infections and infestations" = 1.3,
        "Skin and subcutaneous tissue disorders" = 1.3
      ),
      indication = "Rheumatoid arthritis"
    )
  )
  number <- read_phase(phase)
  of_phase <- if (is.na(number)) by_phase[[2]] else by_phase[[number]]
  area <- if (is.null(therapeutic_area) || !length(therapeutic_area) || is.na(therapeutic_area[[1]])) {
    NA_character_
  } else {
    tolower(trimws(as.character(therapeutic_area[[1]])))
  }
  known <- !is.na(area) && area %in% names(by_area)
  of_area <- if (known) {
    by_area[[area]]
  } else {
    list(spread = 1, serious = 0, severe = 0, chronic = 1, liver = 1, kidney = 1, classes = numeric(0), indication = NULL)
  }
  said <- c(
    if (!is.na(number) && number == 1L) "Phase 1: labs are out of range less often, fewer adverse events are serious and they are milder",
    if (!is.na(number) && number >= 3L) paste0("Phase ", number, ": labs are out of range a little more often"),
    if (known && area == "oncology") "Oncology: more gastrointestinal, general and nutrition events, more serious and severe ones, and more liver and kidney rises",
    if (known && area == "virology") "Virology: more infections, and more participants with raised liver tests from the start",
    if (known && area == "inflammation") "Inflammation: more musculoskeletal, infection and skin events"
  )
  list(
    phase = number,
    therapeutic_area = if (known) area else NA_character_,
    spread = of_phase$spread * of_area$spread,
    chronic = of_area$chronic,
    liver = of_area$liver,
    kidney = of_area$kidney,
    classes = of_area$classes,
    serious = of_phase$serious + of_area$serious,
    severe = of_phase$severe + of_area$severe,
    indication = of_area$indication,
    said = if (length(said)) {
      paste0(paste(said, collapse = ". "), ".")
    } else {
      "Phase 2 with no therapeutic area: the study results are as made."
    }
  )
}

# A profile handed in with the study results, read: `NULL` for none given (the
# study's own is then used), `FALSE` or `TRUE` for the neutral one, or a list
# as `study_profile()` returns one, with what it leaves out filled in.
validate_study_profile <- function(profile) {
  if (is.null(profile)) {
    return(NULL)
  }
  neutral <- study_profile()
  if (is.logical(profile) && length(profile) == 1) {
    return(neutral)
  }
  if (!is.list(profile)) {
    stop("`results$profile` must be FALSE, or a list as `study_profile()` returns one.", call. = FALSE)
  }
  for (name in c("spread", "chronic", "liver", "kidney")) {
    value <- if (is.null(profile[[name]])) neutral[[name]] else suppressWarnings(as.numeric(profile[[name]][[1]]))
    if (is.na(value) || value <= 0) stop("`results$profile$", name, "` must be a number above 0.", call. = FALSE)
    neutral[[name]] <- value
  }
  for (name in c("serious", "severe")) {
    value <- if (is.null(profile[[name]])) 0 else suppressWarnings(as.numeric(profile[[name]][[1]]))
    if (is.na(value) || value < -1 || value > 1) stop("`results$profile$", name, "` must be from -1 to 1.", call. = FALSE)
    neutral[[name]] <- value
  }
  classes <- unlist(profile$classes)
  if (length(classes)) {
    if (is.null(names(classes)) || anyNA(suppressWarnings(as.numeric(classes))) || any(as.numeric(classes) <= 0)) {
      stop("`results$profile$classes` must be numbers above 0 named by system organ class.", call. = FALSE)
    }
    neutral$classes <- stats::setNames(as.numeric(classes), names(classes))
  }
  for (name in c("phase", "therapeutic_area", "indication", "said")) {
    if (!is.null(profile[[name]])) neutral[[name]] <- profile[[name]]
  }
  neutral
}
