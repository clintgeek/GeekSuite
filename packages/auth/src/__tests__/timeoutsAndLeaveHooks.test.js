/**
 * timeoutsAndLeaveHooks.test.js — SUITE_REVIEW_2026-11 A1, A4/A5, A6.
 *
 *   - A1: the refresh and /api/me fetches have deadlines, and a request waits
 *     at most REFRESH_WAIT_CAP_MS for a refresh in flight. A timeout is
 *     "couldn't check", never "signed out".
 *   - A6: a localStorage that throws does not break getMe().
 *   - A4/A5: runBeforeLeave() gives registered hooks and DOM listeners their
 *     chance, never waits past its cap, and survives a throwing hook; the axios
 *     interceptor runs it before the app's onSessionExpired.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  getMe,
  refreshSession,
  waitForRefresh,
  isSessionExpiredError,
  resetRefreshStateForTests,
  setupAxiosInterceptors,
  REFRESH_TIMEOUT_MS,
  ME_TIMEOUT_MS,
  REFRESH_WAIT_CAP_MS,
} from '../authClient.js';
import {
  onBeforeLeave,
  runBeforeLeave,
  resetLeaveHooksForTests,
  SESSION_ENDING_EVENT,
  BEFORE_RELOAD_EVENT,
} from '../leaveHooks.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const REAL_WARN = console.warn;

/** A fetch that never answers, recording the signal it was given. */
function hangingFetch() {
  const signals = [];
  globalThis.fetch = (url, opts) => {
    signals.push(opts?.signal);
    return new Promise(() => {});
  };
  return signals;
}

beforeEach(() => {
  globalThis.window = new EventTarget();
  globalThis.window.location = { search: '', href: 'https://notegeek.clintgeek.com/' };
  globalThis.document = { cookie: '' };
  globalThis.localStorage = makeStorage({ geek_token: 'old.jwt' });
  resetRefreshStateForTests();
  resetLeaveHooksForTests();
  console.warn = () => {};
});

afterEach(() => {
  mock.timers.reset();
  console.warn = REAL_WARN;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.fetch;
});

describe('A1 — deadlines on the fetches everything waits behind', () => {
  test('a refresh that never answers rejects with a TimeoutError, aborts, and keeps the session', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const signals = hangingFetch();

    const p = refreshSession();
    const outcome = p.then(() => 'resolved', (e) => e);
    mock.timers.tick(REFRESH_TIMEOUT_MS);
    const err = await outcome;

    assert.equal(err.name, 'TimeoutError');
    assert.equal(isSessionExpiredError(err), false, 'a timeout is not a dead session');
    assert.equal(signals[0]?.aborted, true, 'the request was really cancelled');
    assert.equal(localStorage.getItem('geek_token'), 'old.jwt', 'tokens untouched');
  });

  test('a hung /api/me makes getMe() throw (retry later), not answer "signed out"', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    hangingFetch();

    const outcome = getMe().then((v) => ({ value: v }), (e) => e);
    // getMe awaits a little before its fetch; let it reach the timer.
    await Promise.resolve();
    mock.timers.tick(ME_TIMEOUT_MS);
    const err = await outcome;

    assert.equal(err.name, 'TimeoutError');
  });

  test('waitForRefresh() stops holding requests after its cap, even while the refresh hangs', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    hangingFetch();

    const refresh = refreshSession().catch(() => {});
    let released = false;
    const wait = waitForRefresh().then(() => { released = true; });

    mock.timers.tick(REFRESH_WAIT_CAP_MS - 1);
    await Promise.resolve();
    assert.equal(released, false);
    mock.timers.tick(1);
    await wait;
    assert.equal(released, true);

    mock.timers.tick(REFRESH_TIMEOUT_MS);
    await refresh;
  });

  test('the wait cap is shorter than the refresh deadline (requests are not held for the full timeout)', () => {
    assert.ok(REFRESH_WAIT_CAP_MS < REFRESH_TIMEOUT_MS);
  });
});

