// Writes desktop R's rows for the RBQM pipeline (#231, #234, obot.roadmap#374):
// tests/fixtures/rbqm/expected.json, the gate's one metric on five raw files,
// and tests/fixtures/rbqm/expected-tab.json, the tab's run of every metric on
// the whole demo study and on two studies with something missing. It also
// writes site/rbqm/needs.json (#236): what each workflow needs, as R reads it
// from the workflows' own specs, which the tab is built with. Desktop R is
// given the runs that R in the browser is given (scripts/rbqm-lib.mjs), on the
// repository's own copies of the files, by scripts/rbqm-reference.R; this adds
// the checksums of every file the rows are derived from. The browser tests
// hold real webR's rows to these.
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
import {
  RBQM_GATE,
  RBQM_NEEDS,
  RBQM_TAB,
  RESULT_NUMBERS,
  derivedFrom,
  inRepository,
  needsArgs,
  needsDerivedFrom,
  pipelineArgs,
  scenarioFiles,
  studyFiles,
  tabArgs,
  tabDerivedFrom
} from './rbqm-lib.mjs';

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

// ---- The tab's run (#234): every metric, on three studies ----

const read = (file) => readFileSync(path.join(rootDir, file));
const scenarios = {};
for (const scenario of RBQM_TAB.scenarios) {
  const folder = path.join(work, scenario.id);
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(scenarioFiles(scenario, read))) {
    writeFileSync(path.join(folder, name), text);
  }
  const request = path.join(work, `${scenario.id}-arguments.json`);
  const reply = path.join(work, `${scenario.id}-answer.json`);
  writeFileSync(
    request,
    JSON.stringify({
      pipeline: RBQM_TAB.pipeline,
      call: RBQM_TAB.call,
      args: tabArgs(folder, inRepository)
    })
  );
  execFileSync('Rscript', ['scripts/rbqm-reference.R', request, reply], {
    cwd: rootDir,
    stdio: ['ignore', 'inherit', 'inherit']
  });
  scenarios[scenario.id] = JSON.parse(readFileSync(reply, 'utf8'));
  delete scenarios[scenario.id].seconds;
}

// A study with something missing gives every metric that still runs the rows
// the whole study gives it: the metrics are worked one by one. That is checked
// here, so the fixture keeps the whole study's rows once and, for the other
// two, which metrics ran and what the rest said.
const whole = scenarios.whole;
const rowsOf = (answer) =>
  new Map(answer.Results.map((row) => [`${row.MetricID} ${row.GroupID}`, row]));
const wholeRows = rowsOf(whole);
const partial = {};
for (const scenario of RBQM_TAB.scenarios.filter((item) => item.id !== 'whole')) {
  const answer = scenarios[scenario.id];
  for (const [key, row] of rowsOf(answer)) {
    const full = wholeRows.get(key);
    if (!full || RESULT_NUMBERS.some((column) => row[column] !== full[column])) {
      throw new Error(`${scenario.id}: the row ${key} is not the whole study's row.`);
    }
  }
  partial[scenario.id] = {
    label: scenario.label,
    status: answer.status,
    groups: answer.groups,
    notes: answer.notes,
    thresholds: answer.thresholds,
    ran: answer.ran,
    warnings: answer.warnings,
    rows: {
      Results: answer.Results.length,
      Bounds: answer.Bounds.length,
      Groups: answer.Groups.length,
      Metrics: answer.Metrics.length
    }
  };
}

// One row to a line: the tables are long, and the file is read by a test.
const table = (rows) => `[\n${rows.map((row) => `   ${JSON.stringify(row)}`).join(',\n')}\n  ]`;
const { Results, Bounds, Groups, Metrics, ...rest } = whole;
const tabOut = path.join(rootDir, RBQM_TAB.expected);
writeFileSync(
  tabOut,
  `{\n "metrics": ${JSON.stringify(RBQM_TAB.metrics)},\n` +
    ` "snapshot_date": ${JSON.stringify(RBQM_TAB.snapshotDate)},\n` +
    ` "derived_from": ${JSON.stringify(tabDerivedFrom(read), null, 1).replace(/\n/g, '\n ')},\n` +
    ` "whole": {\n` +
    `  "Results": ${table(Results)},\n` +
    `  "Bounds": ${table(Bounds)},\n` +
    `  "Groups": ${table(Groups)},\n` +
    `  "Metrics": ${table(Metrics)},\n` +
    Object.entries(rest)
      .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(',\n') +
    `\n },\n` +
    ` "partial": ${JSON.stringify(partial, null, 1).replace(/\n/g, '\n ')}\n}\n`
);
console.log(
  `✓ Wrote ${RBQM_TAB.expected} — ${Results.length} Results rows for ` +
    `${new Set(Results.map((row) => row.MetricID)).size} metrics, ${Bounds.length} Bounds, ` +
    `${Groups.length} Groups, ${Metrics.length} Metrics; and ` +
    Object.entries(partial)
      .map(([id, item]) => `${id}: ${item.ran.metrics.length} metrics ran`)
      .join(', ') +
    '.'
);

// ---- What each workflow needs, read by R from the workflows' specs (#236) ----

const needsRequest = path.join(work, 'needs-arguments.json');
const needsReply = path.join(work, 'needs-answer.json');
writeFileSync(
  needsRequest,
  JSON.stringify({
    pipeline: RBQM_NEEDS.pipeline,
    call: RBQM_NEEDS.call,
    args: needsArgs(inRepository)
  })
);
execFileSync('Rscript', ['scripts/rbqm-reference.R', needsRequest, needsReply], {
  cwd: rootDir,
  stdio: ['ignore', 'inherit', 'inherit']
});
const needs = JSON.parse(readFileSync(needsReply, 'utf8'));
writeFileSync(
  path.join(rootDir, RBQM_NEEDS.file),
  `${JSON.stringify({ derived_from: needsDerivedFrom(read), needs }, null, 1)}\n`
);
console.log(
  `✓ Wrote ${RBQM_NEEDS.file} — what ${needs.mappings.length} mapping workflows and ` +
    `${needs.metrics.length} metric workflows need, of ${needs.raw.length} raw tables.`
);
