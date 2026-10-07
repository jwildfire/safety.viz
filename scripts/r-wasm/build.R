#!/usr/bin/env Rscript
# Builds the gsm packages for R in the browser (#229, obot.roadmap#373): one
# WebAssembly package for each pin in site/vendor/r-wasm/pins.json, built from
# the pinned commit with the r-wasm project's rwasm, and written as a package
# repository under site/vendor/r-wasm/repo/ with a record, SOURCE.json, of
# what each file was built from. Nothing in a package is changed, and its
# dependencies are not built: R in the browser takes those from the public
# index (repo.r-wasm.org).
#
# Run inside the webR build image the pins name, from the repository root, by
# .github/workflows/r-wasm.yml; the output is committed. A build is not
# reproducible byte for byte, so the record names the run that made the files
# and scripts/r-wasm.mjs holds the files to the record and the record to the
# pins.

dir <- file.path("site", "vendor", "r-wasm")
pins_file <- file.path(dir, "pins.json")
pins <- jsonlite::fromJSON(pins_file, simplifyVector = FALSE)

# owner/repository@commit: the commit, never the tag, so a moved tag cannot
# change what is built.
refs <- vapply(
  pins$packages,
  function(pin) sprintf("%s@%s", sub("^https://github.com/", "", pin$repository), pin$commit),
  character(1)
)
message("Building:\n", paste0("  ", refs, collapse = "\n"))

work <- tempfile("r-wasm-repo-")
rwasm::add_pkg(refs, repo_dir = work, remotes = NULL, dependencies = FALSE, compress = TRUE)

contrib_root <- file.path(work, "bin", "emscripten", "contrib")
r_minor <- list.files(contrib_root)
if (length(r_minor) != 1) {
  stop("Expected one R version under bin/emscripten/contrib, found: ", toString(r_minor))
}
contrib <- file.path("bin", "emscripten", "contrib", r_minor)
built_dir <- file.path(work, contrib)
index <- read.dcf(file.path(built_dir, "PACKAGES"), fields = c("Package", "Version"))

# Every pin built, at the version it names, and nothing else.
wanted <- vapply(pins$packages, function(pin) pin$package, character(1))
if (!setequal(index[, "Package"], wanted)) {
  stop("Built ", toString(index[, "Package"]), " but the pins name ", toString(wanted))
}
for (pin in pins$packages) {
  version <- index[index[, "Package"] == pin$package, "Version"]
  if (!identical(unname(version), pin$version)) {
    stop(pin$package, " built as version ", version, " but its pin says ", pin$version)
  }
}

out <- file.path(dir, "repo")
unlink(out, recursive = TRUE)
dir.create(file.path(out, contrib), recursive = TRUE)
files <- list.files(built_dir)
file.copy(file.path(built_dir, files), file.path(out, contrib, files))

describe <- function(file) {
  full <- file.path(out, contrib, file)
  list(file = file, sha256 = unname(tools::sha256sum(full)), bytes = file.size(full))
}
run <- Sys.getenv("R_WASM_RUN_URL", "")
record <- list(
  packages = "gsm packages built for R in the browser",
  builder = list(
    image = pins$image,
    webr = pins$webr,
    r = paste(R.version$major, R.version$minor, sep = "."),
    rwasm = as.character(utils::packageVersion("rwasm")),
    run = if (nzchar(run)) run else NULL
  ),
  pins_sha256 = unname(tools::sha256sum(pins_file)),
  contrib = contrib,
  built = lapply(pins$packages, function(pin) {
    file <- sprintf("%s_%s.tgz", pin$package, pin$version)
    if (!file %in% files) stop("No ", file, " was built.")
    c(pin, describe(file))
  }),
  # The repository's index files, and anything else the build wrote: every
  # file served is in the record.
  index = lapply(
    sort(setdiff(files, sprintf("%s_%s.tgz", wanted, index[match(wanted, index[, "Package"]), "Version"]))),
    describe
  )
)
writeLines(
  jsonlite::toJSON(record, auto_unbox = TRUE, pretty = 2, null = "null"),
  file.path(dir, "SOURCE.json")
)
message("Wrote ", file.path(out, contrib), ":\n", paste0("  ", files, collapse = "\n"))
