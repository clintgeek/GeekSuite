import axios from 'axios';
import { apiService } from './apiService.js';

// Direct REST client for baseGeek SSO endpoints that aren't part of the
// fitnessgeek GraphQL schema (e.g. /me, /user/profile). These are served
// by basegeek via the same origin.
const restApi = axios.create({ baseURL: '/api', timeout: 15000, withCredentials: true });
restApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('geek_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const userService = {
  /**
   * Update user profile via baseGeek SSO endpoint
   */
  async updateProfile(profileData) {
    try {
      const response = await restApi.put('/user/profile', { profile: profileData });
      const payload = response.data || {};
      const user = payload?.user || payload?.data?.user || payload?.data || null;
      return { success: true, data: user };
    } catch (error) {
      console.error('Failed to update profile:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message || 'Failed to update profile');
    }
  },

  /**
   * Get current SSO user from baseGeek
   */
  async getProfile() {
    try {
      const response = await restApi.get('/me');
      const payload = response.data || {};
      return payload?.user || payload?.data?.user || payload?.data || payload || null;
    } catch (error) {
      console.error('Failed to get profile:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message || 'Failed to get profile');
    }
  },

  /**
   * Get user's latest weight from fitnessGeek logs (still uses GraphQL proxy)
   */
  async getLatestWeight() {
    try {
      const response = await apiService.get('/weight', {
        params: { limit: 1, sort: 'date:desc' }
      });
      const logs = response.data?.data || response.data;
      if (logs && logs.length > 0) {
        return logs[0].weight_value;
      }
      return null;
    } catch (error) {
      console.error('Failed to get latest weight:', error);
      return null;
    }
  }
};
