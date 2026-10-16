/**
 * sessionRefresh.test.js — one shared refresh, and what a failed one means
 * (REVIEW_2026-10 B1, B2).
 *
 * The suite kept signing Heather out of sessions that were still good:
 *
 *   - the axios interceptor logged out (on every tab, via the broadcast) when
 *     a refresh failed for ANY reason, a dropped connection included;
 *   - getMe() answered "no user" when the refresh behind a 401 couldn't
 *     happen, so a fleet restart looked like being signed out;
 *   - the only proactive refresh was a 50-minute setInterval, which Android
 *     freezes while the PWA is in the background.
 *
 * What this pins:
 *   - a refresh answered 401/403/400 ends the session; anything else doesn't;
 *   - concurrent callers share one /auth/refresh;
 *   - getMe(): 401 → refresh → retry; refresh 401 → null; refresh offline → throws;
 *   - coming back to the front with a stale (or unknown-age) token refreshes.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getMe,
  refreshSession,
  sessionNeedsRefresh,
  setupAxiosInterceptors,
  startRefreshTimer,
  stopRefreshTimer,
  resetRefreshStateForTests,
  STALE_MARGIN_MS,
  UNKNOWN_EXPIRY_MAX_AGE_MS,
} from '../authClient.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

/** A tiny EventTarget-ish stand-in, enough for add/removeEventListener. */
function makeTarget(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    dispatch: (type) => { for (const fn of [...(listeners[type] || [])]) fn(); },
    count: (type) => (listeners[type] || []).length,
  };
}

function jwtExpiringAt(ms) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(ms / 1000) })).toString('base64url');
  return `h.${ payload }.s`;
}

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

/** fetch stand-in: /auth/refresh → refresh(), /me → me() (in order), else 200 {}. */
function mockFetch({ refresh, me = [] } = {}) {
  const calls = [];
  const meQueue = [...me];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith('/auth/refresh')) return refresh();
    if (u.endsWith('/me')) {
      const next = meQueue.shift();
      if (typeof next === 'function') return next();
      return next;
    }
    return json(200, {});
  };
  return calls;
}

const REAL_RANDOM = Math.random;
const REAL_WARN = console.warn;

beforeEach(() => {
  globalThis.window = makeTarget({ location: { search: '', href: 'https://fitnessgeek.clintgeek.com/' } });
  globalThis.document = makeTarget({ cookie: '', visibilityState: 'visible' });
  globalThis.localStorage = makeStorage({ geek_token: 'old.jwt' });
  resetRefreshStateForTests();
  Math.random = () => 0;
  console.warn = () => {};
});

afterEach(() => {
  stopRefreshTimer();
  Math.random = REAL_RANDOM;
  console.warn = REAL_WARN;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.fetch;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('refreshSession — single flight', () => {
  test('concurrent callers share one /auth/refresh', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = mockFetch({ refresh: async () => { await gate; return json(200, { token: 'new.jwt' }); } });

    const all = Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    release();
    await all;

    assert.equal(calls.filter((u) => u.endsWith('/auth/refresh')).length, 1);
    assert.equal(localStorage.getItem('geek_token'), 'new.jwt');
  });

  test('a later call after it settles starts a new refresh', async () => {
    const calls = mockFetch({ refresh: () => json(200, { token: 'new.jwt' }) });
    await refreshSession();
    await refreshSession();
    assert.equal(calls.filter((u) => u.endsWith('/auth/refresh')).length, 2);
  });

  test('a 502 rejects with status 502 and leaves the token alone', async () => {
    mockFetch({ refresh: () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('<html>'); } }) });
    const err = await refreshSession().catch((e) => e);
    assert.equal(err.status, 502);
    assert.equal(localStorage.getItem('geek_token'), 'old.jwt');
  });
});

