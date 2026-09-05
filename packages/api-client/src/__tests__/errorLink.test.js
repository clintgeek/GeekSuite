/**
 * errorLink.test.js — the stale-tab CSRF heal in the shared Apollo error link.
 *
 * `errorLink` (packages/api-client/src/index.js) sits in front of `authLink`
 * in every consumer app's Apollo client. A tab that predates the CSRF
 * rollout, or whose `geek_csrf` cookie just rotated under it, gets a
 * `networkError` off basegeek's csrfTokenGuard: `statusCode: 403` and
 * `result: { error: 'csrf_token_missing' | 'csrf_token_invalid' }`. This
 * retries once through `forward()` (which re-runs `authLink`, re-reading the
 * cookie fresh) and reloads once per session if that retry hits the same
 * wall. See DOCS/CONTEXT.md "CSRF: the double-submit token".
 *
 * Runs on vitest for the same reason authLink.test.js does — see its header
 * comment on `@apollo/client`'s subpath exports vs. Node's strict resolver.
 *
 * Run with: pnpm --filter @geeksuite/api-client test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { errorLink } from '../index.js';

const CSRF_RELOAD_FLAG_KEY = 'geeksuite:csrf-reload-attempted';

function setLocalStorage(values = {}) {
  const store = { ...values };
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

function makeSessionStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
}

/** Stubs just enough `window` for triggerCsrfReloadOnce and the 401 logout path. */
function setBrowserEnv({ sessionStorage } = {}) {
  const reloadCalls = [];
  globalThis.window = {
    location: { href: 'https://notegeek.clintgeek.com/', reload: () => { reloadCalls.push(true); } },
    sessionStorage: sessionStorage === undefined ? makeSessionStorage() : sessionStorage,
  };
  return reloadCalls;
}

beforeEach(() => {
  setLocalStorage({});
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.window;
  vi.restoreAllMocks();
});

/** Minimal stand-in for an Apollo Operation: just getContext/setContext. */
function makeOperation(initialContext = {}) {
  let context = { headers: {}, ...initialContext };
  return {
    getContext: () => context,
    setContext: (next) => {
      context = { ...context, ...(typeof next === 'function' ? next(context) : next) };
      return context;
    },
  };
}

function csrfNetworkError(code = 'csrf_token_missing') {
  const err = new Error('Response not successful: Received status code 403');
  err.name = 'ServerError';
  err.statusCode = 403;
  err.result = { error: code };
  return err;
}

/**
 * A stateful `forward` stand-in: each call consumes the next queued
 * behaviour, mimicking a fresh dispatch through authLink+httpLink (a queued
 * `error` simulates that dispatch failing again; a queued `result` simulates
 * it succeeding).
 */
function makeForward(behaviors) {
  let call = 0;
  return () => {
    const behavior = behaviors[Math.min(call, behaviors.length - 1)];
    call += 1;
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
}

/** Runs a link's request() and resolves/rejects with what it emits. */
function run(link, operation, forward) {
  return new Promise((resolve, reject) => {
    link.request(operation, forward).subscribe({
      next: resolve,
      error: reject,
    });
  });
}

describe('errorLink CSRF heal', () => {
  it('retries once via forward() (which re-runs authLink) and resolves on success', async () => {
    setBrowserEnv();
    const link = errorLink('notegeek');
    const forward = makeForward([
      { error: csrfNetworkError('csrf_token_missing') },
      { result: { data: { ok: true } } },
    ]);
    const operation = makeOperation();

    const result = await run(link, operation, forward);

    expect(result.data.ok).toBe(true);
    expect(window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY)).toBeNull();
  });

  it('reloads once, per session, when the retry fails with the same code', async () => {
    const reloadCalls = setBrowserEnv();
    const link = errorLink('notegeek');
    const forward = makeForward([
      { error: csrfNetworkError('csrf_token_invalid') },
      { error: csrfNetworkError('csrf_token_invalid') },
    ]);
    const operation = makeOperation();

    await expect(run(link, operation, forward)).rejects.toThrow();
    expect(reloadCalls.length).toBe(1);
  });

  it('does not retry or reload for an unrelated networkError', async () => {
    const reloadCalls = setBrowserEnv();
    const link = errorLink('notegeek');
    const otherError = new Error('boom');
    otherError.statusCode = 500;
    const operation = makeOperation();

    const forward = makeForward([{ error: otherError }]);
    await expect(run(link, operation, forward)).rejects.toThrow('boom');

    expect(operation.getContext().csrfHealRetried).toBeUndefined();
    expect(reloadCalls.length).toBe(0);
  });

  it('does not retry or reload for a 403 with an unrelated code', async () => {
    const reloadCalls = setBrowserEnv();
    const link = errorLink('notegeek');
    const otherError = new Error('Response not successful: Received status code 403');
    otherError.statusCode = 403;
    otherError.result = { error: 'forbidden' };
    const operation = makeOperation();

    const forward = makeForward([{ error: otherError }]);
    await expect(run(link, operation, forward)).rejects.toThrow();

    expect(operation.getContext().csrfHealRetried).toBeUndefined();
    expect(reloadCalls.length).toBe(0);
  });

  it('leaves the existing 401 → logout path untouched by the CSRF branch', async () => {
    const reloadCalls = setBrowserEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const link = errorLink('notegeek');
    const unauthorizedError = new Error('Response not successful: Received status code 401');
    unauthorizedError.statusCode = 401;
    const forward = makeForward([{ error: unauthorizedError }]);
    const operation = makeOperation();

    await expect(run(link, operation, forward)).rejects.toThrow();

    // The CSRF-heal branch never engaged for a 401 — no retry context, no reload.
    expect(operation.getContext().csrfHealRetried).toBeUndefined();
    expect(reloadCalls.length).toBe(0);
    // ...and the pre-existing logout-on-401 behaviour still ran.
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
