'use strict';

/**
 * csrfGuard — origin-checking CSRF middleware for GeekSuite's cookie auth.
 *
 * ## Why this exists
 *
 * Every GeekSuite app authenticates with the SSO cookies basegeek sets on
 * `.clintgeek.com` (`geek_token`, `geek_refresh_token`), and every backend
 * runs `cors({ credentials: true })`. That combination means the browser
 * attaches the caller's session to any request aimed at any suite backend,
 * including a request a third-party page caused. The cookies are
 * `SameSite=lax` (see apps/basegeek/packages/api/src/routes/auth.js), which
 * already stops a cross-site *subresource* POST from carrying them — but
 * "already stopped by a cookie attribute we could change in one line" is not
 * a control, it is a coincidence. This middleware makes the rule explicit,
 * testable, and independent of the cookie attributes.
 *
 * ## What it does
 *
 * For an unsafe method (POST/PUT/PATCH/DELETE) on a request that actually
 * carries an auth cookie, it requires that the request's browser-asserted
 * origin be on the app's allow-list:
 *
 *   1. Read `Origin`. If absent, fall back to the origin of `Referer`.
 *   2. Origin present and on the allow-list  → pass.
 *   3. Origin present and NOT on the allow-list → 403
 *      `{ error: 'csrf_origin_rejected' }`, logged at `warn`.
 *   4. Neither header present → pass, logged at `debug`.
 *
 * Both headers are set by the browser and cannot be forged by page
 * JavaScript, which is what makes (3) meaningful.
 *
 * ## Why step 4 passes rather than rejects
 *
 * `Origin` and `Referer` are browser constructs. Non-browser clients —
 * `curl`, server-to-server calls, container healthchecks, supertest, the
 * `/graphql` reverse proxies that forward `cookie` but not `Origin` — send
 * neither, and legitimately so. Rejecting them would break the suite's own
 * plumbing while stopping no attack: the attack this guard exists to stop is
 * *by definition* mounted from a browser page, and a browser always sends at
 * least one of the two on a cross-origin mutation. A client that can omit
 * `Origin` entirely is a client that can already set `Authorization`
 * directly and does not need the victim's cookie.
 *
 * ## What it does NOT do
 *
 * This is an origin allow-list, not a per-request token. It cannot
 * distinguish "your app's real page" from "your app's page running attacker
 * JavaScript", so an XSS on an allow-listed origin still gets to make
 * mutations. It closes third-party CSRF everywhere, and closes sibling-
 * subdomain CSRF against the six consumer backends (each of those allow-lists
 * only its own origin). It cannot close sibling-subdomain CSRF against
 * basegeek, whose allow-list has to contain every app origin because every
 * app's frontend calls its GraphQL API. Closing that last case needs a
 * double-submit token; see DOCS/SSO_OVERVIEW.md § CSRF.
 *
 * ## Escape hatch
 *
 * `CSRF_GUARD=off` makes the guard a no-op (restart, no rebuild).
 * `CSRF_GUARD=report` logs what it *would* have rejected but lets it
 * through — use that for a soak before enforcing. Both are read once, when
 * the middleware is built, and announced in the boot log.
 *
 * An empty allow-list also disables the guard, loudly: a misconfigured
 * `CORS_ORIGINS` must not turn into "every mutation in production returns
 * 403".
 *
 * @example
 *   const { csrfGuard } = require('@geeksuite/user/server');
 *   app.use(cookieParser());
 *   app.use(csrfGuard({ allowedOrigins, logger }));
 *   // ...routes after this point
 */

/** Methods that cannot change state, per RFC 9110. Never guarded. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/** The SSO cookies whose presence makes a request CSRF-relevant. */
const DEFAULT_AUTH_COOKIES = ['geek_token', 'geek_refresh_token'];

const MODE_ENFORCE = 'enforce';
const MODE_REPORT = 'report';
const MODE_OFF = 'off';

/**
 * Reduce a URL or origin string to its `scheme://host[:port]` form.
 * Returns null for anything that isn't a parseable absolute URL.
 */
function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!url.protocol || !url.host) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Read the mode from the environment. Anything falsy/unrecognized means
 * "enforce", so a typo fails safe (guarded) rather than open.
 */
function resolveMode(rawValue) {
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (!value) return MODE_ENFORCE;
  if (['off', 'false', '0', 'no', 'disabled'].includes(value)) return MODE_OFF;
  if (['report', 'report-only', 'reportonly', 'dryrun', 'dry-run'].includes(value)) return MODE_REPORT;
  return MODE_ENFORCE;
}

