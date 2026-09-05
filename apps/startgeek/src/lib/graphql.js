import { shouldHealCsrf, triggerCsrfReloadOnce } from './csrfHeal.js'

const URL =
  import.meta.env.VITE_GRAPHQL_API_URL || 'https://basegeek.clintgeek.com/graphql'

export class UnauthorizedError extends Error {}

// Double-submit CSRF token for basegeek (see DOCS/CONTEXT.md "CSRF: the
// double-submit token"). startgeek is standalone (no @geeksuite/auth import),
// so the cookie is read inline here rather than via csrfHeaders(). startgeek
// runs on start.clintgeek.com and the cookie is issued on domain=.clintgeek.com,
// so it's readable here; the header name must match basegeek's exactly
// (X-CSRF-Token / packages/auth's CSRF_HEADER_NAME).
const CSRF_COOKIE_NAME = 'geek_csrf'
const CSRF_HEADER_NAME = 'X-CSRF-Token'

function readCsrfToken() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie
  if (typeof raw !== 'string' || !raw) return null

  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    if (trimmed.slice(0, idx) !== CSRF_COOKIE_NAME) continue
    const value = trimmed.slice(idx + 1)
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

function postGraphql(query, variables) {
  const token = readCsrfToken()
  return fetch(URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { [CSRF_HEADER_NAME]: token } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })
}

/**
 * POST once; if basegeek's CSRF guard rejects it with a 403 that
 * shouldHealCsrf() recognizes (a stale tab loaded before the header existed,
 * or the cookie rotated between page load and this call), retry once with a
 * freshly-read cookie before giving up. If the retry hits the same wall,
 * reload the tab once per session — see csrfHeal.js. Any other response
 * (success, a non-CSRF 403, a 401) is returned untouched.
 */
async function postGraphqlWithCsrfHeal(query, variables) {
  let res = await postGraphql(query, variables)
  if (res.status !== 403) return res

  let body = await res.clone().json().catch(() => null)
  if (!shouldHealCsrf(res.status, body)) return res

  res = await postGraphql(query, variables)
  if (res.status !== 403) return res

  body = await res.clone().json().catch(() => null)
  if (shouldHealCsrf(res.status, body)) triggerCsrfReloadOnce()

  return res
}

export async function gql(query, variables) {
  const res = await postGraphqlWithCsrfHeal(query, variables)

  if (res.status === 401) throw new UnauthorizedError()

  const json = await res.json()

  if (json.errors?.length) {
    const unauth = json.errors.some(
      (e) =>
        e.extensions?.code === 'UNAUTHENTICATED' ||
        /unauthori[sz]ed/i.test(e.message)
    )
    if (unauth) throw new UnauthorizedError()
    throw new Error(json.errors[0].message)
  }

  return json.data
}
