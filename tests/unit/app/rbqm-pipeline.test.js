import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RBQM_STUDY, readRecord, verifyVendored } from '../../../scripts/vendor-lib.mjs';
import {
  RBQM_GATE,
  RESULT_KEYS,
  RESULT_NUMBERS,
  derivedFrom,
  inRepository,
  pipelineArgs,
  pipelineFiles,
  studyFiles
} from '../../../scripts/rbqm-lib.mjs';
import { readPins } from '../../../scripts/r-wasm-lib.mjs';

// The RBQM pipeline's run and what it stands on (#231, obot.roadmap#373): the
// demo study's raw files, copied from jwildfire/demo-301 with a record; the
// run as scripts/rbqm-lib.mjs describes it, for R in the browser and desktop R
// alike; and desktop R's rows, held to the files they were derived from. The
// browser test (APP-R-037) compares real webR's rows with these.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file));
const expected = JSON.parse(read(RBQM_GATE.expected).toString('utf8'));

describe('the RBQM demo study’s raw files (#231)', () => {
  it('APP-R-035: the five raw files adverse event rate by site needs are copied by script from jwildfire/demo-301, and match their record of the commit, checksum and size (#231)', () => {
    const directory = path.join(root, RBQM_STUDY.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record.repository).toBe('https://github.com/jwildfire/demo-301');
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.files.map((entry) => `${entry.source} -> ${entry.file}`)).toEqual([
      'input/Raw_SUBJ.csv -> Raw_SUBJ.csv',
      'input/Raw_AE.csv -> Raw_AE.csv',
      'input/Raw_SITE.csv -> Raw_SITE.csv',
      'input/Raw_STUDY.csv -> Raw_STUDY.csv',
      'input/Raw_ENROLL.csv -> Raw_ENROLL.csv'
    ]);
    // demo-301 has no dev branch, and the record says why the copy is not from one.
    expect(record.merged_to_dev).toBe(false);
    expect(record.note).toMatch(/main/);
  });
});

describe('the RBQM pipeline’s run, as R is given it (#231)', () => {
  it('APP-R-036: R is given the pipeline’s one R file first, then every copied mapping, metric and reporting workflow and gsm.kri’s one R file, each a file the repository holds, each at a place of its own under one root (#231)', () => {
    const files = pipelineFiles();
    expect(files[0]).toEqual({ file: 'site/rbqm/pipeline.R', path: '/rbqm/pipeline.R' });
    expect(files).toHaveLength(1 + 10 + 9 + 4);
    for (const { file, path: place } of [...files, ...studyFiles()]) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
      expect(place.startsWith('/rbqm/'), place).toBe(true);
    }
    const places = [...files, ...studyFiles()].map((entry) => entry.path);
    expect(new Set(places).size).toBe(places.length);
    expect(files.map((entry) => entry.path)).toContain(
      '/rbqm/gsm.reporting/workflow/3_reporting/Results.yaml'
    );
    expect(studyFiles().map((entry) => entry.path)).toEqual([
      '/rbqm/data/Raw_SUBJ.csv',
      '/rbqm/data/Raw_AE.csv',
      '/rbqm/data/Raw_SITE.csv',
      '/rbqm/data/Raw_STUDY.csv',
      '/rbqm/data/Raw_ENROLL.csv'
    ]);
  });

  it('APP-R-036: the one call names where each stage’s workflows and the raw files are, the metric to run and the snapshot’s date; desktop R is given the same call, with each place read from the repository (#231)', () => {
    expect(RBQM_GATE.call).toBe('rbqm_run');
    expect(read(RBQM_GATE.pipeline).toString('utf8')).toMatch(/^rbqm_run <- function\(/m);
    expect(pipelineArgs()).toEqual({
      data: '/rbqm/data',
      mappings: '/rbqm/gsm.mapping/workflow/1_mappings',
      metrics: '/rbqm/gsm.kri/workflow/2_metrics',
      reporting: '/rbqm/gsm.reporting/workflow/3_reporting',
      helpers: '/rbqm/gsm.kri/R/util-Report.R',
      metric_ids: ['kri0001'],
      snapshot_date: '2026-10-07'
    });
    const desktop = pipelineArgs(inRepository);
    expect(desktop).toEqual({
      data: 'site/data/rbqm',
      mappings: 'site/vendor/gsm.mapping/workflow/1_mappings',
      metrics: 'site/vendor/gsm.kri/workflow/2_metrics',
      reporting: 'site/vendor/gsm.reporting/workflow/3_reporting',
      helpers: 'site/vendor/gsm.kri/R/util-Report.R',
      metric_ids: ['kri0001'],
      snapshot_date: '2026-10-07'
    });
    for (const key of ['data', 'mappings', 'metrics', 'reporting', 'helpers']) {
      expect(existsSync(path.join(root, desktop[key])), desktop[key]).toBe(true);
    }
    expect(() => inRepository('/rbqm/elsewhere/file')).toThrow(/not a place/);
    // The packages R installs are the pinned ones, from the repository kept for them.
    expect([...RBQM_GATE.packages].sort()).toEqual(
      readPins(path.join(root, 'site/vendor/r-wasm'))
        .packages.map((pin) => pin.package)
        .sort()
    );
    expect(existsSync(path.join(root, RBQM_GATE.repository))).toBe(true);
  });
});

