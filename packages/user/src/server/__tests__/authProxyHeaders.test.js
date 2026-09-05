'use strict';

/**
 * authProxyHeaders.test.js
 *
 * The contract six auth proxies now depend on. Two properties matter more
 * than the rest, and both have a specific failure they exist to catch:
 *
 *   1. A browser's `X-CSRF-Token` is forwarded. Without this, flipping
 *      basegeek to `CSRF_TOKEN=enforce` 403s every proxied /auth/refresh and
 *      logs the suite out within the hour.
 *   2. A token is never *fabricated* from the cookie jar. If the proxy read
 *      `geek_csrf` off the replayed Cookie header and echoed it back, every
 *      proxied path would auto-satisfy basegeek's double-submit check — the
 *      exact check the flip is meant to turn on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  authProxyHeaders,
  readCsrfHeader,
  CSRF_HEADER_NAME,
} = require('../authProxyHeaders.js');

const TOKEN = 'CmU9YkXhVQ3n7Fj2pL8sRt1wZaB4cD6eG0hI5kM9oQs';
const COOKIE = `geek_token=jwt.value.here; geek_refresh_token=r3fr3sh; geek_csrf=${ TOKEN }`;

function req(headers = {}) {
  return { headers };
}

test('forwards the CSRF token the browser presented', () => {
  const headers = authProxyHeaders(req({ cookie: COOKIE, 'x-csrf-token': TOKEN }));
  assert.equal(headers[CSRF_HEADER_NAME], TOKEN);
  assert.equal(headers.Cookie, COOKIE);
});

test('forwards Cookie and Authorization alongside it', () => {
  const headers = authProxyHeaders(req({
    cookie: COOKIE,
    authorization: 'Bearer abc.def.ghi',
    'x-csrf-token': TOKEN,
  }));
  assert.deepEqual(headers, {
    Cookie: COOKIE,
    Authorization: 'Bearer abc.def.ghi',
    [CSRF_HEADER_NAME]: TOKEN,
  });
});

test('no header in → no header out: the proxy never fabricates a token', () => {
  // The cookie jar contains geek_csrf. A proxy that "helpfully" read it and
  // echoed it back would satisfy basegeek's double-submit check on a request
  // whose caller never proved it could read the cookie. It must not.
  const headers = authProxyHeaders(req({ cookie: COOKIE }));
  assert.equal(headers.Cookie, COOKIE);
  assert.ok(!(CSRF_HEADER_NAME in headers));
  assert.ok(!('x-csrf-token' in headers));
  assert.ok(
    !Object.values(headers).includes(TOKEN),
    'the geek_csrf value must not appear anywhere but inside the replayed Cookie',
  );
});

test('an empty or whitespace-only token is dropped, not forwarded as blank', () => {
  // basegeek reads a blank header as "present but mismatched", which is a
  // louder and less accurate failure than "absent".
  for (const value of ['', '   ']) {
    const headers = authProxyHeaders(req({ cookie: COOKIE, 'x-csrf-token': value }));
    assert.ok(!(CSRF_HEADER_NAME in headers), `dropped for ${ JSON.stringify(value) }`);
  }
});

test('a token is trimmed before it goes upstream', () => {
  const headers = authProxyHeaders(req({ 'x-csrf-token': `  ${ TOKEN }  ` }));
  assert.equal(headers[CSRF_HEADER_NAME], TOKEN);
});

test('a repeated header collapses to the first value, not a joined one', () => {
  const headers = authProxyHeaders(req({ 'x-csrf-token': [TOKEN, 'second-token'] }));
  assert.equal(headers[CSRF_HEADER_NAME], TOKEN);
});

test('empty Cookie and Authorization are omitted rather than sent blank', () => {
  const headers = authProxyHeaders(req({ cookie: '', authorization: '' }));
  assert.deepEqual(headers, {});
});

test('a request with no headers at all yields an empty object', () => {
  assert.deepEqual(authProxyHeaders({}), {});
  assert.deepEqual(authProxyHeaders(req()), {});
});

test('cookie: false suppresses the session replay (login/register)', () => {
  const headers = authProxyHeaders(req({ cookie: COOKIE, 'x-csrf-token': TOKEN }), {
    cookie: false,
  });
  assert.ok(!('Cookie' in headers));
  assert.equal(headers[CSRF_HEADER_NAME], TOKEN);
});

test('authorization: false suppresses the bearer header', () => {
  const headers = authProxyHeaders(req({ cookie: COOKIE, authorization: 'Bearer x' }), {
    authorization: false,
  });
  assert.ok(!('Authorization' in headers));
  assert.equal(headers.Cookie, COOKIE);
});

test('extra headers merge in last and win', () => {
  const headers = authProxyHeaders(
    req({ cookie: COOKIE, authorization: 'Bearer stale', 'x-csrf-token': TOKEN }),
    { extra: { Authorization: 'Bearer resolved' } },
  );
  assert.equal(headers.Authorization, 'Bearer resolved');
  assert.equal(headers.Cookie, COOKIE);
  assert.equal(headers[CSRF_HEADER_NAME], TOKEN);
});

test('extra entries that are empty/undefined/null are skipped', () => {
  const headers = authProxyHeaders(req({ cookie: COOKIE }), {
    extra: { Authorization: undefined, 'X-Nope': '', 'X-Null': null },
  });
  assert.deepEqual(headers, { Cookie: COOKIE });
});

test('readCsrfHeader reads the header and only the header', () => {
  assert.equal(readCsrfHeader(req({ 'x-csrf-token': TOKEN })), TOKEN);
  assert.equal(readCsrfHeader(req({ cookie: COOKIE })), null);
  assert.equal(readCsrfHeader(req()), null);
  assert.equal(readCsrfHeader({}), null);
});

test('the returned object is fresh each call and safe to mutate', () => {
  const a = authProxyHeaders(req({ cookie: COOKIE }));
  a.Cookie = 'tampered';
  const b = authProxyHeaders(req({ cookie: COOKIE }));
  assert.equal(b.Cookie, COOKIE);
});
