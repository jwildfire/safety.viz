import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  contentType,
  createDemoServer,
  isLocalHost,
  listen,
  readRequestPath,
  resolveServedFile
} from '../../../scripts/demo-server.mjs';

// The server `npm run demo` starts (#214): a reader's own machine serves the
// demo app's directory to that machine's browser and to nothing else. These
// tests start the real server on a real port and ask it over HTTP.

// A request made with the path exactly as written: `fetch` and `new URL`
// normalise `..` away before the server ever sees it.
const raw = (port, requestPath, method = 'GET', headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, method, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        );
      }
    );
    request.on('error', reject);
    request.end();
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

describe('the local demo server', () => {
  let parent;
  let served;
  let server;
  let port;
  let linked;

  beforeAll(async () => {
    parent = mkdtempSync(path.join(tmpdir(), 'sv-demo-server-'));
    served = path.join(parent, 'demo');
    mkdirSync(path.join(served, 'renamed'), { recursive: true });
    mkdirSync(path.join(served, 'fonts'), { recursive: true });
    writeFileSync(path.join(served, 'index.html'), '<!doctype html><title>demo</title>');
    writeFileSync(path.join(served, 'safety.viz-app.js'), 'var SafetyVizApp = {};');
    writeFileSync(path.join(served, 'adsl.csv'), 'USUBJID,ARM\n01,Placebo\n');
    writeFileSync(path.join(served, 'statistics.R'), 'f <- function() 1\n');
    writeFileSync(path.join(served, 'renamed', 'ecg.json'), '[]');
    writeFileSync(path.join(served, 'fonts', 'face.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
    // Beside the served directory, not in it: nothing may reach these.
    writeFileSync(path.join(parent, 'secret.txt'), 'not served');
    mkdirSync(path.join(parent, 'demo-private'));
    writeFileSync(path.join(parent, 'demo-private', 'secret.txt'), 'not served either');
    // Links inside the served directory that lead out of it. Making a link
    // needs a privilege on Windows that a test run may not have.
    try {
      symlinkSync(path.join(parent, 'secret.txt'), path.join(served, 'link.txt'));
      symlinkSync(path.join(parent, 'demo-private'), path.join(served, 'up'), 'dir');
      symlinkSync(path.join(served, 'adsl.csv'), path.join(served, 'same.csv'));
      linked = true;
    } catch {
      linked = false;
    }
    server = createDemoServer(served);
    port = await listen(server, { port: 0 });
  });

  afterAll(() => close(server));

  it('APP-LOCAL-003: answers on this machine’s own address and no other (#214)', () => {
    expect(server.address().address).toBe('127.0.0.1');
    expect(port).toBe(server.address().port);
  });

  it('APP-LOCAL-003: serves the page at the directory’s address, and each file with its type (#214)', async () => {
    const page = await raw(port, '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toContain('<title>demo</title>');

    const types = {
      '/index.html': 'text/html; charset=utf-8',
      '/safety.viz-app.js': 'text/javascript; charset=utf-8',
      '/adsl.csv': 'text/csv; charset=utf-8',
      '/statistics.R': 'text/plain; charset=utf-8',
      '/renamed/ecg.json': 'application/json; charset=utf-8',
      '/fonts/face.woff2': 'font/woff2'
    };
    for (const [file, type] of Object.entries(types)) {
      const response = await raw(port, file);
      expect(response.status, file).toBe(200);
      expect(response.headers['content-type'], file).toBe(type);
    }
    const study = await raw(port, '/adsl.csv?v=1');
    expect(study.body).toBe('USUBJID,ARM\n01,Placebo\n');
    expect(study.headers['content-length']).toBe(String(Buffer.byteLength(study.body)));
  });

  it('APP-LOCAL-003: tells the browser to keep no copy, so a rebuilt demo is the one shown (#214)', async () => {
    const response = await raw(port, '/safety.viz-app.js');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('APP-LOCAL-003: answers a HEAD with the headers and no body, and refuses to be written to (#214)', async () => {
    const head = await raw(port, '/adsl.csv', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(head.body).toBe('');
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await raw(port, '/adsl.csv', method);
      expect(response.status, method).toBe(405);
      expect(response.headers.allow).toBe('GET, HEAD');
    }
  });

  it('APP-LOCAL-004: refuses every path that leads outside the directory it serves (#214)', async () => {
    const outside = [
      '/../secret.txt',
      '/renamed/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e%2fsecret.txt',
      '/..%5csecret.txt',
      // A sibling whose name starts with the served directory's name.
      '/../demo-private/secret.txt',
      '//../secret.txt'
    ];
    for (const requestPath of outside) {
      const response = await raw(port, requestPath);
      expect([403, 404], requestPath).toContain(response.status);
      expect(response.body, requestPath).not.toContain('not served');
    }
  });

  it('APP-LOCAL-004: a link inside the directory that leads out of it is refused; one that stays inside is served (#214)', async (context) => {
    if (!linked) return context.skip();
    for (const requestPath of ['/link.txt', '/up/secret.txt']) {
      const response = await raw(port, requestPath);
      expect(response.status, requestPath).toBe(403);
      expect(response.body, requestPath).not.toContain('not served');
    }
    const same = await raw(port, '/same.csv');
    expect(same.status).toBe(200);
    expect(same.body).toBe('USUBJID,ARM\n01,Placebo\n');
    return undefined;
  });

  it('APP-LOCAL-003: a request that names another host is refused; this machine’s own names are answered (#214)', async () => {
    for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1.evil.example']) {
      const response = await raw(port, '/adsl.csv', 'GET', { Host: host });
      expect(response.status, host).toBe(403);
      expect(response.body, host).not.toContain('USUBJID');
    }
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, 'LOCALHOST']) {
      expect((await raw(port, '/adsl.csv', 'GET', { Host: host })).status, host).toBe(200);
    }
  });

  it('APP-LOCAL-004: a path that cannot be read as one is refused, not thrown on (#214)', async () => {
    for (const requestPath of ['/%E0%A4%A', '/adsl.csv%00.html', '/%00']) {
      const response = await raw(port, requestPath);
      expect(response.status, requestPath).toBe(400);
    }
    // The server is still answering.
    expect((await raw(port, '/')).status).toBe(200);
  });

  it('APP-LOCAL-003: a file that is not there is a 404 that says so, and a directory with no page is one too (#214)', async () => {
    const missing = await raw(port, '/nothing.csv');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect((await raw(port, '/fonts/')).status).toBe(404);
    expect((await raw(port, '/fonts')).status).toBe(404);
    // A file is not a directory: its address with a slash after it is nothing.
    expect((await raw(port, '/index.html/')).status).toBe(404);
    expect((await raw(port, '/adsl.csv/')).status).toBe(404);
  });

  it('APP-LOCAL-005: a port already in use is stepped past, and the port returned is the one answering (#214)', async () => {
    const second = createDemoServer(served);
    const secondPort = await listen(second, { port });
    try {
      expect(secondPort).toBeGreaterThan(port);
      expect(second.address().port).toBe(secondPort);
      expect((await raw(secondPort, '/')).status).toBe(200);
    } finally {
      await close(second);
    }
  });

  it('APP-LOCAL-005: with no port left to try, it says which ports were busy (#214)', async () => {
    const second = createDemoServer(served);
    await expect(listen(second, { port, attempts: 1 })).rejects.toThrow(
      new RegExp(`port ${port} is in use`, 'i')
    );
  });
});

describe('resolveServedFile', () => {
  const root = path.resolve('/srv/demo');

  it('APP-LOCAL-004: resolves a path inside the directory and nothing outside it (#214)', () => {
    expect(resolveServedFile(root, '/adsl.csv')).toBe(path.join(root, 'adsl.csv'));
    expect(resolveServedFile(root, '/renamed/dm.csv')).toBe(path.join(root, 'renamed', 'dm.csv'));
    expect(resolveServedFile(root, '/')).toBe(root);
    expect(resolveServedFile(root, '/../demo-private/secret.txt')).toBeNull();
    expect(resolveServedFile(root, '/..')).toBeNull();
    expect(resolveServedFile(root, '/a/../../b')).toBeNull();
  });
});

describe('readRequestPath', () => {
  it('APP-LOCAL-004: drops the query, decodes once, and reads a backslash as a separator, so a climb written with one is seen as a climb (#214)', () => {
    expect(readRequestPath('/adsl.csv?v=1#top')).toBe('/adsl.csv');
    expect(readRequestPath('/a%20b.csv')).toBe('/a b.csv');
    expect(readRequestPath('/..%5csecret.txt')).toBe('/../secret.txt');
    expect(readRequestPath('/..\\..\\secret.txt')).toBe('/../../secret.txt');
    // Decoded once: a doubly encoded dot stays a literal percent sign and digits.
    expect(readRequestPath('/%252e%252e/secret.txt')).toBe('/%2e%2e/secret.txt');
    const root = path.resolve('/srv/demo');
    expect(resolveServedFile(root, readRequestPath('/..%5csecret.txt'))).toBeNull();
  });

  it('APP-LOCAL-004: a path that cannot be decoded, holds a null, or does not start at the root is no path (#214)', () => {
    expect(readRequestPath('/%E0%A4%A')).toBeNull();
    expect(readRequestPath('/%00')).toBeNull();
    expect(readRequestPath('*')).toBeNull();
    expect(readRequestPath('http://other.example/adsl.csv')).toBeNull();
  });
});

describe('isLocalHost', () => {
  it('APP-LOCAL-003: only this machine’s own names, with or without a port (#214)', () => {
    for (const host of ['127.0.0.1', '127.0.0.1:8642', 'localhost:8642', '[::1]:8642']) {
      expect(isLocalHost(host), host).toBe(true);
    }
    for (const host of [undefined, '', 'example.com', '127.0.0.1.example.com', '127.0.0.1:x']) {
      expect(isLocalHost(host), String(host)).toBe(false);
    }
  });
});

describe('contentType', () => {
  it('APP-LOCAL-003: names a type for every kind of file the demo directory holds (#214)', () => {
    expect(contentType('safety.viz-app.js.map')).toBe('application/json; charset=utf-8');
    expect(contentType('LICENSE-ibm-plex-mono.txt')).toBe('text/plain; charset=utf-8');
    expect(contentType('STATISTICS.R')).toBe('text/plain; charset=utf-8');
    expect(contentType('unknown.bin')).toBe('application/octet-stream');
  });
});
