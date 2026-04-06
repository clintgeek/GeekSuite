import axios from 'axios';
import { configure } from '@geeksuite/user';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

const BASEGEEK_API_URL = import.meta.env.VITE_BASEGEEK_URL;

if (!BASEGEEK_API_URL) {
  throw new Error('VITE_BASEGEEK_URL is not defined. Check your .env file.');
}

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
