// feedback.js — what the console says after something happens, and for how
// long (design review 2026-11-18, findings 5 and 6).
//
// Until then a capture or search result was a 2.5 s pill that no screen
// reader heard, failures went to the same pill, and ticking a task said
// nothing at all. The rules, kept pure so `node --test` can pin them:
//
//   - a plain message stays about 6 s (the suite's undo-toast length);
//   - a message with an action (Undo) stays a little longer, 8 s;
//   - a failure stays until it is dismissed: it may tell you not to retype.
//
// The toast itself (`components/Toast.jsx`) pauses the clock while it is
// hovered or holds focus, and sits in a polite live region.

export const TOAST_MS = 6000
export const TOAST_ACTION_MS = 8000

/**
 * A toast from whatever a caller passes: a string is an info message.
 * Returns null for nothing to say.
 *
 * @param {string|{message: string, tone?: 'info'|'error', action?: {label: string, run: () => unknown}}|null} input
 */
export function normalizeToast(input) {
  if (!input) return null
  const t = typeof input === 'string' ? { message: input } : input
  const message = typeof t.message === 'string' ? t.message.trim() : ''
  if (!message) return null
  return {
    message,
    tone: t.tone === 'error' ? 'error' : 'info',
    action: t.action && typeof t.action.run === 'function' && t.action.label ? t.action : null,
  }
}

/** How long a toast stays, in ms; null means until dismissed. */
export function toastLifetime(toast) {
  if (!toast) return null
  if (toast.tone === 'error') return null
  return toast.action ? TOAST_ACTION_MS : TOAST_MS
}

const shorten = (text, max = 48) => {
  const s = String(text ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Tick (or untick) a task, say what happened, and offer Undo.
 *
 * @param {{id: string, content?: string, status?: string}} task
 * @param {{
 *   setStatus: (id: string, status: string) => Promise<unknown>,
 *   notify: (toast: object) => void,
 *   refresh: () => void,
 *   onAuthFailure: () => void,
 *   isAuthFailure: (err: unknown) => boolean,
 * }} deps
 * @returns {Promise<boolean>} true when the change was saved
 */
export async function toggleTaskWithUndo(task, { setStatus, notify, refresh, onAuthFailure, isAuthFailure }) {
  const previous = task.status === 'completed' ? 'completed' : 'pending'
  const next = previous === 'completed' ? 'pending' : 'completed'
  const name = shorten(task.content) || 'Task'

  const fail = (err, what) => {
    if (isAuthFailure(err)) {
      onAuthFailure()
      return
    }
    notify({ tone: 'error', message: `Couldn't ${what} "${name}". Nothing changed; try again.` })
  }

  try {
    await setStatus(task.id, next)
  } catch (err) {
    fail(err, next === 'completed' ? 'mark done' : 'reopen')
    return false
  }

  refresh()
  notify({
    message: next === 'completed' ? `Done: ${name}` : `Back on the list: ${name}`,
    action: {
      label: 'Undo',
      run: async () => {
        try {
          await setStatus(task.id, previous)
        } catch (err) {
          fail(err, 'undo')
          return
        }
        refresh()
        notify({ message: previous === 'completed' ? `Done again: ${name}` : `Back on the list: ${name}` })
      },
    },
  })
  return true
}
