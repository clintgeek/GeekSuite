// commandFailure.test.js — the command box's error reporting.
//
// Going-over 2026-09-05. Before this, every capture and search path in
// `CommandBox.jsx` caught with
//
//     if (err instanceof UnauthorizedError) markOut()
//
// and did nothing at all for anything else. Pressing Enter on `> feed the
// birds /tomorrow` while the gateway was returning 500s left the text sitting
// in the box and said nothing — indistinguishable from a task that saved.
//
// startgeek has no component runner, so the decision lives in a pure module
// (same reasoning as `csrfHeal.js`) and this runs on plain node:test.
//
// Run with: node --test apps/startgeek/src/lib/commandFailure.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { failureMessage, isAuthFailure } from './commandFailure.js'
import { UnauthorizedError } from './errors.js'

describe('isAuthFailure', () => {
  test('an UnauthorizedError is the session ending, not a failed call', () => {
    assert.equal(isAuthFailure(new UnauthorizedError()), true)
  })

  test('every other error is a failed call', () => {
    assert.equal(isAuthFailure(new Error('Internal server error')), false)
    assert.equal(isAuthFailure(new TypeError('Failed to fetch')), false)
    assert.equal(isAuthFailure(null), false)
    assert.equal(isAuthFailure(undefined), false)
    assert.equal(isAuthFailure('nope'), false)
  })
})

describe('failureMessage', () => {
  test("prefers the server's own message", () => {
    assert.equal(
      failureMessage(new Error('dueDate must be a valid date'), "Couldn't add the task"),
      'dueDate must be a valid date'
    )
  })

  test('falls back to the caller phrasing when the error carries none', () => {
    assert.equal(failureMessage(new Error(''), "Couldn't add the task"), "Couldn't add the task")
    assert.equal(failureMessage({}, "Couldn't save the note"), "Couldn't save the note")
    assert.equal(failureMessage(undefined, "Couldn't reach the suite"), "Couldn't reach the suite")
  })

  test('a whitespace-only message is treated as no message', () => {
    assert.equal(failureMessage(new Error('   '), "Couldn't add the task"), "Couldn't add the task")
  })

  test('never returns an empty string — silence is the bug this exists to remove', () => {
    for (const [err, fallback] of [
      [undefined, undefined],
      [null, ''],
      [new Error(''), '   '],
      [{ message: 42 }, null],
    ]) {
      const message = failureMessage(err, fallback)
      assert.equal(typeof message, 'string')
      assert.ok(message.length > 0, `empty message for ${JSON.stringify(err)}`)
    }
  })
})