/** A logger that swallows everything, for callers that pass none. */
const SILENT_LOGGER = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

function loggerOrSilent(candidate) {
  if (!candidate) return SILENT_LOGGER;
  const needed = ['error', 'warn', 'info', 'debug'];
  if (needed.every((m) => typeof candidate[m] === 'function')) return candidate;
  return SILENT_LOGGER;
}

/**
 * Turn the `allowedOrigins` option into a predicate.
 * Accepts an array of origin strings, a single string, or a predicate
 * (bookgeek's CORS check is a function over `*.clintgeek.com`, and the point
 * of accepting one is that no app grows a second, drifting allow-list).
 */
function buildAllowPredicate(allowedOrigins) {
  if (typeof allowedOrigins === 'function') {
    return { test: (origin) => allowedOrigins(origin) === true, size: null };
  }
  const list = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : (allowedOrigins ? [allowedOrigins] : []);
  const set = new Set(list.map(normalizeOrigin).filter(Boolean));
  return { test: (origin) => set.has(origin), size: set.size };
}

/**
 * True if any of `cookieNames` is present with a non-empty value.
 *
 * Deliberately cookie-only: an `Authorization: Bearer` header is not a CSRF
 * vector, because a cross-site page cannot make the browser attach one
 * (a custom header forces a preflight, which CORS then refuses). Guarding
 * bearer-only requests would only break API and server-to-server clients.
 *
 * Reads `req.cookies` when cookie-parser has run, and falls back to the raw
 * header so the guard works in backends that mount no cookie parser
 * (bujogeek) or mount it after this middleware.
 */
function hasAuthCookie(req, cookieNames) {
  const parsed = req.cookies;
  if (parsed && typeof parsed === 'object') {
    for (const name of cookieNames) {
      if (parsed[name]) return true;
    }
  }

  const header = req.headers?.cookie;
  if (typeof header !== 'string' || !header) return false;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
    if (!cookieNames.includes(key)) continue;
    const value = idx >= 0 ? trimmed.slice(idx + 1) : '';
    if (value !== '') return true;
  }

  return false;
}

/**
 * Resolve the browser-asserted origin of a request.
 *
 * @returns {{ origin: string|null, source: 'origin'|'referer'|'none', raw?: string, opaque?: boolean, unparseable?: boolean }}
 */
function resolveRequestOrigin(req) {
  const rawOrigin = req.headers?.origin;
  if (typeof rawOrigin === 'string' && rawOrigin.trim()) {
    const raw = rawOrigin.trim();
    // A literal "null" is what a browser sends for an *opaque* origin — a
    // sandboxed iframe, a `data:`/`blob:` document, some cross-site redirect
    // chains. It is a real browser assertion, and it asserts "not one of
    // your origins", so it is rejected rather than treated as absent.
    if (raw.toLowerCase() === 'null') {
      return { origin: 'null', source: 'origin', raw, opaque: true };
    }
    const normalized = normalizeOrigin(raw);
    if (normalized) return { origin: normalized, source: 'origin', raw };
    // Present but not a URL. A real browser never does this; treat it as an
    // assertion we cannot match against the allow-list, i.e. reject.
    return { origin: raw.toLowerCase(), source: 'origin', raw, unparseable: true };
  }

  const rawReferer = req.headers?.referer ?? req.headers?.referrer;
  if (typeof rawReferer === 'string' && rawReferer.trim()) {
    const raw = rawReferer.trim();
    const normalized = normalizeOrigin(raw);
    if (normalized) return { origin: normalized, source: 'referer', raw };
    // A garbage Referer carries no usable origin. Unlike a garbage Origin,
    // Referer is routinely rewritten by proxies and privacy tooling, so this
    // is treated as "no evidence" (pass) and logged loudly rather than
    // turned into a 403.
    return { origin: null, source: 'referer', raw, unparseable: true };
  }

  return { origin: null, source: 'none' };
}

function pathIsExempt(reqPath, exemptPaths) {
  for (const rule of exemptPaths) {
    if (rule instanceof RegExp) {
      if (rule.test(reqPath)) return true;
    } else if (typeof rule === 'string' && rule) {
      if (reqPath === rule || reqPath.startsWith(rule.endsWith('/') ? rule : `${rule}/`)) return true;
    }
  }
  return false;
}

