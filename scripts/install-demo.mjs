// The safety.viz demo app, installed and started on your own machine (#214).
//
// One file with no dependencies: download it and run it with Node.
//
//   node install-demo.mjs
//
// It checks for Node, git and npm, clones a release of safety.viz into
// ./safety.viz, installs what the release's lock file names, builds the demo
// app and serves it to this machine only, at an address it prints and opens in
// your browser. Run it again to start the demo again: a clone already there is
// not cloned twice.
//
//   node install-demo.mjs --ref v1.9.2 --dir my-demo --port 5050 --no-open
//
// It imports nothing but Node's own modules, because it runs before anything
// is installed; so it shares no code with the scripts beside it.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The oldest Node the demo is built and tested on: the one CI runs. */
export const MINIMUM_NODE = 22;

/** What is installed when nothing is said: the latest release, into ./safety.viz. */
export const DEFAULTS = Object.freeze({
  dir: 'safety.viz',
  // `main` is the release branch: it holds the latest release.
  ref: 'main',
  repo: 'https://github.com/jwildfire/safety.viz.git',
  port: null,
  open: true
});

export const USAGE = `Usage: node install-demo.mjs [options]

Installs the safety.viz demo app into a directory and starts it on this machine.
Needs Node.js ${MINIMUM_NODE} or later, and git.

  --dir <path>      where to install (default ./${DEFAULTS.dir})
  --ref <name>      the release to install, a tag or a branch (default ${DEFAULTS.ref}, the latest release)
  --port <number>   the port to serve the demo on
  --no-open         do not open the browser
  --help            show this
`;

/**
 * Read the installer's arguments.
 * @param {string[]} argv The arguments after the script's name.
 * @returns {{dir: string, ref: string, repo: string, port: ?number, open: boolean, help: boolean}} What was asked for.
 */
export function parseInstallArgs(argv) {
  const options = { ...DEFAULTS, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/s);
    const value = () => {
      const given = inline !== undefined ? inline : argv[(index += 1)];
      // A value that starts with a dash is the next option, or would be read
      // as one by git.
      if (!given || given.startsWith('-')) throw new Error(`${flag} needs a value.`);
      return given;
    };
    if (flag === '--dir') options.dir = value();
    else if (flag === '--ref') options.ref = value();
    else if (flag === '--repo') options.repo = value();
    else if (flag === '--port') {
      const port = value();
      if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        throw new Error(`--port takes a number from 1 to 65535, not "${port}".`);
      }
      options.port = Number(port);
    } else if (flag === '--no-open' && inline === undefined) options.open = false;
    else if ((flag === '--help' || flag === '-h') && inline === undefined) options.help = true;
    else throw new Error(`Unknown argument "${argv[index]}".`);
  }
  return options;
}

// npm is a .cmd file on Windows, which Node starts only through a shell.
const viaShell = (command) => process.platform === 'win32' && command === 'npm';

const hasCommand = (command) => {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', shell: viaShell(command) });
  return !result.error && result.status === 0;
};

/**
 * What is missing for the install, one sentence each; empty when nothing is.
 * @param {Object} [found] What this machine has; read from the machine by default.
 * @param {string} [found.nodeVersion] The running Node's version.
 * @param {(command: string) => boolean} [found.has] Whether a command can be run.
 * @returns {string[]} The sentences.
 */
export function checkPrerequisites({ nodeVersion = process.version, has = hasCommand } = {}) {
  const problems = [];
  const version = nodeVersion.replace(/^v/, '');
  if (Number(version.split('.')[0]) < MINIMUM_NODE) {
    problems.push(
      `This is Node.js ${version}; the demo needs Node.js ${MINIMUM_NODE} or later. ` +
        'Install the current version from https://nodejs.org and run this again.'
    );
  }
  if (!has('git')) {
    problems.push(
      'git was not found. Install it from https://git-scm.com/downloads and run this again.'
    );
  }
  if (!has('npm')) {
    problems.push(
      'npm was not found. It comes with Node.js: install Node.js from https://nodejs.org and run this again.'
    );
  }
  return problems;
}

/**
 * What is at the directory the demo is to be installed into.
 * @param {string} dir The directory.
 * @returns {'absent'|'empty'|'checkout'|'other'} Nothing; an empty directory; a safety.viz checkout; or something else, which is left alone.
 */
