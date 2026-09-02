'use strict';

/**
 * Unit tests for csrfGuard — node's built-in test runner, no new dependencies.
 *
 *   pnpm --filter @geeksuite/user test
 *
 * These exercise the middleware directly with fake req/res objects rather
 * than through express, so every branch is reachable without pulling in
 * supertest. The per-backend suites cover the mounted-in-a-real-app case.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { csrfGuard, normalizeOrigin, DEFAULT_AUTH_COOKIES } = require('../csrfGuard.js');

const ALLOWED = ['https://fitnessgeek.clintgeek.com', 'http://localhost:5173'];

/** A logger that records what it was told, so log assertions are possible. */
function recordingLogger() {
  const lines = { error: [], warn: [], info: [], debug: [] };
  return {
    lines,
    error: (...a) => lines.error.push(a),
    warn: (...a) => lines.warn.push(a),
    info: (...a) => lines.info.push(a),
    debug: (...a) => lines.debug.push(a),
  };
}

function makeReq({ method = 'POST', path = '/api/logs', headers = {}, cookies } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { method, path, url: path, originalUrl: path, headers: lower, cookies };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

/** Run the middleware; returns { nexted, res }. */
function run(guard, req) {
  const res = makeRes();
  let nexted = false;
  guard(req, res, () => { nexted = true; });
  return { nexted, res };
}

function cookieHeader(value = 'a-token') {
  return { cookie: `geek_token=${value}` };
}

/** A guard with a clean, enforcing config and no log noise. */
function enforcingGuard(overrides = {}) {
  return csrfGuard({
    allowedOrigins: ALLOWED,
    mode: 'enforce',
    env: {},
    ...overrides,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// normalizeOrigin
// ───────────────────────────────────────────────────────────────────────────

test('normalizeOrigin: reduces a URL to scheme://host', () => {
  assert.equal(normalizeOrigin('https://a.clintgeek.com/some/path?q=1'), 'https://a.clintgeek.com');
});

test('normalizeOrigin: keeps a non-default port', () => {
  assert.equal(normalizeOrigin('http://localhost:5173'), 'http://localhost:5173');
});

test('normalizeOrigin: lowercases the host', () => {
  assert.equal(normalizeOrigin('https://FitnessGeek.ClintGeek.com'), 'https://fitnessgeek.clintgeek.com');
});

test('normalizeOrigin: returns null for junk, empty, and non-strings', () => {
  assert.equal(normalizeOrigin('not a url'), null);
  assert.equal(normalizeOrigin(''), null);
  assert.equal(normalizeOrigin('   '), null);
  assert.equal(normalizeOrigin(undefined), null);
  assert.equal(normalizeOrigin(null), null);
  assert.equal(normalizeOrigin(42), null);
  assert.equal(normalizeOrigin('null'), null);
});

// ───────────────────────────────────────────────────────────────────────────
// Safe methods
// ───────────────────────────────────────────────────────────────────────────

for (const method of ['GET', 'HEAD', 'OPTIONS', 'TRACE']) {
  test(`${method} is never guarded, even with a cookie and a hostile Origin`, () => {
    const guard = enforcingGuard();
    const { nexted, res } = run(guard, makeReq({
      method,
      headers: { ...cookieHeader(), origin: 'https://evil.example' },
    }));
    assert.equal(nexted, true);
    assert.equal(res.statusCode, null);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Requests with no auth cookie
// ───────────────────────────────────────────────────────────────────────────

test('POST with no cookies at all passes, whatever the Origin', () => {
  const guard = enforcingGuard();
  const { nexted, res } = run(guard, makeReq({ headers: { origin: 'https://evil.example' } }));
  assert.equal(nexted, true);
  assert.equal(res.statusCode, null);
});

test('POST with unrelated cookies only passes', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    headers: { cookie: 'theme=dark; kindle_ui=abc', origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('POST with an empty geek_token cookie value is treated as unauthenticated', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    headers: { cookie: 'geek_token=', origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('a Bearer token alone is not a CSRF vector and is not guarded', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    headers: { authorization: 'Bearer abc', origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('the refresh cookie alone is enough to trigger the guard', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    path: '/api/auth/refresh',
    headers: { cookie: 'geek_refresh_token=r1', origin: 'https://evil.example' },
  }));
  assert.equal(res.statusCode, 403);
});

test('cookie detection works off req.cookies when cookie-parser has run', () => {
  const guard = enforcingGuard();
  const req = makeReq({ headers: { origin: 'https://evil.example' }, cookies: { geek_token: 'abc' } });
  delete req.headers.cookie;
  const { res } = run(guard, req);
  assert.equal(res.statusCode, 403);
});

test('DEFAULT_AUTH_COOKIES is the pair basegeek sets', () => {
  assert.deepEqual(DEFAULT_AUTH_COOKIES, ['geek_token', 'geek_refresh_token']);
});

test('cookieNames can be overridden', () => {
  const guard = enforcingGuard({ cookieNames: ['app_session'] });
  const allowed = run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } }));
  assert.equal(allowed.nexted, true, 'geek_token is no longer watched');

  const blocked = run(guard, makeReq({
    headers: { cookie: 'app_session=x', origin: 'https://evil.example' },
  }));
  assert.equal(blocked.res.statusCode, 403);
});

// ───────────────────────────────────────────────────────────────────────────
// The core rule: unsafe method + auth cookie + Origin
// ───────────────────────────────────────────────────────────────────────────

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`${method} with a cookie and an allow-listed Origin passes`, () => {
    const guard = enforcingGuard();
    const { nexted, res } = run(guard, makeReq({
      method,
      headers: { ...cookieHeader(), origin: 'https://fitnessgeek.clintgeek.com' },
    }));
    assert.equal(nexted, true);
    assert.equal(res.statusCode, null);
  });

  test(`${method} with a cookie and a foreign Origin is rejected with 403`, () => {
    const guard = enforcingGuard();
    const { nexted, res } = run(guard, makeReq({
      method,
      headers: { ...cookieHeader(), origin: 'https://evil.example' },
    }));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'csrf_origin_rejected' });
  });
}

test('an unknown method (arbitrary verb) is treated as unsafe', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    method: 'PROPFIND',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(res.statusCode, 403);
});

