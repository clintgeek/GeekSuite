import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionStatusFor } from './sessionStatus.js'

test('a user on an OK answer is signed in; an OK answer with no user is out', () => {
  assert.equal(sessionStatusFor(200, { user: { username: 'chef' } }), 'in')
  assert.equal(sessionStatusFor(200, {}), 'out')
  assert.equal(sessionStatusFor(200, null), 'out')
})

test('only an explicit refusal means signed out', () => {
  for (const code of [401, 403, 404]) assert.equal(sessionStatusFor(code), 'out', String(code))
})

test('a network failure, a 5xx or AUTH_UNAVAILABLE is "couldn\'t check", never signed out', () => {
  assert.equal(sessionStatusFor(null), 'error')
  for (const code of [500, 502, 503, 504, 429]) assert.equal(sessionStatusFor(code), 'error', String(code))
})
