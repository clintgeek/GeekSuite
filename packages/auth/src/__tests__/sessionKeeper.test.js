/**
 * sessionKeeper.test.js — what AuthProvider does with an /api/me answer
 * (REVIEW_2026-10 B2).
 *
 * AuthProvider used to set the user to null on any failed /api/me, so a 502
 * during a fleet restart (or no signal) sent ProtectedRoute to the sign-in
 * page. Now only getMe() answering null — a 401 that survived one refresh —
 * signs out. Anything else keeps the last known user, raises
 * connectionProblem, and retries: on a schedule, then on foreground/online.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSessionKeeper } from '../sessionKeeper.js';
import { USER_CACHE_KEY, readCachedUser, clearTokens } from '../authClient.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

function makeTarget(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    dispatch: (type) => { for (const fn of [...(listeners[type] || [])]) fn(); },
  };
}

/** Manual timers: run them when the test says so. */
function makeTimers() {
  const pending = [];
  return {
    pending,
    setTimer: (fn, ms) => { pending.push({ fn, ms }); return pending.length; },
    clearTimer: () => {},
    runNext: () => pending.shift()?.fn(),
  };
}

/** getMe stand-in that plays queued answers: a value, or an Error to throw. */
function queuedGetMe(answers) {
  const queue = [...answers];
  const fn = async () => {
    fn.calls += 1;
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = 0;
  return fn;
}

function recorder() {
  const r = { users: [], signedOut: 0, problems: [], settled: 0 };
  r.callbacks = {
    onUser: (u) => r.users.push(u),
    onSignedOut: () => { r.signedOut += 1; },
    onConnectionProblem: (p) => r.problems.push(p),
    onSettled: () => { r.settled += 1; },
  };
  return r;
}

const badGateway = () => Object.assign(new Error('Failed to load session'), { status: 502 });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  globalThis.window = makeTarget({ location: { search: '', href: 'https://fitnessgeek.clintgeek.com/' } });
  globalThis.document = makeTarget({ cookie: '', visibilityState: 'visible' });
  globalThis.localStorage = makeStorage();
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
});

describe('createSessionKeeper', () => {
  test('a user from /api/me is passed on and remembered', async () => {
    const r = recorder();
    const keeper = createSessionKeeper({ getMe: queuedGetMe([{ id: 'heather' }]), ...r.callbacks, ...makeTimers() });
    await keeper.start();

    assert.deepEqual(r.users, [{ id: 'heather' }]);
    assert.equal(r.signedOut, 0);
    assert.equal(r.settled, 1);
    assert.deepEqual(readCachedUser(), { id: 'heather' });
    keeper.stop();
  });

  test('/api/me 502 with a known user: the user is kept, connectionProblem is raised', async () => {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'heather' }));
    const r = recorder();
    const timers = makeTimers();
    const keeper = createSessionKeeper({ getMe: queuedGetMe([badGateway()]), ...r.callbacks, ...timers });
    await keeper.start();

    assert.deepEqual(r.users, [{ id: 'heather' }]);
    assert.equal(r.signedOut, 0, 'a restart is not a sign-out');
    assert.deepEqual(r.problems, [true]);
    assert.equal(r.settled, 1, 'loading ends so the app can render');
    assert.deepEqual(timers.pending.map((t) => t.ms), [2000]);
    keeper.stop();
  });

  test('/api/me 401 (getMe answers null) signs out and forgets the user', async () => {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'heather' }));
    const r = recorder();
    const keeper = createSessionKeeper({ getMe: queuedGetMe([null]), ...r.callbacks, ...makeTimers() });
    await keeper.start();

    assert.equal(r.signedOut, 1);
    assert.deepEqual(r.users, []);
    assert.equal(readCachedUser(), null);
    keeper.stop();
  });

  test('retries 2s, 5s, 15s, then waits for foreground or signal', async () => {
    const r = recorder();
    const timers = makeTimers();
    const getMe = queuedGetMe([badGateway()]);
    const keeper = createSessionKeeper({ getMe, ...r.callbacks, ...timers });
    await keeper.start();

    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      seen.push(timers.pending[0].ms);
      timers.runNext();
      await flush();
    }
    assert.deepEqual(seen, [2000, 5000, 15000]);
    assert.equal(timers.pending.length, 0, 'no more timed retries');
    assert.equal(getMe.calls, 4);

    window.dispatch('online');
    await flush();
    assert.equal(getMe.calls, 5);

    document.dispatch('visibilitychange');
    await flush();
    assert.equal(getMe.calls, 6);
    keeper.stop();
  });

  test('a retry that gets through clears connectionProblem and passes the fresh user', async () => {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'heather', name: 'old' }));
    const r = recorder();
    const timers = makeTimers();
    const keeper = createSessionKeeper({
      getMe: queuedGetMe([badGateway(), { id: 'heather', name: 'new' }]),
      ...r.callbacks,
      ...timers,
    });
    await keeper.start();
    timers.runNext();
    await flush();

    assert.deepEqual(r.problems, [true, false]);
    assert.deepEqual(r.users.at(-1), { id: 'heather', name: 'new' });
    keeper.stop();
  });

  test('a failure with nobody known raises the problem but invents no user', async () => {
    const r = recorder();
    const keeper = createSessionKeeper({ getMe: queuedGetMe([new TypeError('Failed to fetch')]), ...r.callbacks, ...makeTimers() });
    await keeper.start();

    assert.deepEqual(r.users, []);
    assert.equal(r.signedOut, 0);
    assert.deepEqual(r.problems, [true]);
    keeper.stop();
  });

  test('foreground does not re-check when nothing is wrong', async () => {
    const getMe = queuedGetMe([{ id: 'heather' }]);
    const keeper = createSessionKeeper({ getMe, ...recorder().callbacks, ...makeTimers() });
    await keeper.start();
    document.dispatch('visibilitychange');
    window.dispatch('online');
    await flush();
    assert.equal(getMe.calls, 1);
    keeper.stop();
  });

  test('blocked storage: no cache, no crash', async () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const r = recorder();
    const keeper = createSessionKeeper({ getMe: queuedGetMe([badGateway()]), ...r.callbacks, ...makeTimers() });
    await keeper.start();
    assert.deepEqual(r.users, []);
    assert.deepEqual(r.problems, [true]);
    keeper.stop();
  });

  test('clearing tokens (the session ended) forgets the cached user', () => {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'heather' }));
    clearTokens();
    assert.equal(readCachedUser(), null);
  });
});
