import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

// The required check is split across jobs (#292), and a ruleset can only
// require one of them: the gate, which carries the check's name. GitHub counts
// a required job that was skipped as passed, so a gate that does not always
// run, or that leaves a job out of what it waits for, reports green without
// every test having run and passed. These tests read the workflow file and
// fail unless the gate has the shape that makes it safe to require
// (CONTRIBUTING.md, "How the check is laid out").

const read = (file) =>
  parse(readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8'));

const GATE_NAME = 'Build, format, and test';
const RESULTS_EXPRESSION = "${{ join(needs.*.result, ',') }}";

// The commands the check rests on, each the whole of one step of its job
// (#316). A step that is removed, reworded, narrowed or made unable to fail no
// longer matches. Adding a check adds a line here.
const E2E = 'npm run test:e2e -- --project=chromium';
const REQUIRED = {
  static: [
    'npm ci',
    'npm run format:check',
    'npm run build',
    'npm run build:check-dist',
    'npm run bio-viz:check-source',
    'npm run statistics:check-source',
    'npm run r-wasm:check-source',
    'npm run gsm-workflows:check-source',
    'npm run gsm-viz:check-source',
    'npm run rbqm-study:check-source',
    'npm test -- --reporter=default --reporter=json --outputFile="$RUNNER_TEMP/vitest.json"',
    'npm run site',
    'npm run requirements:check'
  ],
  browser: [
    'npm ci',
    'npm run build',
    'npx playwright install --with-deps chromium',
    `${E2E} --grep-invert "$REAL_R_TAG" --reporter=list,blob`
  ],
  'browser-real-r': [
    'npm ci',
    'npm run build',
    'npx playwright install --with-deps chromium',
    `${E2E} --grep "$REAL_R_TAG" --reporter=list,blob`
  ],
  gate: [
    'npm ci',
    'npx playwright merge-reports --reporter=json,html "$RUNNER_TEMP/blob-reports"',
    'npm run evidence:check -- --vitest-json="$RUNNER_TEMP/results/vitest.json" --playwright-json="$RUNNER_TEMP/results/playwright.json"'
  ]
};
// In the gate, these two also run after a failure, so that a failed browser
// test still gets its merged report. No other command may carry a condition.
const MAY_RUN_AFTER_A_FAILURE = [REQUIRED.gate[0], REQUIRED.gate[1]];
const AFTER_A_FAILURE = '${{ !cancelled() }}';
const CANNOT_FAIL = /\|\|\s*(true|:|exit 0)|;\s*true\s*$|set \+e/;

const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const steps = (workflow) =>
  Object.entries(workflow.jobs || {}).flatMap(([job, body]) =>
    (body.steps || []).map((step) => ({ job, ...step }))
  );
const usesAction = (step, action) => String(step.uses || '').startsWith(`actions/${action}@`);
const keysAtAnyDepth = (value, found = []) => {
  if (Array.isArray(value)) value.forEach((item) => keysAtAnyDepth(item, found));
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      keysAtAnyDepth(child, found);
    }
  }
  return found;
};

