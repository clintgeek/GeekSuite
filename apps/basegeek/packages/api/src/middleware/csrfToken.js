/**
 * csrfToken.js — basegeek's double-submit CSRF token.
 *
 * ## Why this exists, given we already have an Origin guard
 *
 * `csrfGuard()` (packages/user/src/server/csrfGuard.js, mounted first in
 * server.js) rejects a cookie-authenticated mutation whose browser-asserted
 * Origin is not on this app's CORS allow-list. That closes third-party CSRF
 * everywhere, and it closes sibling-subdomain CSRF against the six consumer
 * backends, because each of those allow-lists only its own origin.
 *
 * It cannot close sibling-subdomain CSRF against *basegeek*. basegeek's
 * allow-list has to contain every app origin — every frontend in the suite
 * calls this process's GraphQL API — and the SSO cookies are issued on
 * `domain=.clintgeek.com`, so the browser attaches them to a request from any
 * `*.clintgeek.com` page. An origin allow-list cannot tell "notegeek's real
 * page" from "notegeek's page with an injection on it", so any sibling app
 * that gets compromised inherits the ability to make credentialed,
 * state-changing calls to basegeek as the victim.
 *
 * This middleware adds the second factor an allow-list cannot provide: a
 * value the request has to *carry in a header*, which a cross-site page
 * cannot set (a custom header forces a CORS preflight, which the browser will
 * only clear for an origin this API has already approved) and which a plain
 * form-post or image-tag attack has no way to attach at all.
 *
 * ## The contract
 *
 *   Cookie:  geek_csrf=<43-char base64url>   (NOT HttpOnly — the page must
 *            read it), domain=.clintgeek.com, SameSite=Lax, Secure in prod,
 *            path=/, max-age 30d (the refresh-token lifetime).
 *   Header:  X-CSRF-Token: <the exact same value>
 *
 * Required on POST/PUT/PATCH/DELETE that authenticate *by cookie*. Issued and
 * rotated wherever the SSO cookies are (login, register, refresh — see
 * routes/auth.js) and back-filled by `ensureCsrfCookie()` on any request that
 * carries a session but no token yet, so a session created before this shipped
 * heals on its very next call instead of on its next login.
 *
 * ## What is exempt, and why it needs no exempt-list
 *
 * The check only fires when the request actually carries an SSO cookie. An
 * API-key client (`Authorization: Bearer bg_…` against /openai/v1 and the
 * key-authenticated /api/ai routes) and a JWT-bearer client send no cookie, so
 * they are exempt by construction rather than by a path list that could rot.
 *
 * Deliberately NOT keyed off the presence of a bearer header: basegeek's
 * `authenticateToken` is cookie-*first*, so "has a bearer header" would let a
 * caller opt out of the check by attaching a junk `Authorization` value while
 * still authenticating via the victim's cookie. Cookie presence is the only
 * gate.
 *
 * ## What it does NOT do
 *
 * A token cannot stop full script execution on an allow-listed origin. The
 * cookie is readable by any `*.clintgeek.com` page by design — that is how a
 * sibling app attaches the header — so an attacker who can run arbitrary JS on
 * a suite origin can read it and replay it, exactly as they could already read
 * any response the victim is entitled to. What this closes is everything
 * short of that: injected markup that cannot script, a hostile page hosted on
 * a `*.clintgeek.com` host that a wildcard rule lets through, a stale/looser
 * allow-list entry, and any future mount where the Origin guard is bypassed or
 * misconfigured. It is defense in depth, and the Origin guard stays in front
 * of it.
 *
 * ## Rollout lever
 *
 *   CSRF_TOKEN=report   (default) log every violation with app/method/path,
 *                       let it through. Soak here until the logs are clean.
 *   CSRF_TOKEN=enforce  403 { error: 'csrf_token_missing' | 'csrf_token_invalid' }
 *   CSRF_TOKEN=off      no-op.
 *
 * Unlike CSRF_GUARD, an unset or unrecognized value means *report*, not
 * enforce: this control is newly deployed and every direct caller of basegeek
 * has to grow the header before enforcing is safe. Flip to enforce once
 * `csrfToken` warnings have been absent from the logs for a day.
 */

import crypto from 'node:crypto';

/** The cookie the page reads and echoes back. */
export const CSRF_COOKIE_NAME = 'geek_csrf';

/** The header it echoes it in. Must also be on the CORS allowedHeaders list. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Methods that cannot change state, per RFC 9110. Never checked. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Non-secret request context for report-only lines, so a violation can be
 * traced to a client: which origin/referer page sent it, what UA, and which
 * credential shape it carried (cookie session vs bearer). Never the values.
 */
