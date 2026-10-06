// `npm run demo` (#214): the demo app on the reader's own machine. Builds the
// directory the site serves at demo/ into build/demo/ (scripts/demo-app.mjs),
// serves it to this machine only (scripts/demo-server.mjs), prints the address
// and opens it in the browser.
//
//   npm run demo
//   npm run demo -- --port 5050 --no-open

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDemoAppDir, LOCAL_LINKS } from './demo-app.mjs';
import { createDemoServer, HOST, listen } from './demo-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The directory the demo is built into and served from; gitignored with build/. */
export const DEMO_DIR = path.join(rootDir, 'build/demo');

/** The first port tried; a busy one is stepped past. */
export const DEFAULT_PORT = 8642;

export const USAGE = `Usage: npm run demo [-- options]

Builds the safety.viz demo app and serves it on this machine.

  --port <number>   the port to serve on (default ${DEFAULT_PORT}; a busy port is stepped past)
  --no-open         do not open the browser
  --help            show this
`;

/**
 * A port read from an argument.
 * @param {string|undefined} value What was written after `--port`.
 * @returns {number} The port.
 */
export function parsePort(value) {
  if (!/^\d+$/.test(value || '') || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`--port takes a number from 1 to 65535${value ? `, not "${value}"` : ''}.`);
  }
  return Number(value);
}

/**
 * Read the command's arguments.
 * @param {string[]} argv The arguments after the script's name.
 * @returns {{port: number, open: boolean, help: boolean}} What was asked for.
 */
export function parseDemoArgs(argv) {
  const options = { port: DEFAULT_PORT, open: true, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/s);
    if (flag === '--port') {
      options.port = parsePort(inline !== undefined ? inline : argv[(index += 1)]);
    } else if (flag === '--no-open' && inline === undefined) {
      options.open = false;
    } else if ((flag === '--help' || flag === '-h') && inline === undefined) {
      options.help = true;
    } else {
      throw new Error(`Unknown argument "${argv[index]}".`);
    }
  }
  return options;
}

/**
 * The command that opens an address in the reader's browser.
 * @param {string} platform `process.platform`.
 * @param {string} url The address.
 * @returns {{command: string, args: string[]}} The command and its arguments.
 */
export function openCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  // `start` is a builtin of cmd; its first quoted argument is a window title,
  // here an empty one.
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

// The browser not opening is not the demo failing: the address is printed.
function openBrowser(url) {
  try {
    const { command, args } = openCommand(process.platform, url);
    const child = spawn(command, args, {
      stdio: 'ignore',
      // Left running when this command ends; on Windows that would open a
      // console window of its own, so there it is only hidden.
      detached: process.platform !== 'win32',
      windowsHide: true
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Nothing to do: the address is on the screen.
  }
}

async function main() {
  let options;
  try {
    options = parseDemoArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  console.log('Building the demo app…');
  await buildDemoAppDir(DEMO_DIR, { links: LOCAL_LINKS });
  const server = createDemoServer(DEMO_DIR);
  let port;
  try {
    port = await listen(server, { port: options.port });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (port !== options.port) console.log(`Port ${options.port} is in use; using ${port}.`);
  const url = `http://${HOST}:${port}/`;
  console.log(`\nThe safety.viz demo app is running at ${url}`);
  console.log('It answers this computer only. Files you load are read in your browser.');
  console.log('Press Ctrl+C to stop it.\n');
  if (options.open) openBrowser(url);

  const stop = () => {
    server.close(() => process.exit(0));
    // A browser holding a connection open does not keep the command from ending.
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Run when this file is what Node was started on, not when it is imported.
const startedDirectly = () => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};
if (startedDirectly()) await main();
