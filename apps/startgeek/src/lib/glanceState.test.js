import { test } from 'node:test'
import assert from 'node:assert/strict'
import { glanceRowState } from './glanceState.js'

const snapshot = { date: '2026-11-16', tasks: { due: [], overdue: [], upcoming: [] } }

test('a failed first load is an error, not an empty day', () => {
  assert.equal(glanceRowState({ data: null, loading: false, error: new Error('502') }), 'error')
})

test('a failed refresh over earlier rows is stale, and the rows stay', () => {
  assert.equal(glanceRowState({ data: snapshot, error: new Error('timeout') }), 'stale')
})

test('loading, ready and empty', () => {
  assert.equal(glanceRowState({ data: null, loading: true }), 'loading')
  assert.equal(glanceRowState({ data: snapshot }), 'ready')
  // An empty day is still a snapshot: it is "ready" (the row hides itself),
  // never an error.
  assert.equal(glanceRowState({ data: { ...snapshot } }), 'ready')
  assert.equal(glanceRowState({ data: null }), 'empty')
})
