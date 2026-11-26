#' Study design: a schedule of activities for a simulated study
#'
#' @description
#' `r lifecycle::badge("experimental")`
#'
#' A study design tells the simulator when participants are seen and what is
#' collected at each visit, in place of the fixed list of eight visits. It is a
#' plain list, so it can be written by hand, read from YAML or JSON, or
#' translated from a protocol (for example a CDISC USDM study definition).
#'
#' A design has one element, `visits`: a list with one entry per planned
#' visit, each a list with
#'
#' - `name` (character): the visit's name; each visit's is its own.
#' - `day` (integer): the planned study day. Day 1 is the participant's first
#'   dose; the day before it is -1; there is no day 0.
#' - `before`, `after` (integer, optional): the window, in days either side of
#'   the planned day. Default 0.
#' - `vs` (logical, optional): whether vital signs are taken at the visit.
#'   Default `FALSE`.
#' - `lb` (list, optional): the lab panels drawn at the visit, each a list with
#'   `panel` (character) and `tests` (character vector). A panel with no tests
#'   takes the simulator's own tests of that panel, or one test of the panel's
#'   name when the simulator has none.
#'
#' @section What follows a design:
#' Visits (`Raw_VISIT`), labs (`Raw_LB`) and vital signs (`Raw_VS`), in every
#' snapshot. Each visit is dated from the participant's own day 1, moved
#' within its window. A visit is made when its day is within the participant's
#' time on study and on or before the snapshot's last visit date. A participant
#' who was not enrolled has only the visits before day 1.
#'
#' Each participant keeps their own simulated vital signs and lab grades, drawn
#' again at the designed visits, so a site that was simulated as an outlier
#' still is. Which value is drawn at a visit depends only on the participant
#' and the visit, never on the random number stream, so a participant's visit
#' is the same in every snapshot that holds it.
#'
#' @section What does not, yet:
#' Adverse events, protocol deviations and the other domains keep the
#' simulator's own timeline. Values do not trend from visit to visit.
#'
#' @param design A study design, or `NULL` for none.
#'
#' @return `validate_study_design()` returns the design, with every visit's
#'   optional fields filled in and the visits in day order; it stops with a
#'   message when the design cannot be used.
#'
#' @examples
#' design <- list(visits = list(
#'   list(name = "Screening", day = -14),
#'   list(name = "Baseline", day = 1, vs = TRUE,
#'        lb = list(list(panel = "Chemistry", tests = c("ALT", "AST")))),
#'   list(name = "Week 4", day = 29, before = 3, after = 3, vs = TRUE)
#' ))
#' validate_study_design(design)$visits[[3]]$before
#'
#' @export
validate_study_design <- function(design) {
  if (is.null(design)) {
    return(NULL)
  }
  if (!is.list(design) || !is.list(design$visits) || !length(design$visits)) {
    stop("`design` must be a list with a non-empty `visits` list.", call. = FALSE)
  }
  whole <- function(value, default = NULL) {
    if (is.null(value)) {
      return(default)
    }
    number <- suppressWarnings(as.integer(round(as.numeric(value[[1]]))))
    if (is.na(number)) NULL else number
  }
  visits <- lapply(seq_along(design$visits), function(i) {
    visit <- design$visits[[i]]
    name <- if (is.null(visit$name)) "" else trimws(as.character(visit$name[[1]]))
    day <- whole(visit$day)
    if (!nzchar(name)) {
      stop("`design$visits[[", i, "]]` needs a `name`.", call. = FALSE)
    }
    if (is.null(day) || day == 0L) {
      stop(
        "The visit '", name, "' needs a `day`: a whole number that is not 0. ",
        "Day 1 is the first dose; the day before it is -1.",
        call. = FALSE
      )
    }
    panels <- lapply(visit$lb, function(panel) {
      list(
        panel = as.character(panel$panel[[1]]),
        tests = as.character(unlist(panel$tests))
      )
    })
    list(
      name = name,
      day = day,
      before = max(0L, whole(visit$before, 0L)),
      after = max(0L, whole(visit$after, 0L)),
      vs = isTRUE(as.logical(visit$vs)[1]),
      lb = panels
    )
  })
  names_of <- vapply(visits, function(visit) visit$name, character(1))
  if (anyDuplicated(names_of)) {
    stop(
      "Each visit of a design needs a name of its own; repeated: ",
      paste(unique(names_of[duplicated(names_of)]), collapse = ", "), ".",
      call. = FALSE
    )
  }
  days <- vapply(visits, function(visit) visit$day, integer(1))
  list(visits = visits[order(days)])
}