test('a lowercase method name is still recognized as safe', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    method: 'get',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('Origin matching ignores case and any path/query the client tacked on', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'HTTPS://FitnessGeek.ClintGeek.com' },
  }));
  assert.equal(nexted, true);
});

test('a sibling subdomain not on this app\'s list is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://storygeek.clintgeek.com' },
  }));
  assert.equal(res.statusCode, 403);
});

test('a lookalike suffix host is rejected (no substring matching)', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://fitnessgeek.clintgeek.com.evil.example' },
  }));
  assert.equal(res.statusCode, 403);
});

test('scheme is part of the match: http:// against an https allow-list is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'http://fitnessgeek.clintgeek.com' },
  }));
  assert.equal(res.statusCode, 403);
});

test('port is part of the match: a different localhost port is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'http://localhost:9999' },
  }));
  assert.equal(res.statusCode, 403);
});

test('an opaque "null" Origin is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'null' } }));
  assert.equal(res.statusCode, 403);
});

test('an Origin header that is not a URL at all is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'nonsense' } }));
  assert.equal(res.statusCode, 403);
});

test('a blank Origin header falls through to Referer/none rather than rejecting', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({ headers: { ...cookieHeader(), origin: '   ' } }));
  assert.equal(nexted, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Referer fallback
// ───────────────────────────────────────────────────────────────────────────

test('with no Origin, an allow-listed Referer passes', () => {
  const guard = enforcingGuard();
  const { nexted } = run(guard, makeReq({
    headers: { ...cookieHeader(), referer: 'https://fitnessgeek.clintgeek.com/logs?day=1' },
  }));
  assert.equal(nexted, true);
});

test('with no Origin, a foreign Referer is rejected', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), referer: 'https://evil.example/attack.html' },
  }));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'csrf_origin_rejected' });
});

test('Origin wins over Referer when both are present', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: {
      ...cookieHeader(),
      origin: 'https://evil.example',
      referer: 'https://fitnessgeek.clintgeek.com/',
    },
  }));
  assert.equal(res.statusCode, 403, 'a friendly Referer must not launder a hostile Origin');
});

test('the misspelled "referrer" header is honored as a fallback', () => {
  const guard = enforcingGuard();
  const { res } = run(guard, makeReq({
    headers: { ...cookieHeader(), referrer: 'https://evil.example/x' },
  }));
  assert.equal(res.statusCode, 403);
});