describe('getMe — only a failed session is "no user"', () => {
  test('401 → refresh → the retry answers the user', async () => {
    const calls = mockFetch({
      refresh: () => json(200, { token: 'new.jwt' }),
      me: [json(401, {}), json(200, { user: { id: 'u1' } })],
    });
    const me = await getMe();
    assert.deepEqual(me, { id: 'u1' });
    assert.equal(calls.filter((u) => u.endsWith('/auth/refresh')).length, 1);
  });

  test('401 and the refresh is answered 401 → null (signed out)', async () => {
    mockFetch({ refresh: () => json(401, {}), me: [json(401, {})] });
    assert.equal(await getMe(), null);
  });

  test('401 and the refresh cannot reach the server → throws, not "no user"', async () => {
    mockFetch({
      refresh: () => { throw new TypeError('Failed to fetch'); },
      me: [json(401, {})],
    });
    await assert.rejects(getMe(), /Failed to fetch/);
    assert.equal(localStorage.getItem('geek_token'), 'old.jwt');
  });

  test('a 502 from /api/me throws (a restart is not a sign-out)', async () => {
    mockFetch({ me: [json(502, { message: 'bad gateway' })] });
    await assert.rejects(getMe());
  });
});

describe('setupAxiosInterceptors — refresh failures', () => {
  function fakeAxios() {
    const instance = async function callAxios(config) {
      const finalConfig = instance.requestInterceptor ? await instance.requestInterceptor(config) : config;
      instance.calls.push(finalConfig);
      const next = instance.responses.shift();
      if (!next) throw new Error('fakeAxios: no response queued for this call');
      const settled = next.error
        ? Promise.reject(Object.assign(new Error('Request failed'), { response: next.error, config: finalConfig }))
        : Promise.resolve({ ...next.response, config: finalConfig });
      return settled.then(
        (response) => (instance.responseFulfilled ? instance.responseFulfilled(response) : response),
        (error) => (instance.responseRejected ? instance.responseRejected(error) : Promise.reject(error)),
      );
    };
    instance.calls = [];
    instance.responses = [];
    instance.interceptors = {
      request: { use: (fn) => { instance.requestInterceptor = fn; } },
      response: { use: (ok, bad) => { instance.responseFulfilled = ok; instance.responseRejected = bad; } },
    };
    return instance;
  }

  test('401 → refresh → retry succeeds, no session-expired callback', async () => {
    mockFetch({ refresh: () => json(200, { token: 'new.jwt' }) });
    const ax = fakeAxios();
    let expired = 0;
    setupAxiosInterceptors(ax, () => { expired += 1; });
    ax.responses.push({ error: { status: 401, data: {} } }, { response: { status: 200, data: { ok: true } } });

    const res = await ax({ url: '/weight', method: 'get', headers: {} });

    assert.equal(res.data.ok, true);
    assert.equal(expired, 0);
    assert.equal(ax.calls[1].headers.Authorization, 'Bearer new.jwt');
  });

  test('refresh answered 401 → session-expired callback fires', async () => {
    mockFetch({ refresh: () => json(401, {}) });
    const ax = fakeAxios();
    let expired = 0;
    setupAxiosInterceptors(ax, () => { expired += 1; });
    ax.responses.push({ error: { status: 401, data: {} } });

    await assert.rejects(ax({ url: '/weight', method: 'get', headers: {} }));
    assert.equal(expired, 1);
  });

  test('refresh that cannot reach the server → no logout, tokens kept', async () => {
    mockFetch({ refresh: () => { throw new TypeError('Failed to fetch'); } });
    const ax = fakeAxios();
    let expired = 0;
    setupAxiosInterceptors(ax, () => { expired += 1; });
    ax.responses.push({ error: { status: 401, data: {} } });

    await assert.rejects(ax({ url: '/weight', method: 'get', headers: {} }), /Failed to fetch/);
    assert.equal(expired, 0);
    assert.equal(localStorage.getItem('geek_token'), 'old.jwt');
  });

  test('concurrent 401s share one refresh', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = mockFetch({ refresh: async () => { await gate; return json(200, { token: 'new.jwt' }); } });
    const ax = fakeAxios();
    setupAxiosInterceptors(ax, () => {});
    ax.responses.push(
      { error: { status: 401, data: {} } },
      { error: { status: 401, data: {} } },
      { response: { status: 200, data: { n: 1 } } },
      { response: { status: 200, data: { n: 2 } } },
    );

    const both = Promise.all([
      ax({ url: '/a', method: 'get', headers: {} }),
      ax({ url: '/b', method: 'get', headers: {} }),
    ]);
    await tick();
    release();
    await both;

    assert.equal(calls.filter((u) => u.endsWith('/auth/refresh')).length, 1);
  });
});

