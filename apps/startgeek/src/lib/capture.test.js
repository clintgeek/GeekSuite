import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  captureAttemptFor,
  createBusyGuard,
  newClientId,
  partialCaptureMessage,
  runTaskCapture,
  taskVariables,
} from './capture.js'
import parseTaskInput from './parseTaskInput.js'

/**
 * A fake gateway with TodoGeek's contract C1: one task per clientId. `fail`
 * makes the named step throw once.
 */
function fakeGateway({ fail = {} } = {}) {
  const tasks = new Map()
  const calls = { createTask: 0, createNote: 0, blockTask: 0 }
  const failures = { ...fail }
  const maybeFail = (name) => {
    if (failures[name]) {
      failures[name] = false
      throw new Error(`${name} failed`)
    }
  }
  return {
    tasks,
    calls,
    steps: {
      async createTask(vars) {
        calls.createTask += 1
        if (vars.clientId && tasks.has(vars.clientId)) return tasks.get(vars.clientId)
        const task = { id: `t${tasks.size + 1}`, ...vars }
        // The server can write the row and still fail the response (timeout).
        tasks.set(vars.clientId || `anon-${tasks.size}`, task)
        maybeFail('createTask')
        return task
      },
      async createNote() {
        calls.createNote += 1
        maybeFail('createNote')
        return { id: 'n1' }
      },
      async blockTask() {
        calls.blockTask += 1
        maybeFail('blockTask')
        return { id: 't1' }
      },
    },
  }
}

test('every capture sends a clientId with createTask', async () => {
  const gw = fakeGateway()
  const attempt = captureAttemptFor(null, 'task:buy milk')
  await runTaskCapture(parseTaskInput('buy milk'), attempt, gw.steps)
  const [task] = gw.tasks.values()
  assert.equal(typeof task.clientId, 'string')
  assert.ok(task.clientId.length > 8)
  assert.equal(task.clientId, attempt.clientId)
})

test('a retry of the same line reuses the clientId; a different line gets a new one', () => {
  let n = 0
  const make = () => `id-${++n}`
  const first = captureAttemptFor(null, 'task:a', make)
  assert.equal(captureAttemptFor(first, 'task:a', make), first)
  const other = captureAttemptFor(first, 'task:b', make)
  assert.notEqual(other.clientId, first.clientId)
})

test('a createTask that wrote the row but failed the response does not duplicate on retry', async () => {
  const gw = fakeGateway({ fail: { createTask: true } })
  const fields = parseTaskInput('call the vet')
  let attempt = captureAttemptFor(null, 'task:call the vet')
  await assert.rejects(runTaskCapture(fields, attempt, gw.steps), (err) => err.captureStep === 'task')
  attempt = captureAttemptFor(attempt, 'task:call the vet')
  await runTaskCapture(fields, attempt, gw.steps)
  assert.equal(gw.tasks.size, 1)
})

test('a failed follow-up step: the retry resumes there and never re-creates the task', async () => {
  const gw = fakeGateway({ fail: { createNote: true } })
  const line = 'pay invoice $^remember the PO number'
  const fields = parseTaskInput(line)
  assert.ok(fields.noteGeekNote, 'fixture: the line carries a NoteGeek note')

  let attempt = captureAttemptFor(null, `task:${line}`)
  let failure
  await runTaskCapture(fields, attempt, gw.steps).catch((err) => {
    failure = err
  })
  assert.equal(failure.captureStep, 'note')
  assert.ok(attempt.taskId)
  assert.match(partialCaptureMessage(failure, attempt), /^Task added/)

  attempt = captureAttemptFor(attempt, `task:${line}`)
  await runTaskCapture(fields, attempt, gw.steps)
  assert.equal(gw.calls.createTask, 1, 'createTask is not called again')
  assert.equal(gw.calls.createNote, 2)
  assert.equal(gw.tasks.size, 1)
})

test('a failed block step is retried alone', async () => {
  const gw = fakeGateway({ fail: { blockTask: true } })
  const line = 'renew passport ~blocked waiting on photos'
  const fields = parseTaskInput(line)
  assert.equal(fields.blocked, true)
  const attempt = captureAttemptFor(null, `task:${line}`)
  await assert.rejects(runTaskCapture(fields, attempt, gw.steps))
  await runTaskCapture(fields, attempt, gw.steps)
  assert.equal(gw.calls.createTask, 1)
  assert.equal(gw.calls.blockTask, 2)
})

test('partialCaptureMessage is null when the task itself failed', () => {
  const err = Object.assign(new Error('x'), { captureStep: 'task' })
  assert.equal(partialCaptureMessage(err, { taskId: null }), null)
})

test('the busy guard drops a second run while the first is in flight', { timeout: 2000 }, async () => {
  const guard = createBusyGuard()
  let release
  let runs = 0
  const slow = () =>
    new Promise((resolve) => {
      runs += 1
      release = resolve
    })
  const first = guard.run(slow)
  const second = await guard.run(slow) // double Enter
  assert.equal(second, undefined)
  assert.equal(runs, 1)
  assert.equal(guard.busy, true)
  release('done')
  assert.equal(await first, 'done')
  assert.equal(guard.busy, false)
  await guard.run(async () => {
    runs += 1
  })
  assert.equal(runs, 2, 'the guard reopens after the first settles')
})

test('the busy guard reopens after a failure', async () => {
  const guard = createBusyGuard()
  await assert.rejects(guard.run(async () => {
    throw new Error('boom')
  }))
  assert.equal(guard.busy, false)
})

test('taskVariables defaults the due date to 9 am today and carries the clientId', () => {
  const now = new Date(2026, 10, 16, 15, 30)
  const vars = taskVariables({ content: 'x' }, 'cid', now)
  const due = new Date(vars.dueDate)
  assert.equal(due.getHours(), 9)
  assert.equal(due.getDate(), 16)
  assert.equal(vars.clientId, 'cid')
})

test('newClientId is unique', () => {
  assert.notEqual(newClientId(), newClientId())
})

test('the CREATE_TASK document declares and passes clientId', async () => {
  const { CREATE_TASK } = await import('./queries.js')
  assert.match(CREATE_TASK, /\$clientId:\s*String\b/)
  assert.match(CREATE_TASK, /clientId:\s*\$clientId/)
})
