import { apiService } from './apiService.js';
import { formatDateLocal } from '../utils/dateUtils.js';
import logger from '../utils/logger.js';
import { restClient as restApi } from './restClient.js';

// FitnessGeek service for food logging and nutrition tracking
export const fitnessGeekService = {
  // ===== FOOD ITEMS =====

  // Search for foods
  searchFoods: async (query, limit = 25) => {
    try {
      const response = await apiService.get('/foods', {
        params: { search: query, limit }
      });
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Error searching foods:', error);
      throw error;
    }
  },

  // Get food by barcode
  getFoodByBarcode: async (barcode) => {
    try {
      const response = await apiService.get('/foods', {
        params: { barcode }
      });
      return response.data[0] || null;
    } catch (error) {
      logger.error('Error getting food by barcode:', error);
      throw error;
    }
  },

  // Create custom food
  createCustomFood: async (foodData) => {
    try {
      const response = await apiService.post('/foods', foodData);
      return response.data;
    } catch (error) {
      logger.error('Error creating custom food:', error);
      throw error;
    }
  },

  // Update food item
  updateFood: async (foodId, updateData) => {
    try {
      const response = await apiService.put(`/foods/${foodId}`, updateData);
      return response.data;
    } catch (error) {
      logger.error('Error updating food:', error);
      throw error;
    }
  },

  // Delete food item (soft delete)
  deleteFood: async (foodId) => {
    try {
      const response = await apiService.delete(`/foods/${foodId}`);
      return response;
    } catch (error) {
      logger.error('Error deleting food:', error);
      throw error;
    }
  },

  // Get all foods (global + custom)
  getAllFoods: async (limit = 50) => {
    try {
      const response = await apiService.get('/foods', {
        params: { limit }
      });
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Error getting all foods:', error);
      throw error;
    }
  },

  // ===== FOOD LOGS =====

  // Get food logs for a date
  getLogsForDate: async (date) => {
    try {
      const response = await apiService.get('/logs', {
        params: { date }
      });
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Error getting logs for date:', error);
      throw error;
    }
  },

  // Get recent logs
  getRecentLogs: async () => {
    try {
      const response = await apiService.get('/logs');
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Error getting recent logs:', error);
      throw error;
    }
  },

  // Add food to log — uses REST so backend can create FoodItem from AI/API results
  addFoodToLog: async (logData) => {
    try {
      const response = await restApi.post('/logs', logData);
      return response.data; // { success, data, message }
    } catch (error) {
      logger.error('Error adding food to log:', error.response?.data || error.message);
      throw error;
    }
  },

  // Update food log — uses REST for consistency with add
  updateFoodLog: async (logId, updateData) => {
    try {
      const response = await restApi.put(`/logs/${logId}`, updateData);
      return response.data;
    } catch (error) {
      logger.error('Error updating food log:', error.response?.data || error.message);
      throw error;
    }
  },

  // Delete food log — uses REST for consistency
  deleteFoodLog: async (logId) => {
    try {
      const response = await restApi.delete(`/logs/${logId}`);
      return response.data;
    } catch (error) {
      logger.error('Error deleting food log:', error.response?.data || error.message);
      throw error;
    }
  },

  // Copy meal from one date/meal to another
  copyMeal: async (fromDate, toDate, fromMealType = null, toMealType = null, fromUserId = null) => {
    try {
      const payload = {
        from_date: fromDate,
        to_date: toDate
      };
      if (fromMealType) payload.from_meal_type = fromMealType;
      if (toMealType) payload.to_meal_type = toMealType;
      if (fromUserId) payload.from_user_id = fromUserId;

      const response = await apiService.post('/logs/copy', payload);
      return response.data;
    } catch (error) {
      logger.error('Error copying meal:', error);
      throw error;
    }
  },

  // Get household members
  getHouseholdMembers: async () => {
    try {
      const response = await apiService.get('/logs/household');
      return response.data;
    } catch (error) {
      logger.error('Error getting household members:', error);
      throw error;
    }
  },

  // Get a household member's logs for a date
  getHouseholdMemberLogs: async (memberId, date) => {
    try {
      const response = await apiService.get(`/logs/household/${memberId}/${date}`);
      return response.data;
    } catch (error) {
      logger.error('Error getting household member logs:', error);
      throw error;
    }
  },

  // ===== DAILY SUMMARIES =====

  // Get daily summary
  getDailySummary: async (date) => {
    try {
      const response = await apiService.get(`/summary/${date}`);
      return response.data;
    } catch (error) {
      logger.error('Error getting daily summary:', error);
      throw error;
    }
  },

  // Get today's summary
  getTodaySummary: async () => {
    try {
      const response = await apiService.get('/summary/today');
      return response.data;
    } catch (error) {
      logger.error('Error getting today\'s summary:', error);
      throw error;
    }
  },

  // Get weekly summary
  getWeeklySummary: async (startDate) => {
    try {
      const response = await apiService.get(`/summary/week/${startDate}`);
      return response.data;
    } catch (error) {
      logger.error('Error getting weekly summary:', error);
      throw error;
    }
  },

  // Refresh daily summary
  refreshDailySummary: async (date) => {
    try {
      const response = await apiService.post(`/summary/${date}/refresh`);
      return response.data;
    } catch (error) {
      logger.error('Error refreshing daily summary:', error);
      throw error;
    }
  },

  // ===== GARMIN =====

  getGarminStatus: async () => {
    try {
      const response = await apiService.get('/fitness/garmin/status');
      return response.data || response;
    } catch (error) {
      logger.error('Error getting Garmin status:', error);
      throw error;
    }
  },

  getGarminDaily: async (date) => {
    try {
      const response = await apiService.get(`/fitness/garmin/daily/${date || ''}`);
      return response.data?.data || response.data;
    } catch (error) {
      logger.error('Error getting Garmin daily:', error);
      throw error;
    }
  },

  getGarminHeartRate: async (date) => {
    try {
      // No GraphQL equivalent — goes direct to REST on the fitnessgeek backend
      const response = await restApi.get(`/fitness/garmin/heart-rate/${date || ''}`);
      return response.data?.data || response.data || null;
    } catch (error) {
      logger.error('Error getting Garmin heart rate:', error.response?.data || error.message);
      throw error;
    }
  },

  getGarminSleep: async (date) => {
    try {
      const response = await apiService.get(`/fitness/garmin/sleep/${date || ''}`);
      return response.data || response;
    } catch (error) {
      logger.error('Error getting Garmin sleep:', error);
      throw error;
    }
  },

  getGarminActivities: async (start = 0, limit = 20) => {
    try {
      const response = await apiService.get('/fitness/garmin/activities', { params: { start, limit } });
      return response.data || response;
    } catch (error) {
      logger.error('Error getting Garmin activities:', error);
      throw error;
    }
  },

  get: (path, config) => apiService.get(path, config),
  post: (path, data, config) => apiService.post(path, data, config),

  pushWeightToGarmin: async ({ date, weightLbs, timezone }) => {
    try {
      const response = await apiService.post('/fitness/garmin/weight', { date, weightLbs, timezone });
      return response;
    } catch (error) {
      logger.error('Error pushing weight to Garmin:', error);
      throw error;
    }
  },

  // ===== MEALS =====

  // Get all meals
  getMeals: async (mealType = null, search = null) => {
    try {
      const params = {};
      if (mealType) params.meal_type = mealType;
      if (search) params.search = search;

      const response = await apiService.get('/meals', { params });
      // apiService.get returns the response body directly.
      // Backend typically responds with { success: true, data: [...] }.
      // Be resilient to both shapes.
      return (response && (response.data ?? response.data?.data)) || response.data || response;
    } catch (error) {
      logger.error('Error getting meals:', error);
      throw error;
    }
  },

  // Get single meal
  getMeal: async (mealId) => {
    try {
      const response = await apiService.get(`/meals/${mealId}`);
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Error getting meal:', error);
      throw error;
    }
  },

  // Create meal
  createMeal: async (mealData) => {
    try {
      const response = await apiService.post('/meals', mealData);
      return response; // Return full response, not response.data
    } catch (error) {
      logger.error('Error creating meal:', error);
      throw error;
    }
  },

  // Update meal
  updateMeal: async (mealId, updateData) => {
    try {
      const response = await apiService.put(`/meals/${mealId}`, updateData);
      return response.data;
    } catch (error) {
      logger.error('Error updating meal:', error);
      throw error;
    }
  },

  // Delete meal
  deleteMeal: async (mealId) => {
    try {
      const response = await apiService.delete(`/meals/${mealId}`);
      return response;
    } catch (error) {
      logger.error('Error deleting meal:', error);
      throw error;
    }
  },

  // Add meal to log
  addMealToLog: async (mealId, logDate, mealType) => {
    try {
      // REST endpoint — expects log_date + meal_type in body (not the GQL apiService path)
      const response = await restApi.post(`/meals/${mealId}/add-to-log`, {
        log_date: logDate,
        meal_type: mealType
      });
      return response.data;
    } catch (error) {
      logger.error('Error adding meal to log:', error);
      throw error;
    }
  },

  // ===== UTILITY FUNCTIONS =====

  // Calculate nutrition for a food item with servings
  calculateNutrition: (food, servings) => {
    const multiplier = parseFloat(servings) || 1;
    return {
      calories: Math.round(food.nutrition.calories_per_serving * multiplier),
      protein_grams: Math.round(food.nutrition.protein_grams * multiplier * 10) / 10,
      carbs_grams: Math.round(food.nutrition.carbs_grams * multiplier * 10) / 10,
      fat_grams: Math.round(food.nutrition.fat_grams * multiplier * 10) / 10,
      fiber_grams: Math.round(food.nutrition.fiber_grams * multiplier * 10) / 10,
      sugar_grams: Math.round(food.nutrition.sugar_grams * multiplier * 10) / 10,
      sodium_mg: Math.round(food.nutrition.sodium_mg * multiplier)
    };
  },

  // Format date for API
  formatDate: (date) => {
    if (typeof date === 'string') return date;
    return formatDateLocal(date);
  },

  // Get meal type display name
  getMealTypeName: (mealType) => {
    const names = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack'
    };
    return names[mealType] || mealType;
  },

  // Get meal type icon
  getMealTypeIcon: (mealType) => {
    const icons = {
      breakfast: '🌅',
      lunch: '☀️',
      dinner: '🌙',
      snack: '🍎'
    };
    return icons[mealType] || '🍽️';
  }
};