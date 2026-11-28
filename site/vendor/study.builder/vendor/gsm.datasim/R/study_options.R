# NOTICE. This file is not part of gsm.datasim v2.1.0 (https://github.com/Gilead-Public/gsm.datasim, commit 29fc61c), Copyright Gilead Sciences, Apache License 2.0.
# Added in November 2026 by Jeremy Wildfire, in the modified copy at
# https://github.com/jwildfire/gsm.datasim (branch safety-results-2.1),
# under the same licence. Not reviewed or endorsed by gsm.datasim's maintainers.

#' Columns under gsm's names
#'
#' @description
#' `r lifecycle::badge("experimental")`
#'
#' The simulator names each raw column as the source system does: the name a
#' mapping workflow's spec gives as `source_col`. gsm's own tools read the
#' column under gsm's name for it. `apply_gsm_names()` renames every such
#' column of one snapshot's raw tables, and keeps what each was called.
#'
#' @param lRaw A named list of one snapshot's raw data frames, as in
#'   `study$raw_data[[1]]`.
#' @param specs Optional named list of table specs for tables the installed
#'   `gsm.mapping` has no mapping workflow for, as `list(Raw_VS = <spec>)`.
#'
#' @return `lRaw`, each table's columns under gsm's names. A table with a
#'   renamed column carries the attribute `renamed`: a character vector of the
#'   names the simulator used, named by gsm's. A column is renamed only when
#'   the table has the source name and not gsm's, so applying it twice gives
#'   what applying it once gives.
#'
#' @examples
#' \dontrun{
#' study <- create_longitudinal_study(domains = c("AE", "VISIT"))
#' named <- apply_gsm_names(study$raw_data[[1]])
#' attr(named$Raw_SITE, "renamed")
#' }
#'
#' @export
apply_gsm_names <- function(lRaw, specs = NULL) {
  folder <- base::system.file("workflow", "1_mappings", package = "gsm.mapping")
  installed <- lapply(list.files(folder, pattern = "\\.yaml$", full.names = TRUE), function(file) {
    yaml::read_yaml(file)$spec
  })
  for (spec in c(installed, list(if (is.null(specs)) list() else specs))) {
    for (table in intersect(names(spec), names(lRaw))) {
      for (column in names(spec[[table]])) {
        source <- spec[[table]][[column]]$source_col
        if (is.null(source) || identical(source, column)) next
        have <- names(lRaw[[table]])
        if (source %in% have && !(column %in% have)) {
          names(lRaw[[table]])[have == source] <- column
          # Kept, so the table can say what the simulator called the column.
          was <- attr(lRaw[[table]], "renamed")
          attr(lRaw[[table]], "renamed") <- c(was, stats::setNames(source, column))
        }
      }
    }
  }
  lRaw
}

#' @rdname create_longitudinal_study
#' @return `validate_study_specs()` returns the specs handed in, or `NULL` for
#'   none; it stops with a message when they cannot be used.
#' @export
validate_study_specs <- function(specs) {
  if (is.null(specs) || !length(specs)) {
    return(NULL)
  }
  if (!is.list(specs) || is.null(names(specs)) || any(!nzchar(names(specs)))) {
    stop("`specs` must be a list of table specs named by table, as `list(Raw_VS = ...)`.", call. = FALSE)
  }
  raw <- startsWith(names(specs), "Raw_")
  if (!any(raw)) {
    stop("`specs` names no raw table: each name begins with `Raw_`.", call. = FALSE)
  }
  for (table in names(specs)[raw]) {
    if (!is.list(specs[[table]]) || !length(specs[[table]])) {
      stop("The spec of ", table, " names no column.", call. = FALSE)
    }
  }
  # A mapping workflow's spec also names the tables it reads beside the raw
  # one (Mapped_SUBJ, say). Only the raw tables are made.
  specs[raw]
}

# How a site id begins: letters and digits, starting with a letter or a digit.
validate_site_id_prefix <- function(prefix) {
  if (is.null(prefix)) {
    return("0X")
  }
  if (!is.character(prefix) || length(prefix) != 1 || !grepl("^[A-Za-z0-9]+$", prefix)) {
    stop("`site_id_prefix` must be one run of letters and digits, such as \"0X\" or \"SITE\".", call. = FALSE)
  }
  prefix
}

# The study table saying the phase, the area and the indication asked for. The column is the
# one the spec names for each, under the source's name or gsm's.
.set_study_labels <- function(study, spec, params) {
  for (label in c("phase", "therapeutic_area", "protocol_indication")) {
    value <- params[[label]]
    if (is.null(value)) next
    source <- if (is.list(spec) && is.list(spec[[label]])) spec[[label]]$source_col else NULL
    for (column in unique(c(label, source))) {
      if (column %in% names(study)) study[[column]] <- rep(as.character(value)[1], nrow(study))
    }
  }
  study
}

# Evaluate `code` on a random stream of its own, and put the stream back as it
# was: what the code draws moves nothing after it. The stream it draws from is
# worked out from where the main one stands and `salt`, so the same seed gives
# the same draws.
.with_own_stream <- function(salt, code) {
  if (!exists(".Random.seed", envir = globalenv(), inherits = FALSE)) set.seed(NULL)
  kept <- get(".Random.seed", envir = globalenv(), inherits = FALSE)
  on.exit(assign(".Random.seed", kept, envir = globalenv()), add = TRUE)
  state <- abs(as.numeric(kept[seq_len(min(length(kept), 12L))]))
  set.seed(as.integer((sum(state %% 100003) + as.numeric(salt) * 7919) %% 2147483647))
  force(code)
}
