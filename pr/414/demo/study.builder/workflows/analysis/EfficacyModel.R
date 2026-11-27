# The one function the Efficacy summary workflow calls that a query cannot do:
# an analysis of covariance of a score at its last visit. It is here, beside
# the workflow that names it, because it is analysis and not simulation:
# gsm.datasim makes the scores, and this reads the ADaM table built from them.
# R is handed this file with the workflows; nothing in r/builder.R derives data.

#' Change from baseline at the last visit, by arm, with baseline as covariate
#'
#' For each score in an ADQS table: of the rows after day one that are not the
#' baseline row, those at the last visit are fitted with `stats::lm()` as
#' change ~ baseline + arm. Each arm that is not the reference arm gets its
#' adjusted difference from the reference arm, the standard error, a 95%
#' interval and a two-sided p-value.
#'
#' The reference arm is the first arm, by name, that holds "placebo" or
#' "control", or the first arm by name when none does: the rule the summary
#' steps of the same workflow use.
#'
#' @param df An ADQS table: `USUBJID`, `ARM`, `VISIT`, `VISITNUM`, `TEST`,
#'   `BASE`, `CHG`, `ABLFL` and `DY`.
#' @return One row a result, with the columns of the Efficacy summary:
#'   `ANALYSIS`, `ANALYSISSET`, `PARAM`, `ARM`, `VISIT`, `VISITNUM`,
#'   `STATISTIC`, `VALUE` and `REFARM`. No rows when a model cannot be fitted.
EfficacyModel <- function(df) {
  empty <- data.frame(
    ANALYSIS = character(0), ANALYSISSET = character(0), PARAM = character(0), ARM = character(0),
    VISIT = character(0), VISITNUM = integer(0), STATISTIC = character(0), VALUE = numeric(0),
    REFARM = character(0), stringsAsFactors = FALSE
  )
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  needed <- c("ARM", "VISIT", "VISITNUM", "TEST", "BASE", "CHG", "ABLFL", "DY")
  if (!all(needed %in% names(df)) || !nrow(df)) {
    return(empty)
  }
  df <- df[!is.na(df$ARM) & !is.na(df$CHG) & !is.na(df$BASE) & !is.na(df$DY) & df$DY > 1 &
    !(df$ABLFL %in% "Y"), , drop = FALSE]
  out <- list(empty)
  for (score in unique(df$TEST)) {
    rows <- df[df$TEST == score, , drop = FALSE]
    if (!nrow(rows)) next
    last <- max(rows$VISITNUM)
    rows <- rows[rows$VISITNUM == last, , drop = FALSE]
    arms <- sort(unique(rows$ARM))
    named <- arms[grepl("placebo|control", arms, ignore.case = TRUE)]
    reference <- if (length(named)) named[[1]] else arms[[1]]
    others <- setdiff(arms, reference)
    # A fit needs two arms, and more rows than it has terms.
    if (!length(others) || nrow(rows) <= length(arms) + 1) next
    rows$arm <- stats::relevel(factor(rows$ARM, levels = arms), ref = reference)
    fit <- tryCatch(stats::lm(CHG ~ BASE + arm, data = rows), error = function(e) NULL)
    if (is.null(fit) || fit$df.residual < 1) next
    said <- stats::coef(summary(fit))
    for (arm in others) {
      term <- paste0("arm", arm)
      if (!(term %in% rownames(said))) next
      estimate <- said[term, "Estimate"]
      error <- said[term, "Std. Error"]
      half <- stats::qt(0.975, fit$df.residual) * error
      values <- c(
        "adjusted difference" = round(estimate, 2),
        "standard error" = round(error, 2),
        "lower 95% limit" = round(estimate - half, 2),
        "upper 95% limit" = round(estimate + half, 2),
        "p-value" = round(said[term, "Pr(>|t|)"], 4)
      )
      out[[length(out) + 1]] <- data.frame(
        ANALYSIS = "Analysis of covariance at the last visit",
        ANALYSISSET = "Enrolled participants with a score at the last visit",
        PARAM = score, ARM = arm, VISIT = rows$VISIT[[1]], VISITNUM = as.integer(last),
        STATISTIC = names(values), VALUE = unname(values), REFARM = reference,
        stringsAsFactors = FALSE
      )
    }
  }
  out <- do.call(rbind, out)
  rownames(out) <- NULL
  out
}
