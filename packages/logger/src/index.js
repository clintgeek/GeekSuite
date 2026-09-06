'use strict';

/**
 * @geeksuite/logger
 *
 * The pino setup that basegeek, bujogeek, fitnessgeek, flockgeek, storygeek,
 * notegeek and bookgeek each hand-rolled independently — same level/env
 * logic, same dev pretty-print switch, same pino-http request-id wiring.
 * None of the originals redacted anything, so the redaction here (auth
 * headers, cookies, api keys, password/apiKey body fields) and the
 * health-check quieting in `createHttpLogger` are new, additive hardening —
 * not a preserved behavior — everything else (levels, pretty switch,
 * genReqId, shutdown signal handling/timeout shape) matches every backend's
 * prior module line for line.
 *
 * Written as plain CommonJS (no "type": "module") so it loads the same way
 * `@geeksuite/user` does across the suite: ESM backends `import { x } from
 * '@geeksuite/logger'` (Node's CJS/ESM interop statically reads the named
 * `module.exports` below), and fitnessgeek — the one CJS backend — can
 * `require('@geeksuite/logger')` directly. A "type": "module" package could
 * not be `require()`-d by fitnessgeek at all.
 */

const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('node:crypto');

/**
 * Redaction paths applied to every logger this package creates. Union of
 * what a pino-http setup should never write in the clear: the auth header,
 * cookies in both directions, API keys (header + body), and password
 * fields. Nothing in the six backends redacted any of this before — see the
 * module header.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.apiKey',
];

/* ---------------------------------------------------------------------------
 * The err serializer — why this package needs one
 * -------------------------------------------------------------------------*/

/**
 * Every backend logs failures as `logger.error({ err }, '…')`, and a large
 * share of those failures are axios rejections: `attachUser()` validating a
 * token against basegeek, the six `/auth/{refresh,logout}` proxies, the food
 * APIs, `baseGeekAIService`. An axios error is not a tidy `Error` — it hangs
 * `config`, `request` and `response` off itself as **own enumerable
 * properties**, and pino's standard `err` serializer copies own enumerable
 * properties verbatim.
 *
 * Measured, on a real axios 401 (2026-09-05): one `logger.error({ err })` call
 * wrote 9.5 KB containing the caller's `Authorization: Bearer …` in three
 * separate places (`err.config.headers`, `err.request._header`,
 * `err.request._redirectable._options.headers`), the replayed `Cookie` header
 * in two, the upstream `set-cookie` in two, and the outbound request body —
 * which on the login/register proxies is the user's password — in two more.
 *
 * A redaction path list cannot win that game: `err.request` is a live
 * `ClientRequest`, and its internals are node's to rename. So the serializer
 * drops the transport objects instead of trying to censor them, and keeps the
 * three things a reader of the log actually wants: which call, what status,
 * what the far end said.
 *
 * Non-axios errors are unaffected — no `config`/`request`/`response`, nothing
 * to strip — and a non-object `err` (several call sites log `{ err:
 * err.message }`) passes straight through.
 */

/** Fields of an axios `config` that are safe and worth keeping. */
const SAFE_CONFIG_KEYS = ['method', 'url', 'baseURL', 'timeout'];

function summarizeConfig(config) {
  if (!config || typeof config !== 'object') return undefined;
  const out = {};
  for (const key of SAFE_CONFIG_KEYS) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  // Deliberately absent: `headers` (Authorization / Cookie / X-API-Key) and
  // `data` (the outbound body — a password on the login proxies, a
  // client_secret on the OAuth exchanges).
  return out;
}

function summarizeResponse(response) {
  if (!response || typeof response !== 'object') return undefined;
  const out = {};
  if (response.status !== undefined) out.status = response.status;
  if (response.statusText !== undefined) out.statusText = response.statusText;
  // The *error body* is the useful half and carries no credential of ours;
  // `response.headers` (set-cookie), `response.config` (a second copy of the
  // request headers) and `response.request` (the ClientRequest again) do, and
  // are dropped.
  if (response.data !== undefined) out.data = response.data;
  return out;
}

/**
 * pino `err` serializer: the standard one, with axios's transport objects
 * replaced by safe summaries. Exported so a consumer that builds its own pino
 * instance can reuse it.
 */
function serializeError(err) {
  if (!err || typeof err !== 'object') return err;

  const base = pino.stdSerializers.err(err);
  if (!base || typeof base !== 'object') return base;

  // `request` is a whole ClientRequest tree: raw request line and headers in
  // `_header`, another copy in `_redirectable._options.headers`, the response
  // in `res.rawHeaders`. Nothing in it is worth a log line.
  if ('request' in base) delete base.request;
  if ('config' in base) base.config = summarizeConfig(base.config);
  if ('response' in base) base.response = summarizeResponse(base.response);

  return base;
}

