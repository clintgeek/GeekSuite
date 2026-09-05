/**
 * csrfHeaders.test.js — the client half of basegeek's double-submit CSRF token.
 *
 * basegeek issues `geek_csrf` (not HttpOnly, `domain=.clintgeek.com`) and
 * requires it echoed in `X-CSRF-Token` on any cookie-authenticated mutation.
 * This module is the shared client every app uses to talk to basegeek, so if
 * the header goes missing here it goes missing suite-wide.
 *
 * Runs on node:test — no jsdom. `document` is stubbed to exactly what the code
 * reads (a `cookie` string), which is the whole surface `readCsrfToken` uses.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  readCsrfToken,
  csrfHeaders,
  logout,
  setupAxiosInterceptors,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_RELOAD_FLAG_KEY,
  extractCsrfErrorCode,
  isCsrfFailure,
  triggerCsrfReloadOnce,
} from '../authClient.js';

const TOKEN = 'oO2xk5Yz1QqFbn-8LmvTz7cRk2sQeWpUvHgJdNaBcDe';

/** Point `document.cookie` at a jar string, or remove the global entirely. */
function setCookieJar(value) {
  if (value === null) {
    delete globalThis.document;
    return;
  }
  globalThis.document = { cookie: value };
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.fetch;
  delete globalThis.window;
  delete globalThis.localStorage;
});

/** A minimal, in-memory sessionStorage stand-in. */
function makeSessionStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
}

/**
 * Stub `window` with just what triggerCsrfReloadOnce / the browser-only paths
 * read. Also stubs the bare `localStorage` global the request interceptor
 * reads once `window` exists — the two are one browser environment in
 * production, and authClient's `typeof window === 'undefined'` guards assume
 * that pairing.
 */
function setBrowserEnv({ sessionStorage } = {}) {
  const reloadCalls = [];
  globalThis.window = {
    location: { reload: () => { reloadCalls.push(true); } },
    sessionStorage: sessionStorage === undefined ? makeSessionStorage() : sessionStorage,
  };
  globalThis.localStorage = makeSessionStorage();
  return reloadCalls;
}

describe('readCsrfToken', () => {
  test('pulls geek_csrf out of a jar with several cookies', () => {
    setCookieJar(`geek_theme=dark; ${ CSRF_COOKIE_NAME }=${ TOKEN }; other=1`);
    assert.equal(readCsrfToken(), TOKEN);
  });

  test('handles the token being first, last, and alone', () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }; b=2`);
    assert.equal(readCsrfToken(), TOKEN);
    setCookieJar(`a=1; ${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
  });

  test('does not match a cookie whose name merely ends in geek_csrf', () => {
    setCookieJar(`not_geek_csrf=${ TOKEN }`);
    assert.equal(readCsrfToken(), null);
  });

  test('returns null when the cookie is absent, empty, or the jar is empty', () => {
    setCookieJar('geek_theme=dark');
    assert.equal(readCsrfToken(), null);
    setCookieJar(`${ CSRF_COOKIE_NAME }=`);
    assert.equal(readCsrfToken(), null);
    setCookieJar('');
    assert.equal(readCsrfToken(), null);
  });

  test('returns null server-side, where there is no document at all', () => {
    setCookieJar(null);
    assert.equal(readCsrfToken(), null);
  });

  test('reads fresh each call — basegeek rotates the token on every refresh', () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
    globalThis.document.cookie = `${ CSRF_COOKIE_NAME }=rotated-value`;
    assert.equal(readCsrfToken(), 'rotated-value');
  });
});

describe('csrfHeaders', () => {
  beforeEach(() => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
  });

  test('returns the header when a token is present', () => {
    assert.deepEqual(csrfHeaders(), { [CSRF_HEADER_NAME]: TOKEN });
  });

  test('returns an empty object when there is no token, so it is always spreadable', () => {
    setCookieJar('geek_theme=dark');
    assert.deepEqual(csrfHeaders(), {});
    assert.deepEqual({ 'Content-Type': 'application/json', ...csrfHeaders() }, {
      'Content-Type': 'application/json',
    });
  });

  test('skips the header for safe methods when a method is given', () => {
    for (const method of ['GET', 'get', 'HEAD', 'options', 'TRACE']) {
      assert.deepEqual(csrfHeaders(method), {}, `expected no header for ${ method }`);
    }
  });

  test('adds it for every state-changing method', () => {
    for (const method of ['POST', 'put', 'PATCH', 'delete']) {
      assert.deepEqual(csrfHeaders(method), { [CSRF_HEADER_NAME]: TOKEN }, method);
    }
  });

  test('adds it when no method is given at all', () => {
    assert.deepEqual(csrfHeaders(undefined), { [CSRF_HEADER_NAME]: TOKEN });
  });
});

