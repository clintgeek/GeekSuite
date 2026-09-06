'use strict';

/**
 * attachUser.test.js — the two things `attachUser()` must never confuse.
 *
 * 1. **Who validates.** The default validator is an HTTP call to basegeek,
 *    which is right for the six consumer backends (bookgeek, bujogeek,
 *    fitnessgeek, flockgeek, notegeek, storygeek) and wrong for basegeek
 *    itself — there `BASEGEEK_URL` resolves to the same process, so the
 *    gateway spent an inbound request slot asking itself who the caller was.
 *    `validateSession` lets an app answer in-process. These tests pin that the
 *    injected validator is actually used, gets the request, and that *no
 *    socket is opened* when one is supplied — the last part proven by pointing
 *    `BASEGEEK_URL` at a real loopback server that records every hit.
 *
 * 2. **Which kind of failure.** "The token is bad" and "nobody could check the
 *    token" used to arrive at the same place: with `required: false` both fell
 *    through as an anonymous request. That is the whole of BURN_REVIEW_2 §3 —
 *    an anonymous request reaches a resolver that throws UNAUTHENTICATED, and
 *    the shared Apollo error link turns UNAUTHENTICATED into `logout()` in
 *    every open tab. So a slow basegeek logged the suite out. Unavailable now
 *    answers 503 + `Retry-After` on *both* the required and optional paths;
 *    invalid keeps its old 401/anonymous behaviour exactly.
 *
 * Run with: pnpm --filter @geeksuite/user test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { attachUser, optionalUser } = require('../attachUser.js');
const { invalidSession, sessionUnavailable, AUTH_RETRY_AFTER_SECONDS } = require('../tokenUtils.js');

/** A request just real enough for the middleware. */
function makeReq({ token, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  return { headers: h };
}

/** A response that records what the middleware said, without express. */
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

/** Run a middleware and report whether it called next(). */
async function run(mw, req, res) {
  let nexted = false;
  await mw(req, res, () => { nexted = true; });
  return nexted;
}

const SSO_USER = { _id: 'u1', id: 'u1', userId: 'u1', email: 'chef@example.com' };

// ───────────────────────────────────────────────────────────────────────────
// 1. The injected validator
// ───────────────────────────────────────────────────────────────────────────

test('an injected validator replaces the HTTP call entirely — no socket is opened', async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: SSO_USER }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.BASEGEEK_URL;
  process.env.BASEGEEK_URL = `http://127.0.0.1:${server.address().port}`;

  try {
    let seenToken = null;
    let seenReq = null;
    const mw = optionalUser({
      validateSession: async (token, ctx) => {
        seenToken = token;
        seenReq = ctx.req;
        return SSO_USER;
      },
    });

    const req = makeReq({ token: 'tok-abc' });
    const res = makeRes();
    assert.equal(await run(mw, req, res), true);

    assert.equal(seenToken, 'tok-abc');
    assert.equal(seenReq, req, 'the validator is handed the request, so it can re-read the token in its own order');
    assert.deepEqual(req.user, SSO_USER);
    assert.deepEqual(req.geek, { user: SSO_USER, localUser: null });
    assert.deepEqual(hits, [], 'BASEGEEK_URL must never be fetched when a validator is injected');
  } finally {
    if (previous === undefined) delete process.env.BASEGEEK_URL;
    else process.env.BASEGEEK_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a validator returning no user is an invalid session, not an outage', async () => {
  const required = attachUser({ validateSession: async () => null });
  const res = makeRes();
  assert.equal(await run(required, makeReq({ token: 't' }), res), false);
  assert.equal(res.statusCode, 401);

  const optional = optionalUser({ validateSession: async () => null });
  const req = makeReq({ token: 't' });
  assert.equal(await run(optional, req, makeRes()), true);
  assert.equal(req.geek, null);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Unavailable → 503, on both paths
// ───────────────────────────────────────────────────────────────────────────

test('required: an unavailable validator is a 503 with Retry-After, not a 401', async () => {
  const mw = attachUser({ validateSession: async () => { throw sessionUnavailable(); } });
  const res = makeRes();

  assert.equal(await run(mw, makeReq({ token: 't' }), res), false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], String(AUTH_RETRY_AFTER_SECONDS));
  assert.equal(res.body.code, 'AUTH_UNAVAILABLE');
});

test('optional: an unavailable validator is a 503 — never an anonymous request', async () => {
  // The regression itself. `optionalUser()` swallowing the failure is what
  // turned a slow basegeek into a suite-wide logout: anonymous request →
  // resolver throws UNAUTHENTICATED → shared Apollo error link calls logout().
  const mw = optionalUser({ validateSession: async () => { throw sessionUnavailable(); } });
  const req = makeReq({ token: 't' });
  const res = makeRes();

  assert.equal(await run(mw, req, res), false, 'must not fall through to the resolver');
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], String(AUTH_RETRY_AFTER_SECONDS));
  assert.equal(req.geek, undefined);
});