function callerContext(req) {
  const h = req.headers || {};
  const referer = typeof h.referer === 'string' ? h.referer.split('?')[0].slice(0, 200) : undefined;
  return {
    origin: typeof h.origin === 'string' ? h.origin.slice(0, 200) : undefined,
    referer,
    ua: typeof h['user-agent'] === 'string' ? h['user-agent'].slice(0, 160) : undefined,
    auth: h.authorization ? 'bearer' : (h.cookie ? 'cookie' : 'none'),
  };
}

/** The SSO cookies whose presence makes a request CSRF-relevant. */
export const DEFAULT_AUTH_COOKIES = ['geek_token', 'geek_refresh_token'];

/** Matches geek_refresh_token so the token rotates with the session, not sooner. */
const CSRF_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const MODE_ENFORCE = 'enforce';
const MODE_REPORT = 'report';
const MODE_OFF = 'off';

const SILENT_LOGGER = { error() {}, warn() {}, info() {}, debug() {} };

function loggerOrSilent(candidate) {
  if (!candidate) return SILENT_LOGGER;
  const needed = ['error', 'warn', 'info', 'debug'];
  if (needed.every((m) => typeof candidate[m] === 'function')) return candidate;
  return SILENT_LOGGER;
}

/**
 * Resolve the rollout mode. Anything unrecognized (including unset) is
 * `report` — see the "Rollout lever" note above for why this fails open where
 * the Origin guard fails closed.
 */
export function resolveTokenMode(rawValue) {
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (['off', 'false', '0', 'no', 'disabled'].includes(value)) return MODE_OFF;
  if (['enforce', 'on', 'true', '1', 'block'].includes(value)) return MODE_ENFORCE;
  return MODE_REPORT;
}

/** A fresh token: 32 random bytes, base64url, 43 chars, no padding. */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Cookie attributes for `geek_csrf`.
 *
 * Mirrors setSSOCookies() in routes/auth.js in every respect but one:
 * `httpOnly` is false, because the whole point is that the page can read the
 * value and put it in a header. `domain` is passed in by routes/auth.js so the
 * two issuance sites cannot drift; the default here reproduces the same rule
 * for the standalone middleware.
 */
export function csrfCookieOptions({ domain, env = process.env } = {}) {
  const resolvedDomain =
    domain !== undefined
      ? domain
      : env.SSO_COOKIE_DOMAIN ||
        (env.NODE_ENV === 'production' ? '.clintgeek.com' : undefined);

  const options = {
    path: '/',
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
  if (resolvedDomain) options.domain = resolvedDomain;
  return options;
}

/**
 * Set (or rotate) the CSRF cookie. Returns the token it wrote, so a caller
 * that wants to log or assert on it does not have to re-parse the header.
 */
export function setCsrfCookie(res, { token, domain, env = process.env } = {}) {
  const value = token || generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, value, {
    ...csrfCookieOptions({ domain, env }),
    maxAge: CSRF_COOKIE_MAX_AGE_MS,
  });
  return value;
}

/** Clear it alongside the SSO cookies on logout. */
export function clearCsrfCookie(res, { domain, env = process.env } = {}) {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions({ domain, env }));
}

/**
 * Read one cookie off a request.
 *
 * Works with or without cookie-parser, because server.js mounts the CSRF
 * middleware ahead of `cookieParser()` (it runs in front of everything, for
 * the same reason the Origin guard does) and the test app mounts it after.
 */