// Everything about a parsed workflow that would let the required check report
// success without every test having run and passed. Empty for a safe one.
function problems(workflow) {
  const found = [];
  const jobs = workflow.jobs || {};
  const gates = Object.entries(jobs).filter(([, job]) => job.name === GATE_NAME);
  if (gates.length !== 1) {
    found.push(`${gates.length} jobs are named "${GATE_NAME}"; exactly one must be.`);
    return found;
  }
  const [gateId, gate] = gates[0];
  const others = Object.keys(jobs).filter((id) => id !== gateId);

  if (gate.if !== 'always()' && gate.if !== '${{ always() }}') {
    found.push(
      `the gate's "if" is ${JSON.stringify(gate.if)}, not always(): a gate that is skipped counts as passed.`
    );
  }
  if (gate.strategy !== undefined) {
    found.push(
      'the gate has a strategy: a matrix reports under other names than the required one.'
    );
  }
  const needs = asList(gate.needs);
  const missing = others.filter((id) => !needs.includes(id));
  if (missing.length) {
    found.push(`the gate does not need ${missing.join(', ')}: it would not wait for or check it.`);
  }
  const first = (gate.steps || [])[0] || {};
  if (first.env?.RESULTS !== RESULTS_EXPRESSION || first.if !== undefined || !first.run) {
    found.push(
      `the gate's first step must be the result check, reading RESULTS: ${RESULTS_EXPRESSION}, with no "if".`
    );
  }

  const triggers = Object.keys(workflow.on || {}).sort();
  if (triggers.join(',') !== 'pull_request,push') {
    found.push(
      `the workflow runs on ${triggers.join(', ')}; it must run on pull_request and push only.`
    );
  }
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) {
    found.push(
      `the workflow's permissions are ${JSON.stringify(workflow.permissions)}, not contents: read.`
    );
  }
  for (const [id, job] of Object.entries(jobs)) {
    if (job.permissions !== undefined) found.push(`job ${id} sets its own permissions.`);
    if (!Number.isInteger(job['timeout-minutes'])) found.push(`job ${id} has no timeout-minutes.`);
    if (job['runs-on'] !== 'ubuntu-24.04') {
      found.push(`job ${id} runs on ${JSON.stringify(job['runs-on'])}, not ubuntu-24.04.`);
    }
  }
  if (keysAtAnyDepth(workflow).includes('continue-on-error')) {
    found.push(
      'continue-on-error appears in the workflow: a failed step or job must fail the check.'
    );
  }

  // One variable holds the tag; one browser job runs the tests that carry it
  // and one the rest, so every browser test runs in exactly one job.
  if (workflow.env?.REAL_R_TAG !== '@real-r') {
    found.push(
      `the workflow's REAL_R_TAG is ${JSON.stringify(workflow.env?.REAL_R_TAG)}, not '@real-r'.`
    );
  }
  const browserRuns = steps(workflow)
    .filter((step) => /playwright test|test:e2e/.test(step.run || ''))
    .map((step) => step.run.trim());
  const withTag = browserRuns.filter((run) => /(^| )--grep "\$REAL_R_TAG"( |$)/.test(run));
  const withoutTag = browserRuns.filter((run) =>
    /(^| )--grep-invert "\$REAL_R_TAG"( |$)/.test(run)
  );
  if (browserRuns.length !== 2 || withTag.length !== 1 || withoutTag.length !== 1) {
    found.push(
      'the browser tests must run in two steps, one with --grep "$REAL_R_TAG" and one with --grep-invert "$REAL_R_TAG".'
    );
  }
  if (browserRuns.some((run) => (run.match(/--grep(-invert)?[ =]/g) || []).length !== 1)) {
    found.push('a browser step filters its tests by more than the one tag.');
  }

  // Every command the check rests on is there, whole, and can fail (#316).
  for (const [id, commands] of Object.entries(REQUIRED)) {
    const runs = (jobs[id]?.steps || []).map((step) => String(step.run || '').trim());
    for (const command of commands) {
      if (runs.filter((run) => run === command).length !== 1) {
        found.push(`job ${id} no longer runs \`${command}\` as the whole of one step.`);
      }
    }
  }
  for (const step of steps(workflow)) {
    const said = `the step "${step.name}" in ${step.job}`;
    if (CANNOT_FAIL.test(step.run || '')) found.push(`${said} is written so that it cannot fail.`);
    if ('REAL_R_TAG' in (step.env || {})) {
      found.push(`REAL_R_TAG is set again in the step "${step.name}" of ${step.job}.`);
    }
    if (step.if === undefined) continue;
    const allowed =
      step.if === AFTER_A_FAILURE &&
      (step.uses !== undefined ||
        (step.job === gateId && MAY_RUN_AFTER_A_FAILURE.includes(String(step.run).trim())));
    if (!allowed) {
      found.push(`${said} has a condition, ${JSON.stringify(step.if)}: it could be skipped.`);
    }
  }
  for (const [id, job] of Object.entries(jobs)) {
    if (id !== gateId && job.if !== undefined) {
      found.push(`job ${id} has a condition, ${JSON.stringify(job.if)}: it could be skipped.`);
    }
    if ('REAL_R_TAG' in (job.env || {})) found.push(`REAL_R_TAG is set again in job ${id}.`);
  }
  if (keysAtAnyDepth(workflow).some((key) => key === 'shell' || key === 'defaults')) {
    found.push('a shell or defaults setting appears in the workflow: each step runs as written.');
  }

  // Artifacts: fixed, distinct names; an error when a file is missing; taken
  // from this run's own jobs, and never unpacked into the checkout.
  const uploads = steps(workflow).filter((step) => usesAction(step, 'upload-artifact'));
  const names = uploads.map((step) => step.with?.name);
  for (const step of uploads) {
    const name = step.with?.name;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) {
      found.push(`an upload in ${step.job} has no fixed name (${JSON.stringify(name)}).`);
    }
    if (step.with?.['if-no-files-found'] !== 'error') {
      found.push(`the upload of ${name} does not fail when it finds no file.`);
    }
  }
  if (new Set(names).size !== names.length) found.push('two uploads share an artifact name.');
  for (const step of steps(workflow).filter((s) => usesAction(s, 'download-artifact'))) {
    const settings = step.with || {};
    if (step.job !== gateId)
      found.push(`job ${step.job} downloads an artifact; only the gate may.`);
    if (!names.includes(settings.name)) {
      found.push(
        `a download names ${JSON.stringify(settings.name)}, which no job of this workflow uploads.`
      );
    }
    if (!String(settings.path || '').startsWith('${{ runner.temp }}/')) {
      found.push(`the download of ${settings.name} is not into the runner's temporary directory.`);
    }
    for (const key of ['run-id', 'repository', 'github-token', 'pattern']) {
      if (key in settings) found.push(`the download of ${settings.name} sets ${key}.`);
    }
  }
  return found;
}

