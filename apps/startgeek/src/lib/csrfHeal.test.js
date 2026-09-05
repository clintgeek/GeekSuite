// csrfHeal.test.js — startgeek's stale-tab CSRF heal (graphql.js, basegeek.js).
//
// startgeek has no test runner configured (no vitest/jest), so this runs on
// plain node:test with no jsdom — `document`/`window` are stubbed to exactly
// what csrfHeal.js reads.
//
// Run with: node --test apps/startgeek/src/lib/csrfHeal.test.js

import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { shouldHealCsrf, triggerCsrfReloadOnce, CSRF_RELOAD_FLAG_KEY } from './csrfHeal.js'

afterEach(() => {
  delete globalThis.window
})

/** A minimal, in-memory sessionStorage stand-in. */
function makeSessionStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value) },
  }
}

/** Stub `window` with just what triggerCsrfReloadOnce reads. */
function setBrowserEnv({ sessionStorage } = {}) {
  const reloadCalls = []
  globalThis.window = {
    location: { reload: () => { reloadCalls.push(true) } },
    sessionStorage: sessionStorage === undefined ? makeSessionStorage() : sessionStorage,
  }
  return reloadCalls
}

describe('shouldHealCsrf', () => {
  test('true for the bare shape csrfTokenGuard actually sends', () => {
    assert.equal(shouldHealCsrf(403, { error: 'csrf_token_missing' }), true)
    assert.equal(shouldHealCsrf(403, { error: 'csrf_token_invalid' }), true)
  })

  test('also true for a { code } or nested { error: { code } } wrapper', () => {
    assert.equal(shouldHealCsrf(403, { code: 'csrf_token_missing' }), true)
    assert.equal(shouldHealCsrf(403, { error: { code: 'csrf_token_invalid' } }), true)
  })

  test('false for a 403 with an unrelated code, or no body', () => {
    assert.equal(shouldHealCsrf(403, { error: 'forbidden' }), false)
    assert.equal(shouldHealCsrf(403, null), false)
    assert.equal(shouldHealCsrf(403, undefined), false)
    assert.equal(shouldHealCsrf(403, 'not an object'), false)
  })

  test('false for a non-403 status even with a matching code', () => {
    assert.equal(shouldHealCsrf(401, { error: 'csrf_token_missing' }), false)
    assert.equal(shouldHealCsrf(200, { error: 'csrf_token_missing' }), false)
  })
})

describe('triggerCsrfReloadOnce', () => {
  test('does nothing outside a browser (no window)', () => {
    assert.doesNotThrow(() => triggerCsrfReloadOnce())
  })

  test('reloads once, and sets the sessionStorage guard', () => {
    const reloadCalls = setBrowserEnv()
    triggerCsrfReloadOnce()
    assert.equal(reloadCalls.length, 1)
    assert.equal(window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY), '1')
  })

  test('does not reload again once the flag is already set', () => {
    const reloadCalls = setBrowserEnv({ sessionStorage: makeSessionStorage({ [CSRF_RELOAD_FLAG_KEY]: '1' }) })
    triggerCsrfReloadOnce()
    assert.equal(reloadCalls.length, 0)
  })

  test('a broken sessionStorage does not prevent the one reload it cannot guard', () => {
    const reloadCalls = []
    globalThis.window = {
      location: { reload: () => { reloadCalls.push(true) } },
      get sessionStorage() { throw new Error('storage disabled') },
    }
    assert.doesNotThrow(() => triggerCsrfReloadOnce())
    assert.equal(reloadCalls.length, 1)
  })
})