describe('logout()', () => {
  test('sends the CSRF header on its POST to basegeek', async () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await logout();

    assert.match(seen.url, /\/auth\/logout$/);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers[CSRF_HEADER_NAME], TOKEN);
    assert.equal(seen.init.credentials, 'include');
  });

  test('still posts (and still logs out) when no token has been issued yet', async () => {
    setCookieJar('geek_theme=dark');
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await logout();

    assert.ok(seen, 'logout must not be skipped just because there is no CSRF token');
    assert.equal(seen.init.headers[CSRF_HEADER_NAME], undefined);
  });
});

describe('setupAxiosInterceptors', () => {
  /** Minimal stand-in for an axios instance: captures the request interceptor. */
  function fakeAxios() {
    const instance = {
      requestInterceptor: null,
      interceptors: {
        request: { use: (fn) => { instance.requestInterceptor = fn; } },
        response: { use: () => {} },
      },
    };
    return instance;
  }

  beforeEach(() => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
  });

  test('adds the header to a POST', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);
  });

  test('leaves a GET alone', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'get', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
  });

  test('the cookie wins over a header already on the config', () => {
    // Not politeness — correctness. The jar is the only thing that knows the
    // current token, and the one caller that reliably arrives with a header
    // already set is the post-refresh replay below, carrying a stale one.
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({
      method: 'put',
      headers: { [CSRF_HEADER_NAME]: 'explicit-value' },
    });
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);
  });

  test('adds nothing when the session has no token yet', () => {
    setCookieJar('geek_theme=dark');
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
  });

  // -- the post-rotation replay (BURN_REVIEW #17) ---------------------------
  //
  // basegeek rotates `geek_csrf` on every /auth/refresh. The response
  // interceptor recovers from a 401/403 by refreshing and replaying the
  // *original* config — which already carries the header stamped on it before
  // the refresh. Under CSRF_TOKEN=enforce, replaying that pre-rotation value
  // is a 403 `csrf_token_invalid`, and the recovery that was supposed to save
  // the session ends it instead.

  test('a replayed request picks up the rotated token, not the one it was built with', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    // First pass: the request is built and stamped with the live token.
    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);

    // basegeek refreshes and rotates the cookie.
    setCookieJar(`${ CSRF_COOKIE_NAME }=rotated-after-refresh`);

    // Second pass: axios re-runs the same config object through the request
    // interceptors on `axiosInstance(originalRequest)`.
    const replayed = ax.requestInterceptor(config);
    assert.equal(replayed.headers[CSRF_HEADER_NAME], 'rotated-after-refresh');
  });

  test('a stale header spelled in a different case is replaced, not duplicated', () => {
    // axios normalizes header names on a config that has already been sent, so
    // the stale value can come back lowercase.
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({
      method: 'post',
      headers: { 'x-csrf-token': 'pre-rotation' },
    });

    const present = Object.keys(config.headers)
      .filter((k) => k.toLowerCase() === CSRF_HEADER_NAME.toLowerCase());
    assert.deepEqual(present, [CSRF_HEADER_NAME]);
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);
  });

  test('a stale header is dropped when the session no longer has a token', () => {
    // Logging out clears geek_csrf. Replaying the old value would be a
    // guaranteed mismatch — worse than sending nothing, which basegeek reads
    // as an un-issued session and lets through while it re-issues.
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = { method: 'post', headers: { [CSRF_HEADER_NAME]: 'pre-logout' } };
    setCookieJar('geek_theme=dark');
    ax.requestInterceptor(config);

    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
    assert.equal(
      Object.keys(config.headers).some((k) => k.toLowerCase() === 'x-csrf-token'),
      false,
    );
  });

  test('works against an AxiosHeaders-shaped headers bag (set/delete methods)', () => {
    // axios 1.x hands the interceptor an AxiosHeaders instance, whose delete()
    // is case-insensitive and whose set() is the supported way to write.
    class FakeAxiosHeaders {
      constructor(initial = {}) { Object.assign(this, initial); }
      set(name, value) { this[name] = value; }
      delete(name) {
        for (const key of Object.keys(this)) {
          if (key.toLowerCase() === name.toLowerCase()) delete this[key];
        }
      }
    }

    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const headers = new FakeAxiosHeaders({ 'x-csrf-token': 'pre-rotation' });
    const config = ax.requestInterceptor({ method: 'patch', headers });

    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);
    assert.equal(config.headers['x-csrf-token'], undefined);
  });

  test('a GET replay does not inherit a token from an earlier POST config', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);

    config.method = 'get';
    ax.requestInterceptor(config);
    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
  });
});

