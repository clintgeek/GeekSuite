import http from 'node:http';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createHttpLogger,
  createLogger,
  DEFAULT_QUIET_PATHS,
  REDACT_PATHS,
} from '../index.js';

/** Collects newline-delimited JSON log lines written to a fake destination. */
function makeCollector() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => lines.push(JSON.parse(line)));
      cb();
    },
  });
  return { stream, lines };
}

function get(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('createLogger redaction', () => {
  it('redacts authorization, cookie, x-api-key request headers and set-cookie response headers', () => {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer super-secret-token',
            cookie: 'session=abc123',
            'x-api-key': 'sk-should-not-appear',
          },
        },
        res: {
          headers: { 'set-cookie': 'session=xyz; HttpOnly' },
        },
      },
      'test log',
    );

    expect(lines).toHaveLength(1);
    const [entry] = lines;
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(entry.req.headers.cookie).toBe('[Redacted]');
    expect(entry.req.headers['x-api-key']).toBe('[Redacted]');
    expect(entry.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('redacts req.body.password and req.body.apiKey without touching other body fields', () => {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });

    logger.info(
      {
        req: {
          body: { password: 'hunter2', apiKey: 'another-secret', username: 'chef' },
        },
      },
      'body log',
    );

    const [entry] = lines;
    expect(entry.req.body.password).toBe('[Redacted]');
    expect(entry.req.body.apiKey).toBe('[Redacted]');
    expect(entry.req.body.username).toBe('chef');
  });

  it('exports the redaction path list so consumers can see what is covered', () => {
    expect(REDACT_PATHS).toEqual([
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'res.headers["set-cookie"]',
      'req.headers["x-api-key"]',
      'req.body.password',
      'req.body.apiKey',
    ]);
  });

  it('keeps the dev debug / production info level split, LOG_LEVEL still wins', () => {
    const isDevLogger = createLogger({ pretty: false });
    expect(['debug', 'info']).toContain(isDevLogger.level);

    const explicit = createLogger({ pretty: false, level: 'warn' });
    expect(explicit.level).toBe('warn');
  });
});

describe('createHttpLogger health-check quieting', () => {
  let server;

  afterEach(() => {
    server?.close();
  });

  it('skips auto-logging for /api/health and /health but logs other routes', async () => {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });
    const httpLogger = createHttpLogger(logger);

    server = http.createServer((req, res) => {
      httpLogger(req, res);
      res.end('ok');
    });
    await new Promise((resolve) => server.listen(0, resolve));

    await get(server, '/api/health');
    await get(server, '/health');
    await get(server, '/api/users');

    const completed = lines.filter((l) => l.msg === 'request completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].req.url).toBe('/api/users');
  });

  it('respects a caller-supplied quietPaths override', async () => {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });
    const httpLogger = createHttpLogger(logger, { quietPaths: ['/api/users'] });

    server = http.createServer((req, res) => {
      httpLogger(req, res);
      res.end('ok');
    });
    await new Promise((resolve) => server.listen(0, resolve));

    // /api/health is no longer in the quiet list, so it should log now.
    await get(server, '/api/health');
    await get(server, '/api/users');

    const completed = lines.filter((l) => l.msg === 'request completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].req.url).toBe('/api/health');
  });

  it('DEFAULT_QUIET_PATHS covers /api/health and /health', () => {
    expect(DEFAULT_QUIET_PATHS).toEqual(['/api/health', '/health']);
  });
});
