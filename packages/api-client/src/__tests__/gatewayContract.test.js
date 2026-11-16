/**
 * gatewayContract.test.js — the two ends of SUITE_REVIEW_2026-11 S1/S2 agree.
 *
 * The gateway now answers a refused session token with HTTP 401 and
 *   { errors: [{ message: 'Unauthorized: …', extensions: { code: 'UNAUTHENTICATED' } }] }
 * and NO `data` key (apps/basegeek/packages/api/src/middleware/auth.js,
 * GATEWAY_UNAUTHENTICATED_BODY). A resolver's `requireUser` answers
 * UNAUTHENTICATED on an HTTP 200, and TodoGeek's task reads still answer a
 * 401 that carries `data`. These tests run those exact bodies through a real Apollo HttpLink —
 * not a hand-made networkError — so what Apollo Client actually raises is
 * what the error link is tested against.
 *
 * Also pins the S2 client half (no refresh on a message that merely contains
 * "401", none on FORBIDDEN; legacy shapes still heal), the A6 mutation-replay
 * guard, the A6 storage guard in authLink, and the A4/A5 before-leave hooks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApolloLink, createHttpLink, execute, gql } from '@apollo/client';

import {
  errorLink,
  authLink,
  isUnauthenticatedGraphQLError,
  mayReplayAfterRefresh,
  reloadForStaleBundleOnce,
} from '../index.js';
import { resetRefreshStateForTests, onBeforeLeave, resetLeaveHooksForTests } from '@geeksuite/auth';

const GATEWAY_401 = {
  errors: [{ message: 'Unauthorized: your session has expired, sign in again', extensions: { code: 'UNAUTHENTICATED' } }],
};
const RESOLVER_UNAUTH = {
  errors: [{ message: 'Unauthorized: sign in to continue', path: ['birds'], extensions: { code: 'UNAUTHENTICATED' } }],
  data: null,
};
const RESOLVER_401_WITH_DATA = {
  errors: [{ message: 'Unauthorized: sign in to read tasks', path: ['birds'], extensions: { code: 'UNAUTHENTICATED' } }],
  data: { birds: null },
};

function setLocalStorage(values = {}) {
  const store = { ...values };
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

function setBrowserEnv() {
  const reloads = [];
  globalThis.window = {
    location: {
      href: 'https://flockgeek.clintgeek.com/birds',
      search: '',
      origin: 'https://flockgeek.clintgeek.com',
      reload: () => reloads.push(true),
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
  };
  return reloads;
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

/**
 * fetch stand-in for both the gateway (/graphql, answered from `graphql`
 * in order) and the auth endpoints.
 */
function mockFetch({ graphql = [], refresh = () => jsonResponse(200, { token: 'new.jwt' }) } = {}) {
  const calls = [];
  const queue = [...graphql];
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, auth: opts?.headers?.authorization });
    if (u.endsWith('/auth/refresh')) return refresh();
    if (u.endsWith('/auth/logout')) return jsonResponse(200, {});
    if (u.endsWith('/graphql')) {
      const [status, body] = queue.shift();
      return jsonResponse(status, body);
    }
    return jsonResponse(404, {});
  });
  return calls;
}

const BIRDS = gql`query Birds { birds { id } }`;

function runOp(query = BIRDS) {
  const httpLink = createHttpLink({ uri: 'https://flockgeek.clintgeek.com/graphql', fetch: (...a) => globalThis.fetch(...a) });
  const link = ApolloLink.from([errorLink('flockgeek'), authLink, httpLink]);
  return new Promise((resolve, reject) => {
    execute(link, { query }).subscribe({ next: resolve, error: reject });
  });
}

const flush = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  setLocalStorage({ geek_token: 'expired.jwt' });
  setBrowserEnv();
  resetRefreshStateForTests();
  resetLeaveHooksForTests();
});

afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.fetch;
  vi.restoreAllMocks();
});