# A whole number from 1 to `n` that depends only on `key`: the same key gives
# the same number in every snapshot and every session, whatever the random
# number stream holds.
.design_pick <- function(key, n) {
  if (n <= 1L) {
    return(1L)
  }
  codes <- utf8ToInt(key)
  as.integer(sum(codes * (seq_along(codes) %% 97 + 1)) %% n) + 1L
}

# The first of several columns of a table that it has, or NULL.
.design_column <- function(table, ...) {
  found <- intersect(c(...), names(table))
  if (length(found)) found[[1]] else NULL
}

#' Apply a study design to one snapshot's raw data
#'
#' @description
#' `r lifecycle::badge("experimental")`
#'
#' Remakes a snapshot's visits, labs and vital signs on a study design's
#' schedule. [create_longitudinal_study()] calls it on every snapshot when it is
#' given a `design`; it is exported for a caller that adds a domain to a
#' snapshot afterwards and wants that domain on the schedule too. Applying it
#' twice gives what applying it once gives.
#'
#' @param lRaw A named list of one snapshot's raw data frames, as in
#'   `study$raw_data[[1]]`. It needs `Raw_SUBJ` and `Raw_VISIT`.
#' @inheritParams validate_study_design
#'
#' @return `lRaw`, with `Raw_VISIT`, and `Raw_LB` and `Raw_VS` where it has
#'   them, following the design. Returned as it was when `design` is `NULL`.
#'
#' @seealso [validate_study_design()] for the design's format.
#' @export
apply_study_design <- function(lRaw, design) {
  design <- validate_study_design(design)
  if (is.null(design)) {
    return(lRaw)
  }
  if (!all(c("Raw_SUBJ", "Raw_VISIT") %in% names(lRaw))) {
    stop("A study design needs the SUBJ and VISIT domains.", call. = FALSE)
  }
  plan <- design$visits
  subj <- as.data.frame(lRaw$Raw_SUBJ, stringsAsFactors = FALSE)
  old_visit <- as.data.frame(lRaw$Raw_VISIT, stringsAsFactors = FALSE)
  if (!nrow(subj) || !nrow(old_visit)) {
    return(lRaw)
  }
  as_date <- function(x) as.Date(substr(as.character(x), 1, 10))
  last <- suppressWarnings(max(as_date(old_visit$visit_dt), na.rm = TRUE))
  day <- vapply(plan, function(visit) visit$day, integer(1))
  # A study day as days from day 1: day 1 is 0, day -1 is the day before.
  offset <- ifelse(day > 0L, day - 1L, day)
  before <- vapply(plan, function(visit) visit$before, integer(1))
  after <- vapply(plan, function(visit) visit$after, integer(1))
  names_of <- vapply(plan, function(visit) visit$name, character(1))

  first_of <- function(...) {
    out <- as.Date(rep(NA_character_, nrow(subj)))
    for (column in c(...)) {
      if (column %in% names(subj)) {
        value <- as_date(subj[[column]])
        out[is.na(out)] <- value[is.na(out)]
      }
    }
    out
  }
  enrolled <- "enrollyn" %in% names(subj) & !is.na(subj$enrollyn) & subj$enrollyn == "Y"
  day_one <- first_of("firstdosedate", "enrolldt", "firstparticipantdate")
  screened <- first_of("mincreated_dts", "firstparticipantdate")
  on_study <- if ("timeonstudy" %in% names(subj)) {
    suppressWarnings(as.integer(subj$timeonstudy))
  } else {
    rep(NA_integer_, nrow(subj))
  }
  on_study[is.na(on_study)] <- .Machine$integer.max
  site <- if ("invid" %in% names(subj)) as.character(subj$invid) else rep(NA_character_, nrow(subj))

  rows <- lapply(seq_len(nrow(subj)), function(i) {
    id <- as.character(subj$subjid[i])
    if (enrolled[i] && !is.na(day_one[i])) {
      keep <- which(offset <= on_study[i])
      anchor <- day_one[i]
    } else {
      # Screened and not enrolled: the visits before day 1, from the day they were screened.
      keep <- which(day < 1L)
      if (is.na(screened[i]) || !length(keep)) {
        return(NULL)
      }
      anchor <- screened[i] - min(offset[keep])
    }
    if (!length(keep)) {
      return(NULL)
    }
    # Where in its window a visit falls depends on the participant and the visit alone.
    moved <- vapply(keep, function(k) {
      span <- before[k] + after[k] + 1L
      .design_pick(paste(id, names_of[k], "window"), span) - 1L - before[k]
    }, integer(1))
    dates <- anchor + offset[keep] + moved
    ok <- is.na(last) | dates <= last
    if (!any(ok)) {
      return(NULL)
    }
    data.frame(
      subjid = id, invid = site[i], at = keep[ok], date = dates[ok],
      stringsAsFactors = FALSE
    )
  })
  made <- do.call(rbind, rows)
  if (is.null(made) || !nrow(made)) {
    return(lRaw)
  }

  # Visits: the same columns as before, on the design's schedule.
  visit <- old_visit[rep(1L, nrow(made)), , drop = FALSE]
  rownames(visit) <- NULL
  visit$subjid <- made$subjid
  if ("invid" %in% names(visit)) visit$invid <- made$invid
  visit$visit_dt <- if (inherits(old_visit$visit_dt, "Date")) made$date else format(made$date, "%Y-%m-%d")
  for (column in intersect(c("foldername", "instancename", "visit", "visnam"), names(visit))) {
    visit[[column]] <- names_of[made$at]
  }
  lRaw$Raw_VISIT <- visit

  # Vital signs: a participant's own, drawn again at each visit that takes them.
  if ("Raw_VS" %in% names(lRaw) && nrow(lRaw$Raw_VS)) {
    old <- as.data.frame(lRaw$Raw_VS, stringsAsFactors = FALSE)
    takes <- vapply(plan, function(one) one$vs, logical(1))
    at <- made[takes[made$at], , drop = FALSE]
    by_subj <- split(seq_len(nrow(old)), as.character(old$subjid))
    pick <- vapply(seq_len(nrow(at)), function(i) {
      own <- by_subj[[at$subjid[i]]]
      if (!length(own)) own <- seq_len(nrow(old))
      own[.design_pick(paste(at$subjid[i], names_of[at$at[i]], "vs"), length(own))]
    }, integer(1))
    new <- old[pick, , drop = FALSE]
    rownames(new) <- NULL
    new$subjid <- at$subjid
    if ("vs_dt" %in% names(new)) {
      new$vs_dt <- if (inherits(old$vs_dt, "Date")) at$date else format(at$date, "%Y-%m-%d")
    }
    for (column in intersect(c("foldername", "instancename", "visit", "visnam"), names(new))) {
      new[[column]] <- names_of[at$at]
    }
    lRaw$Raw_VS <- new
  }

  # Labs: at each visit, the panels the design draws there. A panel that lists
  # its tests has those; one that lists none has the simulator's tests of that
  # panel, or one test of the panel's name. Each grade is one of the
  # participant's own.
  if ("Raw_LB" %in% names(lRaw) && nrow(lRaw$Raw_LB)) {
    old <- as.data.frame(lRaw$Raw_LB, stringsAsFactors = FALSE)
    known <- unique(old[, c("battrnam", "lbtstnam")])
    tests_of <- function(panel) {
      listed <- panel$tests
      if (!length(listed)) {
        match <- known$lbtstnam[grepl(panel$panel, known$battrnam, ignore.case = TRUE, fixed = FALSE)]
        listed <- if (length(match)) match else panel$panel
      }
      data.frame(battrnam = toupper(panel$panel), lbtstnam = listed, stringsAsFactors = FALSE)
    }
    panels <- lapply(plan, function(one) {
      if (!length(one$lb)) {
        return(NULL)
      }
      unique(do.call(rbind, lapply(one$lb, tests_of)))
    })
    grades <- split(as.character(old$toxgrg_nsv), as.character(old$subjid))
    every <- as.character(old$toxgrg_nsv)
    visit_column <- .design_column(old, "visnam", "instancename", "foldername", "visit")
    rows <- lapply(seq_len(nrow(made)), function(i) {
      tests <- panels[[made$at[i]]]
      if (is.null(tests)) {
        return(NULL)
      }
      own <- grades[[made$subjid[i]]]
      if (!length(own)) own <- every
      picked <- vapply(seq_len(nrow(tests)), function(t) {
        own[.design_pick(paste(made$subjid[i], names_of[made$at[i]], tests$lbtstnam[t]), length(own))]
      }, character(1))
      block <- old[rep(1L, nrow(tests)), , drop = FALSE]
      block$subjid <- made$subjid[i]
      block$toxgrg_nsv <- picked
      block$battrnam <- tests$battrnam
      block$lbtstnam <- tests$lbtstnam
      if ("lb_dt" %in% names(block)) {
        block$lb_dt <- if (inherits(old$lb_dt, "Date")) made$date[i] else format(made$date[i], "%Y-%m-%d")
      }
      if (!is.null(visit_column)) block[[visit_column]] <- names_of[made$at[i]]
      block
    })
    new <- do.call(rbind, rows)
    if (is.null(new)) new <- old[0, , drop = FALSE]
    rownames(new) <- NULL
    lRaw$Raw_LB <- new
  }
  lRaw
}
