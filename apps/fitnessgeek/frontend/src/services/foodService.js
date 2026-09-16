/**
 * Unified Food Service (Frontend)
 *
 * Single service for all food operations.
 * Backend handles smart routing (APIs + AI fallback).
 */

import { apiService } from './apiService.js';
import { restClient as restApi } from './restClient.js';

export const foodService = {
  /**
   * Search for foods - calls fitnessgeek REST API directly for AI + external API search
   * @param {string} query - Search query (can be natural language)
   * @param {Object} options - Search options
   */
  search: async (query, options = {}) => {
    const { limit = 25, includeAI = true, signal } = options;
    const response = await restApi.get('/foods', {
      params: {
        search: query,
        limit,
        includeAI: includeAI ? 'true' : 'false'
      },
      // The box fires a fresh search on every pause; an in-flight one whose
      // query is already stale must not land on top of a newer answer.
      signal
    });
    return response.data?.data || response.data || [];
  },

  /**
   * Describe a meal in plain words; the backend writes the log.
   *
   * This is the front door for the whole describe-and-log design
   * (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md): Chef says what he ate and it gets
   * logged — no searching, no picking, no confirm step. `search` above stays
   * as the fallback for when he wants one specific branded item.
   *
   * `hour` is the caller's LOCAL clock. The server runs UTC and otherwise
   * cannot tell which meal 8pm belongs to, so the browser has to say.
   *
   * Resolves to `{ logged, skipped, logIds, questions, totalCalories }`. A
   * 422 means nothing in the text looked like food — that is a real answer,
   * not a fault, so it is thrown with its message intact for the caller to
   * show.
   *
   * @param {string} text
   * @param {{date: string, hour?: number, signal?: AbortSignal}} options
   */
  describe: async (text, { date, hour, signal } = {}) => {
    const response = await restApi.post(
      '/logs/describe',
      {
        text,
        date,
        hour: Number.isFinite(hour) ? hour : new Date().getHours()
      },
      { signal }
    );
    return response.data?.data || null;
  },

  /**
   * The typeahead: the local catalog only — favourites, recents, your own
   * foods, and anything already in the shared catalog. No external API, no
   * model, so it is fast enough to call while someone is still typing.
   *
   * Called with no query it returns the starting shelf, which is the empty
   * state of the search box.
   *
   * @param {string} query
   * @param {{limit?: number, signal?: AbortSignal}} [options]
   */
  suggest: async (query, options = {}) => {
    const { limit = 15, signal } = options;
    const response = await restApi.get('/foods/suggest', {
      params: { q: query || '', limit },
      signal
    });
    return response.data?.data || response.data || [];
  },

  /**
   * Get food by barcode
   * @param {string} barcode - UPC/EAN barcode
   */
  getByBarcode: async (barcode) => {
    const response = await restApi.get('/foods', {
      params: { barcode }
    });
    const data = response.data?.data || response.data;
    return Array.isArray(data) ? data[0] : data;
  },

  /**
   * Create a custom food item — goes through apiService.
   * The apiService router now correctly maps POST /foods → addFitnessFood mutation
   * with input normalization (serving.size/unit flattening).
   */
  create: async (foodData) => {
    const response = await apiService.post('/foods', {
      ...foodData,
      source: 'custom'
    });
    return response.data || response;
  },

  /**
   * Update a food item — maps to updateFitnessFood mutation.
   */
  update: async (foodId, updateData) => {
    const response = await apiService.put(`/foods/${foodId}`, updateData);
    return response.data || response;
  },

  /**
   * Delete a food item — maps to deleteFitnessFood mutation.
   */
  delete: async (foodId) => {
    const response = await apiService.delete(`/foods/${foodId}`);
    return response;
  },

  /**
   * Get a single food item by ID — maps to fitnessFood(id: $id) query.
   */
  getById: async (foodId) => {
    const response = await apiService.get(`/foods/${foodId}`);
    return response.data || response;
  },

  /**
   * Get all user's custom foods — goes through REST to support the `source` filter
   * that the GraphQL query doesn't expose.
   */
  getCustomFoods: async (limit = 50) => {
    const response = await restApi.get('/foods', {
      params: { source: 'custom', limit }
    });
    return response.data?.data || response.data || [];
  },

  // ───── FAVORITES — REST only (no GraphQL equivalent) ─────

  getFavorites: async () => {
    const response = await restApi.get('/foods/favorites');
    return response.data?.data || response.data || [];
  },

  addFavorite: async (foodId) => {
    const response = await restApi.post(`/foods/favorites/${foodId}`);
    return response.data;
  },

  removeFavorite: async (foodId) => {
    const response = await restApi.delete(`/foods/favorites/${foodId}`);
    return response.data;
  },

  // ───── RECENT FOODS — REST only ─────

  getRecent: async (limit = 20) => {
    const response = await restApi.get('/foods/recent', { params: { limit } });
    return response.data?.data || response.data || [];
  },
};

export default foodService;
