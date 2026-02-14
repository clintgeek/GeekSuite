/**
 * Unified Food Service (Frontend)
 *
 * Single service for all food operations.
 * Backend handles smart routing (APIs + AI fallback).
 */

import { apiService } from './apiService.js';

export const foodService = {
  /**
   * Search for foods - backend handles smart routing
   * @param {string} query - Search query (can be natural language)
   * @param {Object} options - Search options
   */
  search: async (query, options = {}) => {
    const { limit = 25, includeAI = true } = options;
    const response = await apiService.get('/foods', {
      params: {
        search: query,
        limit,
        includeAI: includeAI ? 'true' : 'false'
      }
    });
    return response.data || response;
  },

  /**
   * Get food by barcode
   * @param {string} barcode - UPC/EAN barcode
   */
  getByBarcode: async (barcode) => {
    const response = await apiService.get('/foods', {
      params: { barcode }
    });
    const data = response.data || response;
    return Array.isArray(data) ? data[0] : data;
  },

  /**
   * Create a custom food item
   * @param {Object} foodData - Food data
   */
  create: async (foodData) => {
    const response = await apiService.post('/foods', {
      ...foodData,
      source: 'custom'
    });
    return response.data || response;
  },

  /**
   * Update a food item
   * @param {string} foodId - Food ID
   * @param {Object} updateData - Update data
   */
  update: async (foodId, updateData) => {
    const response = await apiService.put(`/foods/${foodId}`, updateData);
    return response.data || response;
  },

  /**
   * Delete a food item (soft delete)
   * @param {string} foodId - Food ID
   */
  delete: async (foodId) => {
    const response = await apiService.delete(`/foods/${foodId}`);
    return response;
  },

  /**
   * Get a single food by ID
   * @param {string} foodId - Food ID
   */
  getById: async (foodId) => {
    const response = await apiService.get(`/foods/${foodId}`);
    return response.data || response;
  },

  /**
   * Get all user's custom foods
   * @param {number} limit - Max results
   */
  getCustomFoods: async (limit = 50) => {
    const response = await apiService.get('/foods', {
      params: { source: 'custom', limit }
    });
    return response.data || response;
  },

  // ===== FAVORITES =====

  /**
   * Get user's favorite foods
   */
  getFavorites: async () => {
    const response = await apiService.get('/foods/favorites');
    return response?.data?.data || response?.data || response;
  },

  /**
   * Add food to favorites
   * @param {string} foodId - Food ID
   */
  addFavorite: async (foodId) => {
    const response = await apiService.post(`/foods/favorites/${foodId}`);
    return response;
  },

  /**
   * Remove food from favorites
   * @param {string} foodId - Food ID
   */
  removeFavorite: async (foodId) => {
    const response = await apiService.delete(`/foods/favorites/${foodId}`);
    return response;
  },

  // ===== RECENT FOODS =====

  /**
   * Get user's recently logged foods
   * @param {number} limit - Max results (default 20)
   */
  getRecent: async (limit = 20) => {
    const response = await apiService.get('/foods/recent', {
      params: { limit }
    });
    return response?.data?.data || response?.data || response;
  }
};

export default foodService;
