// feedback.test.js — how long a message stays, and a ticked task's Undo
// (design review 2026-11-18, findings 5 and 6).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeToast, toastLifetime, toggleTaskWithUndo, TOAST_MS, TOAST_ACTION_MS } from './feedback.js'

test('a plain message stays about 6 s, not 2.5 s', () => {
  assert.equal(toastLifetime(normalizeToast('Added for today')), TOAST_MS)
  assert.ok(TOAST_MS >= 6000)
})

test('a message with Undo stays longer', () => {
  const t = normalizeToast({ message: 'Done: x', action: { label: 'Undo', run: () => {} } })
  assert.equal(toastLifetime(t), TOAST_ACTION_MS)
  assert.ok(TOAST_ACTION_MS > TOAST_MS)
})

test('a failure stays until dismissed', () => {
  assert.equal(toastLifetime(normalizeToast({ tone: 'error', message: "Couldn't add the task" })), null)
})

test('nothing to say is no toast', () => {
  assert.equal(normalizeToast(''), null)
  assert.equal(normalizeToast(null), null)
  assert.equal(normalizeToast({ message: '  ' }), null)
})

function harness({ failOn = [] } = {}) {
  const calls = []
  const toasts = []
  let refreshes = 0
  let authed = 0
  const fails = [...failOn]
  return {
    calls,
    toasts,
    get refreshes() {
      return refreshes
    },
    get authed() {
      return authed
    },
    deps: {
      setStatus: async (id, status) => {
        calls.push([id, status])
        if (fails.includes(calls.length)) throw new Error('Failed to fetch')
      },
      notify: (t) => toasts.push(t),
      refresh: () => {
        refreshes += 1
      },
      onAuthFailure: () => {
        authed += 1
      },
      isAuthFailure: (err) => err?.name === 'UnauthorizedError',
    },
  }
}

test('ticking a task says what happened and offers Undo', async () => {
  const h = harness()
  const ok = await toggleTaskWithUndo({ id: 't1', content: 'Buy milk', status: 'pending' }, h.deps)
  assert.equal(ok, true)
  assert.deepEqual(h.calls, [['t1', 'completed']])
  assert.equal(h.toasts.length, 1)
  assert.match(h.toasts[0].message, /Done: Buy milk/)
  assert.equal(h.toasts[0].action?.label, 'Undo')
  assert.equal(h.refreshes, 1)
})

test('Undo puts the task back the way it was', async () => {
  const h = harness()
  await toggleTaskWithUndo({ id: 't1', content: 'Buy milk', status: 'pending' }, h.deps)
  await h.toasts[0].action.run()
  assert.deepEqual(h.calls, [
    ['t1', 'completed'],
    ['t1', 'pending'],
  ])
  assert.match(h.toasts[1].message, /Back on the list: Buy milk/)
  assert.equal(h.refreshes, 2)
})

test('a failed tick says so in plain words and stays on screen', async () => {
  const h = harness({ failOn: [1] })
  const ok = await toggleTaskWithUndo({ id: 't1', content: 'Buy milk', status: 'pending' }, h.deps)
  assert.equal(ok, false)
  assert.equal(h.toasts.length, 1)
  assert.equal(h.toasts[0].tone, 'error')
  assert.match(h.toasts[0].message, /Couldn't mark done "Buy milk". Nothing changed/)
  assert.equal(toastLifetime(normalizeToast(h.toasts[0])), null)
  assert.equal(h.refreshes, 0)
})

test('a failed Undo says so', async () => {
  const h = harness({ failOn: [2] })
  await toggleTaskWithUndo({ id: 't1', content: 'Buy milk', status: 'pending' }, h.deps)
  await h.toasts[0].action.run()
  assert.equal(h.toasts[1].tone, 'error')
  assert.match(h.toasts[1].message, /Couldn't undo/)
})

test('an expired session signs out instead of a toast', async () => {
  const h = harness()
  h.deps.setStatus = async () => {
    const e = new Error('x')
    e.name = 'UnauthorizedError'
    throw e
  }
  await toggleTaskWithUndo({ id: 't1', content: 'x' }, h.deps)
  assert.equal(h.authed, 1)
  assert.equal(h.toasts.length, 0)
})
