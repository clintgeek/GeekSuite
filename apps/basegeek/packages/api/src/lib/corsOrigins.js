/**
 * The one origin allow-list for basegeek.
 *
 * `cors()` in server.js and `csrfGuard()` from @geeksuite/user both read this
 * — a CSRF guard whose list can drift from the CORS list is worse than no
 * guard, because it fails in whichever direction nobody is watching.
 *
 * basegeek's list is necessarily the widest in the suite: every app's
 * frontend calls this API's unified GraphQL endpoint, either directly (
 * storygeek builds with VITE_GRAPHQL_API_URL pointed at
 * https://basegeek.clintgeek.com/graphql) or through an nginx / in-app
 * reverse proxy that forwards the browser's Origin. Every one of those
 * origins therefore has to be here. That is also the limit of what an origin
 * allow-list can do for basegeek: it stops third-party pages, not a
 * compromised sibling subdomain. See DOCS/SSO_OVERVIEW.md#csrf.
 *
 * `CORS_ORIGINS` (comma-separated) overrides the lists below when set.
 * Production does not set it, so `productionOrigins` is what basegeek runs on.
 */

// Production fallback: only real clintgeek.com origins. Never falls back to
// dev/LAN addresses when NODE_ENV === 'production' (see devOnlyOrigins below).
export const productionOrigins = [
  'https://basegeek.clintgeek.com',  // Production domain
  'https://geeksuite.clintgeek.com', // GeekSuite public portal
  'https://notegeek.clintgeek.com',  // NoteGeek production
  'https://fitnessgeek.clintgeek.com',  // FitnessGeek production
  'https://bujogeek.clintgeek.com',  // BujoGeek production
  'https://bookgeek.clintgeek.com',  // epub library
  'https://storygeek.clintgeek.com',  // StoryGeek production
  'https://flockgeek.clintgeek.com',  // FlockGeek production
  'https://dash.clintgeek.com',       // DashGeek production
  'https://dashgeek.clintgeek.com',   // DashGeek production (alt)
  'https://babelgeek.clintgeek.com',  // BabelGeek production
  'https://geekpr.clintgeek.com',  // geekPR — autonomous PR reviewer
  'https://start.clintgeek.com',  // StartGeek production
  'https://clintgeek.com',        // Portfolio (for portal link)
];

// Dev/LAN origins — only appended to the fallback outside production.
export const devOnlyOrigins = [
  'http://localhost:5173',    // Vite dev server
  'http://localhost:5174',    // Vite dev server (alternative port)
  'http://localhost:5001',    // Backend dev server
  'http://localhost:5000',    // Backend dev server (alternative port)
  'http://localhost:3000',    // StartGeek & StoryGeek frontend
  'http://localhost:1801',    // BookGeek dev server
  'http://192.168.1.17:5173',  // Local network access
  'http://192.168.1.17:5174',   // Local network access (alternative port)
  'http://192.168.1.17:9977'   // StoryGeek local network access
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ origins: string[], source: 'env'|'fallback', isProduction: boolean }}
 */
export function resolveAllowedOrigins(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const fallbackOrigins = isProduction
    ? productionOrigins
    : [...productionOrigins, ...devOnlyOrigins];
  const usingEnvOrigins = Boolean(env.CORS_ORIGINS);
  const origins = usingEnvOrigins
    ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : fallbackOrigins;

  return { origins, source: usingEnvOrigins ? 'env' : 'fallback', isProduction };
}
