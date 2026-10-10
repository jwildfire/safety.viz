import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, it, expect } from 'vitest';
import {
  parseTestName,
  moduleForFile,
  normalizeVitest,
  normalizePlaywright,
  buildRun,
  buildEvidenceSets,
  compareEvidence,
  resultsArgs,
  parseResults,
  handedResultsProblems
} from '../../scripts/evidence-lib.mjs';

// Evidence pipeline (#5, multi-module #20): reporter output →
// docs/evidence/<module>/evidence.json, one set per renderer module. The
// normalizer + router are the unit-testable core; capture assertions are
// enforced by the browser suite itself.

const MODULES = ['histogram', 'shift-plot'];

const PROVENANCE = {
  generatedAt: '2026-07-11T12:00:00.000Z',
  environment: {
    os: 'linux 6.8.0',
    node: 'v22.17.0',
    playwright: '1.61.1',
    chromium: '149.0.7827.55'
  },
  run: { id: '123', url: 'https://github.com/jwildfire/safety.viz/actions/runs/123' }
};

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
    },
    {
      name: '/repo/tests/unit/shift-plot/structureData.test.js',
      assertionResults: [
        {
          fullName:
            'shift-plot structureData > SSP-DATA-001: baseline and comparison values pair by participant (#23)',
          status: 'passed'
        }
      ]
    },
    {
      name: '/repo/tests/unit/main.test.js',
      assertionResults: [
        {
          fullName: 'safety.viz entry > module entry exposes the renderer factories (#1)',
          status: 'passed'
        }
      ]
    }
  ]
};

