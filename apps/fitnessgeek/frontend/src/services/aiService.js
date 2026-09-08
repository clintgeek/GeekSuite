/**
 * AI Service — direct REST client for the fitnessgeek backend's /api/ai/* routes.
 *
 * These endpoints wrap aiGeek calls with fitnessgeek-specific context (user
 * profile, food parsing, goal creation, meal planning). They are NOT part of
 * the GraphQL schema and live only as REST on the fitnessgeek backend.
 *
 * Same pattern as foodService, userService, influxService.
 *
 * AI calls can be slow; a per-request timeout override of 60000ms is applied
 * to each method below rather than using a separate axios instance.
 *
 * **These routes no longer fail with a 5xx because a model was unavailable.**
 * Since the backend moved onto aiGeek's feature door
 * (apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md §4), an unavailable model is a
 * **200** carrying either a deterministic answer or the one friendly
 * sentence. So each method below returns the body and lets the caller read
 * `meta.ok` / `ok`; the `catch` blocks are for real transport failures only,
 * which is now the only thing that reaches them.
 *
 * What to read off each answer:
 *
 *   parseFoodDescription  → `{ data, meta: { ok, source, reason } }`
 *                           `source: 'model' | 'fallback' | 'cache'`. A
 *                           fallback item carries `nutrition: null` — the
 *                           split is known, the numbers are not. `reason:
 *                           'disabled'` means the user has not opted in.
 *   createNutritionGoals  → `{ data, meta: { ok, source, reason, message } }`
 *                           `source: 'deterministic'` is a real plan computed
 *                           from BMR/TDEE; `data: null` with a `message` means
 *                           the profile had too few numbers to compute one.
 *   generateMealPlan      → `{ data, meta: { ok } }` on success, or
 *                           `{ ok: false, reason, message }` — render the
 *                           message in place; there is no fallback menu.
 */

import { restClient as restApi } from './restClient.js';

const AI_TIMEOUT = { timeout: 60000 };

/** The whole body — `meta.ok` and `data` both matter now. */
const body = (response) => response?.data ?? response;

export const aiService = {
  /**
   * Check whether the AI service is configured and reachable.
   */
  async getStatus() {
    try {
      const response = await restApi.get('/ai/status', AI_TIMEOUT);
      return body(response)?.data ?? body(response);
    } catch (error) {
      console.error('Failed to get AI status:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to get AI status');
    }
  },

  /**
   * Parse a natural language food description into structured items.
   * @returns {Promise<{data: object, meta: {ok: boolean, source: string, reason: string|null}}>}
   */
  async parseFoodDescription(description, userContext = {}) {
    try {
      const response = await restApi.post('/ai/parse-food', { description, userContext }, AI_TIMEOUT);
      return body(response);
    } catch (error) {
      console.error('AI food parsing failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to parse food description');
    }
  },

  /**
   * Ask for nutrition goals from a natural language goal + profile. When no
   * model answers, `meta.source` is `deterministic` and `data` is still a
   * real plan (Mifflin-St Jeor BMR, activity-adjusted TDEE, safe floor).
   */
  async createNutritionGoals(userInput, userProfile = {}) {
    try {
      const response = await restApi.post('/ai/create-nutrition-goals', { userInput, userProfile }, AI_TIMEOUT);
      return body(response);
    } catch (error) {
      console.error('AI nutrition goal creation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to create nutrition goals');
    }
  },

  /**
   * Ask for a meal plan for a given goal + profile. `{ ok: false, message }`
   * is the expected answer when the assistant is unavailable — show the
   * message, do not raise an error.
   */
  async generateMealPlan(goal, userProfile = {}) {
    try {
      const response = await restApi.post('/ai/generate-meal-plan', { goal, userProfile }, AI_TIMEOUT);
      return body(response);
    } catch (error) {
      console.error('AI meal plan generation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to generate meal plan');
    }
  },
};

export default aiService;
