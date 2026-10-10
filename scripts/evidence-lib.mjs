// Evidence normalizer (#5, multi-module #20): reshapes Vitest/Playwright
// JSON-reporter output into the committed docs/evidence/<module>/evidence.json
// contract — one evidence set per renderer module. Run provenance
// (generatedAt / environment / run) lives in dedicated top-level keys; the
// records array is deliberately timestamp-free so it stays a pure function of
// the test run and the freshness guard (compareEvidence) can ignore
// provenance entirely.

// Requirement IDs are `<MODULE>-<AREA>-<NUM><suffix?>` per the safety.agent
// matrices — SH- (histogram), SSP- (shift-plot), SDD- (delta-delta), SROT-
// (results-over-time), SOE- (outlier-explorer), AET- (ae-timelines), … The
// pattern is structural rather than an enumerated prefix list so new renderers
// need no edits here.
const REQUIREMENT_ID = /[A-Z]{2,4}-[A-Z]+-\d+[A-D]?/g;
const ISSUE_REF = /\(#(\d+)\)/g;

export function parseTestName(name) {
  const requirementIds = [...new Set(name.match(REQUIREMENT_ID) || [])];
  const issueRefs = [...name.matchAll(ISSUE_REF)].map((m) => Number(m[1]));
  return { requirementIds, issueRefs };
}

// Test-file → module routing (#20):
//
//   tests/unit/<module>/**       → <module>
//   tests/e2e/<module>.spec.js   → <module>  (the Playwright JSON reporter
//                                  emits testDir-relative paths, so a bare
//                                  `<module>.spec.js` matches too)
//
// Anything else — site.spec.js, smoke.spec.js, tests/unit/main.test.js,
// tests/unit/evidence.test.js, tests/unit/api/**, tests/unit/site/**, or a
// directory that is not a registered renderer module — routes to `null`:
// shared scaffold evidence. Per the histogram precedent, shared records are
// duplicated into EVERY module's evidence set, so each evidence.json is
// self-contained and the freshness guard still catches scaffold drift.
// `modules` comes from site/config.json's renderer registry (any status), so
// which modules exist is data, not code.
export function moduleForFile(file, modules) {
  const normalized = String(file || '').replaceAll('\\', '/');
  const unit = normalized.match(/(?:^|\/)tests\/unit\/([^/]+)\//);
  if (unit && modules.includes(unit[1])) return unit[1];
  const spec = normalized.match(/([^/]+)\.spec\.js$/);
  if (spec && modules.includes(spec[1])) return spec[1];
  return null;
}

function record(test, suite, passed, file) {
  const { requirementIds, issueRefs } = parseTestName(test);
  return {
    test,
    suite,
    status: passed ? 'pass' : 'fail',
    requirementIds,
    issueRefs,
    screenshots: [],
    file
  };
}

// Vitest --reporter=json (jest-compatible shape). `name` is the test file.
export function normalizeVitest(json) {
  return (json.testResults || []).flatMap((file) =>
    (file.assertionResults || []).map((assertion) =>
      record(
        assertion.fullName || assertion.title,
        'unit',
        assertion.status === 'passed',
        file.name || ''
      )
    )
  );
}

// Playwright --reporter=json: suites nest arbitrarily; specs carry the
// results and their source file.
export function normalizePlaywright(json) {
  const records = [];
  const walk = (suite, inheritedFile) => {
    const file = suite.file || inheritedFile;
    (suite.specs || []).forEach((spec) => {
      const results = (spec.tests || []).flatMap((t) => t.results || []);
      const last = results[results.length - 1];
      records.push(
        record(spec.title, 'browser', last ? last.status === 'passed' : false, spec.file || file)
      );
    });
    (suite.suites || []).forEach((child) => walk(child, file));
  };
  (json.suites || []).forEach((suite) => walk(suite, ''));
  return records;
}

// GitHub Actions run provenance (#20): built from the env GHA injects into
// every job; null for local runs. Consumers (the docs site) feature-detect.
export function buildRun(env = {}) {
  if (!env.GITHUB_RUN_ID) return null;
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  return {
    id: env.GITHUB_RUN_ID,
    url: env.GITHUB_REPOSITORY
      ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null
  };
}

// Screenshot files are named `${requirementId}-${slug}.png` (Playwright
// sanitizes snapshot names, so dashes are the canonical separator); each
// attaches to every record evidencing that requirement ID.
function attachScreenshots(records, screenshots) {
  for (const rec of records) {
    rec.screenshots = screenshots
      .filter((file) => {
        const prefix = file.match(/^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?/);
        return prefix && rec.requirementIds.includes(prefix[0]);
      })
      .sort();
  }
}

// Build every module's evidence set from ONE Vitest run + ONE Playwright run
// (#20). Records route to modules by test-file path (moduleForFile); shared
// scaffold records are copied into each set. Only modules with at least one
// module-routed record get an evidence set — a renderer's evidence.json
// appears the moment its first module test lands, with zero pipeline edits.
export function buildEvidenceSets({
  modules,
  vitest,
  playwright,
  screenshotsByModule = {},
  provenance = {}
}) {
  const all = [...normalizeVitest(vitest || {}), ...normalizePlaywright(playwright || {})];
  const shared = [];
  const byModule = new Map();
  for (const rec of all) {
    const module = moduleForFile(rec.file, modules);
    if (module) {
      if (!byModule.has(module)) byModule.set(module, []);
      byModule.get(module).push(rec);
    } else {
      shared.push(rec);
    }
  }

  const sets = {};
  for (const [module, moduleRecords] of byModule) {
    // Copy (and drop the routing-only `file` key) so shared records attach
    // screenshots independently per module.
    const records = [...moduleRecords, ...shared].map(({ file, ...rest }) => ({
      ...rest,
      screenshots: []
    }));
    attachScreenshots(records, screenshotsByModule[module] || []);
    records.sort((a, b) => a.suite.localeCompare(b.suite) || a.test.localeCompare(b.test));
    sets[module] = {
      module,
      generatedAt: provenance.generatedAt ?? null,
      environment: provenance.environment ?? null,
      run: provenance.run ?? null,
      records
    };
  }
  return sets;
}

// Freshness guard: stale when the test set or any pass/fail status differs.
// Screenshots, provenance (generatedAt/environment/run), and everything else
// are ignored — pixel enforcement is the browser suite's job, and provenance
// changes on every run by design.
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

// Handed results (#291). The check runs each suite once, as its own step, and
// hands the guard the two JSON reports in place of the guard running both
// suites again. A test step's exit code used to be what failed the check on a
// run that was not clean; the three functions below make the guard refuse one
// by itself, so it is safe to run on results it did not produce.

const RESULTS_FLAGS = { vitest: 'vitest-json', playwright: 'playwright-json' };

// Reads --vitest-json=<file> and --playwright-json=<file> from the arguments.
// Both or neither, and only with --check; anything else throws with the reason.
export function resultsArgs(argv, mode) {
  const given = {};
  for (const [kind, name] of Object.entries(RESULTS_FLAGS)) {
    const hits = argv.filter((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
    if (hits.length > 1) throw new Error(`--${name} is given more than once.`);
    const value = hits.length ? hits[0].slice(name.length + 3) : null;
    if (hits.length && !value) throw new Error(`--${name}=<file> needs the file's path.`);
    given[kind] = value;
  }
  if ((given.vitest || given.playwright) && mode !== 'check') {
    throw new Error('--vitest-json and --playwright-json are read only with --check.');
  }
  if (given.vitest && !given.playwright) {
    throw new Error('--vitest-json is given without --playwright-json; the guard needs both.');
  }
  if (given.playwright && !given.vitest) {
    throw new Error('--playwright-json is given without --vitest-json; the guard needs both.');
  }
  return given;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Parses one handed report. `text` is the file's content, or null when the
// file does not exist. Throws, naming the file, unless it is the JSON report
// of the reporter named by `kind`.
export function parseResults(kind, file, text) {
  if (text === null || text === undefined) throw new Error(`${file} is missing.`);
  if (!text.trim()) throw new Error(`${file} is empty.`);
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not JSON (${error.message}).`);
  }
  if (kind === 'vitest') {
    const shaped =
      isObject(json) &&
      Array.isArray(json.testResults) &&
      'success' in json &&
      Number.isInteger(json.numFailedTestSuites) &&
      Number.isInteger(json.numTotalTests);
    if (!shaped) throw new Error(`${file} is not vitest's JSON report.`);
  } else {
    const shaped =
      isObject(json) &&
      Array.isArray(json.suites) &&
      Array.isArray(json.errors) &&
      isObject(json.stats) &&
      Number.isInteger(json.stats.unexpected) &&
      Number.isInteger(json.stats.flaky);
    if (!shaped) throw new Error(`${file} is not Playwright's JSON report.`);
  }
  return json;
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Everything about two handed reports that is not a clean run of every test
// and that the comparison of names and statuses cannot see. Empty when clean.
export function handedResultsProblems({ vitest, playwright }) {
  const problems = [];
  if (vitest.success !== true) {
    problems.push(
      `unit results: vitest's "success" is ${JSON.stringify(vitest.success)}, not true.`
    );
  }
  if (vitest.numFailedTestSuites > 0) {
    // A test file that failed to load is a failed suite with no assertions.
    const failed = (vitest.testResults || [])
      .filter((file) => file.status === 'failed')
      .map((file) => `${file.name}: ${String(file.message || 'failed').split('\n')[0]}`);
    problems.push(
      `unit results: vitest reports ${count(vitest.numFailedTestSuites, 'failed suite')}` +
        (failed.length ? `, in ${failed.join('; ')}` : '.')
    );
  }
  if (playwright.errors.length > 0) {
    const first = String(playwright.errors[0]?.message ?? '').split('\n')[0];
    problems.push(
      `browser results: the report carries ${count(playwright.errors.length, 'error')}` +
        (first ? `, the first: ${first}` : '.')
    );
  }
  if (playwright.stats.unexpected > 0) {
    problems.push(`browser results: ${count(playwright.stats.unexpected, 'unexpected result')}.`);
  }
  if (playwright.stats.flaky > 0) {
    problems.push(
      `browser results: ${count(playwright.stats.flaky, 'flaky test')}, failed and then passed on a retry.`
    );
  }
  const seen = new Map();
  for (const rec of [...normalizeVitest(vitest), ...normalizePlaywright(playwright)]) {
    const key = `${rec.suite}|${rec.test}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, times] of seen) {
    if (times > 1) problems.push(`a test name appears ${times} times in the results: ${key}`);
  }
  return problems;
}
