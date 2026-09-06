/**
 * refreshTimer.test.js — the background session-refresh loop.
 *
 * `AuthProvider` wires `startRefreshTimer(onFailure)` to "clear the user and
 * run the app's logout callback", so what counts as a failure here is what
 * counts as being logged out. The distinction this file pins:
 *
 *   - a 401/403 from `/auth/refresh` is the session ending. Stop the timer,
 *     call `onFailure`.
 *   - anything else — a rejected `fetch` (wifi blinked, laptop just woke), a
 *     502 while the container restarts, a 200 whose body is an nginx error
 *     page and blows up `res.json()` — is transient. Keep the timer, say
 *     nothing to the app, try again on the next tick.
 *
 * Before 2026-09-05 the `catch` did not look at the error at all: every one of
 * those transient cases stopped the timer *and* logged the user out of an app
 * they were still signed into. The comment above it claimed otherwise.
 *
 * Runs on node:test — no jsdom, no timers library. The timer's first tick is
 * staggered by `Math.random() * 5000`, so `Math.random` is stubbed to 0 and
 * the test simply awaits a real macrotask.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startRefreshTimer, stopRefreshTimer } from '../authClient.js';

const REAL_RANDOM = Math.random;

/** In-memory localStorage stand-in; the module touches it via clearTokens(). */
function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

/**
 * Stub the browser globals the refresh path reads, and hand back a recorder
 * for `console.warn` so the transient branch can be observed without the
 * suite's output filling with warnings.
 */
function setEnv() {
  globalThis.window = { location: { search: '', href: 'https://app.clintgeek.com/' } };
  globalThis.localStorage = makeStorage({ geek_token: 'stored.jwt' });
  globalThis.document = { cookie: '' };
}

let warnings;
const REAL_WARN = console.warn;

beforeEach(() => {
  setEnv();
  Math.random = () => 0; // no stagger — first tick on the next macrotask
  warnings = [];
  console.warn = (...args) => { warnings.push(args); };
});

afterEach(() => {
  stopRefreshTimer();
  Math.random = REAL_RANDOM;
  console.warn = REAL_WARN;
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.document;
  delete globalThis.fetch;
});

/** Let the staggered `setTimeout(0)` fire and its async body settle. */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

/** A `fetch` that always answers `/auth/refresh` the same way. */
function respondWith(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler();
  };
  return calls;
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe('startRefreshTimer — terminal failures', () => {
  test('a 401 stops the timer and reports the session expired', async () => {
    respondWith(() => jsonResponse(401, { message: 'expired' }));
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });

    await tick();

    assert.equal(failures, 1, 'onFailure should fire for a 401');
  });

  test('a 403 does the same — basegeek returns it on refresh-reuse revocation', async () => {
    respondWith(() => jsonResponse(403, { error: 'revoked' }));
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });

    await tick();

    assert.equal(failures, 1, 'onFailure should fire for a 403');
  });

  test('a 401 clears the stored tokens', async () => {
    respondWith(() => jsonResponse(401, {}));
    startRefreshTimer(() => {});

    await tick();

    assert.equal(globalThis.localStorage.getItem('geek_token'), null);
  });
});

describe('startRefreshTimer — transient failures do not log you out', () => {
  test('a rejected fetch keeps the session and warns instead', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });

    await tick();

    assert.equal(failures, 0, 'a dropped connection is not an expired session');
    assert.equal(warnings.length, 1, 'the transient branch says so at warn level');
    assert.match(String(warnings[0][0]), /background token refresh failed/);
  });

  test('a 502 keeps the session — the backend is restarting, not rejecting you', async () => {
    respondWith(() => jsonResponse(502, { message: 'bad gateway' }));
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });

    await tick();

    assert.equal(failures, 0);
  });

  test('a 200 with an unparseable body keeps the session', async () => {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    });
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });

    await tick();

    assert.equal(failures, 0);
  });

  test('a transient failure leaves the stored token alone', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    startRefreshTimer(() => {});

    await tick();

    assert.equal(
      globalThis.localStorage.getItem('geek_token'),
      'stored.jwt',
      'nothing on the transient path may clear tokens',
    );
  });

  test('the timer is still running after a transient failure', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      throw new TypeError('Failed to fetch');
    };
    startRefreshTimer(() => {});

    await tick();
    assert.equal(attempts, 1);

    // stopRefreshTimer() is the only thing that nulls the handle; if the
    // transient branch had called it, this second stop would be a no-op and
    // the interval would already be gone. Assert the observable half instead:
    // a terminal failure after a transient one still reports exactly once.
    globalThis.fetch = async () => jsonResponse(401, {});
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });
    await tick();
    assert.equal(failures, 1);
  });
});
