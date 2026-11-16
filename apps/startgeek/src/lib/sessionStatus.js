// sessionStatus.js — what an answer from basegeek's /api/users/me means.
//
// Until 2026-11-16 every non-OK answer AND every thrown fetch meant "signed
// out": a network blip, a 502 during a deploy or basegeek's 503
// AUTH_UNAVAILABLE at startup drew the logged-out console (web search only,
// a Sign in link) with no way back but a reload. THE_CONTEXT §3.3: only an
// explicit refusal ends a session; 5xx and network failures never do.

/** Answers that mean "there is no session" — the rest are failures to ask. */
const SIGNED_OUT = new Set([401, 403, 404])

/**
 * @param {number|null} httpStatus  the response status, or null when fetch threw
 * @param {unknown} body  the parsed body of an OK response
 * @returns {'in' | 'out' | 'error'}
 */
export function sessionStatusFor(httpStatus, body) {
  if (typeof httpStatus !== 'number') return 'error'
  if (httpStatus >= 200 && httpStatus < 300) return body && body.user ? 'in' : 'out'
  if (SIGNED_OUT.has(httpStatus)) return 'out'
  return 'error'
}
