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
// used as it is, and what is already installed is not installed twice.
//
//   node install-demo.mjs --ref v1.9.2 --dir my-demo --port 5050 --no-open
//
// It imports nothing but Node's own modules, because it runs before anything
// is installed; so it shares no code with the scripts beside it. And it is
// written in the JavaScript an old Node can read (no `node:` prefix, no `??`,
// no top-level await), so that a Node too old for the demo is told so in a
// sentence and not in a syntax error.

import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

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

/** The script the installer starts, in the release it installed. */
const DEMO_SCRIPT = 'scripts/demo.mjs';

export const USAGE = `Usage: node install-demo.mjs [options]

Installs the safety.viz demo app into a directory and starts it on this machine.
Needs Node.js ${MINIMUM_NODE} or later, and git.

  --dir <path>      where to install (default ./${DEFAULTS.dir})
  --ref <name>      the release to install, a tag or a branch (default ${DEFAULTS.ref}, the latest release)
  --port <number>   the port to serve the demo on
  --no-open         do not open the browser
  --help            show this

Run it again to start the demo again: a clone already in the directory is used as it is.
`;

/**
 * Read the installer's arguments.
 * @param {string[]} argv The arguments after the script's name.
 * @returns {{dir: string, ref: string, refGiven: boolean, repo: string, port: ?number, open: boolean, help: boolean}} What was asked for; `refGiven` when a release was named.
 */
export function parseInstallArgs(argv) {
  const options = { ...DEFAULTS, refGiven: false, help: false };
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
    else if (flag === '--ref') {
      options.ref = value();
      options.refGiven = true;
    } else if (flag === '--repo') options.repo = value();
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

/**
 * How a command is handed to `spawn`. npm is a .cmd file on Windows, which
 * Node starts only through a shell, and a shell is given one string. Nothing
 * a reader typed is in that string: only npm's own fixed arguments are.
 * @param {string} command The command.
 * @param {string[]} args Its arguments.
 * @param {string} [platform] `process.platform`.
 * @returns {{command: string, args: string[], shell: boolean}} What to spawn.
 */
export function spawnable(command, args, platform = process.platform) {
  return platform === 'win32' && command === 'npm'
    ? { command: [command, ...args].join(' '), args: [], shell: true }
    : { command, args, shell: false };
}

const hasCommand = (name) => {
  const { command, args, shell } = spawnable(name, ['--version']);
  const result = spawnSync(command, args, { stdio: 'ignore', shell });
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
 * Whether a checkout's packages are installed: npm writes this file last, so
 * an install that was interrupted does not have it.
 * @param {string} dir The checkout.
 * @returns {boolean} Whether they are.
 */
export const isInstalled = (dir) =>
  existsSync(path.join(dir, 'node_modules', '.package-lock.json'));

/**
 * The commands the install runs, in order.
 * @param {{dir: string, ref: string, repo: string, port: ?number, open: boolean}} options What was asked for; `dir` absolute.
 * @param {Object} found What is at the directory.
 * @param {'absent'|'empty'|'checkout'} found.target What is there.
 * @param {boolean} [found.installed] Whether a checkout there has its packages.
 * @returns {Array<{say: string, command: string, args: string[], cwd?: string, last?: boolean}>} Each step: what to tell the reader, and the command. `node` is the Node running this. The last step runs until the reader stops it.
 */
export function steps(options, { target, installed = false }) {
  const cloned = target === 'checkout';
  return [
    ...(cloned
      ? []
      : [
          {
            say: `Downloading safety.viz (${options.ref}) into ${options.dir}…`,
            command: 'git',
            args: [
              'clone',
              // The one release, without its history.
              '--depth',
              '1',
              '--branch',
              options.ref,
              // The files as the repository holds them, on Windows too, and
              // none of git's advice about a tag not being a branch.
              '--config',
              'core.autocrlf=false',
              '--config',
              'advice.detachedHead=false',
              '--',
              options.repo,
              options.dir
            ]
          }
        ]),
    ...(cloned && installed
      ? []
      : [
          {
            say: 'Installing what it needs to build (this can take a minute)…',
            command: 'npm',
            args: ['ci', '--no-audit', '--no-fund'],
            cwd: options.dir
          }
        ]),
    {
      say: 'Starting the demo…',
      // The demo's own script, started directly: nothing stands between this
      // process and it, so stopping one stops the other.
      command: 'node',
      args: [
        DEMO_SCRIPT,
        ...(options.port ? ['--port', String(options.port)] : []),
        ...(options.open ? [] : ['--no-open'])
      ],
      cwd: options.dir,
      last: true
    }
  ];
}

const fail = (lines, code = 1) => {
  process.stderr.write(`${[].concat(lines).join('\n')}\n`);
  process.exit(code);
};

const versionIn = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

// The demo runs until the reader stops it. Ctrl+C reaches it directly; a
// signal sent to this process alone is passed on, so the demo never outlives
// the command that started it. This process ends as the demo ends.
function runUntilStopped(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', (error) => fail(`The demo did not start: ${error.message}`));
  child.on('close', (status) => process.exit(status === null ? 0 : status));
}

function main() {
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
  if (target === 'checkout') {
    // A clone already there is run as it is; it is not moved to another release.
    if (options.refGiven) {
      fail([
        `${options.dir} already holds safety.viz ${versionIn(options.dir)}, and it is used as it is.`,
        `To install ${options.ref}, name another directory with --dir. Nothing was changed.`
      ]);
    }
    console.log(`safety.viz ${versionIn(options.dir)} is already in ${options.dir}; using it.`);
  }

  for (const step of steps(options, { target, installed: isInstalled(options.dir) })) {
    // Asked before anything is installed: a release from before the demo
    // command cannot be started, whatever is installed for it.
    if (step.command !== 'git' && !existsSync(path.join(options.dir, DEMO_SCRIPT))) {
      fail([
        `safety.viz ${versionIn(options.dir)}, in ${options.dir}, has no demo command: it came in v1.9.2.`,
        'Install a later release into another directory, with --ref and --dir.'
      ]);
    }
    console.log(step.say);
    if (step.last) return runUntilStopped(process.execPath, step.args, step.cwd);
    const { command, args, shell } = spawnable(step.command, step.args);
    const result = spawnSync(command, args, { cwd: step.cwd, stdio: 'inherit', shell });
    if (result.error || result.status !== 0) {
      fail(
        `\`${step.command} ${step.args.join(' ')}\` did not finish` +
          `${result.error ? `: ${result.error.message}` : ''}. Its own message is above.`
      );
    }
  }
  return undefined;
}

// Run when this file is what Node was started on, by name or piped to it, and
// not when another script imports it.
function startedDirectly() {
  if (/\/\[(eval\d*|stdin)\]$/.test(import.meta.url)) return true;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
if (startedDirectly()) main();
