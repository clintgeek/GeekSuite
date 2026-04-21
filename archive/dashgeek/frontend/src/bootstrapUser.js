import axios from 'axios';
import { configure } from '@geeksuite/user';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

// Match the suite pattern (see apps/bujogeek/frontend/src/bootstrapUser.js):
// Vite bakes `import.meta.env.VITE_*` at build time. If the image was
// built without the var, fall back to the canonical baseGeek URL rather
// than throwing and bricking the app. Accept either VITE_BASEGEEK_URL
// or VITE_BASE_GEEK_URL so historic env files keep working.
const BASEGEEK_API_URL =
  import.meta.env?.VITE_BASEGEEK_URL ||
  import.meta.env?.VITE_BASE_GEEK_URL ||
  'https://basegeek.clintgeek.com';

const baseGeekApi = axios.create({
  baseURL: `${BASEGEEK_API_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

setupAxiosInterceptors(baseGeekApi, () => {
  loginRedirect('dashgeek', window.location.href);
});

export function configureUserPlatform() {
  configure(baseGeekApi);
}
