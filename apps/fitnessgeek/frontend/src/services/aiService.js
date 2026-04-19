/**
 * AI Service — direct REST client for the fitnessgeek backend's /api/ai/* routes.
 *
 * These endpoints wrap baseGeek AI calls with fitnessgeek-specific context
 * (user profile, food parsing, goal creation, meal planning). They are NOT
 * part of the GraphQL schema and live only as REST on the fitnessgeek backend.
 *
 * Same pattern as foodService, userService, influxService.
 *
 * AI calls can be slow; a per-request timeout override of 60000ms is applied
 * to each method below rather than using a separate axios instance.
 */

import { restClient as restApi } from './restClient.js';

const AI_TIMEOUT = { timeout: 60000 };

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const aiService = {
  /**
   * Check whether the AI service is configured and reachable.
   */
  async getStatus() {
    try {
      const response = await restApi.get('/ai/status', AI_TIMEOUT);
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
      const response = await restApi.post('/ai/parse-food', { description, userContext }, AI_TIMEOUT);
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
      const response = await restApi.post('/ai/create-nutrition-goals', { userInput, userProfile }, AI_TIMEOUT);
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
      const response = await restApi.post('/ai/generate-meal-plan', { goal, userProfile }, AI_TIMEOUT);
      return unwrap(response);
    } catch (error) {
      console.error('AI meal plan generation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to generate meal plan');
    }
  },
};

export default aiService;