const PLAYWRIGHT_FIXTURE = {
  suites: [
    {
      title: 'histogram.spec.js',
      file: 'histogram.spec.js',
      suites: [
        {
          title: 'safety.viz histogram module',
          file: 'histogram.spec.js',
          specs: [
            {
              title:
                'SH-CTRL-004/SH-FUNC-004A/SH-FUNC-004B: normal range checkbox toggles a stable overlay region (#2)',
              file: 'histogram.spec.js',
              tests: [{ results: [{ status: 'passed' }] }]
            },
            {
              title:
                'SH-FUNC-011: selecting a bar de-emphasizes the bars outside the linked listing (#2)',
              file: 'histogram.spec.js',
              tests: [{ results: [{ status: 'failed' }] }]
            }
          ]
        }
      ]
    },
    {
      title: 'shift-plot.spec.js',
      file: 'shift-plot.spec.js',
      suites: [
        {
          title: 'safety.viz shift-plot module',
          file: 'shift-plot.spec.js',
          specs: [
            {
              title: 'SSP-CHART-001: baseline versus comparison scatter renders (#23)',
              file: 'shift-plot.spec.js',
              tests: [{ results: [{ status: 'passed' }] }]
            }
          ]
        }
      ]
    },
    {
      title: 'smoke.spec.js',
      file: 'smoke.spec.js',
      suites: [
        {
          title: 'safety.viz scaffold',
          file: 'smoke.spec.js',
          specs: [
            {
              title: 'demo page loads with no console errors (#1)',
              file: 'smoke.spec.js',
              tests: [{ results: [{ status: 'passed' }] }]
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

  it('parseTestName recognizes every renderer requirement-ID prefix, not just SH (#20)', () => {
    expect(
      parseTestName('SSP-DATA-001: baseline and comparison values pair by participant (#23)')
        .requirementIds
    ).toEqual(['SSP-DATA-001']);
    expect(
      parseTestName('SROT-CHART-002A/AET-FUNC-003: combined evidence row (#24)').requirementIds
    ).toEqual(['SROT-CHART-002A', 'AET-FUNC-003']);
    // Prose that merely looks dashed must not mint requirement IDs.
    expect(parseTestName('exports SUBJ-006 rows to CSV (#2)').requirementIds).toEqual([]);
  });

  it('moduleForFile routes test files to renderer modules by path (#20)', () => {
    // Unit tests live in tests/unit/<module>/.
    expect(moduleForFile('/repo/tests/unit/histogram/structureData.test.js', MODULES)).toBe(
      'histogram'
    );
    expect(moduleForFile('tests/unit/shift-plot/configure.test.js', MODULES)).toBe('shift-plot');
    // Browser specs are tests/e2e/<module>.spec.js (the JSON reporter emits
    // testDir-relative paths).
    expect(moduleForFile('histogram.spec.js', MODULES)).toBe('histogram');
    expect(moduleForFile('tests/e2e/shift-plot.spec.js', MODULES)).toBe('shift-plot');
    // Everything else is shared scaffold evidence.
    for (const shared of [
      'site.spec.js',
      'smoke.spec.js',
      '/repo/tests/unit/main.test.js',
      '/repo/tests/unit/evidence.test.js',
      '/repo/tests/unit/api/schema.test.js',
      '/repo/tests/unit/site/gallery.test.js',
      'tests/unit/not-a-renderer/foo.test.js'
    ]) {
      expect(moduleForFile(shared, MODULES)).toBe(null);
    }
  });

  it('normalizeVitest maps assertion results to unit-suite records (#5)', () => {
    const records = normalizeVitest(VITEST_FIXTURE);
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      suite: 'unit',
      status: 'pass',
      requirementIds: ['SH-DATA-002'],
      issueRefs: [2],
      file: '/repo/tests/unit/histogram/structureData.test.js'
    });
    expect(records[1].status).toBe('fail');
    expect(records[1].requirementIds).toEqual(['SH-CTRL-006']);
  });

  it('normalizePlaywright walks nested suites into browser-suite records (#5)', () => {
    const records = normalizePlaywright(PLAYWRIGHT_FIXTURE);
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      suite: 'browser',
      status: 'pass',
      requirementIds: ['SH-CTRL-004', 'SH-FUNC-004A', 'SH-FUNC-004B'],
      file: 'histogram.spec.js'
    });
    expect(records[1]).toMatchObject({ suite: 'browser', status: 'fail' });
    expect(records[2]).toMatchObject({ file: 'shift-plot.spec.js' });
  });

  it('buildRun builds GitHub Actions run provenance from the environment (#20)', () => {
    expect(buildRun({})).toBe(null);
    expect(
      buildRun({
        GITHUB_RUN_ID: '123',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'jwildfire/safety.viz'
      })
    ).toEqual({ id: '123', url: 'https://github.com/jwildfire/safety.viz/actions/runs/123' });
  });

  it('buildEvidenceSets splits records per module and duplicates shared scaffold records (#20)', () => {
    const sets = buildEvidenceSets({
      modules: MODULES,
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      screenshotsByModule: {
        histogram: ['SH-CTRL-004-normal-range-overlay.png'],
        'shift-plot': ['SSP-CHART-001-scatter.png']
      },
      provenance: PROVENANCE
    });

    // Only modules with module-routed records get an evidence set.
    expect(Object.keys(sets).sort()).toEqual(['histogram', 'shift-plot']);

    // histogram: 2 unit + 2 browser of its own, plus the 2 shared scaffold
    // records (main.test.js, smoke.spec.js).
    expect(sets.histogram.module).toBe('histogram');
    expect(sets.histogram.records).toHaveLength(6);
    // shift-plot: 1 unit + 1 browser of its own, plus the same 2 shared records.
    expect(sets['shift-plot'].records).toHaveLength(4);
    const sharedTest = 'demo page loads with no console errors (#1)';
    expect(sets.histogram.records.some((r) => r.test === sharedTest)).toBe(true);
    expect(sets['shift-plot'].records.some((r) => r.test === sharedTest)).toBe(true);
    // Module records never leak across sets.
    expect(sets['shift-plot'].records.some((r) => r.requirementIds.includes('SH-DATA-002'))).toBe(
      false
    );

    // Screenshots attach per module, by requirement-ID prefix.
    const overlay = sets.histogram.records.find((r) => r.requirementIds.includes('SH-CTRL-004'));
    expect(overlay.screenshots).toEqual(['SH-CTRL-004-normal-range-overlay.png']);
    const scatter = sets['shift-plot'].records.find((r) =>
      r.requirementIds.includes('SSP-CHART-001')
    );
    expect(scatter.screenshots).toEqual(['SSP-CHART-001-scatter.png']);

    // Records are the committed contract: sorted, file-free, screenshot-ready.
    for (const set of Object.values(sets)) {
      for (const rec of set.records) {
        expect(rec).not.toHaveProperty('file');
        expect(rec).toHaveProperty('screenshots');
      }
    }

    // Deterministic given the same inputs.
    const again = buildEvidenceSets({
      modules: MODULES,
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      screenshotsByModule: { histogram: ['SH-CTRL-004-normal-range-overlay.png'] },
      provenance: PROVENANCE
    });
    expect(again.histogram.records.map((r) => r.test)).toEqual(
      sets.histogram.records.map((r) => r.test)
    );
  });

  it('provenance lives in dedicated top-level keys; the records array stays timestamp-free (#20)', () => {
    const sets = buildEvidenceSets({
      modules: MODULES,
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      provenance: PROVENANCE
    });
    expect(sets.histogram.generatedAt).toBe('2026-07-11T12:00:00.000Z');
    expect(sets.histogram.environment).toEqual(PROVENANCE.environment);
    expect(sets.histogram.run).toEqual(PROVENANCE.run);
    // The records array remains a pure function of the test run.
    expect(JSON.stringify(sets.histogram.records)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('compareEvidence flags status drift and test-set changes, ignoring screenshots (#5)', () => {
    const build = (screenshotsByModule) =>
      buildEvidenceSets({
        modules: MODULES,
        vitest: VITEST_FIXTURE,
        playwright: PLAYWRIGHT_FIXTURE,
        screenshotsByModule,
        provenance: PROVENANCE
      }).histogram;
    const committed = build({ histogram: ['SH-CTRL-004-normal-range-overlay.png'] });
    const same = build({});
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

  it('compareEvidence ignores provenance so --check never drifts on generatedAt/environment/run (#20)', () => {
    const sets = buildEvidenceSets({
      modules: MODULES,
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      provenance: PROVENANCE
    });
    const fresh = buildEvidenceSets({
      modules: MODULES,
      vitest: VITEST_FIXTURE,
      playwright: PLAYWRIGHT_FIXTURE,
      provenance: {
        generatedAt: '2026-08-01T00:00:00.000Z',
        environment: {
          os: 'darwin 23.6.0',
          node: 'v24.0.0',
          playwright: '1.62.0',
          chromium: '150.0.0.0'
        },
        run: null
      }
    });
    expect(compareEvidence(sets.histogram, fresh.histogram).stale).toBe(false);
  });
});

// The check hands the guard the results of the suites it has already run
// (#291), so each suite runs once. In one job the test steps' exit codes caught
// a run that was not clean; handed files, the guard has to refuse one itself.

const CLEAN_VITEST = {
  numTotalTestSuites: 2,
  numFailedTestSuites: 0,
  numTotalTests: 1,
  numFailedTests: 0,
  success: true,
  testResults: [
    {
      name: '/repo/tests/unit/histogram/structureData.test.js',
      status: 'passed',
      assertionResults: [
        {
          fullName: 'histogram structureData > SH-DATA-002: a handed unit result (#291)',
          status: 'passed'
        }
      ]
    }
  ]
};

const CLEAN_PLAYWRIGHT = {
  config: {},
  suites: [
    {
      title: 'histogram.spec.js',
      file: 'histogram.spec.js',
      specs: [
        {
          title: 'SH-CTRL-004: a handed browser result (#291)',
          file: 'histogram.spec.js',
          tests: [{ status: 'expected', results: [{ status: 'passed' }] }]
        }
      ]
    }
  ],
  errors: [],
  stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('evidence guard on handed results', () => {
  it('resultsArgs returns both paths under --check, and neither when no flag is given (#291)', () => {
    expect(resultsArgs(['--check'], 'check')).toEqual({ vitest: null, playwright: null });
    expect(resultsArgs([], 'run')).toEqual({ vitest: null, playwright: null });
    expect(resultsArgs(['--update'], 'update')).toEqual({ vitest: null, playwright: null });
    expect(
      resultsArgs(
        [
          '--check',
          '--vitest-json=results/vitest.json',
          '--playwright-json=results/playwright.json'
        ],
        'check'
      )
    ).toEqual({ vitest: 'results/vitest.json', playwright: 'results/playwright.json' });
  });

  it('resultsArgs refuses one results flag without the other (#291)', () => {
    expect(() => resultsArgs(['--check', '--vitest-json=results/vitest.json'], 'check')).toThrow(
      /--playwright-json/
    );
    expect(() =>
      resultsArgs(['--check', '--playwright-json=results/playwright.json'], 'check')
    ).toThrow(/--vitest-json/);
  });

  it('resultsArgs refuses the results flags outside --check (#291)', () => {
    const both = ['--vitest-json=results/vitest.json', '--playwright-json=results/playwright.json'];
    expect(() => resultsArgs(both, 'run')).toThrow(/only with --check/);
    expect(() => resultsArgs(['--update', ...both], 'update')).toThrow(/only with --check/);
    expect(() => resultsArgs(['--vitest-json=results/vitest.json'], 'run')).toThrow(
      /only with --check/
    );
  });

  it('resultsArgs refuses a results flag with no file, or given twice (#291)', () => {
    expect(() =>
      resultsArgs(
        ['--check', '--vitest-json', '--playwright-json=results/playwright.json'],
        'check'
      )
    ).toThrow(/--vitest-json=<file>/);
    expect(() =>
      resultsArgs(
        ['--check', '--vitest-json=', '--playwright-json=results/playwright.json'],
        'check'
      )
    ).toThrow(/--vitest-json=<file>/);
    expect(() =>
      resultsArgs(
        [
          '--check',
          '--vitest-json=a',
          '--vitest-json=b',
          '--playwright-json=results/playwright.json'
        ],
        'check'
      )
    ).toThrow(/more than once/);
  });

  it('parseResults refuses a missing, empty or cut-off file and names it (#291)', () => {
    expect(() => parseResults('vitest', 'results/vitest.json', null)).toThrow(
      /results\/vitest\.json.*missing/
    );
    expect(() => parseResults('vitest', 'results/vitest.json', '')).toThrow(
      /results\/vitest\.json.*empty/
    );
    expect(() => parseResults('playwright', 'results/playwright.json', '  \n')).toThrow(
      /results\/playwright\.json.*empty/
    );
    const cutOff = JSON.stringify(CLEAN_PLAYWRIGHT).slice(0, 40);
    expect(() => parseResults('playwright', 'results/playwright.json', cutOff)).toThrow(
      /results\/playwright\.json.*not JSON/
    );
  });

  it("parseResults refuses JSON that is not the reporter's and names the file (#291)", () => {
    expect(() => parseResults('vitest', 'results/vitest.json', '{}')).toThrow(
      /results\/vitest\.json.*not vitest's JSON report/
    );
    expect(() => parseResults('vitest', 'results/vitest.json', '[]')).toThrow(
      /not vitest's JSON report/
    );
    expect(() =>
      parseResults('vitest', 'results/vitest.json', JSON.stringify(CLEAN_PLAYWRIGHT))
    ).toThrow(/not vitest's JSON report/);
    expect(() => parseResults('playwright', 'results/playwright.json', '{"suites": []}')).toThrow(
      /results\/playwright\.json.*not Playwright's JSON report/
    );
    expect(() =>
      parseResults('playwright', 'results/playwright.json', JSON.stringify(CLEAN_VITEST))
    ).toThrow(/not Playwright's JSON report/);
    expect(parseResults('vitest', 'results/vitest.json', JSON.stringify(CLEAN_VITEST))).toEqual(
      CLEAN_VITEST
    );
    expect(
      parseResults('playwright', 'results/playwright.json', JSON.stringify(CLEAN_PLAYWRIGHT))
    ).toEqual(CLEAN_PLAYWRIGHT);
  });

  it('handedResultsProblems finds nothing wrong with a clean run (#291)', () => {
    expect(handedResultsProblems({ vitest: CLEAN_VITEST, playwright: CLEAN_PLAYWRIGHT })).toEqual(
      []
    );
  });

  it('handedResultsProblems refuses unit results whose success is not true (#291)', () => {
    for (const success of [false, undefined, 'true', 1]) {
      const vitest = { ...clone(CLEAN_VITEST), success };
      const problems = handedResultsProblems({ vitest, playwright: CLEAN_PLAYWRIGHT });
      expect(problems.join('\n')).toMatch(/unit results.*success/);
    }
  });

  it('handedResultsProblems refuses unit results with a test file that failed to load (#291)', () => {
    // What vitest writes when a test file throws on import: the file is a
    // failed suite with no assertions, so no record of it reaches the comparison.
    const vitest = clone(CLEAN_VITEST);
    vitest.numFailedTestSuites = 1;
    vitest.testResults.push({
      name: '/repo/tests/unit/shift-plot/broken.test.js',
      status: 'failed',
      message: 'SyntaxError: Unexpected token',
      assertionResults: []
    });
    const problems = handedResultsProblems({ vitest, playwright: CLEAN_PLAYWRIGHT });
    expect(problems.join('\n')).toMatch(
      /unit results.*1 failed suite.*shift-plot\/broken\.test\.js: SyntaxError: Unexpected token/
    );
  });

  it('handedResultsProblems refuses browser results that carry errors (#291)', () => {
    const playwright = clone(CLEAN_PLAYWRIGHT);
    playwright.errors.push({ message: 'Error: worker process exited unexpectedly' });
    const problems = handedResultsProblems({ vitest: CLEAN_VITEST, playwright });
    expect(problems.join('\n')).toMatch(/browser results.*1 error.*worker process exited/);
  });

  it('handedResultsProblems refuses browser results with an unexpected result (#291)', () => {
    const playwright = clone(CLEAN_PLAYWRIGHT);
    playwright.stats.unexpected = 2;
    const problems = handedResultsProblems({ vitest: CLEAN_VITEST, playwright });
    expect(problems.join('\n')).toMatch(/browser results.*2 unexpected/);
  });

  it('handedResultsProblems refuses a browser test that failed and then passed on a retry (#291)', () => {
    // The comparison reads a test's last result, so a retry that passed reads
    // as a pass. Playwright counts it as flaky, and the guard refuses the run.
    const playwright = clone(CLEAN_PLAYWRIGHT);
    playwright.suites[0].specs[0].tests[0] = {
      status: 'flaky',
      results: [{ status: 'failed' }, { status: 'passed' }]
    };
    playwright.stats = { expected: 0, skipped: 0, unexpected: 0, flaky: 1 };
    const sets = buildEvidenceSets({ modules: MODULES, vitest: CLEAN_VITEST, playwright });
    expect(sets.histogram.records.every((r) => r.status === 'pass')).toBe(true);
    const problems = handedResultsProblems({ vitest: CLEAN_VITEST, playwright });
    expect(problems.join('\n')).toMatch(/browser results.*1 flaky/);
  });

  it('handedResultsProblems refuses a test name that appears twice in the results (#291)', () => {
    // Two records with one name collapse to one in the comparison, so the
    // second result, pass or fail, would go unread.
    const playwright = clone(CLEAN_PLAYWRIGHT);
    playwright.suites.push(clone(playwright.suites[0]));
    const twiceInBrowser = handedResultsProblems({ vitest: CLEAN_VITEST, playwright });
    expect(twiceInBrowser.join('\n')).toMatch(
      /appears 2 times.*browser.*SH-CTRL-004: a handed browser result/
    );

    const vitest = clone(CLEAN_VITEST);
    vitest.testResults.push({
      ...clone(vitest.testResults[0]),
      name: '/repo/tests/unit/main.test.js'
    });
    const twiceInUnit = handedResultsProblems({ vitest, playwright: CLEAN_PLAYWRIGHT });
    expect(twiceInUnit.join('\n')).toMatch(/appears 2 times.*unit.*SH-DATA-002/);
  });
});

// The command itself, started as the check starts it. PATH is emptied so that
// a guard which went on to run a suite would fail at once, without starting
// vitest from inside vitest.
describe('evidence.mjs --check with handed results', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = mkdtempSync(path.join(tmpdir(), 'evidence-handed-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const file = (name, content) => {
    const target = path.join(dir, name);
    writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
    return target;
  };
  const guard = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/evidence.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
      timeout: 60_000
    });
    return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
  };
  const cleanVitest = file('vitest.json', CLEAN_VITEST);
  const cleanPlaywright = file('playwright.json', CLEAN_PLAYWRIGHT);

  it('refuses one flag without the other, and either flag outside --check, and runs no suite (#291)', () => {
    for (const args of [
      ['--check', `--vitest-json=${cleanVitest}`],
      ['--check', `--playwright-json=${cleanPlaywright}`],
      [`--vitest-json=${cleanVitest}`, `--playwright-json=${cleanPlaywright}`],
      ['--update', `--vitest-json=${cleanVitest}`, `--playwright-json=${cleanPlaywright}`]
    ]) {
      const { status, out } = guard(...args);
      expect(status).toBe(1);
      expect(out).toMatch(/--vitest-json|--playwright-json/);
      expect(out).not.toMatch(/json reporter/);
    }
  });

  it('exits with an error that names a handed file that is missing, empty or not the reporter\u2019s JSON (#291)', () => {
    const missing = path.join(dir, 'never-written.json');
    const cases = [
      [missing, cleanPlaywright, /never-written\.json.*missing/],
      [cleanVitest, missing, /never-written\.json.*missing/],
      [file('empty.json', ''), cleanPlaywright, /empty\.json.*empty/],
      [
        cleanVitest,
        file('cut-off.json', '{"suites": [{"title": "histo'),
        /cut-off\.json.*not JSON/
      ],
      [file('other.json', { hello: 'world' }), cleanPlaywright, /other\.json.*not vitest's/],
      [cleanVitest, file('other-pw.json', CLEAN_VITEST), /other-pw\.json.*not Playwright's/]
    ];
    for (const [vitest, playwright, message] of cases) {
      const { status, out } = guard(
        '--check',
        `--vitest-json=${vitest}`,
        `--playwright-json=${playwright}`
      );
      expect(status).toBe(1);
      expect(out).toMatch(message);
      expect(out).not.toMatch(/records match/);
    }
  });

  it('exits with an error on handed results that are not a clean run (#291)', () => {
    const failedToLoad = file('failed-to-load.json', {
      ...CLEAN_VITEST,
      success: false,
      numFailedTestSuites: 1
    });
    const flaky = file('flaky.json', {
      ...CLEAN_PLAYWRIGHT,
      errors: [{ message: 'Error: browser closed' }],
      stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 1 }
    });
    const unit = guard(
      '--check',
      `--vitest-json=${failedToLoad}`,
      `--playwright-json=${cleanPlaywright}`
    );
    expect(unit.status).toBe(1);
    expect(unit.out).toMatch(/failed-to-load\.json.*not a clean run/);
    expect(unit.out).toMatch(/success/);
    expect(unit.out).toMatch(/1 failed suite/);

    const browser = guard('--check', `--vitest-json=${cleanVitest}`, `--playwright-json=${flaky}`);
    expect(browser.status).toBe(1);
    expect(browser.out).toMatch(/flaky\.json.*not a clean run/);
    expect(browser.out).toMatch(/1 error/);
    expect(browser.out).toMatch(/1 flaky/);
  });

  it('exits with an error naming each test that is absent from clean handed results (#291)', () => {
    // A clean run of two tests, where the committed evidence holds every test
    // of the repository: each one absent from the results is named.
    const { status, out } = guard(
      '--check',
      `--vitest-json=${cleanVitest}`,
      `--playwright-json=${cleanPlaywright}`
    );
    expect(status).toBe(1);
    expect(out).not.toMatch(/json reporter/);
    expect(out).toMatch(/docs\/evidence\/histogram\/evidence\.json is stale/);
    expect(out).toMatch(/missing in fresh run: unit\|/);
    expect(out).toMatch(/missing in fresh run: browser\|/);
    expect(out).toMatch(
      /new test not in committed evidence: unit\|histogram structureData > SH-DATA-002: a handed unit result/
    );
    expect(out).toMatch(
      /docs\/evidence\/shift-plot\/evidence\.json is committed but the fresh run produced no records/
    );
  });
});
