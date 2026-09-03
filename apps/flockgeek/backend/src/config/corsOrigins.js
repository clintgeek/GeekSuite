import { env } from "./env.js";

/**
 * The one origin allow-list for this app.
 *
 * `cors()` in server.js and `csrfGuard()` from @geeksuite/user both read this
 * — a CSRF guard whose list can drift from the CORS list is worse than no
 * guard, because it fails in whichever direction nobody is watching.
 *
 * Source: `CORS_ORIGIN` (comma-separated). Production sets it to
 * `https://flockgeek.clintgeek.com`; the dev default is the Vite dev server.
 */
export const allowedOrigins = env.corsOrigin
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
