import axios from 'axios';

/**
 * AI Service — direct REST client for the fitnessgeek backend's /api/ai/* routes.
 *
 * These endpoints wrap baseGeek AI calls with fitnessgeek-specific context
 * (user profile, food parsing, goal creation, meal planning). They are NOT
 * part of the GraphQL schema and live only as REST on the fitnessgeek backend.
 *
 * Same pattern as foodService, userService, influxService.
 */

const restApi = axios.create({
  baseURL: '/api',
  timeout: 60000, // AI calls can be slow
  withCredentials: true,
});

restApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('geek_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const aiService = {
  /**
   * Check whether the AI service is configured and reachable.
   */
  async getStatus() {
    try {
      const response = await restApi.get('/ai/status');
      return unwrap(response);
    } catch (error) {
      console.error('Failed to get AI status:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to get AI status');
    }
  },

  /**
   * Parse a natural language food description into structured items.
   */
  async parseFoodDescription(description, userContext = {}) {
    try {
      const response = await restApi.post('/ai/parse-food', { description, userContext });
      return unwrap(response);
    } catch (error) {
      console.error('AI food parsing failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to parse food description');
    }
  },

  /**
   * Ask AI to generate nutrition goals from a natural language goal + profile.
   */
  async createNutritionGoals(userInput, userProfile = {}) {
    try {
      const response = await restApi.post('/ai/create-nutrition-goals', { userInput, userProfile });
      return unwrap(response);
    } catch (error) {
      console.error('AI nutrition goal creation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to create nutrition goals');
    }
  },

  /**
   * Ask AI to generate a meal plan for a given goal + profile.
   */
  async generateMealPlan(goal, userProfile = {}) {
    try {
      const response = await restApi.post('/ai/generate-meal-plan', { goal, userProfile });
      return unwrap(response);
    } catch (error) {
      console.error('AI meal plan generation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to generate meal plan');
    }
  },
};

export default aiService;
