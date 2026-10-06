import { describe, it, expect } from 'vitest';
import { DEFAULT_PORT, openCommand, parseDemoArgs, USAGE } from '../../../scripts/demo.mjs';

// `npm run demo` (#214): what it reads from its arguments, and how it opens the
// reader's browser. The server it starts is tested in demo-server.test.js and
// in the browser by tests/e2e/local-demo.spec.js.

describe('parseDemoArgs', () => {
  it('APP-LOCAL-006: with no arguments it serves on the default port and opens the browser (#214)', () => {
    expect(parseDemoArgs([])).toEqual({ port: DEFAULT_PORT, open: true, help: false });
  });

  it('APP-LOCAL-006: reads a port, either way of writing it, and --no-open (#214)', () => {
    expect(parseDemoArgs(['--port', '5050', '--no-open'])).toEqual({
      port: 5050,
      open: false,
      help: false
    });
    expect(parseDemoArgs(['--port=5051']).port).toBe(5051);
    expect(parseDemoArgs(['--help']).help).toBe(true);
    expect(parseDemoArgs(['-h']).help).toBe(true);
  });

  it('APP-LOCAL-006: refuses a port that is not one, and an argument it does not know, naming it (#214)', () => {
    for (const port of ['abc', '-1', '70000', '80.5', '']) {
      expect(() => parseDemoArgs(['--port', port]), port).toThrow(/--port/);
    }
    expect(() => parseDemoArgs(['--port'])).toThrow(/--port/);
    expect(() => parseDemoArgs(['--prot', '5050'])).toThrow(/--prot/);
  });

  it('APP-LOCAL-006: the usage names every argument (#214)', () => {
    for (const flag of ['--port', '--no-open', '--help']) expect(USAGE).toContain(flag);
  });
});

describe('openCommand', () => {
  const url = 'http://127.0.0.1:8642/';

  it('APP-LOCAL-006: opens the address with each system’s own command (#214)', () => {
    expect(openCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(openCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
    expect(openCommand('win32', url)).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', url]
    });
  });
});
