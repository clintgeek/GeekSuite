import { apiService } from './apiService.js';

export const userService = {
  /**
   * Update user profile via baseGeek
   * @param {Object} profileData - User profile data
   * @returns {Promise<Object>} Updated profile
   */
  async updateProfile(profileData) {
    try {
      const result = await apiService.put('/user/profile', { profile: profileData });
      const user = result?.user || result?.data?.user || result?.data || null;
      return { success: true, data: user };
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw new Error(error.message || 'Failed to update profile');
    }
  },

  /**
   * Get user profile from baseGeek
   * @returns {Promise<Object>} User profile
   */
  async getProfile() {
    try {
      const result = await apiService.get('/me');
      return result?.user || result?.data?.user || result?.data || null;
    } catch (error) {
      console.error('Failed to get profile:', error);
      throw new Error(error.message || 'Failed to get profile');
    }
  },

  /**
   * Get user's latest weight from fitnessGeek logs
   * @returns {Promise<number|null>} Latest weight or null
   */
  async getLatestWeight() {
    try {
      const response = await apiService.get('/weight', {
        params: {
          limit: 1,
          sort: 'date:desc'
        }
      });

      const logs = response.data.data || response.data;
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
