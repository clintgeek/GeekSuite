// capture.js — one capture, written once (SUITE_REVIEW_2026-11, ranked item 8).
//
// Two ways the command box used to file the same line twice:
//   1. Double Enter (or the phone's Go key tapped twice) on a slow gateway —
//      nothing stopped a second `createTask` while the first was in flight.
//   2. A line with a follow-up step (`>> note` link or `!blocked`) whose
//      follow-up failed: the task existed, the text stayed in the box, and
//      Enter again created a second task.
//
// The fixes, kept pure so `node --test` can pin them (no component runner here):
//   - `createBusyGuard()`: one capture at a time; a second Enter is dropped.
//   - `captureAttemptFor()`: a capture carries a `clientId`; TodoGeek's
//     `createTask` is idempotent per (user, clientId), so a retry of the SAME
//     line reuses it and gets the first task back instead of a new one.
//   - `runTaskCapture()`: records which steps finished, so a retry resumes at
//     the step that failed and never repeats one that worked.
//
// Notes have no idempotency key on the gateway (createNote takes none), so
// a note capture is protected by the busy guard only.

/** A fresh id for one capture. */
export function newClientId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return `startgeek-${c.randomUUID()}`
  return `startgeek-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * The attempt for this line: the previous one when it was for the same line
 * (a retry), otherwise a new one with its own clientId. `key` is whatever
 * identifies the line — editing the text makes it a different capture.
 */
export function captureAttemptFor(previous, key, makeId = newClientId) {
  if (previous && previous.key === key) return previous
  return { key, clientId: makeId(), taskId: null, noteDone: false, blockDone: false }
}

/**
 * The `createTask` variables for parsed fields. With no usable due date it
 * defaults to today at 9 am local, as TodoGeek's quick-add does.
 */
export function taskVariables(fields, clientId, now = new Date()) {
  let dueDate = fields.dueDate ? new Date(fields.dueDate) : null
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    dueDate = new Date(now.getTime())
    dueDate.setHours(9, 0, 0, 0)
  }
  return {
    content: fields.content || '',
    signifier: fields.signifier || '*',
    priority: fields.priority || null,
    tags: fields.tags?.length ? fields.tags : null,
    dueDate: dueDate.toISOString(),
    note: fields.note || null,
    recurrenceRule: fields.recurrenceRule || null,
    clientId,
  }
}

/**
 * Run the steps of a task capture that have not run yet, recording each one
 * on `attempt` as it finishes. A failing step throws with `err.captureStep`
 * set to 'task' | 'note' | 'block'; everything before it stays recorded.
 *
 * @param {object} fields  parsed fields (parseTaskInput or a confirmed draft)
 * @param {object} attempt from captureAttemptFor — mutated
 * @param {{ createTask: (vars) => Promise<{id: string}>,
 *   createNote: (text: string) => Promise<unknown>,
 *   blockTask: (id: string, reason: string|null) => Promise<unknown> }} steps
 */
export async function runTaskCapture(fields, attempt, steps, now = new Date()) {
  const step = async (name, fn) => {
    try {
      return await fn()
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err))
      wrapped.captureStep = name
      throw wrapped
    }
  }

  if (!attempt.taskId) {
    const task = await step('task', () => steps.createTask(taskVariables(fields, attempt.clientId, now)))
    attempt.taskId = task?.id || null
    if (!attempt.taskId) {
      const err = new Error("Couldn't add the task")
      err.captureStep = 'task'
      throw err
    }
  }

  if (fields.noteGeekNote && !attempt.noteDone) {
    await step('note', () => steps.createNote(fields.noteGeekNote))
    attempt.noteDone = true
  }

  if (fields.blocked && !attempt.blockDone) {
    await step('block', () => steps.blockTask(attempt.taskId, fields.blockedReason || null))
    attempt.blockDone = true
  }

  return attempt
}

/**
 * What to say when a task capture failed. A failure AFTER the task exists
 * says so — the person must not think nothing was filed — and that Enter
 * finishes the rest (the retry resumes, it does not re-create).
 * Returns null when the failure was the task itself: the caller's ordinary
 * failure message applies.
 */
export function partialCaptureMessage(err, attempt) {
  if (!attempt?.taskId || err?.captureStep === 'task') return null
  if (err?.captureStep === 'note') return "Task added, but the NoteGeek note wasn't saved. Press Enter to try the note again."
  if (err?.captureStep === 'block') return "Task added, but it wasn't marked blocked. Press Enter to try again."
  return null
}

/**
 * One capture at a time. `run(fn)` returns undefined without calling `fn`
 * while an earlier run is still in flight.
 */
export function createBusyGuard() {
  let busy = false
  return {
    get busy() {
      return busy
    },
    async run(fn) {
      if (busy) return undefined
      busy = true
      try {
        return await fn()
      } finally {
        busy = false
      }
    },
  }
}
