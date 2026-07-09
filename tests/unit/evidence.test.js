import { describe, it, expect } from 'vitest';
import {
  parseTestName,
  normalizeVitest,
  normalizePlaywright,
  buildEvidence,
  compareEvidence
} from '../../scripts/evidence-lib.mjs';

// Evidence pipeline (#5): reporter output → docs/evidence/<module>/evidence.json.
// The normalizer is the unit-testable core; capture assertions are enforced by
// the browser suite itself.

const VITEST_FIXTURE = {
  testResults: [
    {
      name: '/repo/tests/unit/histogram/structureData.test.js',
      assertionResults: [
        {
          fullName:
            'histogram structureData > SH-DATA-002: missing and non-numeric results are removed with a reported count (#2)',
          status: 'passed'
        },
        {
          fullName:
            "histogram structureData > SH-CTRL-006: binning algorithms produce the pilot's bin quantities (#2)",
          status: 'failed'
        }
      ]
    }
  ]
};

const PLAYWRIGHT_FIXTURE = {
  suites: [
    {
      title: 'histogram.spec.js',
      suites: [
        {
          title: 'safety.viz histogram module',
          specs: [
            {
              title:
                'SH-CTRL-004/SH-FUNC-004A/SH-FUNC-004B: normal range checkbox toggles a stable overlay region (#2)',
              tests: [{ results: [{ status: 'passed' }] }]
            },
            {
              title:
                'SH-FUNC-011: selecting a bar de-emphasizes the bars outside the linked listing (#2)',
              tests: [{ results: [{ status: 'failed' }] }]
            }
          ]
        }
      ]
    }
  ]
};

describe('evidence normalizer', () => {
  it('parseTestName extracts requirement IDs and issue refs (#5)', () => {
    const parsed = parseTestName(
      'SH-CTRL-001/SH-CTRL-002/SH-CTRL-006: renders measure, filter, axis, bin, and group controls (#2)'
    );
    expect(parsed.requirementIds).toEqual(['SH-CTRL-001', 'SH-CTRL-002', 'SH-CTRL-006']);
    expect(parsed.issueRefs).toEqual([2]);

    const suffixed = parseTestName(
      'SH-FUNC-004C: normal range control is hidden when the measure has no normal range data (#2)'
    );
    expect(suffixed.requirementIds).toEqual(['SH-FUNC-004C']);

    expect(parseTestName('demo page loads with no console errors (#1)').requirementIds).toEqual([]);
  });

  it('normalizeVitest maps assertion results to unit-suite records (#5)', () => {
    const records = normalizeVitest(VITEST_FIXTURE);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      suite: 'unit',
      status: 'pass',
      requirementIds: ['SH-DATA-002'],
      issueRefs: [2]
    });
    expect(records[1].status).toBe('fail');
    expect(records[1].requirementIds).toEqual(['SH-CTRL-006']);
  });

  it('normalizePlaywright walks nested suites into browser-suite records (#5)', () => {
    const records = normalizePlaywright(PLAYWRIGHT_FIXTURE);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      suite: 'browser',
      status: 'pass',
      requirementIds: ['SH-CTRL-004', 'SH-FUNC-004A', 'SH-FUNC-004B']
    });
    expect(records[1]).toMatchObject({ suite: 'browser', status: 'fail' });
  });

  it('buildEvidence merges suites deterministically and attaches screenshots by requirement ID (#5)', () => {
    const evidence = buildEvidence({
      module: 'histogram',
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      screenshots: ['SH-CTRL-004_overlay-visible.png', 'SH-FUNC-011_bar-de-emphasis.png']
    });
    expect(evidence.module).toBe('histogram');
    expect(evidence.records).toHaveLength(4);
    // Deterministic: no timestamps, stable sort by suite then test name.
    expect(JSON.stringify(evidence)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    const overlay = evidence.records.find((r) => r.requirementIds.includes('SH-CTRL-004'));
    expect(overlay.screenshots).toEqual(['SH-CTRL-004_overlay-visible.png']);
    const unitRec = evidence.records.find((r) => r.requirementIds.includes('SH-DATA-002'));
    expect(unitRec.screenshots).toEqual([]);
    expect(
      buildEvidence({
        module: 'histogram',
        vitest: VITEST_FIXTURE,
        playwright: PLAYWRIGHT_FIXTURE,
        screenshots: []
      })
    ).toEqual(
      buildEvidence({
        module: 'histogram',
        vitest: VITEST_FIXTURE,
        playwright: PLAYWRIGHT_FIXTURE,
        screenshots: []
      })
    );
  });

  it('compareEvidence flags status drift and test-set changes, ignoring screenshots (#5)', () => {
    const committed = buildEvidence({
      module: 'histogram',
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      screenshots: ['SH-CTRL-004_overlay-visible.png']
    });
    const same = buildEvidence({
      module: 'histogram',
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      screenshots: []
    });
    expect(compareEvidence(committed, same).stale).toBe(false);

    const flipped = JSON.parse(JSON.stringify(same));
    flipped.records[0].status = flipped.records[0].status === 'pass' ? 'fail' : 'pass';
    const drift = compareEvidence(committed, flipped);
    expect(drift.stale).toBe(true);
    expect(drift.differences.length).toBeGreaterThan(0);

    const missing = JSON.parse(JSON.stringify(same));
    missing.records.pop();
    expect(compareEvidence(committed, missing).stale).toBe(true);
  });
});
