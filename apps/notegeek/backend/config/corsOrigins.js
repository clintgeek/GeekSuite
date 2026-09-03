/**
 * The one origin allow-list for this app.
 *
 * `cors()` in server.js and `csrfGuard()` from @geeksuite/user both read this
 * — a CSRF guard whose list can drift from the CORS list is worse than no
 * guard, because it fails in whichever direction nobody is watching.
 *
 * Source: `CORS_ORIGINS` (comma-separated) when set, otherwise the hardcoded
 * fallback below. Production does not set it, so the fallback is what
 * notegeek actually runs on; `https://notegeek.clintgeek.com` is the entry
 * that matters there.
 *
 * Exported as a function rather than a constant so that a test (or a script)
 * can set CORS_ORIGINS before calling it — server.js resolves it once, at
 * boot.
 */
export const HARDCODED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5001',
  'http://localhost:9988',
  'https://notegeek.clintgeek.com',
  'http://192.168.1.26:5173',
];

export function getAllowedOrigins(env = process.env) {
  return env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : HARDCODED_ORIGINS;
}