test('an unparseable Referer is treated as no evidence and passes, with a warning', () => {
  const logger = recordingLogger();
  const guard = enforcingGuard({ logger });
  const { nexted } = run(guard, makeReq({
    headers: { ...cookieHeader(), referer: 'not-a-url' },
  }));
  assert.equal(nexted, true);
  assert.equal(logger.lines.warn.length, 1);
});

// ───────────────────────────────────────────────────────────────────────────
// Origin-less clients
// ───────────────────────────────────────────────────────────────────────────

test('a cookie-carrying POST with neither Origin nor Referer passes and logs at debug', () => {
  const logger = recordingLogger();
  const guard = enforcingGuard({ logger });
  const { nexted, res } = run(guard, makeReq({ headers: cookieHeader() }));
  assert.equal(nexted, true);
  assert.equal(res.statusCode, null);
  assert.equal(logger.lines.debug.length, 1);
  assert.equal(logger.lines.warn.length, 0);
});

// ───────────────────────────────────────────────────────────────────────────
// Logging
// ───────────────────────────────────────────────────────────────────────────

test('a rejection logs the offending origin at warn', () => {
  const logger = recordingLogger();
  const guard = enforcingGuard({ logger, appName: 'fitnessgeek' });
  run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } }));

  assert.equal(logger.lines.warn.length, 1);
  const [detail, message] = logger.lines.warn[0];
  assert.equal(detail.origin, 'https://evil.example');
  assert.equal(detail.originSource, 'origin');
  assert.equal(detail.method, 'POST');
  assert.equal(detail.path, '/api/logs');
  assert.equal(detail.app, 'fitnessgeek');
  assert.match(message, /CSRF guard/);
});

test('req.log is preferred over the app logger so the request id travels with the line', () => {
  const appLogger = recordingLogger();
  const reqLogger = recordingLogger();
  const guard = enforcingGuard({ logger: appLogger });
  const req = makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } });
  req.log = reqLogger;

  run(guard, req);

  assert.equal(reqLogger.lines.warn.length, 1);
  // Only the construction-time "enforcing" line went to the app logger.
  assert.equal(appLogger.lines.warn.length, 0);
});

test('a partial req.log (no debug method) is ignored in favour of the app logger', () => {
  const appLogger = recordingLogger();
  const guard = enforcingGuard({ logger: appLogger });
  const req = makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } });
  req.log = { info() {}, warn() {} }; // pino-http always has all four; a stub may not
  const { res } = run(guard, req);

  assert.equal(res.statusCode, 403);
  assert.equal(appLogger.lines.warn.length, 1);
});

test('passing no logger at all is safe', () => {
  const guard = csrfGuard({ allowedOrigins: ALLOWED, mode: 'enforce', env: {} });
  const { res } = run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } }));
  assert.equal(res.statusCode, 403);
});

// ───────────────────────────────────────────────────────────────────────────
// Exempt paths
// ───────────────────────────────────────────────────────────────────────────

test('an exact-string exempt path is skipped', () => {
  const guard = enforcingGuard({ exemptPaths: ['/api/hooks/stripe'] });
  const { nexted } = run(guard, makeReq({
    path: '/api/hooks/stripe',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('a string exempt path also covers its subtree', () => {
  const guard = enforcingGuard({ exemptPaths: ['/api/hooks'] });
  const { nexted } = run(guard, makeReq({
    path: '/api/hooks/stripe/events',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('a string exempt path does not leak into a sibling with the same prefix', () => {
  const guard = enforcingGuard({ exemptPaths: ['/api/hooks'] });
  const { res } = run(guard, makeReq({
    path: '/api/hooksecret',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(res.statusCode, 403);
});

test('a RegExp exempt path is honored', () => {
  const guard = enforcingGuard({ exemptPaths: [/^\/kindle\//] });
  const { nexted } = run(guard, makeReq({
    path: '/kindle/books/1/send',
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
});

test('path resolution falls back to originalUrl when req.path is absent', () => {
  const guard = enforcingGuard({ exemptPaths: ['/api/hooks'] });
  const req = makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } });
  delete req.path;
  req.originalUrl = '/api/hooks/x?y=1';
  const { nexted } = run(guard, req);
  assert.equal(nexted, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Allow-list shapes
// ───────────────────────────────────────────────────────────────────────────

test('a single origin string is accepted', () => {
  const guard = csrfGuard({ allowedOrigins: 'https://flockgeek.clintgeek.com', mode: 'enforce', env: {} });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://flockgeek.clintgeek.com' },
  })).nexted, true);
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).res.statusCode, 403);
});

test('junk entries in the allow-list are dropped, not matched', () => {
  const guard = csrfGuard({
    allowedOrigins: ['', '   ', 'not-a-url', null, undefined, 'https://ok.clintgeek.com'],
    mode: 'enforce',
    env: {},
  });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://ok.clintgeek.com' },
  })).nexted, true);
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'not-a-url' },
  })).res.statusCode, 403);
});

test('a predicate allow-list is used as the matcher, and sees a normalized origin', () => {
  const seen = [];
  const guard = csrfGuard({
    allowedOrigins: (origin) => {
      seen.push(origin);
      return origin.endsWith('.clintgeek.com');
    },
    mode: 'enforce',
    env: {},
  });

  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://bookgeek.clintgeek.com/some/path' },
  })).nexted, true);
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).res.statusCode, 403);
  assert.deepEqual(seen, ['https://bookgeek.clintgeek.com', 'https://evil.example']);
});

