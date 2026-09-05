/**
 * Validates a `?redirect=` / `?returnTo=` target before following it.
 *
 * basegeek is the suite's auth authority, so a redirect legitimately points
 * at another `*.clintgeek.com` app (loginRedirect() sends users here with
 * `redirect=<that app's URL>`), not just a relative path within basegeek
 * itself. The SSO cookie is already shared across `.clintgeek.com`, so
 * trusting that domain isn't a wider grant than the session already is.
 *
 * Anything else — a bare relative path is allowed as-is; a bogus scheme
 * (`javascript:`, `data:`, an unrelated host) falls back to `/`.
 */
export function safeRedirect(raw) {
  if (!raw) return '/';

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '/';
  }

  if (decoded.startsWith('/') && !decoded.startsWith('//')) {
    return decoded;
  }

  try {
    const url = new URL(decoded);
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'clintgeek.com' || url.hostname.endsWith('.clintgeek.com'))
    ) {
      return decoded;
    }
  } catch {
    // not a parseable absolute URL — fall through to the safe default
  }

  return '/';
}
