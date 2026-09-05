export const BASEGEEK =
  import.meta.env.VITE_BASEGEEK_URL || 'https://basegeek.clintgeek.com'

export const loginUrl = () =>
  `${BASEGEEK}/login?app=startgeek&redirect=${encodeURIComponent(
    window.location.href
  )}`

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

export const logout = () => {
  const token = readCsrfToken()
  return fetch(`${BASEGEEK}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { [CSRF_HEADER_NAME]: token } : undefined,
  })
}
