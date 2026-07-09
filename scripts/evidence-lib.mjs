// Evidence normalizer (#5): reshapes Vitest/Playwright JSON-reporter output into
// the committed docs/evidence/<module>/evidence.json contract. Deliberately
// timestamp-free so the artifact is a pure function of the test run.

const REQUIREMENT_ID = /SH-[A-Z]+-\d+[A-D]?/g;
const ISSUE_REF = /\(#(\d+)\)/g;

export function parseTestName(name) {
  const requirementIds = [...new Set(name.match(REQUIREMENT_ID) || [])];
  const issueRefs = [...name.matchAll(ISSUE_REF)].map((m) => Number(m[1]));
  return { requirementIds, issueRefs };
}

function record(test, suite, passed) {
  const { requirementIds, issueRefs } = parseTestName(test);
  return {
    test,
    suite,
    status: passed ? 'pass' : 'fail',
    requirementIds,
    issueRefs,
    screenshots: []
  };
}

// Vitest --reporter=json (jest-compatible shape).
export function normalizeVitest(json) {
  return (json.testResults || []).flatMap((file) =>
    (file.assertionResults || []).map((assertion) =>
      record(assertion.fullName || assertion.title, 'unit', assertion.status === 'passed')
    )
  );
}

// Playwright --reporter=json: suites nest arbitrarily; specs carry the results.
export function normalizePlaywright(json) {
  const records = [];
  const walk = (suite) => {
    (suite.specs || []).forEach((spec) => {
      const results = (spec.tests || []).flatMap((t) => t.results || []);
      const last = results[results.length - 1];
      records.push(record(spec.title, 'browser', last ? last.status === 'passed' : false));
    });
    (suite.suites || []).forEach(walk);
  };
  (json.suites || []).forEach(walk);
  return records;
}

// Screenshot files are named `${requirementId}_${slug}.png`; each attaches to
// every record evidencing that requirement ID.
export function buildEvidence({ module, vitest, playwright, screenshots = [] }) {
  const records = [...normalizeVitest(vitest || {}), ...normalizePlaywright(playwright || {})];
  for (const rec of records) {
    rec.screenshots = screenshots
      .filter((file) => rec.requirementIds.includes(file.split('_')[0].replace(/\.png$/, '')))
      .sort();
  }
  records.sort((a, b) => a.suite.localeCompare(b.suite) || a.test.localeCompare(b.test));
  return { module, records };
}

// Freshness guard: stale when the test set or any pass/fail status differs.
// Screenshots and everything else are ignored — pixel enforcement is the
// browser suite's job.
export function compareEvidence(committed, fresh) {
  const key = (r) => `${r.suite}|${r.test}`;
  const committedMap = new Map((committed.records || []).map((r) => [key(r), r.status]));
  const freshMap = new Map((fresh.records || []).map((r) => [key(r), r.status]));
  const differences = [];
  for (const [k, status] of committedMap) {
    if (!freshMap.has(k)) differences.push(`missing in fresh run: ${k}`);
    else if (freshMap.get(k) !== status)
      differences.push(`status changed: ${k} (${status} → ${freshMap.get(k)})`);
  }
  for (const k of freshMap.keys()) {
    if (!committedMap.has(k)) differences.push(`new test not in committed evidence: ${k}`);
  }
  return { stale: differences.length > 0, differences };
}
