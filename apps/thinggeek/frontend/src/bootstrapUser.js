import axios from 'axios';
import { configure } from '@geeksuite/user';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

const BASEGEEK_API_URL =
  import.meta.env?.VITE_BASEGEEK_URL || import.meta.env?.VITE_BASE_GEEK_URL || 'https://basegeek.clintgeek.com';

const baseGeekApi = axios.create({
  baseURL: `${BASEGEEK_API_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// The shared interceptor owns session expiry (refresh, CSRF heal, and only a
// real 401 ends the session — a 5xx never does).
setupAxiosInterceptors(baseGeekApi, () => {
  loginRedirect('thinggeek', window.location.href);
});

export function configureUserPlatform() {
  configure(baseGeekApi);
}