/** Paths that log at all only on error, to keep uptime probes out of the noise. */
const DEFAULT_QUIET_PATHS = ['/api/health', '/health'];

/**
 * Build a pino logger.
 *
 * @param {object} [opts]
 * @param {string} [opts.name] - included as pino's top-level `name` binding.
 *   None of the original per-app loggers set this; it's additive.
 * @param {string} [opts.level] - explicit level override. Falls back to
 *   `LOG_LEVEL`, then `debug` in dev / `info` in production — exactly the
 *   precedence every original logger.js used.
 * @param {boolean} [opts.pretty] - force pino-pretty on/off. Defaults to the
 *   same `NODE_ENV !== 'production'` check every original module used.
 * @param {NodeJS.WritableStream} [opts.destination] - test-only escape
 *   hatch: write to this stream instead of stdout. Ignored when `pretty` is
 *   on, since pino-pretty owns its own transport destination. No backend
 *   needs this; it exists so tests can assert on log output without
 *   scraping stdout.
 */
function createLogger({ name, level, pretty, destination } = {}) {
  const isDev = process.env.NODE_ENV !== 'production';
  const usePretty = pretty === undefined ? isDev : pretty;

  const options = {
    ...(name ? { name } : {}),
    level: level || process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    // See serializeError(): an axios rejection logged as `{ err }` otherwise
    // writes the caller's bearer token, the replayed cookie and the outbound
    // request body into the log, three times each.
    serializers: { err: serializeError },
    ...(usePretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  };

  return destination && !usePretty ? pino(options, destination) : pino(options);
}

/**
 * Build the pino-http request-logging middleware every backend wires up
 * with `app.use((req, res, next) => { httpLogger(req, res); ...})`.
 *
 * Same `genReqId` every backend used (`x-request-id` header, else a fresh
 * UUID). Adds an `autoLogging.ignore` filter so health-check polling
 * (`/api/health`, `/health`) doesn't spam every backend's logs on every
 * probe interval — none of the originals had this, so it's new quieting,
 * not a preserved behavior.
 *
 * @param {import('pino').Logger} logger
 * @param {object} [opts]
 * @param {string[]} [opts.quietPaths] - request paths to skip auto-logging
 *   for (default: `/api/health`, `/health`). Matched against the URL with
 *   any querystring stripped.
 * @param {...*} [opts.*] - anything else is passed straight through to
 *   `pino-http` (e.g. a caller-supplied `genReqId` or `autoLogging`
 *   override wins over the defaults below).
 */
function createHttpLogger(logger, opts = {}) {
  const { quietPaths, ...pinoHttpOpts } = opts;
  const quiet = new Set(quietPaths || DEFAULT_QUIET_PATHS);

  return pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
    autoLogging: {
      ignore: (req) => quiet.has((req.url || '').split('?')[0]),
    },
    ...pinoHttpOpts,
  });
}

/**
 * Wire SIGTERM/SIGINT into a graceful shutdown: log the signal, force-exit
 * if a second signal arrives mid-shutdown or if close takes too long, close
 * the HTTP server, then run the caller's own cleanup (closing DB
 * connections, stopping background jobs, etc.) before exiting.
 *
 * Mirrors basegeek's `shutdown()` shape (the most complete original:
 * re-entrancy guard, 15s force-exit timer, `server.close()`, then
 * best-effort cleanup) generalized so any backend's app-specific cleanup
 * goes through the single `onClose` hook instead of being copied inline.
 *
 * @param {import('pino').Logger} logger
 * @param {import('http').Server} server
 * @param {object} [opts]
 * @param {() => (void | Promise<void>)} [opts.onClose] - app-specific
 *   cleanup (closing Mongo/Redis, stopping schedulers, ...). Errors are
 *   caught and logged, never left to crash the shutdown.
 * @param {number} [opts.timeoutMs] - force-exit timeout (default 15000, the
 *   value every original hand-rolled shutdown used).
 * @returns {(signal: string) => void} the shutdown function, already
 *   registered on SIGTERM/SIGINT — returned mainly so tests can call it
 *   directly without sending a real signal.
 */
function installShutdownHooks(logger, server, { onClose, timeoutMs = 15_000 } = {}) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${signal} received during shutdown — forcing exit`);
      process.exit(1);
      return;
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceTimer = setTimeout(() => {
      logger.error(`Shutdown timed out after ${Math.round(timeoutMs / 1000)}s — forcing exit`);
      process.exit(0);
    }, timeoutMs);
    forceTimer.unref();

    server.close(async () => {
      if (typeof onClose === 'function') {
        try {
          await onClose();
        } catch (err) {
          logger.error({ err }, 'Error during shutdown cleanup');
        }
      }
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return shutdown;
}

module.exports = {
  createLogger,
  createHttpLogger,
  installShutdownHooks,
  serializeError,
  REDACT_PATHS,
  DEFAULT_QUIET_PATHS,
};
