/**
 * bootstrapUser.js — hand `@geeksuite/user` the axios instance it talks to.
 *
 * The shared user store (`packages/user/src/useUserStore.js`) keeps a single
 * module-level api instance. Every action throws `no api instance configured`
 * until `configure()` is called, so this has to run once at boot, before any
 * component mounts.
 *
 * basegeek was the one app that never called it. The store therefore never
 * loaded: the Account page's `bootstrap()` rejected into a swallowed catch and
 * `loaded` stayed false forever, and the shared `ThemeProvider`'s remote sync
 * — which is guarded on `loaded` — never ran, so a theme picked here moved the
 * `geek_theme` cookie but was never written to the user document. Every other
 * app persisted it. See DOCS/SUITE_TODO.md (Shared libraries).
 *
 * Unlike notegeek/bookgeek this needs no cross-origin base URL or auth
 * interceptor: basegeek's UI is served by the API that owns `/api/users/*`,
 * so `src/api.js` (baseURL `/api`, `withCredentials`) already resolves
 * `/users/bootstrap` and `/users/preferences` to this origin, and a 401 is
 * handled by `RequireAuth` rather than an SSO redirect.
 */

import { configure } from '@geeksuite/user';
import api from './api';

export function configureUserPlatform() {
  configure(api);
}