/**
 * Build the CSRF origin guard.
 *
 * @param {object} [options]
 * @param {string[]|string|((origin: string) => boolean)} [options.allowedOrigins]
 *   The app's CORS origin allow-list — pass the *same* value the app's
 *   `cors()` config uses, never a second copy.
 * @param {object} [options.logger] pino-style logger (error/warn/info/debug).
 * @param {string[]} [options.cookieNames] auth cookies to look for.
 *   Default: `['geek_token', 'geek_refresh_token']`.
 * @param {(string|RegExp)[]} [options.exemptPaths] paths never guarded.
 *   Strings match exactly or as a `/`-delimited prefix.
 * @param {string} [options.mode] 'enforce' | 'report' | 'off'. Overrides the
 *   `CSRF_GUARD` env var; intended for tests.
 * @param {string} [options.appName] label used in log lines.
 * @param {NodeJS.ProcessEnv} [options.env] env source (default `process.env`).
 * @returns {(req, res, next) => void} Express middleware.
 */
function csrfGuard(options = {}) {
  const {
    allowedOrigins = [],
    logger,
    cookieNames = DEFAULT_AUTH_COOKIES,
    exemptPaths = [],
    mode: modeOverride,
    appName = 'geeksuite',
    env = process.env,
  } = options;

  const log = loggerOrSilent(logger);
  const mode = modeOverride ? resolveMode(modeOverride) : resolveMode(env.CSRF_GUARD);
  const allow = buildAllowPredicate(allowedOrigins);

  if (mode === MODE_OFF) {
    log.warn(
      { app: appName, csrfGuard: 'off' },
      'CSRF guard DISABLED by CSRF_GUARD=off — cookie-authenticated mutations are not origin-checked',
    );
    return function csrfGuardDisabled(req, res, next) {
      return next();
    };
  }

  // An empty allow-list would reject every browser mutation. That is an
  // outage, not a security posture, so refuse to enforce and say why.
  if (allow.size === 0) {
    log.error(
      { app: appName, csrfGuard: 'inert' },
      'CSRF guard has an EMPTY origin allow-list — running inert. Check CORS_ORIGINS/CORS_ORIGIN for this app',
    );
    return function csrfGuardInert(req, res, next) {
      return next();
    };
  }

  log.info(
    {
      app: appName,
      csrfGuard: mode,
      allowedOrigins: allow.size === null ? 'predicate' : allow.size,
      cookieNames,
      exemptPaths: exemptPaths.map(String),
    },
    mode === MODE_REPORT
      ? 'CSRF guard in report-only mode — disallowed origins are logged, not blocked'
      : 'CSRF guard enforcing origin allow-list on cookie-authenticated mutations',
  );

  return function csrfGuardMiddleware(req, res, next) {
    const method = String(req.method || '').toUpperCase();
    if (SAFE_METHODS.has(method)) return next();

    const reqPath = req.path || (req.originalUrl || req.url || '').split('?')[0];
    if (exemptPaths.length && pathIsExempt(reqPath, exemptPaths)) return next();

    // No session cookie → nothing for an attacker to ride on.
    if (!hasAuthCookie(req, cookieNames)) return next();

    // Prefer the per-request logger (pino-http's req.log carries the request
    // id) and fall back to the app logger when there is none.
    const perRequestLog = loggerOrSilent(req.log);
    const reqLog = perRequestLog === SILENT_LOGGER ? log : perRequestLog;
    const { origin, source, raw, opaque, unparseable } = resolveRequestOrigin(req);

    if (origin === null) {
      reqLog.debug(
        { app: appName, method, path: reqPath, originSource: source, ...(raw ? { raw } : {}) },
        source === 'referer'
          ? 'CSRF guard: unparseable Referer and no Origin — treating as a non-browser client and allowing'
          : 'CSRF guard: no Origin or Referer — treating as a non-browser client and allowing',
      );
      if (source === 'referer' && unparseable) {
        reqLog.warn(
          { app: appName, method, path: reqPath, referer: raw },
          'CSRF guard: Referer present but not a URL',
        );
      }
      return next();
    }

    if (allow.test(origin)) return next();

    const detail = {
      app: appName,
      method,
      path: reqPath,
      origin,
      originSource: source,
      ...(opaque ? { opaqueOrigin: true } : {}),
      ...(unparseable ? { unparseableOrigin: true } : {}),
    };

    if (mode === MODE_REPORT) {
      reqLog.warn(detail, 'CSRF guard (report-only): would have rejected this request');
      return next();
    }

    reqLog.warn(detail, 'CSRF guard: rejected cookie-authenticated mutation from a disallowed origin');
    return res.status(403).json({ error: 'csrf_origin_rejected' });
  };
}

module.exports = {
  csrfGuard,
  // Exported for tests and for backends that need the same normalization.
  normalizeOrigin,
  SAFE_METHODS,
  DEFAULT_AUTH_COOKIES,
};
