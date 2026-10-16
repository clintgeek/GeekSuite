import { apiService } from './apiService.js';
import logger from '../utils/logger.js';

export const streakService = {
  // Get user's login streak
  async getLoginStreak() {
    try {
      logger.debug('StreakService: GET /streaks/login');
      const response = await apiService.get('/streaks/login');
      logger.debug('StreakService: response OK');
      return response;
    } catch (error) {
      logger.error('Error fetching login streak:', error);
      throw error;
    }
  },

  // Record a login for a calendar day (the browser's, YYYY-MM-DD).
  async recordLogin({ date } = {}) {
    try {
      const response = await apiService.post('/streaks/login', date ? { date } : undefined);
      return response;
    } catch (error) {
      logger.error('Error recording login:', error);
      throw error;
    }
  }
};