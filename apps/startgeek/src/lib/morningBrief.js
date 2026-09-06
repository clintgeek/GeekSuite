/**
 * morningBrief — the pure half of the console's morning brief (AI_IDEAS.md #5).
 *
 * The rules that decide whether the card is on screen at all live here, apart
 * from React and apart from `import.meta.env`, so `node --test` can run them
 * (the same seam `csrfHeal.js` and `commandFailure.js` already use).
 *
 * Three gates, and the card needs all three:
 *
 *   1. **Opt-in.** `settings.brief`, off by default, stored in the same
 *      `localStorage['startgeek.settings']` blob as the `??` Ask switch.
 *      StartGeek has no backend and no server-side settings, so this gate is
 *      client-only *by construction* — with it off the query is simply never
 *      called. The server keeps the two gates it can enforce on its own: the
 *      hour, and a 3-a-day cap.
 *   2. **After 5 a.m. local.** A morning brief at 2 a.m. is a notification.
 *      The gateway enforces the same hour on its own clock reading, from the
 *      `localHour` this module sends — the containers run UTC, so the browser
 *      is the only thing on the wire that knows what time it is here.
 *   3. **Not dismissed today.** One tap and it is gone until tomorrow,
 *      remembered per browser under the day it was dismissed.
 */

/** Before this local hour, no brief. Mirrors BRIEF_MIN_LOCAL_HOUR on the gateway. */
export const BRIEF_MIN_LOCAL_HOUR = 5

/** Holds one `YYYY-MM-DD`: the day the brief was last dismissed. */
export const BRIEF_DISMISS_KEY = 'startgeek.brief.dismissed'

/**
 * Today, as the local calendar has it.
 *
 * Reads the local fields directly rather than going through `toISOString()`,
 * which is UTC and is a different day for five hours every evening here.
 */
export function localDayIso(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Is it late enough in the day for a morning brief? */
export function isBriefHour(hour) {
  return Number.isInteger(hour) && hour >= BRIEF_MIN_LOCAL_HOUR && hour <= 23
}

/**
 * localStorage, or nothing at all.
 *
 * A private window, a browser with site data blocked, and the throwing
 * accessor some setups install all have to end in "no brief remembered"
 * rather than a broken console.
 */
function safeStorage(storage) {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The day the brief was last dismissed, or null. */
export function readDismissedDate(storage) {
  const store = safeStorage(storage)
  if (!store) return null
  try {
    const raw = store.getItem(BRIEF_DISMISS_KEY)
    return /^\d{4}-\d{2}-\d{2}$/.test(raw || '') ? raw : null
  } catch {
    return null
  }
}

/** Remember that today's brief was dismissed. Failure is silent and harmless. */
export function writeDismissedDate(date, storage) {
  const store = safeStorage(storage)
  if (!store) return
  try {
    store.setItem(BRIEF_DISMISS_KEY, date)
  } catch {
    // storage unavailable; the brief comes back on the next load and that is fine
  }
}

/** Has the brief already been dismissed for this day? */
export function isDismissedFor(date, storage) {
  return readDismissedDate(storage) === date
}

/**
 * Should the console ask the gateway for a brief right now?
 *
 * @param {object} opts
 * @param {boolean} opts.enabled    the opt-in setting
 * @param {boolean} opts.signedIn   the brief is all personal data
 * @param {Date}    [opts.now]
 * @param {Storage} [opts.storage]
 */
export function shouldRequestBrief({ enabled, signedIn, now = new Date(), storage } = {}) {
  if (!enabled || !signedIn) return false
  if (!isBriefHour(now.getHours())) return false
  return !isDismissedFor(localDayIso(now), storage)
}

/**
 * The provenance line under the brief.
 *
 * Every AI-touched surface in the suite says where its words came from, and a
 * deterministic brief must never be mistaken for a model one — that is the
 * whole reason `AIProvenance.source` exists.
 */
export function provenanceLine(provenance) {
  if (provenance?.source === 'model' && provenance.model) {
    return `brief by ${provenance.model}`
  }
  return 'no model today'
}
