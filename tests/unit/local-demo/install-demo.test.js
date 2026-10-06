import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkPrerequisites,
  DEFAULTS,
  inspectTarget,
  isInstalled,
  MINIMUM_NODE,
  parseInstallArgs,
  spawnable,
  steps,
  USAGE
} from '../../../scripts/install-demo.mjs';

// The installer (#214): one file a reader downloads and runs with Node. It
// checks what it needs, clones a release, installs it and starts the demo. The
// checks and the plan are tested as functions; what the file does, from its
// arguments to the demo it starts, is tested by running the file itself on
// small made-up releases, so no test installs from the network.

const SCRIPT = fileURLToPath(new URL('../../../scripts/install-demo.mjs', import.meta.url));
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));

const run = (args, options = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...options });

const scratch = (name) => mkdtempSync(path.join(tmpdir(), `sv-install-${name}-`));

// A stand-in for the demo's script: it says what it was started with, and
// ends as the test asks.
const demoThat = (body) =>
  `console.log('demo started ' + JSON.stringify(process.argv.slice(2)));\n${body}\n`;

// A checkout as the installer leaves one, with the stand-in as its demo.
function checkout(dir, { demo = demoThat('process.exit(7);'), installed = true } = {}) {
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), '{"name":"safety.viz","version":"9.9.9"}');
  if (demo) writeFileSync(path.join(dir, 'scripts', 'demo.mjs'), demo);
  if (installed) {
    mkdirSync(path.join(dir, 'node_modules'));
    writeFileSync(path.join(dir, 'node_modules', '.package-lock.json'), '{}');
  }
  return dir;
}

// A made-up release: a git repository of two commits holding a package with
// nothing to install.
function release(dir, { demo = demoThat('process.exit(0);') } = {}) {
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false']
        .concat(args)
        .filter(Boolean),
      { cwd: dir, encoding: 'utf8' }
    );
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  };
  const pkg = { name: 'safety.viz', version: '9.9.9' };
  git('init', '--quiet', '--initial-branch', 'main');
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify({ ...pkg, lockfileVersion: 3, requires: true, packages: { '': pkg } })
  );
  git('add', '.');
  git('commit', '--quiet', '-m', 'first');
  if (demo) {
    mkdirSync(path.join(dir, 'scripts'));
    writeFileSync(path.join(dir, 'scripts', 'demo.mjs'), demo);
  } else {
    writeFileSync(path.join(dir, 'notes.txt'), 'no demo here');
  }
  git('add', '.');
  git('commit', '--quiet', '-m', 'second');
  return pathToFileURL(dir).href;
}

