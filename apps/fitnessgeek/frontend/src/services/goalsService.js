import { apiService } from './apiService.js';
import logger from '../utils/logger.js';

export const goalsService = {
  // Get user goals
  async getGoals() {
    try {
      logger.debug('GoalsService: GET /goals');
      const response = await apiService.get('/goals');
      logger.debug('GoalsService: getGoals OK');
      return response;
    } catch (error) {
      logger.error('Error fetching goals:', error);
      throw error;
    }
  },

  // Save user goals
  async saveGoals(goals) {
    try {
      logger.debug('GoalsService: saveGoals payload');
      const response = await apiService.post('/goals', goals);
      logger.debug('GoalsService: saveGoals OK');
      return response;
    } catch (error) {
      logger.error('Error saving goals:', error);
      throw error;
    }
  },

  // Derived macros for today and week
  async getDerivedMacros() {
    return apiService.get('/goals/nutrition/macros');
  }
};