describe('sessionNeedsRefresh', () => {
  test('a token with more than the margin left does not need it', () => {
    const now = 1_000_000_000_000;
    localStorage.setItem('geek_token', jwtExpiringAt(now + STALE_MARGIN_MS + 60_000));
    assert.equal(sessionNeedsRefresh(now), false);
  });

  test('a token inside the margin, or already expired, does', () => {
    const now = 1_000_000_000_000;
    localStorage.setItem('geek_token', jwtExpiringAt(now + STALE_MARGIN_MS - 1000));
    assert.equal(sessionNeedsRefresh(now), true);
    localStorage.setItem('geek_token', jwtExpiringAt(now - 60_000));
    assert.equal(sessionNeedsRefresh(now), true);
  });

  test('unknown expiry: needed until a refresh lands, then not until it is old', async () => {
    localStorage.removeItem('geek_token');
    assert.equal(sessionNeedsRefresh(), true);
    mockFetch({ refresh: () => json(200, {}) });
    await refreshSession();
    assert.equal(sessionNeedsRefresh(), false);
    assert.equal(sessionNeedsRefresh(Date.now() + UNKNOWN_EXPIRY_MAX_AGE_MS + 1000), true);
  });
});

describe('startRefreshTimer — coming back to the front', () => {
  test('visible with a stale token refreshes; a fresh token does not', async () => {
    const calls = mockFetch({ refresh: () => json(200, {}) });
    localStorage.setItem('geek_token', jwtExpiringAt(Date.now() + 60 * 60 * 1000));
    startRefreshTimer(() => {});
    await tick(); // the staggered first refresh
    const before = calls.length;

    document.dispatch('visibilitychange');
    await tick();
    assert.equal(calls.length, before, 'fresh token: no refresh on foreground');

    localStorage.setItem('geek_token', jwtExpiringAt(Date.now() + 60 * 1000));
    document.dispatch('visibilitychange');
    await tick();
    assert.equal(calls.length, before + 1, 'stale token: refresh on foreground');

    localStorage.setItem('geek_token', jwtExpiringAt(Date.now() - 1000));
    window.dispatch('focus');
    await tick();
    assert.equal(calls.length, before + 2, 'focus counts too');
  });

  test('hidden does nothing, and a 401 on foreground reports the session ended', async () => {
    let status = 200;
    mockFetch({ refresh: () => json(status, {}) });
    let failures = 0;
    startRefreshTimer(() => { failures += 1; });
    await tick();

    localStorage.setItem('geek_token', jwtExpiringAt(Date.now() - 1000));
    status = 401;
    document.visibilityState = 'hidden';
    document.dispatch('visibilitychange');
    await tick();
    assert.equal(failures, 0);

    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await tick();
    assert.equal(failures, 1);
  });

  test('stopRefreshTimer removes the listeners', () => {
    startRefreshTimer(() => {});
    assert.equal(document.count('visibilitychange'), 1);
    assert.equal(window.count('focus'), 1);
    stopRefreshTimer();
    assert.equal(document.count('visibilitychange'), 0);
    assert.equal(window.count('focus'), 0);
  });
});