describe('the required check’s workflow', () => {
  const workflow = read('ci.yml');
  const gateId = Object.keys(workflow.jobs).find((id) => workflow.jobs[id].name === GATE_NAME);

  it('ci.yml has the shape that makes its gate safe to require: one job named "Build, format, and test" that always runs, has no matrix, needs every other job and checks their results first; triggers pull_request and push only; permissions contents: read (#292)', () => {
    expect(problems(workflow)).toEqual([]);
    // Said outright, beside the list above: the four jobs and the gate's name.
    expect(Object.keys(workflow.jobs).sort()).toEqual([
      'browser',
      'browser-real-r',
      'gate',
      'static'
    ]);
    expect(gateId).toBe('gate');
    expect(workflow.jobs.gate.needs).toEqual(['static', 'browser', 'browser-real-r']);
  });

  it('the gate’s result check passes only when every job before it ended in success: failure, cancelled, skipped and no result at all each fail it (#292)', () => {
    const script = workflow.jobs[gateId].steps[0].run;
    const check = (results) =>
      spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, RESULTS: results, NEEDS: '{}' }
      }).status;
    expect(check('success,success,success')).toBe(0);
    for (const bad of ['failure', 'cancelled', 'skipped', '', 'neutral', 'success success']) {
      const said = bad || 'with no result';
      expect(check(`${bad},success,success`), `the first job ${said}`).not.toBe(0);
      expect(check(`success,${bad},success`), `the middle job ${said}`).not.toBe(0);
      expect(check(`success,success,${bad}`), `the last job ${said}`).not.toBe(0);
    }
    expect(check(''), 'no results at all').not.toBe(0);
  });

  // The checker above is only worth having if it bites: each change below is
  // one way to make the check report green wrongly, made to a copy of the real
  // file, and each must be reported.
  const broken = [
    ['the gate’s "if" is removed', (w) => delete w.jobs.gate.if, /not always\(\)/],
    ['the gate runs only on success', (w) => (w.jobs.gate.if = 'success()'), /not always\(\)/],
    [
      'the gate is given a matrix',
      (w) => (w.jobs.gate.strategy = { matrix: { part: [1, 2] } }),
      /has a strategy/
    ],
    [
      'a job is left out of the gate’s needs',
      (w) => (w.jobs.gate.needs = ['static', 'browser']),
      /does not need browser-real-r/
    ],
    [
      'a job is added that the gate does not need',
      (w) => (w.jobs.extra = { ...w.jobs.static, name: 'Extra' }),
      /does not need extra/
    ],
    [
      'a second job takes the gate’s name',
      (w) => (w.jobs.static.name = GATE_NAME),
      /2 jobs are named/
    ],
    ['the gate is renamed', (w) => (w.jobs.gate.name = 'Gate'), /0 jobs are named/],
    [
      'the result check is no longer the gate’s first step',
      (w) => w.jobs.gate.steps.push(w.jobs.gate.steps.shift()),
      /first step must be the result check/
    ],
    [
      'the result check is given a condition',
      (w) => (w.jobs.gate.steps[0].if = "github.event_name == 'push'"),
      /first step must be the result check/
    ],
    [
      'the result check reads one job’s result only',
      (w) => (w.jobs.gate.steps[0].env.RESULTS = '${{ needs.static.result }}'),
      /first step must be the result check/
    ],
    [
      'the workflow also runs on pull_request_target',
      (w) => (w.on.pull_request_target = {}),
      /pull_request and push only/
    ],
    [
      'the workflow also runs on workflow_run',
      (w) => (w.on.workflow_run = {}),
      /pull_request and push only/
    ],
    ['the token can write', (w) => (w.permissions = { contents: 'write' }), /not contents: read/],
    [
      'a job gives itself permissions',
      (w) => (w.jobs.browser.permissions = { contents: 'write' }),
      /job browser sets its own permissions/
    ],
    [
      'a step continues on error',
      (w) => (w.jobs.browser.steps.at(-2)['continue-on-error'] = true),
      /continue-on-error/
    ],
    [
      'a job continues on error',
      (w) => (w.jobs.static['continue-on-error'] = true),
      /continue-on-error/
    ],
    [
      'a job loses its timeout',
      (w) => delete w.jobs.browser['timeout-minutes'],
      /job browser has no timeout/
    ],
    [
      'a job goes back to ubuntu-latest',
      (w) => (w.jobs.browser['runs-on'] = 'ubuntu-latest'),
      /job browser runs on "ubuntu-latest"/
    ],
    [
      'one browser job is given its own pattern',
      (w) => {
        const step = w.jobs.browser.steps.find((s) => /--grep-invert/.test(s.run || ''));
        step.run = step.run.replace('"$REAL_R_TAG"', '"@real-r|SH-CTRL-004"');
      },
      /two steps, one with --grep/
    ],
    [
      'both browser jobs run the tagged tests',
      (w) => {
        const step = w.jobs.browser.steps.find((s) => /--grep-invert/.test(s.run || ''));
        step.run = step.run.replace('--grep-invert', '--grep');
      },
      /two steps, one with --grep/
    ],
    ['the tag’s variable is changed', (w) => (w.env.REAL_R_TAG = '@real'), /REAL_R_TAG is "@real"/],
    [
      'an upload tolerates a missing file',
      (w) => {
        const step = w.jobs.static.steps.find((s) => usesAction(s, 'upload-artifact'));
        step.with['if-no-files-found'] = 'warn';
      },
      /does not fail when it finds no file/
    ],
    [
      'two uploads share a name',
      (w) => {
        const step = w.jobs.browser.steps.find((s) => usesAction(s, 'upload-artifact'));
        step.with.name = 'unit-results';
      },
      /two uploads share an artifact name/
    ],
    [
      'an upload’s name is computed',
      (w) => {
        const step = w.jobs.browser.steps.find((s) => usesAction(s, 'upload-artifact'));
        step.with.name = 'browser-report-${{ github.run_attempt }}';
      },
      /has no fixed name/
    ],
    [
      'a download unpacks into the checkout',
      (w) => {
        const step = w.jobs.gate.steps.find((s) => usesAction(s, 'download-artifact'));
        step.with.path = 'results';
      },
      /not into the runner's temporary directory/
    ],
    [
      'a download names another run',
      (w) => {
        const step = w.jobs.gate.steps.find((s) => usesAction(s, 'download-artifact'));
        step.with['run-id'] = '123';
        step.with['github-token'] = '${{ github.token }}';
      },
      /sets run-id/
    ],
    [
      'a download names another repository',
      (w) => {
        const step = w.jobs.gate.steps.find((s) => usesAction(s, 'download-artifact'));
        step.with.repository = 'someone/else';
      },
      /sets repository/
    ],
    // Found by the review of the v1.11.0 release candidate (#316): the checker
    // passed each of these.
    [
      'the evidence guard is removed from the gate',
      (w) =>
        (w.jobs.gate.steps = w.jobs.gate.steps.filter((s) => !/evidence:check/.test(s.run || ''))),
      /job gate no longer runs `npm run evidence:check/
    ],
    [
      'the evidence guard is switched off',
      (w) =>
        (w.jobs.gate.steps.find((s) => /evidence:check/.test(s.run || '')).if = '${{ false }}'),
      /"Evidence freshness guard" in gate has a condition/
    ],
    [
      'the evidence guard cannot fail',
      (w) => (w.jobs.gate.steps.find((s) => /evidence:check/.test(s.run || '')).run += ' || true'),
      /job gate no longer runs `npm run evidence:check/
    ],
    [
      'the evidence guard is handed other files',
      (w) => {
        const step = w.jobs.gate.steps.find((s) => /evidence:check/.test(s.run || ''));
        step.run = step.run.replace('results/playwright.json', 'results/other.json');
      },
      /job gate no longer runs `npm run evidence:check/
    ],
    [
      'the real-R job runs one file only',
      (w) =>
        (w.jobs['browser-real-r'].steps.find((s) => /test:e2e/.test(s.run || '')).run +=
          ' tests/e2e/site.spec.js'),
      /job browser-real-r no longer runs `npm run test:e2e/
    ],
    [
      'a browser job runs half its tests',
      (w) => (w.jobs.browser.steps.find((s) => /test:e2e/.test(s.run || '')).run += ' --shard=1/2'),
      /job browser no longer runs `npm run test:e2e/
    ],
    [
      'a browser job runs another project',
      (w) => {
        const step = w.jobs.browser.steps.find((s) => /test:e2e/.test(s.run || ''));
        step.run = step.run.replace('--project=chromium', '--project=none');
      },
      /job browser no longer runs `npm run test:e2e/
    ],
    [
      'a browser job’s tests cannot fail',
      (w) => (w.jobs.browser.steps.find((s) => /test:e2e/.test(s.run || '')).run += ' || true'),
      /"Run browser tests" in browser is written so that it cannot fail/
    ],
    [
      'a browser job’s tests are switched off',
      (w) => (w.jobs.browser.steps.find((s) => /test:e2e/.test(s.run || '')).if = 'false'),
      /"Run browser tests" in browser has a condition/
    ],
    [
      'a job sets the tag again',
      (w) => (w.jobs.browser.env = { REAL_R_TAG: '@real-r|APP-R-032' }),
      /REAL_R_TAG is set again in job browser/
    ],
    [
      'a step sets the tag again',
      (w) =>
        (w.jobs.browser.steps.find((s) => /test:e2e/.test(s.run || '')).env.REAL_R_TAG = '@none'),
      /REAL_R_TAG is set again in the step "Run browser tests" of browser/
    ],
    [
      'the format check is removed',
      (w) =>
        (w.jobs.static.steps = w.jobs.static.steps.filter((s) => s.run !== 'npm run format:check')),
      /job static no longer runs `npm run format:check`/
    ],
    [
      'the format check cannot fail',
      (w) => (w.jobs.static.steps.find((s) => s.run === 'npm run format:check').run += ' || true'),
      /"Check formatting" in static is written so that it cannot fail/
    ],
    [
      'the unit tests are removed',
      (w) =>
        (w.jobs.static.steps = w.jobs.static.steps.filter((s) => !/^npm test/.test(s.run || ''))),
      /job static no longer runs `npm test/
    ],
    [
      'the unit tests are given a condition',
      (w) =>
        (w.jobs.static.steps.find((s) => /^npm test/.test(s.run || '')).if =
          "github.event_name == 'push'"),
      /"Run unit tests" in static has a condition/
    ],
    [
      'the result check runs under another shell',
      (w) => (w.jobs.gate.steps[0].shell = 'bash --noprofile --norc {0}'),
      /shell or defaults/
    ],
    [
      'a job other than the gate is given a condition',
      (w) => (w.jobs['browser-real-r'].if = "github.event_name == 'push'"),
      /job browser-real-r has a condition/
    ]
  ];

  // The name carries no count: the evidence files are keyed on it, and the list
  // above grows.
  it('the checker reports every way of breaking the gate in its list, each made to a copy of ci.yml (#292)', () => {
    expect(broken.length).toBeGreaterThanOrEqual(44);
    for (const [what, change, message] of broken) {
      const copy = read('ci.yml');
      change(copy);
      expect(problems(copy).join('\n'), what).toMatch(message);
    }
  });

  it('every job of the check and of the evidence refresh run names the ubuntu-24.04 image, so the image the screenshots are compared on changes by a commit (#292)', () => {
    for (const file of ['ci.yml', 'evidence-update.yml']) {
      for (const [id, job] of Object.entries(read(file).jobs)) {
        expect(job['runs-on'], `${file}: ${id}`).toBe('ubuntu-24.04');
      }
    }
  });

  it('the browser tests that start real R with gsm’s packages carry the tag the check’s real-R job runs (#292)', () => {
    const tagged = [];
    for (const spec of ['basic-app', 'rbqm-pipeline', 'site']) {
      const source = readFileSync(new URL(`../e2e/${spec}.spec.js`, import.meta.url), 'utf8');
      // Any test that carries the real-R tag, alone or among other tags.
      for (const match of source.matchAll(
        /^\s*test\('([A-Z]+-[A-Z]+-\d+):.*', \{ tag: (\[[^\]]*\]|'[^']+') \}, async/gm
      )) {
        if (match[2].includes(`'${workflow.env.REAL_R_TAG}'`)) tagged.push(match[1]);
      }
    }
    for (const id of [
      'APP-R-032',
      'APP-R-037',
      'APP-R-051',
      'APP-RBQM-012',
      'APP-RBQM-021',
      'APP-RBQM-030',
      'APP-RBQM-031',
      'APP-RBQM-039',
      'APP-RBQM-047',
      'APP-RBQM-078'
    ]) {
      expect(tagged, id).toContain(id);
    }
  });
});