// -- the stale-tab heal (a tab loaded before CSRF_TOKEN=enforce) ------------
//
// A tab whose JS predates the CSRF rollout entirely sends no header at all;
// under `enforce` every mutation 403s as csrf_token_missing. These cover the
// predicate, the reload guard, and the interceptor wiring that ties them
// together: retry once with a fresh header, reload once if that still fails,
// never reload for anything else.

describe('extractCsrfErrorCode / isCsrfFailure', () => {
  test('reads the bare shape csrfTokenGuard actually sends', () => {
    assert.equal(extractCsrfErrorCode({ error: 'csrf_token_missing' }), 'csrf_token_missing');
    assert.equal(isCsrfFailure(403, { error: 'csrf_token_missing' }), true);
    assert.equal(isCsrfFailure(403, { error: 'csrf_token_invalid' }), true);
  });

  test('also reads a { code } or nested { error: { code } } wrapper', () => {
    assert.equal(extractCsrfErrorCode({ code: 'csrf_token_invalid' }), 'csrf_token_invalid');
    assert.equal(extractCsrfErrorCode({ error: { code: 'csrf_token_missing' } }), 'csrf_token_missing');
  });

  test('is false for a 403 with an unrelated code, or no body', () => {
    assert.equal(isCsrfFailure(403, { error: 'forbidden' }), false);
    assert.equal(isCsrfFailure(403, null), false);
    assert.equal(isCsrfFailure(403, undefined), false);
  });

  test('is false for a non-403 status even with a matching code', () => {
    assert.equal(isCsrfFailure(401, { error: 'csrf_token_missing' }), false);
    assert.equal(isCsrfFailure(200, { error: 'csrf_token_missing' }), false);
  });
});

describe('triggerCsrfReloadOnce', () => {
  test('does nothing outside a browser (no window)', () => {
    // no globalThis.window set
    assert.doesNotThrow(() => triggerCsrfReloadOnce());
  });

  test('reloads once, and sets the sessionStorage guard', () => {
    const reloadCalls = setBrowserEnv();
    triggerCsrfReloadOnce();
    assert.equal(reloadCalls.length, 1);
    assert.equal(window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY), '1');
  });

  test('does not reload again once the flag is already set, even across a fresh call', () => {
    const reloadCalls = setBrowserEnv({ sessionStorage: makeSessionStorage({ [CSRF_RELOAD_FLAG_KEY]: '1' }) });
    triggerCsrfReloadOnce();
    assert.equal(reloadCalls.length, 0);
  });

  test('a broken sessionStorage does not prevent the one reload it cannot guard', () => {
    const reloadCalls = [];
    globalThis.window = {
      location: { reload: () => { reloadCalls.push(true); } },
      get sessionStorage() { throw new Error('storage disabled'); },
    };
    assert.doesNotThrow(() => triggerCsrfReloadOnce());
    assert.equal(reloadCalls.length, 1);
  });
});

