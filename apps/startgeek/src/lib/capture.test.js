import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  captureAttemptFor,
  createBusyGuard,
  describeCapture,
  draftFields,
  formatTime,
  NOTHING_TO_ADD,
  newClientId,
  partialCaptureMessage,
  runTaskCapture,
  taskVariables,
} from './capture.js'
import { parseTaskInput, toCreateInput } from '@geeksuite/task-grammar'

/**
 * A fake gateway with TodoGeek's contract C1: one task per clientId. `fail`
 * makes the named step throw once.
 */
function fakeGateway({ fail = {} } = {}) {
  const tasks = new Map()
  const calls = { createTask: 0, createNote: 0 }
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

test('~blocked files a #blocked tag with the reason in the note, as TodoGeek does', async () => {
  // Until 2026-11-18 StartGeek parked the task with a second blockTask call;
  // TodoGeek's add box files it as a tag (the parked state has no screen).
  const gw = fakeGateway()
  const line = 'renew passport ~blocked waiting on photos'
  const fields = parseTaskInput(line)
  assert.equal(fields.blocked, true)
  const attempt = captureAttemptFor(null, `task:${line}`)
  await runTaskCapture(fields, attempt, gw.steps)
  const [task] = gw.tasks.values()
  assert.equal(gw.calls.createTask, 1)
  assert.deepEqual(task.tags, ['blocked'])
  assert.equal(task.note, 'Blocked: waiting on photos')
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

test('taskVariables: no date means today, date-only, as TodoGeek sends it', () => {
  // Was "today at 9 am" (an instant) until 2026-11-18: a phantom 9:00 time
  // TodoGeek's own add box stopped sending.
  const now = new Date(2026, 10, 16, 15, 30)
  const vars = taskVariables({ content: 'x' }, 'cid', now)
  assert.equal(vars.dueDate, '2026-11-16')
  assert.equal(vars.hasDueTime, false)
  assert.equal(vars.clientId, 'cid')
})

test('(private) is read and carried through to createTask', async () => {
  const gw = fakeGateway()
  const line = 'book the clinic (private)'
  const fields = parseTaskInput(line)
  await runTaskCapture(fields, captureAttemptFor(null, `task:${line}`), gw.steps)
  const [task] = gw.tasks.values()
  assert.equal(task.private, true)
  assert.equal(task.content, 'book the clinic')
  assert.doesNotMatch(task.content, /private/i)
})

test('an ordinary line never sends private', () => {
  const vars = taskVariables(parseTaskInput('buy milk'), 'cid')
  assert.equal('private' in vars, false)
})

test('"call Dana tomorrow 2pm" reads the same as in TodoGeek: tomorrow at 2 pm, words without the date', () => {
  const now = new Date(2026, 10, 18, 9, 38)
  const line = 'call Dana tomorrow 2pm #work'
  const fields = parseTaskInput(line, { now })
  const vars = taskVariables(fields, 'cid', now)
  assert.equal(vars.content, 'call Dana')
  assert.deepEqual(vars.tags, ['work'])
  assert.equal(vars.hasDueTime, true)
  const due = new Date(vars.dueDate)
  assert.equal(due.getFullYear(), 2026)
  assert.equal(due.getMonth(), 10)
  assert.equal(due.getDate(), 19)
  assert.equal(due.getHours(), 14)
  assert.equal(due.getMinutes(), 0)
  // And it is exactly TodoGeek's createTask input for the same line.
  const { input } = toCreateInput(fields, { today: now, explicit: true })
  assert.deepEqual({ ...vars, clientId: undefined }, { ...input, clientId: undefined })
})

test('a model draft keeps its time', () => {
  const fields = draftFields({ content: 'dentist', dueDate: '2026-11-20T15:30:00', tags: ['health'], priority: 2 })
  const vars = taskVariables(fields, 'cid', new Date(2026, 10, 18))
  assert.equal(vars.hasDueTime, true)
  assert.equal(new Date(vars.dueDate).getHours(), 15)
  assert.equal(vars.priority, 2)
  assert.deepEqual(vars.tags, ['health'])
})

test('a drafted task keeps (private), ~blocked and the notes from the typed line', async () => {
  // The model sees "this afternoon" the grammar cannot read, and drafts the
  // line; its fields never carry the tokens the grammar reads with certainty.
  const line = 'call the clinic about results this afternoon (private) ~blocked waiting on the lab'
  const draft = { content: 'Call the clinic about results', dueDate: '2026-11-20T14:00:00', tags: [], signifier: '*' }
  const gw = fakeGateway()
  const fields = draftFields(draft, line)
  const vars = taskVariables(fields, 'cid', new Date(2026, 10, 20, 9))
  assert.equal(vars.private, true)
  assert.deepEqual(vars.tags, ['blocked'])
  assert.equal(vars.note, 'Blocked: waiting on the lab')
  assert.equal(new Date(vars.dueDate).getHours(), 14)
  // The same tag and note the direct path files for the same tokens.
  const direct = taskVariables(parseTaskInput('call the clinic (private) ~blocked waiting on the lab'), 'cid')
  assert.deepEqual(direct.tags, vars.tags)
  assert.equal(direct.note, vars.note)
  // Nothing the gateway's strict createTask schema does not declare.
  const allowed = new Set(['content', 'signifier', 'priority', 'tags', 'dueDate', 'note', 'recurrenceRule', 'clientId', 'private', 'hasDueTime', 'timeZone'])
  for (const key of Object.keys(vars)) assert.ok(allowed.has(key), `unexpected createTask variable ${key}`)
  await runTaskCapture(fields, captureAttemptFor(null, `draft:${line}`), gw.steps)
  assert.equal([...gw.tasks.values()][0].private, true)
})

test('a drafted repeat keeps its frequency, anchored on the drafted date; a $^note still goes to NoteGeek', async () => {
  const line = 'water the plants every morning (daily) $^ferns like it damp'
  const fields = draftFields({ content: 'Water the plants', dueDate: '2026-11-21T08:00:00', tags: [] }, line)
  const vars = taskVariables(fields, 'cid', new Date(2026, 10, 20, 9))
  assert.match(vars.recurrenceRule, /RRULE:FREQ=DAILY/)
  const start = new Date(2026, 10, 21, 8).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  assert.match(vars.recurrenceRule, new RegExp(`DTSTART:${start}`))
  const gw = fakeGateway()
  await runTaskCapture(fields, captureAttemptFor(null, `draft:${line}`), gw.steps)
  assert.equal(gw.calls.createNote, 1)
})

test('a line with no words left is refused with TodoGeek\'s words, and nothing is sent', async () => {
  for (const line of ['#work /tomorrow', '(private) !high', '$^just an idea']) {
    const gw = fakeGateway()
    const attempt = captureAttemptFor(null, `task:${line}`)
    await assert.rejects(runTaskCapture(parseTaskInput(line), attempt, gw.steps), (err) => {
      assert.equal(err.message, NOTHING_TO_ADD)
      assert.equal(err.nothingToAdd, true)
      assert.equal(partialCaptureMessage(err, attempt), null)
      return true
    })
    assert.equal(gw.calls.createTask, 0, line)
    assert.equal(gw.calls.createNote, 0, line)
  }
  assert.equal(NOTHING_TO_ADD, 'Nothing to add: type some words for the task.')
  assert.equal(taskVariables(parseTaskInput('#work'), 'cid'), null)
})

test('describeCapture says what was understood, on the chosen clock', () => {
  const now = new Date(2026, 10, 18, 9, 38)
  const fields = parseTaskInput('call Dana tomorrow 2pm #work (private)', { now })
  assert.equal(describeCapture(fields, { now }), 'Added for tomorrow · 2pm · #work · private')
  assert.equal(describeCapture(fields, { now, hour12: false }), 'Added for tomorrow · 14:00 · #work · private')
  assert.equal(describeCapture(parseTaskInput('buy milk', { now }), { now }), 'Added for today')
  const friday = parseTaskInput('pay rent /2026-11-20', { now })
  assert.equal(describeCapture(friday, { now }), 'Added for Fri 20')
})

test('describeCapture: a far or past date says its month, yesterday is yesterday, #blocked is said once', () => {
  const now = new Date(2026, 10, 18, 9, 38) // Wed 18 Nov 2026
  const say = (line) => describeCapture(parseTaskInput(line, { now }), { now })
  assert.equal(say('pay rent /2026-11-24'), 'Added for Tue 24') // within the week
  assert.equal(say('renew passport /2026-12-03'), 'Added for Thu 3 Dec')
  assert.equal(say('file it /2026-11-17'), 'Added for yesterday')
  assert.equal(say('file it /2026-11-02'), 'Added for Mon 2 Nov')
  assert.equal(say('plan it /2027-01-04'), 'Added for Mon 4 Jan 2027')
  assert.equal(say('renew passport #blocked ~blocked waiting on photos'), 'Added for today · #blocked')
  assert.equal(say('renew passport ~blocked'), 'Added for today · #blocked')
})

test('formatTime', () => {
  assert.equal(formatTime(new Date(2026, 0, 1, 0, 5)), '12:05am')
  assert.equal(formatTime(new Date(2026, 0, 1, 12, 0)), '12pm')
  assert.equal(formatTime(new Date(2026, 0, 1, 7, 0), false), '07:00')
})

test('newClientId is unique', () => {
  assert.notEqual(newClientId(), newClientId())
})

test('the CREATE_TASK document declares and passes clientId', async () => {
  const { CREATE_TASK } = await import('./queries.js')
  assert.match(CREATE_TASK, /\$clientId:\s*String\b/)
  assert.match(CREATE_TASK, /clientId:\s*\$clientId/)
})
