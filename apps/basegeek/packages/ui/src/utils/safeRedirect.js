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

/**
 * Strip the characters a URL parser removes or rewrites before it decides what
 * a path means.
 *
 * Going-over 2026-09-05 — the "relative path" branch used to be a literal
 * `startsWith('/') && !startsWith('//')`, and the browser does not read a path
 * that literally:
 *
 *   - a backslash is a slash in every special scheme, so `/\evil.com` parses
 *     as `//evil.com` and `location.href = ...` leaves the origin;
 *   - ASCII tab, LF and CR are deleted from a URL wherever they appear, so
 *     `/%09/evil.com` decodes to `/<TAB>/evil.com` and then collapses to
 *     `//evil.com` — the same escape, wearing an encoding.
 *
 * Both passed the old check and both are an open redirect out of the login and
 * register flows, which is the one place in this app a `?redirect=` from an
 * untrusted link is followed. Normalize first, then decide; the value handed
 * back is still the original, since the browser will apply exactly this
 * normalization to it anyway.
 */
const normalizeForOriginCheck = (value) =>
  value.replace(/[\t\n\r]/g, '').replace(/\\/g, '/');

export function safeRedirect(raw) {
  if (!raw) return '/';

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '/';
  }

  const normalized = normalizeForOriginCheck(decoded);

  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return decoded;
  }

  try {
    const url = new URL(normalized);
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
