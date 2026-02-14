import { apiService } from './apiService.js';
import logger from '../utils/logger.js';

export const settingsService = {
  // Get user settings
  getSettings: async () => {
    try {
      logger.debug('SettingsService: getSettings');
      const response = await apiService.get('/settings');
      logger.debug('SettingsService: getSettings OK');
      return response;
    } catch (error) {
      logger.error('Error getting user settings:', error);
      throw error;
    }
  },

  // Update user settings
  updateSettings: async (settings) => {
    try {
      const response = await apiService.put('/settings', settings);
      return response.data;
    } catch (error) {
      console.error('Error updating user settings:', error);
      throw error;
    }
  },

  // Update dashboard settings specifically
  updateDashboardSettings: async (dashboardSettings) => {
    try {
      logger.debug('SettingsService: updateDashboardSettings payload');
      const response = await apiService.put('/settings/dashboard', dashboardSettings);
      logger.debug('SettingsService: updateDashboardSettings OK');
      return response;
    } catch (error) {
      logger.error('Error updating dashboard settings:', error);
      throw error;
    }
  },

  // Update AI settings specifically
  updateAISettings: async (aiSettings) => {
    try {
      logger.debug('SettingsService: updateAISettings payload');
      const response = await apiService.put('/settings/ai', aiSettings);
      logger.debug('SettingsService: updateAISettings OK');
      return response;
    } catch (error) {
      logger.error('Error updating AI settings:', error);
      throw error;
    }
  },

  // ===== HOUSEHOLD SETTINGS =====

  // Get household settings and members
  getHouseholdSettings: async () => {
    try {
      const response = await apiService.get('/settings/household');
      return response.data;
    } catch (error) {
      logger.error('Error getting household settings:', error);
      throw error;
    }
  },

  // Create a new household
  createHousehold: async (displayName) => {
    try {
      const response = await apiService.post('/settings/household/create', {
        display_name: displayName
      });
      return response.data;
    } catch (error) {
      logger.error('Error creating household:', error);
      throw error;
    }
  },

  // Join an existing household
  joinHousehold: async (householdId, displayName) => {
    try {
      const response = await apiService.post('/settings/household/join', {
        household_id: householdId,
        display_name: displayName
      });
      return response.data;
    } catch (error) {
      logger.error('Error joining household:', error);
      throw error;
    }
  },

  // Update household sharing settings
  updateHouseholdSettings: async (settings) => {
    try {
      const response = await apiService.put('/settings/household', settings);
      return response.data;
    } catch (error) {
      logger.error('Error updating household settings:', error);
      throw error;
    }
  },

  // Leave household
  leaveHousehold: async () => {
    try {
      const response = await apiService.delete('/settings/household');
      return response.data;
    } catch (error) {
      logger.error('Error leaving household:', error);
      throw error;
    }
  },

  // Get default dashboard settings
  getDefaultDashboardSettings: () => ({
    show_current_weight: true,
    show_blood_pressure: true,
    show_calories_today: true,
    show_login_streak: true,
    show_nutrition_today: true,
    show_garmin_summary: true,
    show_quick_actions: true,
    show_weight_goal: true,
    show_nutrition_goal: true,
    card_order: [
      'current_weight',
      'blood_pressure',
      'calories_today',
      'login_streak',
      'nutrition_today',
      'garmin_summary',
      'quick_actions',
      'weight_goal',
      'nutrition_goal'
    ]
  }),

  // Get default AI settings
  getDefaultAISettings: () => ({
    enabled: true,
    features: {
      natural_language_food_logging: true,
      meal_suggestions: true,
      nutrition_analysis: true,
      goal_recommendations: true
    }
  }),

  // Get default Garmin settings
  getDefaultGarminSettings: () => ({
    enabled: false,
    username: '',
    password: ''
  })
};