describe('the installer file', () => {
  const source = readFileSync(SCRIPT, 'utf8');

  it('APP-LOCAL-009: is one file that imports nothing but Node’s own modules, so it runs before anything is installed (#214)', () => {
    const specifiers = [
      ...source.matchAll(/^\s*import\b[^'"`;]*?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm)
    ].map((match) => match[1] || match[2]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) expect(builtinModules, specifier).toContain(specifier);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it('APP-LOCAL-009: is written so an old Node can read it and reach the sentence that says it is too old (#214)', () => {
    const code = source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    // No `node:` prefix, no `??` or `?.`, and no await at the top level.
    expect(code).not.toMatch(/from 'node:/);
    expect(code).not.toMatch(/\?\?|\?\.[a-zA-Z_[(]/);
    expect(code).not.toMatch(/\bawait\b/);
  });

  it('APP-LOCAL-009: asks for the Node the repository is tested on (#214)', () => {
    const workflow = readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain(`node-version: '${MINIMUM_NODE}'`);
  });
});

describe('parseInstallArgs', () => {
  it('APP-LOCAL-008: with no arguments it installs the latest release into ./safety.viz (#214)', () => {
    expect(parseInstallArgs([])).toEqual({ ...DEFAULTS, refGiven: false, help: false });
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
      refGiven: true,
      port: 5050,
      open: false,
      help: false
    });
    expect(parseInstallArgs(['--repo', 'elsewhere/safety.viz']).repo).toBe('elsewhere/safety.viz');
    // Naming the default release is still naming one.
    expect(parseInstallArgs(['--ref', 'main']).refGiven).toBe(true);
  });

  it('APP-LOCAL-008: refuses an argument it does not know, a value left out, and a port that is not one (#214)', () => {
    expect(() => parseInstallArgs(['--branch', 'dev'])).toThrow(/--branch/);
    expect(() => parseInstallArgs(['--ref'])).toThrow(/--ref/);
    expect(() => parseInstallArgs(['--ref', '--no-open'])).toThrow(/--ref/);
    expect(() => parseInstallArgs(['--port', 'abc'])).toThrow(/--port/);
    // A release name that would be read by git as an option is refused.
    expect(() => parseInstallArgs(['--ref=-x'])).toThrow(/--ref/);
    expect(() => parseInstallArgs(['--repo', '--upload-pack=x'])).toThrow(/--repo/);
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
  const dir = scratch('target');

  it('APP-LOCAL-007: tells a directory that is not there, an empty one, a safety.viz checkout and anything else apart (#214)', () => {
    expect(inspectTarget(path.join(dir, 'absent'))).toBe('absent');
    mkdirSync(path.join(dir, 'empty'));
    expect(inspectTarget(path.join(dir, 'empty'))).toBe('empty');
    checkout(path.join(dir, 'checkout'), { installed: false });
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

  it('APP-LOCAL-008: a checkout’s packages count as installed only once npm has finished writing them (#214)', () => {
    expect(isInstalled(path.join(dir, 'checkout'))).toBe(false);
    mkdirSync(path.join(dir, 'checkout', 'node_modules'));
    // An install that was interrupted: the directory is there, npm's last file is not.
    expect(isInstalled(path.join(dir, 'checkout'))).toBe(false);
    writeFileSync(path.join(dir, 'checkout', 'node_modules', '.package-lock.json'), '{}');
    expect(isInstalled(path.join(dir, 'checkout'))).toBe(true);
  });
});

describe('steps', () => {
  const options = { ...DEFAULTS, dir: 'sv-demo', ref: 'v1.9.2' };

  it('APP-LOCAL-008: clones the named release alone, installs what its lock file names, and starts the demo’s own script (#214)', () => {
    const plan = steps(options, { target: 'absent' });
    expect(plan.map((step) => step.command)).toEqual(['git', 'npm', 'node']);
    expect(plan[0].say).toContain('v1.9.2');
    expect(plan[0].args).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'v1.9.2',
      '--config',
      'core.autocrlf=false',
      '--config',
      'advice.detachedHead=false',
      '--',
      DEFAULTS.repo,
      'sv-demo'
    ]);
    expect(plan[1]).toMatchObject({ args: ['ci', '--no-audit', '--no-fund'], cwd: 'sv-demo' });
    expect(plan[2]).toMatchObject({ args: ['scripts/demo.mjs'], cwd: 'sv-demo', last: true });
    expect(steps(options, { target: 'empty' })[0].command).toBe('git');
  });

  it('APP-LOCAL-008: a checkout already there is not cloned again, nor installed twice, and the port and --no-open reach the demo (#214)', () => {
    const asked = { ...options, port: 5050, open: false };
    const ready = steps(asked, { target: 'checkout', installed: true });
    expect(ready.map((step) => step.command)).toEqual(['node']);
    expect(ready[0].args).toEqual(['scripts/demo.mjs', '--port', '5050', '--no-open']);
    // A checkout whose install did not finish is installed.
    expect(
      steps(asked, { target: 'checkout', installed: false }).map((step) => step.command)
    ).toEqual(['npm', 'node']);
    // A fresh clone is installed whatever is said of the directory before it.
    expect(steps(asked, { target: 'absent', installed: true }).map((step) => step.command)).toEqual(
      ['git', 'npm', 'node']
    );
  });
});

describe('spawnable', () => {
  it('APP-LOCAL-008: npm is started through a shell on Windows, as one string of its own fixed arguments; everything else is started directly (#214)', () => {
    expect(spawnable('npm', ['ci', '--no-audit'], 'win32')).toEqual({
      command: 'npm ci --no-audit',
      args: [],
      shell: true
    });
    expect(spawnable('npm', ['ci'], 'darwin')).toEqual({
      command: 'npm',
      args: ['ci'],
      shell: false
    });
    expect(spawnable('git', ['clone', 'a b'], 'win32')).toEqual({
      command: 'git',
      args: ['clone', 'a b'],
      shell: false
    });
  });
});

describe('running the installer', () => {
  it('APP-LOCAL-008: --help prints the usage and changes nothing (#214)', () => {
    const cwd = scratch('help');
    const result = run(['--help'], { cwd });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--ref');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-008: an argument it does not know stops it with the usage, and changes nothing (#214)', () => {
    const cwd = scratch('args');
    const result = run(['--branch', 'dev'], { cwd });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--branch');
    expect(result.stderr).toContain('--ref');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-007: with no git or npm to be found it stops before it changes anything, saying what to install (#214)', () => {
    const cwd = scratch('nogit');
    const emptyPath = scratch('path');
    const result = run([], { cwd, env: { ...process.env, PATH: emptyPath, Path: emptyPath } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('https://git-scm.com');
    expect(result.stderr).toMatch(/npm/);
    expect(result.stderr).toContain('Nothing was changed');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('APP-LOCAL-007: a directory that holds something else is left as it was, and named (#214)', () => {
    const cwd = scratch('other');
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

  it('APP-LOCAL-008: from an empty directory it clones the release alone, installs it and starts its demo with what was asked, ending as the demo ends (#214)', () => {
    const cwd = scratch('fresh');
    const repo = release(scratch('release'), { demo: demoThat('process.exit(7);') });
    const result = run(['--repo', repo, '--port', '5050', '--no-open'], { cwd });
    expect(result.stdout).toContain('Downloading safety.viz (main)');
    expect(result.stdout).toContain('Installing');
    expect(result.stdout).toContain('demo started ["--port","5050","--no-open"]');
    expect(result.status).toBe(7);
    const clone = path.join(cwd, 'safety.viz');
    const git = (...args) => spawnSync('git', args, { cwd: clone, encoding: 'utf8' }).stdout.trim();
    // The one release, without its history, and its files as the repository holds them.
    expect(git('rev-list', '--count', 'HEAD')).toBe('1');
    expect(git('config', 'core.autocrlf')).toBe('false');
  });

  it('APP-LOCAL-008: a release that does not exist stops it with git’s own reason, and leaves no clone behind (#214)', () => {
    const cwd = scratch('noref');
    const repo = release(scratch('release'));
    const result = run(['--repo', repo, '--ref', 'no-such-release-214'], { cwd });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no-such-release-214');
    expect(result.stdout).not.toContain('Installing');
    expect(existsSync(path.join(cwd, 'safety.viz'))).toBe(false);
  });

  it('APP-LOCAL-008: a release from before the demo command says so before anything is installed for it (#214)', () => {
    const cwd = scratch('old');
    const repo = release(scratch('release'), { demo: null });
    const result = run(['--repo', repo], { cwd });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('safety.viz 9.9.9');
    expect(result.stderr).toContain('has no demo command');
    expect(result.stderr).toContain('--ref and --dir');
    expect(result.stdout).not.toContain('Installing');
    expect(result.stdout).not.toContain('demo started');
    // Run again, it says the same and still installs nothing.
    const again = run(['--repo', repo], { cwd });
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('has no demo command');
    expect(existsSync(path.join(cwd, 'safety.viz', 'node_modules'))).toBe(false);
  });

  it('APP-LOCAL-008: run again where a checkout is, it uses it as it is: nothing is cloned or installed, and the demo starts (#214)', () => {
    const cwd = scratch('again');
    checkout(path.join(cwd, 'safety.viz'));
    const before = readdirSync(path.join(cwd, 'safety.viz', 'node_modules'));
    const result = run(['--no-open'], { cwd });
    expect(result.stdout).toContain('safety.viz 9.9.9 is already in');
    expect(result.stdout).not.toContain('Downloading');
    expect(result.stdout).not.toContain('Installing');
    expect(result.stdout).toContain('demo started ["--no-open"]');
    expect(result.status).toBe(7);
    expect(readdirSync(path.join(cwd, 'safety.viz', 'node_modules'))).toEqual(before);
  });

  it('APP-LOCAL-008: naming a release where a checkout already is stops it: the checkout is not moved to another release, and it says where to install one (#214)', () => {
    const cwd = scratch('ref');
    checkout(path.join(cwd, 'safety.viz'));
    const result = run(['--ref', 'v1.9.2'], { cwd });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already holds safety.viz 9.9.9');
    expect(result.stderr).toContain('To install v1.9.2, name another directory with --dir');
    expect(result.stderr).toContain('Nothing was changed');
    expect(result.stdout).not.toContain('demo started');
  });

  it.skipIf(process.platform === 'win32')(
    'APP-LOCAL-008: stopping the installer alone stops the demo it started (#214)',
    async () => {
      const cwd = scratch('signal');
      checkout(path.join(cwd, 'safety.viz'), {
        demo: demoThat(
          "process.on('SIGTERM', () => { console.log('demo was told to stop'); process.exit(0); });\n" +
            "console.log('demo pid ' + process.pid);\nsetInterval(() => {}, 1000);"
        )
      });
      const installer = spawn(process.execPath, [SCRIPT, '--no-open'], { cwd });
      let output = '';
      const demoPid = await new Promise((resolve, reject) => {
        installer.stdout.on('data', (chunk) => {
          output += chunk;
          const pid = output.match(/demo pid (\d+)/);
          if (pid) resolve(Number(pid[1]));
        });
        installer.on('exit', () => reject(new Error(`the installer ended early:\n${output}`)));
      });
      const ended = new Promise((resolve) => installer.on('close', resolve));
      // To the installer only, as a terminal closing or a supervisor would.
      installer.kill('SIGTERM');
      expect(await ended).toBe(0);
      expect(output).toContain('demo was told to stop');
      // The demo is gone: signalling it finds no such process.
      expect(() => process.kill(demoPid, 0)).toThrow(/ESRCH/);
    }
  );

  it.skipIf(process.platform === 'win32')(
    'APP-LOCAL-009: piped to Node as readers of a one-line install do, it runs and reads its arguments (#214)',
    () => {
      const cwd = scratch('piped');
      const result = spawnSync(process.execPath, ['--input-type=module', '-', '--help'], {
        cwd,
        input: readFileSync(SCRIPT),
        encoding: 'utf8'
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: node install-demo.mjs');
      expect(readdirSync(cwd)).toEqual([]);
    }
  );
});
