import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPrerequisites,
  DEFAULTS,
  inspectTarget,
  MINIMUM_NODE,
  parseInstallArgs,
  steps,
  USAGE
} from '../../../scripts/install-demo.mjs';

// The installer (#214): one file a reader downloads and runs with Node. It
// checks what it needs, clones a release, installs it and starts the demo. The
// checks and the plan are tested as functions; what it does when it must stop
// is tested by running the file itself.

const SCRIPT = fileURLToPath(new URL('../../../scripts/install-demo.mjs', import.meta.url));
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));

const run = (args, options = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...options });

describe('the installer file', () => {
  const source = readFileSync(SCRIPT, 'utf8');

  it('APP-LOCAL-009: is one file that imports nothing but Node’s own modules, so it runs before anything is installed (#214)', () => {
    const specifiers = [...source.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g)].map(
      (match) => match[1] || match[2]
    );
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) expect(specifier).toMatch(/^node:/);
  });

  it('APP-LOCAL-009: asks for the Node the repository is tested on (#214)', () => {
    const workflow = readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain(`node-version: '${MINIMUM_NODE}'`);
  });
});

describe('parseInstallArgs', () => {
  it('APP-LOCAL-008: with no arguments it installs the latest release into ./safety.viz (#214)', () => {
    expect(parseInstallArgs([])).toEqual({ ...DEFAULTS, help: false });
    expect(DEFAULTS).toEqual({
      dir: 'safety.viz',
      ref: 'main',
      repo: 'https://github.com/jwildfire/safety.viz.git',
      port: null,
      open: true
    });
  });

  it('APP-LOCAL-008: reads a directory, a release, a port and --no-open (#214)', () => {
    expect(
      parseInstallArgs(['--dir', 'demo here', '--ref=v1.9.2', '--port', '5050', '--no-open'])
    ).toEqual({
      ...DEFAULTS,
      dir: 'demo here',
      ref: 'v1.9.2',
      port: 5050,
      open: false,
      help: false
    });
    expect(parseInstallArgs(['--repo', '/srv/safety.viz']).repo).toBe('/srv/safety.viz');
  });

  it('APP-LOCAL-008: refuses an argument it does not know, a value left out, and a port that is not one (#214)', () => {
    expect(() => parseInstallArgs(['--branch', 'dev'])).toThrow(/--branch/);
    expect(() => parseInstallArgs(['--ref'])).toThrow(/--ref/);
    expect(() => parseInstallArgs(['--ref', '--no-open'])).toThrow(/--ref/);
    expect(() => parseInstallArgs(['--port', 'abc'])).toThrow(/--port/);
    // A release name that would be read by git as an option is refused.
    expect(() => parseInstallArgs(['--ref=-x'])).toThrow(/--ref/);
  });

  it('APP-LOCAL-008: the usage names every argument (#214)', () => {
    for (const flag of ['--dir', '--ref', '--port', '--no-open', '--help']) {
      expect(USAGE).toContain(flag);
    }
  });
});

describe('checkPrerequisites', () => {
  const found = () => true;

  it('APP-LOCAL-007: passes on the Node it asks for with git and npm present (#214)', () => {
    expect(checkPrerequisites({ nodeVersion: `${MINIMUM_NODE}.0.0`, has: found })).toEqual([]);
    expect(checkPrerequisites({ nodeVersion: 'v24.14.0', has: found })).toEqual([]);
  });

  it('APP-LOCAL-007: an older Node is named with the version found and where to get a newer one (#214)', () => {
    const [problem, ...rest] = checkPrerequisites({ nodeVersion: 'v20.11.1', has: found });
    expect(rest).toEqual([]);
    expect(problem).toContain('20.11.1');
    expect(problem).toContain(`Node.js ${MINIMUM_NODE}`);
    expect(problem).toContain('https://nodejs.org');
  });

  it('APP-LOCAL-007: a missing git or npm is named with where to get it, each in its own sentence (#214)', () => {
    const problems = checkPrerequisites({
      nodeVersion: 'v24.0.0',
      has: (command) => command !== 'git'
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/git/);
    expect(problems[0]).toContain('https://git-scm.com');
    expect(checkPrerequisites({ nodeVersion: 'v18.0.0', has: () => false })).toHaveLength(3);
  });
});

describe('inspectTarget', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sv-install-target-'));

  it('APP-LOCAL-007: tells a directory that is not there, an empty one, a safety.viz checkout and anything else apart (#214)', () => {
    expect(inspectTarget(path.join(dir, 'absent'))).toBe('absent');
    mkdirSync(path.join(dir, 'empty'));
    expect(inspectTarget(path.join(dir, 'empty'))).toBe('empty');
    mkdirSync(path.join(dir, 'checkout'));
    writeFileSync(path.join(dir, 'checkout', 'package.json'), '{"name":"safety.viz"}');
    expect(inspectTarget(path.join(dir, 'checkout'))).toBe('checkout');
    mkdirSync(path.join(dir, 'other'));
    writeFileSync(path.join(dir, 'other', 'package.json'), '{"name":"something-else"}');
    expect(inspectTarget(path.join(dir, 'other'))).toBe('other');
    mkdirSync(path.join(dir, 'unreadable'));
    writeFileSync(path.join(dir, 'unreadable', 'package.json'), '{not json');
    expect(inspectTarget(path.join(dir, 'unreadable'))).toBe('other');
    writeFileSync(path.join(dir, 'a-file'), 'x');
    expect(inspectTarget(path.join(dir, 'a-file'))).toBe('other');
  });
});