export function readCookie(req, name) {
  const parsed = req.cookies;
  if (parsed && typeof parsed === 'object' && parsed[name]) return parsed[name];

  const header = req.headers?.cookie;
  if (typeof header !== 'string' || !header) return null;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    if (trimmed.slice(0, idx) !== name) continue;
    const raw = trimmed.slice(idx + 1);
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** True if any SSO cookie is present with a non-empty value. */
function hasAuthCookie(req, cookieNames) {
  return cookieNames.some((name) => !!readCookie(req, name));
}

/** Length-safe constant-time compare. */
function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function headerToken(req) {
  const raw = req.headers?.[CSRF_HEADER_NAME];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * Back-fill the CSRF cookie on any request that has a session but no token.
 *
 * Mounted globally (after cookieParser) rather than bolted onto
 * `GET /api/users/me`, so *every* entry point heals a pre-rollout session —
 * the /me bootstrap every consumer app runs, a GraphQL query, a static asset
 * fetch that carries cookies. One `Set-Cookie` per session, then never again.
 *
 * Never overwrites an existing token: rotation is the job of routes/auth.js,
 * which rotates it in lockstep with the refresh token. Overwriting here would
 * race two tabs into permanent mismatch.
 */
export function ensureCsrfCookie(options = {}) {
  const {
    cookieNames = DEFAULT_AUTH_COOKIES,
    domain,
    env = process.env,
  } = options;

  return function ensureCsrfCookieMiddleware(req, res, next) {
    if (readCookie(req, CSRF_COOKIE_NAME)) return next();
    if (!hasAuthCookie(req, cookieNames)) return next();

    const token = setCsrfCookie(res, { domain, env });
    // Make it visible to the rest of this request too, so a handler that
    // wants to hand the token back in a body does not have to re-read it.
    if (req.cookies && typeof req.cookies === 'object') {
      req.cookies[CSRF_COOKIE_NAME] = token;
    }
    return next();
  };
}

/**
 * Build the double-submit token check.
 *
 * @param {object} [options]
 * @param {object} [options.logger] pino-style logger (error/warn/info/debug).
 * @param {string[]} [options.cookieNames] SSO cookies that make a request
 *   CSRF-relevant. Default `['geek_token', 'geek_refresh_token']`.
 * @param {string} [options.mode] 'enforce' | 'report' | 'off'. Overrides
 *   `CSRF_TOKEN`; intended for tests.
 * @param {string} [options.appName] label used in log lines.
 * @param {NodeJS.ProcessEnv} [options.env] env source (default `process.env`).
 * @returns {(req, res, next) => void} Express middleware.
 */
export function csrfTokenGuard(options = {}) {
  const {
    logger,
    cookieNames = DEFAULT_AUTH_COOKIES,
    mode: modeOverride,
    appName = 'basegeek',
    env = process.env,
  } = options;

  const log = loggerOrSilent(logger);
  const mode = resolveTokenMode(modeOverride ?? env.CSRF_TOKEN);

  if (mode === MODE_OFF) {
    log.warn(
      { app: appName, csrfToken: 'off' },
      'CSRF token check DISABLED by CSRF_TOKEN=off — cookie-authenticated mutations are origin-checked only',
    );
    return function csrfTokenGuardDisabled(req, res, next) {
      return next();
    };
  }

  log.info(
    { app: appName, csrfToken: mode, cookie: CSRF_COOKIE_NAME, header: CSRF_HEADER_NAME },
    mode === MODE_REPORT
      ? 'CSRF token check in report-only mode — missing/mismatched tokens are logged, not blocked'
      : 'CSRF token check enforcing double-submit on cookie-authenticated mutations',
  );

  return function csrfTokenGuardMiddleware(req, res, next) {
    const method = String(req.method || '').toUpperCase();
    if (SAFE_METHODS.has(method)) return next();

    // No session cookie → nothing for an attacker to ride on, and no cookie
    // for us to compare against. API-key and bearer clients land here.
    if (!hasAuthCookie(req, cookieNames)) return next();

    const reqPath = req.path || (req.originalUrl || req.url || '').split('?')[0];
    const perRequestLog = loggerOrSilent(req.log);
    const reqLog = perRequestLog === SILENT_LOGGER ? log : perRequestLog;

    const cookieValue = readCookie(req, CSRF_COOKIE_NAME);
    const headerValue = headerToken(req);

    // Session predates this control (or the token cookie was cleared).
    // Nothing to compare, so allow — `ensureCsrfCookie` is issuing one on this
    // very response and the next call will be checkable. Reaching this branch
    // requires script on a `*.clintgeek.com` host to delete the cookie, which
    // is already game over for any token scheme; a third-party page cannot
    // make the browser omit a cookie it holds.
    if (!cookieValue) {
      reqLog.warn(
        { app: appName, method, path: reqPath, csrfToken: mode, reason: 'no_csrf_cookie', hasHeader: !!headerValue, ...callerContext(req) },
        'CSRF token check: session has no geek_csrf cookie yet — allowing and issuing one',
      );
      return next();
    }

    if (!headerValue) {
      return violation(res, reqLog, {
        app: appName, method, path: reqPath, csrfToken: mode, reason: 'missing_header', ...callerContext(req),
      }, 'csrf_token_missing', mode, next);
    }

    if (!tokensMatch(headerValue, cookieValue)) {
      return violation(res, reqLog, {
        app: appName, method, path: reqPath, csrfToken: mode, reason: 'header_cookie_mismatch', ...callerContext(req),
      }, 'csrf_token_invalid', mode, next);
    }

    return next();
  };
}

/**
 * One place for the report/enforce split, so the two failure codes can never
 * diverge in how they are logged or how they behave under the lever.
 *
 * Never logs either token value: the cookie is the victim's live credential
 * for this control, and a log file is not where it belongs.
 */
function violation(res, reqLog, detail, errorCode, mode, next) {
  if (mode === MODE_REPORT) {
    reqLog.warn(
      { ...detail, wouldReject: errorCode },
      'CSRF token check (report-only): would have rejected this request',
    );
    return next();
  }

  reqLog.warn({ ...detail, rejected: errorCode }, 'CSRF token check: rejected cookie-authenticated mutation');
  return res.status(403).json({ error: errorCode });
}

export { SAFE_METHODS, CSRF_COOKIE_MAX_AGE_MS };