describe('gateway 401 → refresh → replay, through a real HttpLink', () => {
  it('the gate\'s 401 (no data) refreshes once and replays with the new token', async () => {
    const calls = mockFetch({ graphql: [[401, GATEWAY_401], [200, { data: { birds: [{ id: 'b1', __typename: 'Bird' }] } }]] });

    const result = await runOp();
    await flush();

    expect(result.data.birds).toHaveLength(1);
    const gqlCalls = calls.filter((c) => c.url.endsWith('/graphql'));
    expect(gqlCalls.map((c) => c.auth)).toEqual(['Bearer expired.jwt', 'Bearer new.jwt']);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(calls.some((c) => c.url.endsWith('/auth/logout'))).toBe(false);
  });

  it('a resolver\'s requireUser (UNAUTHENTICATED on a 200) refreshes and replays once', async () => {
    const calls = mockFetch({ graphql: [[200, RESOLVER_UNAUTH], [200, { data: { birds: [] } }]] });
    const result = await runOp();
    expect(result.data.birds).toEqual([]);
    expect(result.errors).toBeUndefined();
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(2);
  });

  it('a 401 that ALSO carries data (HttpLink emits next + error) is replayed once, not twice', async () => {
    // TodoGeek's requireTaskReader sets extensions.http.status 401, so its
    // anonymous answer is this shape today.
    const calls = mockFetch({ graphql: [[401, RESOLVER_401_WITH_DATA], [200, { data: { birds: [] } }], [200, { data: { birds: [] } }]] });
    const result = await runOp();
    await flush();
    expect(result.data.birds).toEqual([]);
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(2);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('a dead refresh token ends the session: logout, then sign-in — after the before-leave hooks', async () => {
    const order = [];
    onBeforeLeave(() => { order.push('hook'); });
    const calls = mockFetch({ graphql: [[401, GATEWAY_401]], refresh: () => jsonResponse(401, { code: 'TOKEN_REFRESH_ERROR' }) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (String(url).endsWith('/auth/logout')) order.push('logout');
      return realFetch(url, opts);
    });

    await runOp().catch(() => {});
    await flush();

    expect(order).toEqual(['hook', 'logout']);
    expect(window.location.href).toMatch(/\/login\?app=flockgeek/);
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(1);
  });
});

describe('S2 — what counts as "not signed in"', () => {
  it.each([
    [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }, true],
    [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }, true],              // gamegeek/thinggeek legacy
    [{ message: 'Unauthorized', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, true],     // bare Error('Unauthorized') legacy
    [{ message: 'Unauthorized: not a member', extensions: { code: 'FORBIDDEN' } }, false],  // permission, not session
    [{ message: 'Bird 401 not found', extensions: { code: 'NOT_FOUND' } }, false],          // a number in a message
    [{ message: 'Saved 401(k) note' }, false],
  ])('%j → %s', (err, expected) => {
    expect(isUnauthenticatedGraphQLError(err)).toBe(expected);
  });

  it('a "401" in an ordinary error message no longer refreshes or replays', async () => {
    const calls = mockFetch({ graphql: [[200, { errors: [{ message: 'Bird 401 not found', extensions: { code: 'NOT_FOUND' } }], data: { birds: null } }]] });
    const result = await runOp();
    expect(result.errors[0].message).toBe('Bird 401 not found');
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(0);
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(1);
  });
});

describe('A6 — a mutation that partly ran is not replayed', () => {
  const MUTATION = gql`mutation Two { a: logEgg(count: 1) { id } b: logEgg(count: 2) { id } }`;
  const op = { query: MUTATION };

  it('mayReplayAfterRefresh: queries always; mutations only when nothing came back', () => {
    expect(mayReplayAfterRefresh({ query: BIRDS }, { data: { birds: [] } })).toBe(true);
    expect(mayReplayAfterRefresh(op, { data: { a: null, b: null } })).toBe(true);
    expect(mayReplayAfterRefresh(op, { data: null })).toBe(true);
    expect(mayReplayAfterRefresh(op, { data: { a: { id: '1' }, b: null } })).toBe(false);
  });

  it('refreshes the session but returns the first answer instead of sending it twice', async () => {
    const calls = mockFetch({ graphql: [[200, {
      data: { a: { id: '1', __typename: 'Egg' }, b: null },
      errors: [{ message: 'Unauthorized', path: ['b'], extensions: { code: 'UNAUTHENTICATED' } }],
    }]] });
    const result = await runOp(MUTATION);
    expect(result.data.a.id).toBe('1');
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});

describe('A6 — authLink survives storage that throws', () => {
  it('sends the request (cookie-only) instead of failing it', async () => {
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
    const calls = mockFetch({ graphql: [[200, { data: { birds: [] } }]] });
    const result = await runOp();
    expect(result.data.birds).toEqual([]);
    expect(calls[0].auth).toBeUndefined();
  });
});

describe('A4 — stale-bundle reload waits for before-leave hooks', () => {
  it('runs the hook before reloading', async () => {
    const reloads = setBrowserEnv();
    const order = [];
    onBeforeLeave(() => new Promise((r) => setTimeout(() => { order.push('hook'); r(); }, 5)));
    window.location.reload = () => { order.push('reload'); reloads.push(true); };

    expect(reloadForStaleBundleOnce(5_000_000)).toBe(true);
    expect(order).toEqual([]);
    await flush();
    expect(order).toEqual(['hook', 'reload']);
  });
});