describe('steps', () => {
  const options = { ...DEFAULTS, dir: 'sv-demo', ref: 'v1.9.2' };

  it('APP-LOCAL-008: clones the named release alone, installs what its lock file names, and starts the demo (#214)', () => {
    expect(steps(options, 'absent')).toEqual([
      {
        say: expect.stringContaining('v1.9.2'),
        command: 'git',
        args: ['clone', '--depth', '1', '--branch', 'v1.9.2', '--', DEFAULTS.repo, 'sv-demo']
      },
      {
        say: expect.any(String),
        command: 'npm',
        args: ['ci', '--no-audit', '--no-fund'],
        cwd: 'sv-demo'
      },
      { say: expect.any(String), command: 'npm', args: ['run', 'demo'], cwd: 'sv-demo', last: true }
    ]);
    expect(steps(options, 'empty')[0].command).toBe('git');
  });

  it('APP-LOCAL-008: a checkout already there is not cloned again, and the port and --no-open reach the demo (#214)', () => {
    const plan = steps({ ...options, port: 5050, open: false }, 'checkout');
    expect(plan.map((step) => step.command)).toEqual(['npm', 'npm']);
    expect(plan[1].args).toEqual(['run', 'demo', '--', '--port', '5050', '--no-open']);
  });
});

describe('running the installer', () => {
  it('APP-LOCAL-008: --help prints the usage and changes nothing (#214)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sv-install-help-'));
    const result = run(['--help'], { cwd });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--ref');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-008: an argument it does not know stops it with the usage, and changes nothing (#214)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sv-install-args-'));
    const result = run(['--branch', 'dev'], { cwd });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--branch');
    expect(result.stderr).toContain('--ref');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-007: with no git or npm to be found it stops before it changes anything, saying what to install (#214)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sv-install-nogit-'));
    const emptyPath = mkdtempSync(path.join(tmpdir(), 'sv-install-path-'));
    const result = run([], { cwd, env: { ...process.env, PATH: emptyPath, Path: emptyPath } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('https://git-scm.com');
    expect(result.stderr).toMatch(/npm/);
    expect(result.stderr).toContain('Nothing was changed');
    expect(existsSync(path.join(cwd, 'safety.viz'))).toBe(false);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-007: a directory that holds something else is left as it was, and named (#214)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sv-install-other-'));
    mkdirSync(path.join(cwd, 'safety.viz'));
    writeFileSync(path.join(cwd, 'safety.viz', 'notes.txt'), 'mine');
    const result = run([], { cwd });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join(cwd, 'safety.viz'));
    expect(result.stderr).toContain('--dir');
    expect(result.stderr).toContain('Nothing was changed');
    expect(readdirSync(path.join(cwd, 'safety.viz'))).toEqual(['notes.txt']);
    expect(readFileSync(path.join(cwd, 'safety.viz', 'notes.txt'), 'utf8')).toBe('mine');
  });

  it('APP-LOCAL-008: a release that does not exist stops it with git’s own reason, and leaves no directory behind (#214)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'sv-install-noref-'));
    const result = run(['--repo', rootDir, '--ref', 'no-such-release-214'], { cwd });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no-such-release-214');
    expect(existsSync(path.join(cwd, 'safety.viz'))).toBe(false);
  });
});
