// capture.js — one capture, written once (SUITE_REVIEW_2026-11, ranked item 8).
//
// Two ways the command box used to file the same line twice:
//   1. Double Enter (or the phone's Go key tapped twice) on a slow gateway —
//      nothing stopped a second `createTask` while the first was in flight.
//   2. A line with a follow-up step (a `$^note` for NoteGeek) whose
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

import {
  buildRecurrenceRule,
  frequencyFromRecurrenceRule,
  parseTaskInput,
  toCreateInput,
} from '@geeksuite/task-grammar'
import { formatTime } from './time.js'

export { formatTime }

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
  return { key, clientId: makeId(), taskId: null, noteDone: false }
}

/**
 * The `createTask` variables for parsed fields, through the shared grammar's
 * own mapping (`toCreateInput` in `@geeksuite/task-grammar`), so a line typed
 * here becomes exactly the task the same line typed into TodoGeek becomes:
 *
 * - no date → today, date-only; a date without a time → date-only; a typed
 *   time → the instant, with `hasDueTime` said out loud (contract C2);
 * - `(private)` → `private: true` (until 2026-11-18 StartGeek's own copy of
 *   the grammar did not read it, and a private task arrived unmasked);
 * - `~blocked` → a `#blocked` tag with the reason in the note, as TodoGeek
 *   files it (the parked state has no screen there any more);
 * - `$^note` is not part of the task: `runTaskCapture` sends it to NoteGeek.
 *
 * Null when no words are left once the tokens are read (`> #work /tomorrow`):
 * there is no task to add, and the gateway would refuse an empty one.
 */
export function taskVariables(fields, clientId, now = new Date()) {
  const { input } = toCreateInput(
    { ...fields, content: fields.content || '' },
    { today: now, explicit: true },
  )
  return input ? { ...input, clientId } : null
}

/** What TodoGeek's add box says for a line with no words left. */
export const NOTHING_TO_ADD = 'Nothing to add: type some words for the task.'

/**
 * A model draft (`glanceDraft`) as the fields the grammar would have read.
 * Its `dueDate` is always a local date-time ("YYYY-MM-DDTHH:MM:SS"), so a
 * dated draft is a timed one, as it was before the shared mapping.
 *
 * The model only returns content, date, priority, tags and signifier. The
 * tokens the grammar reads with certainty — `(private)`, `~blocked` and its
 * reason, `^note`, `$^note`, `(daily)` — come from the line the person typed
 * (`line`), so a drafted task keeps them exactly as the direct path would
 * (until 2026-11-20 a drafted `(private)` task arrived unmasked).
 */
export function draftFields(draft, line = '') {
  if (!draft) return {}
  const typed = line ? parseTaskInput(line) : {}
  const dueDate = draft.dueDate ? new Date(draft.dueDate) : undefined
  // A repeat's RRULE anchors on its due date: re-anchor the typed frequency
  // on the model's date, as the parser would have on a typed one.
  let recurrenceRule = typed.recurrenceRule
  if (recurrenceRule && dueDate && !Number.isNaN(dueDate.getTime())) {
    recurrenceRule = buildRecurrenceRule(frequencyFromRecurrenceRule(recurrenceRule), dueDate) || recurrenceRule
  }
  return {
    content: draft.content || '',
    signifier: draft.signifier || '*',
    priority: draft.priority || undefined,
    tags: draft.tags?.length ? draft.tags : undefined,
    dueDate,
    hasTime: Boolean(draft.dueDate),
    note: typed.note,
    noteGeekNote: typed.noteGeekNote,
    recurrenceRule,
    blocked: typed.blocked,
    blockedReason: typed.blockedReason,
    private: typed.private,
  }
}

/**
 * The words the capture toast uses for what was understood:
 * "Added for Thu 19 · 2pm · #work · private". `hour12` follows the clock
 * setting.
 */
export function describeCapture(fields, { now = new Date(), hour12 = true } = {}) {
  const parts = []
  if (fields?.dueDate) {
    const d = new Date(fields.dueDate)
    if (!Number.isNaN(d.getTime())) {
      const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const b = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const diff = Math.round((b - a) / 86400000)
      parts.push(
        diff === 0
          ? 'today'
          : diff === 1
            ? 'tomorrow'
            : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
      )
      if (fields.hasTime) parts.push(formatTime(d, hour12))
    }
  } else {
    parts.push('today')
  }
  for (const tag of fields?.tags || []) parts.push(`#${tag}`)
  if (fields?.blocked) parts.push('#blocked')
  if (fields?.private) parts.push('private')
  return `Added for ${parts.join(' · ')}`
}

/**
 * Run the steps of a task capture that have not run yet, recording each one
 * on `attempt` as it finishes. A failing step throws with `err.captureStep`
 * set to 'task' | 'note'; everything before it stays recorded.
 *
 * @param {object} fields  parsed fields (parseTaskInput or a confirmed draft)
 * @param {object} attempt from captureAttemptFor — mutated
 * @param {{ createTask: (vars) => Promise<{id: string}>,
 *   createNote: (text: string) => Promise<unknown> }} steps
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
    const variables = taskVariables(fields, attempt.clientId, now)
    if (!variables) {
      // Refused here, with no request: nothing is filed, the line stays.
      const err = new Error(NOTHING_TO_ADD)
      err.captureStep = 'task'
      err.nothingToAdd = true
      throw err
    }
    const task = await step('task', () => steps.createTask(variables))
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