test('a timeout against a hung basegeek is unavailable, not invalid', async () => {
  // The real shape: axios ECONNABORTED carries no `error.response` at all.
  const server = http.createServer(() => { /* never answers */ });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.BASEGEEK_URL;
  process.env.BASEGEEK_TIMEOUT_MS = '150';
  process.env.BASEGEEK_URL = `http://127.0.0.1:${server.address().port}`;

  try {
    const mw = optionalUser();
    const req = makeReq({ token: 't' });
    const res = makeRes();

    assert.equal(await run(mw, req, res), false);
    assert.equal(res.statusCode, 503);
  } finally {
    delete process.env.BASEGEEK_TIMEOUT_MS;
    if (previous === undefined) delete process.env.BASEGEEK_URL;
    else process.env.BASEGEEK_URL = previous;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a 5xx from basegeek is unavailable; a 401/403 is invalid', async () => {
  const cases = [
    { thrown: { response: { status: 500 } }, requiredStatus: 503 },
    { thrown: { response: { status: 502 } }, requiredStatus: 503 },
    { thrown: { response: { status: 404 } }, requiredStatus: 503 }, // wrong URL is not a bad token
    { thrown: { response: { status: 401 } }, requiredStatus: 401 },
    { thrown: { response: { status: 403 } }, requiredStatus: 401 },
  ];

  for (const { thrown, requiredStatus } of cases) {
    const mw = attachUser({ validateSession: async () => { throw thrown; } });
    const res = makeRes();
    await run(mw, makeReq({ token: 't' }), res);
    assert.equal(res.statusCode, requiredStatus, `status ${thrown.response.status}`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Invalid keeps behaving exactly as it did
// ───────────────────────────────────────────────────────────────────────────

test('required: an invalid token is still a 401', async () => {
  const mw = attachUser({ validateSession: async () => { throw invalidSession(); } });
  const res = makeRes();

  assert.equal(await run(mw, makeReq({ token: 't' }), res), false);
  assert.equal(res.statusCode, 401);
});

test('optional: an invalid token is still an anonymous request', async () => {
  const mw = optionalUser({ validateSession: async () => { throw invalidSession(); } });
  const req = makeReq({ token: 't' });
  const res = makeRes();

  assert.equal(await run(mw, req, res), true);
  assert.equal(req.geek, null);
  assert.equal(res.statusCode, null);
});

test('no token at all: 401 when required, anonymous when not — the validator is never called', async () => {
  let called = 0;
  const validateSession = async () => { called += 1; return SSO_USER; };

  const res = makeRes();
  assert.equal(await run(attachUser({ validateSession }), makeReq(), res), false);
  assert.equal(res.statusCode, 401);

  const req = makeReq();
  assert.equal(await run(optionalUser({ validateSession }), req, makeRes()), true);
  assert.equal(req.geek, null);
  assert.equal(called, 0);
});

test('a cookie-only request still reaches the validator', async () => {
  let seen = null;
  const mw = optionalUser({
    validateSession: async (token) => { seen = token; return SSO_USER; },
  });
  const req = makeReq({ cookie: 'geek_token=cookie-tok; other=1' });

  assert.equal(await run(mw, req, makeRes()), true);
  assert.equal(seen, 'cookie-tok');
  assert.equal(req.headers.authorization, 'Bearer cookie-tok');
});
