// commandFailure.js — what the command box does with an error that is not a
// signed-out session.
//
// Extracted for the same reason `csrfHeal.js` was: startgeek has no component
// test runner (no vitest, no jsdom), so a decision worth pinning has to live in
// a module that plain `node --test` can import. The decision here is small but
// it was, until 2026-09-05, absent entirely — every capture and search path in
// `CommandBox.jsx` ended with
//
//     } catch (err) {
//       if (err instanceof UnauthorizedError) markOut()
//     }
//
// so a gateway 500, a rejected mutation, a dropped connection or a CSRF 403 the
// heal could not fix all produced exactly nothing: the box kept its text and
// the page said not one word. Someone pressing Enter to file a task had no way
// to tell it from a task that filed fine.

import { UnauthorizedError } from './errors.js'

/**
 * True when the error means "this session is over" rather than "this call
 * failed". Those go to `markOut()`, not to a toast — the sign-in state itself
 * is the message.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAuthFailure(err) {
  return err instanceof UnauthorizedError
}

/**
 * The line to show for a failure that is not an expired session.
 *
 * Prefers the server's own message — the gateway's validation errors are
 * written for a person to read — and falls back to the caller's phrasing when
 * there is nothing usable. Never returns an empty string: a toast with no text
 * is the silence this exists to remove.
 *
 * @param {unknown} err
 * @param {string} fallback what to say when the error carries no message
 * @returns {string}
 */
export function failureMessage(err, fallback) {
  const raw = typeof err?.message === 'string' ? err.message.trim() : ''
  const spare = typeof fallback === 'string' ? fallback.trim() : ''
  // A dropped connection or a gateway that answered with an error page
  // (not JSON) is not a message for a person: "Failed to fetch",
  // "Unexpected token '<'". Say it in plain words instead (2026-11-18).
  if (raw && isConnectionFailure(err, raw)) {
    return `${spare || 'That didn’t work'}. The suite didn’t answer; check your connection and try again.`
  }
  if (raw) return raw
  return spare || 'Something went wrong'
}

const CONNECTION_WORDS = /failed to fetch|networkerror|network request failed|load failed|unexpected token|is not valid json|unexpected end of json/i

function isConnectionFailure(err, raw) {
  return err instanceof SyntaxError || CONNECTION_WORDS.test(raw)
}
