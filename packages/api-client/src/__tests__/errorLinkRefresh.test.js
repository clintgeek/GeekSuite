/**
 * errorLinkRefresh.test.js — an auth failure on a GraphQL operation refreshes
 * once and retries, instead of logging out (REVIEW_2026-10 B1).
 *
 * Before 2026-10-16 the shared error link called logout() and redirected to
 * the sign-in page on any UNAUTHENTICATED / 'Unauthorized' / 401, with no
 * refresh. The access token lives an hour and Android freezes the 50-minute
 * refresh timer in the background, so opening the app after a while and
 * tapping anything signed Heather out.
 *
 * What this pins:
 *   - auth failure → one refresh → the operation is sent again → its result
 *     reaches the caller, and nothing logs out;
 *   - a refresh answered 401 is the session ending: log out and redirect;
 *   - a refresh that can't happen (offline, a 502) does not log out;
 *   - several operations failing together share one refresh.
 *
 * Run with: pnpm --filter @geeksuite/api-client test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { errorLink, authLink } from '../index.js';
import { resetRefreshStateForTests, refreshSession } from '@geeksuite/auth';

function setLocalStorage(values = {}) {
  const store = { ...values };
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

function setBrowserEnv() {
  globalThis.window = {
    location: {
      href: 'https://fitnessgeek.clintgeek.com/weight',
      search: '',
      origin: 'https://fitnessgeek.clintgeek.com',
      reload: () => {},
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
  };
}

/**
 * A fetch stand-in that answers /auth/refresh with `refresh()` and records
 * every call. /auth/logout always answers 200; it being called at all is what
 * "logged out" means here.
 */
function mockFetch(refresh) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/refresh')) return refresh();
    return { ok: true, status: 200, json: async () => ({}) };
  });
  return calls;
}

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function makeOperation() {
  let context = { headers: {} };
  return {
    getContext: () => context,
    setContext: (next) => {
      context = { ...context, ...(typeof next === 'function' ? next(context) : next) };
      return context;
    },
  };
}

/** Each call to forward() plays the next queued behaviour. */
function makeForward(behaviors) {
  const state = { calls: 0 };
  const forward = () => {
    const behavior = behaviors[Math.min(state.calls, behaviors.length - 1)];
    state.calls += 1;
    return {
      subscribe: (observer) => {
        if (behavior.error) observer.error(behavior.error);
        else {
          observer.next(behavior.result ?? { data: {} });
          observer.complete();
        }
        return { unsubscribe() {} };
      },
    };
  };
  forward.state = state;
  return forward;
}

function run(link, operation, forward) {
  return new Promise((resolve, reject) => {
    link.request(operation, forward).subscribe({ next: resolve, error: reject });
  });
}

const unauthenticatedResult = {
  errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
  data: null,
};

function http401() {
  const err = new Error('Response not successful: Received status code 401');
  err.name = 'ServerError';
  err.statusCode = 401;
  err.result = { message: 'Unauthorized' };
  return err;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeEach(() => {
  setLocalStorage({ geek_token: 'old.jwt' });
  setBrowserEnv();
  resetRefreshStateForTests();
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.fetch;
  vi.restoreAllMocks();
});

describe('errorLink — auth failure refreshes and retries', () => {
  it('UNAUTHENTICATED → one refresh → the retry succeeds, and nobody is logged out', async () => {
    const calls = mockFetch(() => json(200, { token: 'new.jwt', refreshToken: 'r2' }));
    const forward = makeForward([
      { result: unauthenticatedResult },
      { result: { data: { weight: 1 } } },
    ]);

    const result = await run(errorLink('fitnessgeek'), makeOperation(), forward);
    await flush();

    expect(result.data).toEqual({ weight: 1 });
    expect(forward.state.calls).toBe(2);
    expect(calls.filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(false);
    expect(window.location.href).toBe('https://fitnessgeek.clintgeek.com/weight');
    expect(localStorage.getItem('geek_token')).toBe('new.jwt');
  });

  it('an HTTP 401 networkError takes the same path', async () => {
    const calls = mockFetch(() => json(200, { token: 'new.jwt' }));
    const forward = makeForward([{ error: http401() }, { result: { data: { ok: true } } }]);

    const result = await run(errorLink('fitnessgeek'), makeOperation(), forward);
    await flush();

    expect(result.data.ok).toBe(true);
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(false);
  });

  it('a refresh answered 401 is the session ending: log out and go to sign-in', async () => {
    const calls = mockFetch(() => json(401, { message: 'expired' }));
    const forward = makeForward([{ result: unauthenticatedResult }]);

    const result = await run(errorLink('fitnessgeek'), makeOperation(), forward);
    await flush();

    expect(result.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(forward.state.calls).toBe(1);
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(true);
    expect(window.location.href).toMatch(/\/login\?app=fitnessgeek/);
  });

  it('a refresh that cannot reach the server does not log out', async () => {
    const calls = mockFetch(() => { throw new TypeError('Failed to fetch'); });
    const forward = makeForward([{ result: unauthenticatedResult }]);

    await expect(run(errorLink('fitnessgeek'), makeOperation(), forward)).rejects.toThrow('Failed to fetch');
    await flush();

    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(false);
    expect(window.location.href).toBe('https://fitnessgeek.clintgeek.com/weight');
    expect(localStorage.getItem('geek_token')).toBe('old.jwt');
  });

  it('a refresh answered 502 (fleet restarting) does not log out, and says 502', async () => {
    const calls = mockFetch(() => json(502, { message: 'bad gateway' }));
    const forward = makeForward([{ error: http401() }]);

    const err = await run(errorLink('fitnessgeek'), makeOperation(), forward).catch((e) => e);
    await flush();

    expect(err.statusCode).toBe(502);
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(false);
  });

  it('several operations failing at once share one refresh', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = mockFetch(async () => { await gate; return json(200, { token: 'new.jwt' }); });
    const link = errorLink('fitnessgeek');

    const runs = [1, 2, 3].map((n) => run(
      link,
      makeOperation(),
      makeForward([{ result: unauthenticatedResult }, { result: { data: { n } } }]),
    ));
    await flush();
    release();
    const results = await Promise.all(runs);

    expect(results.map((r) => r.data.n)).toEqual([1, 2, 3]);
    expect(calls.filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});

describe('authLink — waits for a refresh in flight', () => {
  it('sends the new token, not the one being replaced', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    mockFetch(async () => { await gate; return json(200, { token: 'new.jwt' }); });

    const pending = refreshSession();
    const headersP = new Promise((resolve, reject) => {
      const forward = (op) => ({
        subscribe: (observer) => {
          observer.next(op.getContext().headers);
          observer.complete();
          return { unsubscribe() {} };
        },
      });
      authLink.request(makeOperation(), forward).subscribe({ next: resolve, error: reject });
    });
    release();
    await pending;
    const headers = await headersP;

    expect(headers.authorization).toBe('Bearer new.jwt');
  });
});
