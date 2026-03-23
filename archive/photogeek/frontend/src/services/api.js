import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

const api = axios.create({
  baseURL: '/api',
});

api.defaults.withCredentials = true;

// Add response interceptor to handle auth errors and transparent token refreshing
setupAxiosInterceptors(api, () => {
  // If refresh fails, redirect to login
  if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    window.location.href = '/login';
  }
});

export default api;