describe('setupAxiosInterceptors — CSRF-heal on 403', () => {
  /**
   * A fakeAxios that, like the real thing, threads every dispatched request —
   * including one triggered from inside the response interceptor itself via
   * `axiosInstance(originalRequest)` — back through both interceptors. Each
   * entry in `responses` is consumed by the next dispatch, in order.
   */
  function fakeAxios() {
    const instance = function callAxios(config) {
      const finalConfig = instance.requestInterceptor ? instance.requestInterceptor(config) : config;
      instance.calls.push(finalConfig);
      const next = instance.responses.shift();
      if (!next) throw new Error('fakeAxios: no response queued for this call');
      const settled = next.error
        ? Promise.reject(Object.assign(next.error, { config: finalConfig }))
        : Promise.resolve({ ...next.response, config: finalConfig });
      return settled.then(
        (response) => (instance.responseFulfilled ? instance.responseFulfilled(response) : response),
        (error) => (instance.responseRejected ? instance.responseRejected(error) : Promise.reject(error)),
      );
    };
    instance.calls = [];
    instance.responses = [];
    instance.requestInterceptor = null;
    instance.responseFulfilled = null;
    instance.responseRejected = null;
    instance.interceptors = {
      request: { use: (fn) => { instance.requestInterceptor = fn; } },
      response: { use: (onFulfilled, onRejected) => { instance.responseFulfilled = onFulfilled; instance.responseRejected = onRejected; } },
    };
    return instance;
  }

  function csrfError(code = 'csrf_token_missing') {
    const error = new Error('Request failed with status code 403');
    error.response = { status: 403, data: { error: code } };
    return error;
  }

  beforeEach(() => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
  });

  test('retries once with the freshly-read header, and succeeds', async () => {
    setBrowserEnv();
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = { method: 'post', url: '/graphql', headers: {} };
    ax.responses.push({ error: csrfError() }, { response: { status: 200, data: {} } });

    const result = await ax(config);

    assert.equal(ax.calls.length, 2, 'the original dispatch plus exactly one retry');
    assert.equal(config._csrfHealRetried, true);
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN, 'the retry carries the live cookie value');
    assert.equal(result.status, 200);
    assert.equal(window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY), null, 'no reload on a successful retry');
  });

  test('picks up a cookie rotated between the first failure and the retry', async () => {
    setBrowserEnv();
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = { method: 'post', headers: {} };
    ax.responses.push({ error: csrfError() }, { response: { status: 200, data: {} } });

    // The dispatch that stamps the first (soon-to-be-stale) header has to
    // happen before the cookie rotates, so run the retry's queued success on
    // the next microtask tick and rotate the cookie in between.
    const promise = ax(config);
    setCookieJar(`${ CSRF_COOKIE_NAME }=rotated-value`);
    await promise;

    assert.equal(config.headers[CSRF_HEADER_NAME], 'rotated-value');
  });

  test('reloads once, per session, when the retry fails with the same code', async () => {
    const reloadCalls = setBrowserEnv();
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = { method: 'post', headers: {} };
    ax.responses.push({ error: csrfError('csrf_token_invalid') }, { error: csrfError('csrf_token_invalid') });

    await assert.rejects(() => ax(config));

    assert.equal(ax.calls.length, 2, 'retried exactly once, not looped');
    assert.equal(reloadCalls.length, 1);
  });

  test('never reloads for an unrelated 403', async () => {
    const reloadCalls = setBrowserEnv();
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    // Routed at the refresh endpoint so, once the CSRF branch declines it,
    // the pre-existing 401/403 branch bails out on its own short-circuit
    // instead of attempting a real token refresh — irrelevant to what this
    // test is checking.
    const config = { method: 'post', headers: {}, url: '/api/auth/refresh' };
    const error = new Error('nope');
    error.response = { status: 403, data: { error: 'forbidden' } };
    ax.responses.push({ error });

    await assert.rejects(() => ax(config));
    assert.equal(config._csrfHealRetried, undefined, 'the CSRF-heal branch never engaged');
    assert.equal(ax.calls.length, 1, 'no retry of any kind for an unrelated 403');
    assert.equal(reloadCalls.length, 0);
  });

  test('does not reload twice in the same session across two different failing requests', async () => {
    const reloadCalls = setBrowserEnv();
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const configA = { method: 'post', headers: {} };
    ax.responses.push({ error: csrfError() }, { error: csrfError() });
    await assert.rejects(() => ax(configA));
    assert.equal(reloadCalls.length, 1);

    const configB = { method: 'post', headers: {} };
    ax.responses.push({ error: csrfError() }, { error: csrfError() });
    await assert.rejects(() => ax(configB));
    assert.equal(reloadCalls.length, 1, 'the sessionStorage flag from the first request suppresses this one');
  });
});
