'use strict';

/**
 * tokenUtils.test.js
 *
 * `validateToken()` is the single outbound call that sits in front of *every*
 * authenticated request in six backends: `attachUser()` runs it per request,
 * with no cache. Two properties matter.
 *
 *   1. **It is bounded.** axios defaults `timeout` to 0 — wait forever. A
 *      basegeek that is hung rather than down would therefore park every
 *      inbound request in every consumer app on a socket that will not close
 *      for minutes, and the app runs out of handlers long before that. The
 *      timeout turns that into `attachUser()`'s existing 502 branch.
 *   2. **The token order is header-first.** The docstring used to claim
 *      cookie-first; six backends have shipped on header-first since
 *      inception. The order is pinned here so the comment and the code can
 *      never drift apart again silently.
 *
 * Rather than stub axios, the test stands up a real `http` server: the point
 * of a timeout is what happens on the wire, and a hand-rolled stub proves
 * nothing about whether axios was actually handed the option.
 *
 * Run with: pnpm --filter @geeksuite/user test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  getTokenFromRequest,
  normalizeSsoUser,
  validateToken,
  resolveTimeoutMs,
  DEFAULT_TIMEOUT_MS,
} = require('../tokenUtils.js');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('resolveTimeoutMs defaults to DEFAULT_TIMEOUT_MS', () => {
  assert.equal(resolveTimeoutMs({}), DEFAULT_TIMEOUT_MS);
});

test('BASEGEEK_TIMEOUT_MS overrides the default', () => {
  assert.equal(resolveTimeoutMs({ BASEGEEK_TIMEOUT_MS: '2500' }), 2500);
});

test('a non-positive or unparseable BASEGEEK_TIMEOUT_MS falls back rather than restoring "forever"', () => {
  // `0` is axios's own "no timeout", which is the failure mode this exists to
  // remove — an operator setting it must not get it back by accident.
  assert.equal(resolveTimeoutMs({ BASEGEEK_TIMEOUT_MS: '0' }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs({ BASEGEEK_TIMEOUT_MS: '-1' }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs({ BASEGEEK_TIMEOUT_MS: 'soon' }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs({ BASEGEEK_TIMEOUT_MS: '' }), DEFAULT_TIMEOUT_MS);
});

test('validateToken gives up on a hung basegeek instead of waiting forever', async () => {
  // A server that accepts the connection and then says nothing — the shape of
  // a hung upstream, which is exactly what an untimed axios call waits out.
  const { server, port } = await listen(() => {});
  try {
    const started = Date.now();
    await assert.rejects(
      validateToken('jwt.value', `http://127.0.0.1:${port}`, { timeoutMs: 150 }),
      (err) => {
        // axios reports a timeout with no `response`, which is what keeps
        // attachUser() from mistaking it for a 401.
        assert.equal(err.response, undefined);
        assert.ok(
          err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT',
          `expected a timeout code, got ${err.code}`,
        );
        return true;
      },
    );
    assert.ok(Date.now() - started < 3000, 'the call must not outlive its timeout');
  } finally {
    await close(server);
  }
});

test('validateToken returns the normalized SSO user on success', async () => {
  const seen = {};
  const { server, port } = await listen((req, res) => {
    seen.url = req.url;
    seen.authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: { _id: 'u1', username: 'chef', email: 'chef@example.com' } }));
  });
  try {
    const user = await validateToken('jwt.value', `http://127.0.0.1:${port}/`);
    assert.equal(seen.url, '/api/users/me');
    assert.equal(seen.authorization, 'Bearer jwt.value');
    // A trailing slash on the base URL must not produce `//api/users/me`.
    assert.equal(user.id, 'u1');
    assert.equal(user.userId, 'u1');
    assert.equal(user._id, 'u1');
  } finally {
    await close(server);
  }
});

test('normalizeSsoUser reads all three basegeek response shapes', () => {
  assert.equal(normalizeSsoUser({ data: { user: { id: 'a' } } }).userId, 'a');
  assert.equal(normalizeSsoUser({ user: { _id: 'b' } }).userId, 'b');
  assert.equal(normalizeSsoUser({ userId: 'c' }).id, 'c');
  assert.equal(normalizeSsoUser(null), null);
});

test('getTokenFromRequest is header-first, cookie-second — the shipped order', () => {
  const both = {
    headers: {
      authorization: 'Bearer from-header',
      cookie: 'geek_token=from-cookie',
    },
  };
  assert.equal(getTokenFromRequest(both), 'from-header');

  assert.equal(
    getTokenFromRequest({ headers: { cookie: 'geek_theme=dark; geek_token=from-cookie' } }),
    'from-cookie',
  );

  // A non-Bearer Authorization is not a token; fall through to the cookie.
  assert.equal(
    getTokenFromRequest({
      headers: { authorization: 'Basic abc', cookie: 'geek_token=from-cookie' },
    }),
    'from-cookie',
  );

  assert.equal(getTokenFromRequest({ headers: {} }), null);
  assert.equal(getTokenFromRequest({}), null);
});

test('getTokenFromRequest url-decodes a cookie value and honours a custom name', () => {
  assert.equal(
    getTokenFromRequest({ headers: { cookie: 'geek_token=a%20b' } }),
    'a b',
  );
  assert.equal(
    getTokenFromRequest({ headers: { cookie: 'other_token=zzz' } }, 'other_token'),
    'zzz',
  );
});
