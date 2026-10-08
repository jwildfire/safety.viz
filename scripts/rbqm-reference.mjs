// Writes desktop R's rows for the RBQM pipeline (#231, obot.roadmap#373):
// tests/fixtures/rbqm/expected.json. Desktop R is given the run that R in the
// browser is given (scripts/rbqm-lib.mjs), on the repository's own copies of
// the files, by scripts/rbqm-reference.R; this adds the checksums of every
// file the rows are derived from. The browser test holds real webR's rows to
// these.
//
//   node scripts/rbqm-reference.mjs
//
// Needs desktop R with gsm.core, gsm.mapping, gsm.reporting, workr, duckdb and
// jsonlite installed, at the versions the reference then records. Rerun when
// the demo study, a copied workflow or the pipeline's R changes; a unit test
// fails until it is.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RBQM_GATE, derivedFrom, inRepository, pipelineArgs, studyFiles } from './rbqm-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(path.join(tmpdir(), 'rbqm-reference-'));
const requestFile = path.join(work, 'arguments.json');
const answerFile = path.join(work, 'answer.json');

// The gate's run is given five of the study's nine raw files (#233), so they
// are copied to a folder of their own: desktop R reads every raw file in the
// folder it is given, as R in the browser does.
const gateData = path.join(work, 'gate');
mkdirSync(gateData);
for (const { file } of studyFiles()) {
  copyFileSync(path.join(rootDir, file), path.join(gateData, path.basename(file)));
}
writeFileSync(
  requestFile,
  JSON.stringify({
    pipeline: RBQM_GATE.pipeline,
    call: RBQM_GATE.call,
    args: { ...pipelineArgs(inRepository), data: gateData }
  })
);
execFileSync('Rscript', ['scripts/rbqm-reference.R', requestFile, answerFile], {
  cwd: rootDir,
  stdio: ['ignore', 'inherit', 'inherit']
});
const answer = JSON.parse(readFileSync(answerFile, 'utf8'));
// How long desktop R took is not part of what the browser is held to.
delete answer.seconds;

const out = path.join(rootDir, RBQM_GATE.expected);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      metrics: RBQM_GATE.metrics,
      snapshot_date: RBQM_GATE.snapshotDate,
      derived_from: derivedFrom((file) => readFileSync(path.join(rootDir, file))),
      answer
    },
    null,
    1
  )}\n`
);
console.log(
  `✓ Wrote ${RBQM_GATE.expected} — ${answer.Results.length} Results rows, ` +
    `${answer.Bounds.length} Bounds, ${answer.Groups.length} Groups, ${answer.Metrics.length} Metrics, ` +
    `from R ${answer.versions.R}.`
);
