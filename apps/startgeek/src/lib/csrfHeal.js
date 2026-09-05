// csrfHeal.js — pure predicate + reload guard shared by startgeek's two
// hand-rolled fetch clients (graphql.js, basegeek.js).
//
// startgeek is standalone: it cannot import @geeksuite/auth or
// @geeksuite/api-client, so this is a deliberate, small duplicate of the same
// logic those packages carry (packages/auth/src/authClient.js,
// packages/api-client/src/index.js). See DOCS/CONTEXT.md's CSRF section for
// why every client heals the same way: a tab whose JS predates the
// CSRF_TOKEN=enforce rollout (or whose geek_csrf cookie just rotated under
// it) posts with no header, or a stale one, and basegeek's csrfTokenGuard
// rejects it with a 403 whose body carries the failure code.

/** basegeek's csrfTokenGuard 403 codes — see csrfToken.js's `violation()`. */
const CSRF_FAILURE_CODES = new Set(['csrf_token_missing', 'csrf_token_invalid'])

/**
 * True when `status`/`body` is one of basegeek's CSRF-guard 403s — a stale
 * tab missing the header entirely, or carrying a rotated-out value. Tolerates
 * a bare `{ error: code }` (what csrfTokenGuard actually sends) alongside
 * `{ code }` / `{ error: { code } }` for any wrapper that nests it.
 *
 * Pure and side-effect-free so both call sites can share it without either
 * one importing the other, and so it is trivially unit-testable with
 * `node --test` (startgeek has no test runner otherwise).
 */
export function shouldHealCsrf(status, body) {
  if (status !== 403) return false
  if (!body || typeof body !== 'object') return false

  const code =
    (typeof body.code === 'string' && body.code) ||
    (typeof body.error === 'string' && body.error) ||
    (body.error && typeof body.error === 'object' && typeof body.error.code === 'string' && body.error.code) ||
    null

  return CSRF_FAILURE_CODES.has(code)
}

/** sessionStorage key guarding the one-reload-per-session rule below. */
const CSRF_RELOAD_FLAG_KEY = 'geeksuite:csrf-reload-attempted'

/**
 * Reload the tab once per session when a CSRF-healed retry still fails.
 * Guarded by sessionStorage — not an in-memory flag — because the guard has
 * to survive the reload it causes, or a setup that is genuinely broken
 * (cookies blocked, storage disabled) would reload forever. If sessionStorage
 * itself is unreachable there is no way to remember across a future load;
 * this reloads once for this page load and accepts that risk rather than
 * never healing at all.
 *
 * A full reload drops any unsaved state in the page — an open command box
 * draft, an in-progress edit — exactly like any other forced navigation
 * would. That's the tradeoff for a tab that cannot otherwise escape a CSRF
 * 403 loop; this only ever fires after a retry with a freshly-read cookie has
 * already failed with the same code, and at most once per browser session.
 */
export function triggerCsrfReloadOnce() {
  if (typeof window === 'undefined' || !window.location) return

  try {
    if (window.sessionStorage) {
      if (window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY)) return
      window.sessionStorage.setItem(CSRF_RELOAD_FLAG_KEY, '1')
    }
  } catch {
    // sessionStorage inaccessible (private browsing, storage disabled) —
    // fall through and reload anyway; see the note above.
  }

  window.location.reload()
}

export { CSRF_RELOAD_FLAG_KEY }
