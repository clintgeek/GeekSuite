import { apiService } from './apiService.js';

export const aiService = {
  async parseFoodDescription(description, userContext = {}) {
    try {
      const response = await apiService.post('/ai/parse-food', {
        description,
        userContext
      });
      return response.data;
    } catch (error) {
      console.error('AI food parsing failed:', error);
      throw new Error(error.message || 'Failed to parse food description');
    }
  },

  async getStatus() {
    try {
      const response = await apiService.get('/ai/status');
      return response.data;
    } catch (error) {
      console.error('Failed to get AI status:', error);
      throw new Error(error.message || 'Failed to get AI status');
    }
  },

  async createNutritionGoals(userInput, userProfile = {}) {
    try {
      const response = await apiService.post('/ai/create-nutrition-goals', {
        userInput,
        userProfile
      });

      return response.data;
    } catch (error) {
      console.error('AI nutrition goal creation failed:', error);
      throw new Error(error.message || 'Failed to create nutrition goals');
    }
  },

  async generateMealPlan(goal, userProfile = {}) {
    try {
      const response = await apiService.post('/ai/generate-meal-plan', {
        goal,
        userProfile
      });

      return response.data;
    } catch (error) {
      console.error('AI meal plan generation failed:', error);
      throw new Error(error.message || 'Failed to generate meal plan');
    }
  },
};