test('a predicate that returns a truthy non-true value does not allow the request', () => {
  const guard = csrfGuard({ allowedOrigins: () => 'yes', mode: 'enforce', env: {} });
  const { res } = run(guard, makeReq({ headers: { ...cookieHeader(), origin: 'https://evil.example' } }));
  assert.equal(res.statusCode, 403);
});

test('an EMPTY allow-list runs inert (fails open) and logs an error', () => {
  const logger = recordingLogger();
  const guard = csrfGuard({ allowedOrigins: [], mode: 'enforce', env: {}, logger });

  const { nexted, res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true, 'an outage is worse than the exposure this would close');
  assert.equal(res.statusCode, null);
  assert.equal(logger.lines.error.length, 1);
  assert.match(logger.lines.error[0][1], /EMPTY origin allow-list/);
});

test('an all-junk allow-list is treated as empty and runs inert', () => {
  const guard = csrfGuard({ allowedOrigins: ['not-a-url', ''], mode: 'enforce', env: {} });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).nexted, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Modes and the CSRF_GUARD escape hatch
// ───────────────────────────────────────────────────────────────────────────

test('CSRF_GUARD=off makes the guard a no-op and warns at startup', () => {
  const logger = recordingLogger();
  const guard = csrfGuard({ allowedOrigins: ALLOWED, env: { CSRF_GUARD: 'off' }, logger });

  const { nexted, res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
  assert.equal(res.statusCode, null);
  assert.equal(logger.lines.warn.length, 1);
  assert.match(logger.lines.warn[0][1], /DISABLED/);
});

for (const value of ['off', 'OFF', ' off ', 'false', '0', 'no', 'disabled']) {
  test(`CSRF_GUARD=${JSON.stringify(value)} disables the guard`, () => {
    const guard = csrfGuard({ allowedOrigins: ALLOWED, env: { CSRF_GUARD: value } });
    assert.equal(run(guard, makeReq({
      headers: { ...cookieHeader(), origin: 'https://evil.example' },
    })).nexted, true);
  });
}

test('CSRF_GUARD=report logs the rejection it would have made, but allows the request', () => {
  const logger = recordingLogger();
  const guard = csrfGuard({ allowedOrigins: ALLOWED, env: { CSRF_GUARD: 'report' }, logger });

  const { nexted, res } = run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  }));
  assert.equal(nexted, true);
  assert.equal(res.statusCode, null);
  assert.equal(logger.lines.warn.length, 1);
  assert.match(logger.lines.warn[0][1], /report-only/);
});

test('CSRF_GUARD unset means enforce', () => {
  const guard = csrfGuard({ allowedOrigins: ALLOWED, env: {} });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).res.statusCode, 403);
});

test('an unrecognized CSRF_GUARD value fails safe (enforce), not open', () => {
  const guard = csrfGuard({ allowedOrigins: ALLOWED, env: { CSRF_GUARD: 'yes-please' } });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).res.statusCode, 403);
});

test('the mode option overrides the environment', () => {
  const guard = csrfGuard({ allowedOrigins: ALLOWED, mode: 'off', env: { CSRF_GUARD: 'enforce' } });
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).nexted, true);
});

test('csrfGuard() with no arguments builds an inert middleware rather than throwing', () => {
  const guard = csrfGuard();
  assert.equal(typeof guard, 'function');
  assert.equal(run(guard, makeReq({
    headers: { ...cookieHeader(), origin: 'https://evil.example' },
  })).nexted, true);
});