export function inspectTarget(dir) {
  if (!existsSync(dir)) return 'absent';
  if (!statSync(dir).isDirectory()) return 'other';
  if (readdirSync(dir).length === 0) return 'empty';
  try {
    const { name } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return name === 'safety.viz' ? 'checkout' : 'other';
  } catch {
    return 'other';
  }
}

/**
 * The commands the install runs, in order.
 * @param {{dir: string, ref: string, repo: string, port: ?number, open: boolean}} options What was asked for; `dir` absolute.
 * @param {'absent'|'empty'|'checkout'} target What is at the directory.
 * @returns {Array<{say: string, command: string, args: string[], cwd?: string, last?: boolean}>} Each step: what to tell the reader, and the command. The last one runs until the reader stops it.
 */
export function steps(options, target) {
  const demoArgs = [
    ...(options.port ? ['--port', String(options.port)] : []),
    ...(options.open ? [] : ['--no-open'])
  ];
  return [
    ...(target === 'checkout'
      ? []
      : [
          {
            say: `Downloading safety.viz (${options.ref}) into ${options.dir}…`,
            command: 'git',
            // The one release, without its history.
            args: [
              'clone',
              '--depth',
              '1',
              '--branch',
              options.ref,
              '--',
              options.repo,
              options.dir
            ]
          }
        ]),
    {
      say: 'Installing what it needs to build (a minute or so)…',
      command: 'npm',
      args: ['ci', '--no-audit', '--no-fund'],
      cwd: options.dir
    },
    {
      say: 'Starting the demo…',
      command: 'npm',
      args: ['run', 'demo', ...(demoArgs.length ? ['--', ...demoArgs] : [])],
      cwd: options.dir,
      last: true
    }
  ];
}

const fail = (lines, code = 1) => {
  process.stderr.write(`${[].concat(lines).join('\n')}\n`);
  process.exit(code);
};

async function main() {
  let options;
  try {
    options = parseInstallArgs(process.argv.slice(2));
  } catch (error) {
    fail([error.message, '', USAGE.trimEnd()], 2);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  options.dir = path.resolve(options.dir);

  // Everything is checked before anything is changed.
  const problems = checkPrerequisites();
  if (problems.length) fail([...problems, 'Nothing was changed.']);
  const target = inspectTarget(options.dir);
  if (target === 'other') {
    fail([
      `${options.dir} already holds something that is not safety.viz.`,
      'Name another directory with --dir. Nothing was changed.'
    ]);
  }
  if (target === 'checkout') console.log(`safety.viz is already in ${options.dir}; using it.`);

  for (const step of steps(options, target)) {
    console.log(step.say);
    const spawnOptions = { cwd: step.cwd, stdio: 'inherit', shell: viaShell(step.command) };
    if (step.last) {
      const { scripts = {}, version } = JSON.parse(
        readFileSync(path.join(options.dir, 'package.json'), 'utf8')
      );
      if (!scripts.demo) {
        fail([
          `safety.viz ${version} has no demo command: it came in v1.9.2.`,
          `Name a later release with --ref. The clone is in ${options.dir}.`
        ]);
      }
      // The demo runs until the reader stops it. Ctrl+C reaches it directly, so
      // this process waits for it to end and ends the same way.
      process.on('SIGINT', () => {});
      const child = spawn(step.command, step.args, spawnOptions);
      const code = await new Promise((resolve) => {
        child.on('error', () => resolve(1));
        child.on('close', (status) => resolve(status ?? 0));
      });
      process.exit(code);
    }
    const result = spawnSync(step.command, step.args, spawnOptions);
    if (result.error || result.status !== 0) {
      // A clone that failed leaves nothing behind: git removes what it made,
      // and an empty directory this run found is still empty.
      if (step.command === 'git' && target === 'absent' && inspectTarget(options.dir) === 'empty') {
        rmSync(options.dir, { recursive: true });
      }
      fail(
        `\`${step.command} ${step.args.join(' ')}\` did not finish` +
          `${result.error ? `: ${result.error.message}` : ''}. Its own message is above.`
      );
    }
  }
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) await main();