describe('desktop R’s rows for the RBQM pipeline (#231)', () => {
  it('APP-R-038: desktop R’s rows are derived from the pipeline’s R, the copied workflows and the demo study’s raw files as they are now, by checksum of every one (#231)', () => {
    // Rerun `node scripts/rbqm-reference.mjs` when this fails.
    expect(expected.derived_from).toEqual(derivedFrom(read));
    expect(expected.metrics).toEqual(RBQM_GATE.metrics);
    expect(expected.snapshot_date).toBe(RBQM_GATE.snapshotDate);
  });

  it('APP-R-038: they are adverse event rate for 148 sites, each row with its site, numerator, denominator, metric, score and flag, beside the Bounds, Groups and Metrics tables, from the pinned versions of the gsm packages (#231)', () => {
    const { Results, Bounds, Groups, Metrics, ran, versions, warnings } = expected.answer;
    expect(Results).toHaveLength(148);
    expect(new Set(Results.map((row) => row.GroupID)).size).toBe(148);
    for (const row of Results) {
      for (const column of [...RESULT_KEYS, ...RESULT_NUMBERS]) {
        expect(Object.prototype.hasOwnProperty.call(row, column), column).toBe(true);
      }
      expect(row.GroupLevel).toBe('Site');
      expect(row.SnapshotDate).toBe(RBQM_GATE.snapshotDate);
      expect(typeof row.Numerator).toBe('number');
      expect(typeof row.Denominator).toBe('number');
    }
    // Sites under the accrual threshold carry no flag; the rest do.
    expect(Results.filter((row) => row.Flag === null).length).toBe(27);
    expect(Results.filter((row) => row.Flag !== null && row.Flag !== 0).length).toBe(24);
    expect(Bounds.length).toBeGreaterThan(1000);
    expect(Groups.length).toBeGreaterThan(1000);
    expect(Metrics).toHaveLength(1);
    expect(Metrics[0].Metric).toBe('Adverse Event Rate');
    expect(ran.metrics).toEqual(RBQM_GATE.metrics);
    expect(ran.mappings).toEqual([
      'Mapped_AE',
      'Mapped_ENROLL',
      'Mapped_SUBJ',
      'Mapped_COUNTRY',
      'Mapped_SITE',
      'Mapped_STUDY'
    ]);
    expect(warnings).toEqual([]);
    const pins = readPins(path.join(root, 'site/vendor/r-wasm')).packages;
    for (const pin of pins) expect(versions[pin.package], pin.package).toBe(pin.version);
  });
});
