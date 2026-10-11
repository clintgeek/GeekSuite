import axios from 'axios';
import { configure } from '@geeksuite/user';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

const BASEGEEK_API_URL =
  import.meta.env?.VITE_BASEGEEK_URL || import.meta.env?.VITE_BASE_GEEK_URL || 'https://basegeek.clintgeek.com';

const onSessionExpired = () => {
  loginRedirect('newsgeek', window.location.href);
};

const baseGeekApi = axios.create({
  baseURL: `${BASEGEEK_API_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// The shared interceptor owns session expiry (refresh, CSRF heal, and only a
// real 401 ends the session — a 5xx never does).
setupAxiosInterceptors(baseGeekApi, onSessionExpired);

/**
 * NewsGeek's own backend (same origin, `/api`): today only feed discovery
 * (POST /api/discover). Same interceptor as basegeek's instance, so the
 * request carries the SSO cookies (same-origin, withCredentials), the
 * double-submit `X-CSRF-Token` read fresh from the `geek_csrf` cookie, and the
 * stored bearer token if there is one; the browser adds `Origin`, which the
 * backend's csrfGuard checks against its allow-list.
 */
export const newsApi = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
setupAxiosInterceptors(newsApi, onSessionExpired);

export function configureUserPlatform() {
  configure(baseGeekApi);
}
