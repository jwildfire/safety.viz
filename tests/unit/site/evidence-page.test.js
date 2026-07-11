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
    expect(coverage.sections[0].rows).toHaveLength(3);
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

  it('falls back to requirement-ID matching when a browser row wording drifts from the spec name (#7)', () => {
    // The coverage table says "missing results are dropped with a note"; the
    // spec name reads differently but evidences the same requirement ID.
    expect(html).toContain('missing and non-numeric results are dropped with a reported count');
    expect(html).not.toContain('status-none');
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

  it('rewrites repo-relative coverage links to repository URLs (#7)', () => {
    // The coverage doc lives at docs/, so its ../CONTRIBUTING.md link must
    // point back at the repository, not at a path inside the site.
    expect(html).not.toContain('href="../CONTRIBUTING.md"');
    expect(html).toContain('https://github.com/jwildfire/safety.viz/blob/HEAD/CONTRIBUTING.md');
  });
});

// Qualification-report framing (#21): the evidence page opens with a summary
// fact panel — scope, result counts, and run provenance — rendered from
// evidence.json's top-level provenance fields when present (they land with
// the multi-module evidence pipeline, #20) and degrading gracefully when the
// committed evidence set predates them.
describe('site generator: evidence report provenance (#21)', () => {
  const base = { module: 'histogram', config, coverage: parseCoverage(coverageMd) };
  const html = renderEvidencePage({ ...base, evidence });

  it('summarizes scope and results in a fact panel (#21)', () => {
    expect(html).toContain('class="facts"');
    // Fixture: 7 records — 3 browser, 4 unit, 1 failing.
    expect(html).toContain('7');
    expect(html).toContain('1 failing');
  });

  it('renders generation date, environment, and CI run when evidence.json carries them (#21)', () => {
    const withProvenance = {
      ...evidence,
      generatedAt: '2026-07-11T14:03:22.000Z',
      environment: {
        os: 'ubuntu-24.04',
        node: '24.4.0',
        playwright: '1.61.1',
        chromium: '141.0.0.0'
      },
      run: {
        id: 29160000001,
        url: 'https://github.com/jwildfire/safety.viz/actions/runs/29160000001'
      }
    };
    const provenanceHtml = renderEvidencePage({ ...base, evidence: withProvenance });
    expect(provenanceHtml).toContain('2026-07-11');
    expect(provenanceHtml).toContain('ubuntu-24.04');
    expect(provenanceHtml).toContain(
      'https://github.com/jwildfire/safety.viz/actions/runs/29160000001'
    );
  });

  it('degrades gracefully when provenance fields are absent (#21)', () => {
    expect(html).toContain('Not recorded');
    expect(html).not.toContain('undefined');
  });

  it('links result chips to the CI run when a run is recorded (#21)', () => {
    const withRun = {
      ...evidence,
      run: {
        id: 29160000002,
        url: 'https://github.com/jwildfire/safety.viz/actions/runs/29160000002'
      }
    };
    const runHtml = renderEvidencePage({ ...base, evidence: withRun });
    expect(runHtml).toContain('chip-link');
    expect(html).not.toContain('chip-link');
  });

  it('presents a captioned visual-evidence gallery of the committed screenshots (#21)', () => {
    expect(html).toContain('evidence-gallery');
    expect(html).toContain('SH-CTRL-004');
    expect(html).toContain('normal range overlay');
  });
});