describe('A6 — storage that throws does not break the session check', () => {
  test('getMe() still asks /api/me (on the cookie) when localStorage throws', async () => {
    globalThis.localStorage = {
      getItem() { throw new Error('SecurityError: storage blocked'); },
      setItem() { throw new Error('SecurityError: storage blocked'); },
      removeItem() { throw new Error('SecurityError: storage blocked'); },
    };
    let sentAuth = 'unset';
    globalThis.fetch = async (url, opts) => {
      sentAuth = opts?.headers?.Authorization;
      return json(200, { user: { id: 'u1' } });
    };

    const me = await getMe();
    assert.deepEqual(me, { id: 'u1' });
    assert.equal(sentAuth, undefined, 'no Bearer when the stored copy is unreadable');
  });
});

describe('A4/A5 — runBeforeLeave', () => {
  test('calls registered hooks and waits for them', async () => {
    const seen = [];
    let saved = false;
    onBeforeLeave(({ reason }) => { seen.push(reason); });
    onBeforeLeave(() => new Promise((r) => setTimeout(() => { saved = true; r(); }, 5)));

    await runBeforeLeave('session-ending');
    assert.deepEqual(seen, ['session-ending']);
    assert.equal(saved, true);
  });

  test('dispatches the named DOM event with waitUntil, for both reasons', async () => {
    const got = [];
    let flushed = false;
    window.addEventListener(SESSION_ENDING_EVENT, (e) => {
      got.push(e.type);
      e.detail.waitUntil(new Promise((r) => setTimeout(() => { flushed = true; r(); }, 5)));
    });
    window.addEventListener(BEFORE_RELOAD_EVENT, (e) => got.push(`${ e.type }:${ e.detail.reason }`));

    await runBeforeLeave('session-ending');
    assert.equal(flushed, true);
    await runBeforeLeave('stale-bundle');
    assert.deepEqual(got, [SESSION_ENDING_EVENT, `${ BEFORE_RELOAD_EVENT }:stale-bundle`]);
  });

  test('a hook that hangs cannot hold the page: resolves at the cap', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    onBeforeLeave(() => new Promise(() => {}));
    let done = false;
    const p = runBeforeLeave('stale-bundle', { timeoutMs: 1000 }).then(() => { done = true; });
    mock.timers.tick(999);
    await Promise.resolve();
    assert.equal(done, false);
    mock.timers.tick(1);
    await p;
    assert.equal(done, true);
  });

  test('a throwing or rejecting hook is skipped, the others still run', async () => {
    let ran = false;
    onBeforeLeave(() => { throw new Error('boom'); });
    onBeforeLeave(() => Promise.reject(new Error('nope')));
    onBeforeLeave(() => { ran = true; });
    await runBeforeLeave('session-ending');
    assert.equal(ran, true);
  });

  test('unsubscribe removes the hook', async () => {
    let calls = 0;
    const off = onBeforeLeave(() => { calls += 1; });
    off();
    await runBeforeLeave('session-ending');
    assert.equal(calls, 0);
  });

  test('axios interceptor: hooks run before the app\'s onSessionExpired', async () => {
    const order = [];
    onBeforeLeave(() => new Promise((r) => setTimeout(() => { order.push('hook'); r(); }, 5)));
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/auth/refresh')) return json(401, { message: 'expired' });
      return json(200, {});
    };

    let onRejected;
    const instance = Object.assign(async () => json(200, {}), {
      interceptors: {
        request: { use: () => {} },
        response: { use: (_ok, bad) => { onRejected = bad; } },
      },
    });
    setupAxiosInterceptors(instance, () => order.push('expired'));

    const err = await onRejected({ config: { url: '/api/things', headers: {} }, response: { status: 401, data: {} } })
      .then(() => null, (e) => e);
    assert.equal(err.status, 401);
    assert.deepEqual(order, ['hook', 'expired']);
  });
});
