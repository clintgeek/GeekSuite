/**
 * The one origin allow-list for bookgeek.
 *
 * `cors()` in server.js and `csrfGuard()` from @geeksuite/user both use this
 * predicate — a CSRF guard whose rule can drift from the CORS rule is worse
 * than no guard, because it fails in whichever direction nobody is watching.
 *
 * Unlike the other backends this is a predicate rather than a list: bookgeek
 * accepts any `clintgeek.com` host (the SPA, the /kindle pages, and the
 * portal all reach it) plus the local dev ports. The cost of that breadth is
 * that the CSRF guard cannot tell a sibling GeekSuite subdomain from
 * bookgeek's own page — it stops third-party pages only. See
 * DOCS/SSO_OVERVIEW.md#csrf.
 */

const DEV_ORIGINS = new Set([
  "http://localhost:1800",
  "http://127.0.0.1:1800",
  "http://localhost:1801",
  "http://127.0.0.1:1801",
]);

export function isAllowedCorsOrigin(origin) {
  if (!origin) return true;

  if (DEV_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === "clintgeek.com" || url.hostname.endsWith(".clintgeek.com")) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}
