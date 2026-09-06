import http from 'node:http';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createHttpLogger,
  createLogger,
  DEFAULT_QUIET_PATHS,
  REDACT_PATHS,
  serializeError,
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

describe('createLogger err serializer — axios rejections', () => {
  /**
   * A stand-in with the same *own enumerable* properties a real axios error
   * carries, because those are precisely what pino's standard `err`
   * serializer copies verbatim. Measured against a real axios 401 on
   * 2026-09-05: one `logger.error({ err })` wrote 9.5 KB and repeated the
   * bearer token three times (`config.headers`, `request._header`,
   * `request._redirectable._options.headers`), the cookie twice and the
   * outbound body twice. The nesting below mirrors those exact paths.
   */
  function axiosLikeError() {
    const err = new Error('Request failed with status code 401');
    err.name = 'AxiosError';
    err.isAxiosError = true;
    err.code = 'ERR_BAD_REQUEST';
    err.status = 401;
    const config = {
      method: 'post',
      url: 'https://basegeek.clintgeek.com/api/auth/login',
      timeout: 8000,
      headers: {
        Authorization: 'Bearer SUPERSECRETJWT',
        Cookie: 'geek_token=COOKIEVALUE',
        'X-CSRF-Token': 'CSRFVALUE',
      },
      data: '{"password":"hunter2"}',
    };
    err.config = config;
    err.request = {
      _header: 'POST /api/auth/login HTTP/1.1\r\nAuthorization: Bearer SUPERSECRETJWT\r\n',
      _redirectable: { _options: { headers: { Authorization: 'Bearer SUPERSECRETJWT' } } },
      res: { rawHeaders: ['set-cookie', 'geek_token=UPSTREAMCOOKIE'] },
    };
    err.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: { message: 'Invalid credentials' },
      headers: { 'set-cookie': ['geek_token=UPSTREAMCOOKIE'] },
      config,
      request: err.request,
    };
    return err;
  }

  function logError(err) {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });
    logger.error({ err }, 'call failed');
    return { entry: lines[0], raw: JSON.stringify(lines[0]) };
  }

  it('writes no bearer token, cookie, CSRF token or request body anywhere in the line', () => {
    const { raw } = logError(axiosLikeError());

    expect(raw).not.toContain('SUPERSECRETJWT');
    expect(raw).not.toContain('COOKIEVALUE');
    expect(raw).not.toContain('CSRFVALUE');
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('UPSTREAMCOOKIE');
  });

  it('drops the ClientRequest tree entirely', () => {
    const { entry } = logError(axiosLikeError());
    expect(entry.err.request).toBeUndefined();
  });

  it('keeps which call it was, what status came back, and what the far end said', () => {
    const { entry } = logError(axiosLikeError());

    expect(entry.err.message).toBe('Request failed with status code 401');
    expect(entry.err.code).toBe('ERR_BAD_REQUEST');
    expect(entry.err.stack).toBeTruthy();
    expect(entry.err.config).toEqual({
      method: 'post',
      url: 'https://basegeek.clintgeek.com/api/auth/login',
      timeout: 8000,
    });
    expect(entry.err.response).toEqual({
      status: 401,
      statusText: 'Unauthorized',
      data: { message: 'Invalid credentials' },
    });
  });

  it('leaves a plain Error untouched', () => {
    const { entry } = logError(new Error('mongo went away'));
    expect(entry.err.type).toBe('Error');
    expect(entry.err.message).toBe('mongo went away');
    expect(entry.err.stack).toBeTruthy();
    expect(entry.err.config).toBeUndefined();
  });

  it('passes a non-object err straight through — several call sites log err.message', () => {
    const { stream, lines } = makeCollector();
    const logger = createLogger({ pretty: false, destination: stream });
    logger.warn({ err: 'Redis connection failed' }, 'cache off');
    expect(lines[0].err).toBe('Redis connection failed');
  });

  it('serializeError is exported so a consumer building its own pino can reuse it', () => {
    const out = serializeError(axiosLikeError());
    expect(out.request).toBeUndefined();
    expect(out.config.headers).toBeUndefined();
    expect(out.config.data).toBeUndefined();
    expect(out.response.headers).toBeUndefined();
    expect(serializeError('a string')).toBe('a string');
    expect(serializeError(null)).toBe(null);
  });
});
