// The server `npm run demo` starts (#214): the demo app's directory, served to
// the browser on the machine it runs on. Written here on Node's own modules so
// running the demo installs nothing more.
//
// It answers this machine only (127.0.0.1) and only when asked by that name,
// reads and never writes (GET and HEAD), and serves no file outside the
// directory it was given: not by a path that climbs out of it, and not by a
// link inside it that points out of it.

import http from 'node:http';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/** The address the server answers on: this machine and no other. */
export const HOST = '127.0.0.1';

const TEXT = '; charset=utf-8';
const TYPES = {
  '.html': `text/html${TEXT}`,
  '.js': `text/javascript${TEXT}`,
  '.mjs': `text/javascript${TEXT}`,
  '.css': `text/css${TEXT}`,
  '.csv': `text/csv${TEXT}`,
  '.json': `application/json${TEXT}`,
  '.map': `application/json${TEXT}`,
  '.txt': `text/plain${TEXT}`,
  '.r': `text/plain${TEXT}`,
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

/**
 * The content type a file is served with, from its extension.
 * @param {string} file The file's name or path.
 * @returns {string} The type; `application/octet-stream` for an unknown extension.
 */
export const contentType = (file) =>
  TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * The path a request asks for, as the server reads it: the address less any
 * query, decoded once, with a backslash read as a separator, as Windows reads
 * it, so that no path means one thing here and another to the file system.
 * @param {string} url The request's address, as sent.
 * @returns {?string} The path, starting with `/`; null when it cannot be read as one.
 */
export function readRequestPath(url) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(String(url).split(/[?#]/)[0]).replace(/\\/g, '/');
  } catch {
    return null;
  }
  return requestPath.startsWith('/') && !requestPath.includes('\0') ? requestPath : null;
}

/**
 * Whether a request names this machine as its host. A page on another site
 * can be pointed at 127.0.0.1 by a name of its own; a request under such a
 * name is refused, so only a page opened at this machine's address reads the
 * demo.
 * @param {string|undefined} host The request's Host header.
 * @returns {boolean} Whether it is 127.0.0.1 or localhost, with or without a port.
 */
export const isLocalHost = (host) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host || '');

/**
 * The file a request path names, if it is inside the served directory.
 * @param {string} rootDir The served directory, absolute.
 * @param {string} requestPath The request's path, already decoded, starting with `/`.
 * @returns {?string} The absolute path, or null when it leads outside the directory.
 */
export function resolveServedFile(rootDir, requestPath) {
  const file = path.resolve(rootDir, `.${path.sep}${requestPath}`);
  // A sibling whose name starts with the directory's is outside it, so the
  // comparison ends at a separator.
  return file === rootDir || file.startsWith(rootDir + path.sep) ? file : null;
}

const statOf = (file) => {
  try {
    return statSync(file);
  } catch {
    return null;
  }
};

// Where a path leads once every link in it is followed; null when it leads nowhere.
const realOf = (file) => {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
};

/**
 * A server for one directory.
 * @param {string} dir The directory to serve.
 * @returns {import('node:http').Server} The server, not yet listening.
 */
export function createDemoServer(dir) {
  const rootDir = path.resolve(dir);
  const inside = (file) => {
    const root = realOf(rootDir);
    const real = realOf(file);
    return Boolean(root && real && (real === root || real.startsWith(root + path.sep)));
  };
  return http.createServer((request, response) => {
    const answer = (status, text, headers = {}) => {
      response.writeHead(status, {
        'Content-Type': `text/plain${TEXT}`,
        'Content-Length': Buffer.byteLength(text),
        'X-Content-Type-Options': 'nosniff',
        ...headers
      });
      response.end(request.method === 'HEAD' ? undefined : text);
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return answer(405, 'This server only reads: GET and HEAD.\n', { Allow: 'GET, HEAD' });
    }

    if (!isLocalHost(request.headers.host)) {
      return answer(403, 'This server answers only at 127.0.0.1 and localhost.\n');
    }

    const requestPath = readRequestPath(request.url);
    if (requestPath === null) return answer(400, 'That address cannot be read.\n');

    let file = resolveServedFile(rootDir, requestPath);
    if (!file) return answer(403, 'That is outside the demo.\n');
    let stat = statOf(file);
    // An address ending in a slash is a directory's page and nothing else: a
    // directory without the slash is not served, because the page's own links
    // are relative and would resolve against the wrong directory.
    const asDirectory = requestPath.endsWith('/');
    if (stat && stat.isDirectory() === asDirectory) {
      if (asDirectory) {
        file = path.join(file, 'index.html');
        stat = statOf(file);
      }
    } else {
      stat = null;
    }
    if (!stat || !stat.isFile()) return answer(404, 'There is no such file in the demo.\n');
    // A link inside the directory that leads out of it is outside it.
    if (!inside(file)) return answer(403, 'That is outside the demo.\n');

    response.writeHead(200, {
      'Content-Type': contentType(file),
      'Content-Length': stat.size,
      // A rebuilt demo is the one shown.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    return stream.pipe(response);
  });
}

const tryListen = (server, port) =>
  new Promise((resolve, reject) => {
    const failed = (error) => {
      server.off('listening', listening);
      reject(error);
    };
    const listening = () => {
      server.off('error', failed);
      resolve(server.address().port);
    };
    server.once('error', failed);
    server.once('listening', listening);
    server.listen(port, HOST);
  });

/**
 * Start a server listening on this machine, stepping past a port already in use.
 * @param {import('node:http').Server} server The server.
 * @param {Object} [options] Listen options.
 * @param {number} [options.port] The first port to try; 0 for any free port.
 * @param {number} [options.attempts] How many ports to try, counting up from the first.
 * @returns {Promise<number>} The port the server is answering on.
 */
export async function listen(server, { port = 0, attempts = 20 } = {}) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = port === 0 ? 0 : port + offset;
    if (candidate > 65535) break;
    try {
      return await tryListen(server, candidate);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  const last = Math.min(port + attempts - 1, 65535);
  throw new Error(
    attempts === 1 || last === port
      ? `Port ${port} is in use. Name another with --port.`
      : `Every port from ${port} to ${last} is in use. Name another with --port.`
  );
}
