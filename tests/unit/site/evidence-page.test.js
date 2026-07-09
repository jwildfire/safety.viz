import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  expandRequirementIds,
  parseCoverage,
  renderEvidencePage
} from '../../../scripts/site-lib.mjs';

// Evidence-page generator (#7): joins the coverage table
// (docs/<module>-coverage.md) with the committed evidence.json — requirement
// ID → source matrix rows (linked to the safety.agent matrix) → test →
// status chip → screenshot(s) — and carries the routing-status sections.

const config = JSON.parse(readFileSync(new URL('./fixtures/config.json', import.meta.url), 'utf8'));
const coverageMd = readFileSync(new URL('./fixtures/coverage.md', import.meta.url), 'utf8');
const evidence = JSON.parse(
  readFileSync(new URL('./fixtures/evidence.json', import.meta.url), 'utf8')
);

describe('site generator: requirement-ID expansion', () => {
  it('expands double-dot ranges and slash shorthand into full IDs (#7)', () => {
    expect(expandRequirementIds('SH-CFG-004..006 (defaults)')).toEqual([
      'SH-CFG-004',
      'SH-CFG-005',
      'SH-CFG-006'
    ]);
    expect(expandRequirementIds('SH-LIST-002/003')).toEqual(['SH-LIST-002', 'SH-LIST-003']);
    expect(expandRequirementIds('SH-FUNC-004A, SH-FUNC-004B')).toEqual([
      'SH-FUNC-004A',
      'SH-FUNC-004B'
    ]);
    expect(expandRequirementIds('—')).toEqual([]);
  });
});

describe('site generator: coverage parsing', () => {
  const coverage = parseCoverage(coverageMd);

  it('parses the browser and unit tables plus the routing-status tail (#7)', () => {
    expect(coverage.sections.map((s) => s.kind)).toEqual(['browser', 'unit']);
    expect(coverage.sections[0].rows).toHaveLength(2);
    expect(coverage.sections[1].rows).toHaveLength(2);
    expect(coverage.sections[0].rows[0].test).toBe(
      'normal range checkbox toggles a stable overlay region'
    );
    expect(coverage.tail).toContain('Source-matrix routing status');
  });
});

describe('site generator: evidence page', () => {
  const html = renderEvidencePage({
    module: 'histogram',
    config,
    coverage: parseCoverage(coverageMd),
    evidence
  });

  it('joins browser rows to their evidence record with status chip and screenshot (#7)', () => {
    expect(html).toContain('normal range checkbox toggles a stable overlay region');
    expect(html).toContain('src="evidence/SH-CTRL-004-normal-range-overlay.png"');
    expect(html).toContain('status-pass');
  });

  it('surfaces failing records with a fail status chip (#7)', () => {
    expect(html).toContain('status-fail');
  });

  it('matches unit rows to records through expanded requirement IDs (#7)', () => {
    // The range row must pick up both fixture configure records; the
    // slash row must pick up the listing record.
    expect(html).toContain('numeric bin default follows the pilot');
    expect(html).toContain('missing-value and normal-range defaults follow the pilot');
    expect(html).toContain('listing search and sort operate on the visible columns');
  });

  it('links source matrix rows to the safety.agent matrix (#7)', () => {
    expect(html).toContain(
      'https://github.com/jwildfire/safety.agent/blob/main/docs/requirements/safety-histogram.md'
    );
    expect(html).toContain('SH-FUNC-004A');
  });

  it('carries the routing-status sections onto the page (#7)', () => {
    expect(html).toContain('Source-matrix routing status');
    expect(html).toContain('manual');
    expect(html).toContain('Legacy-API note');
  });
});
