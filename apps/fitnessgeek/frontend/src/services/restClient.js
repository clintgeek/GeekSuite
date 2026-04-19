/**
 * Shared REST client for fitnessgeek frontend services.
 *
 * All services that talk to the fitnessgeek backend's REST endpoints use this
 * single axios instance so that token attachment and refresh-token rotation go
 * through the canonical @geeksuite/auth interceptor rather than each service
 * reading localStorage directly.
 */

import axios from 'axios';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

export const restClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
});

setupAxiosInterceptors(restClient, () => {
  loginRedirect('fitnessgeek', window.location.href);
});
