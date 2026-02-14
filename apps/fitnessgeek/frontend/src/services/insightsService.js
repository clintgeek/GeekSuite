/**
 * AI Insights Service
 *
 * Frontend service for AI-powered health insights.
 */

import { fitnessGeekService } from './fitnessGeekService.js';

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  if (params.start) searchParams.append('start', params.start);
  if (params.days) searchParams.append('days', params.days);
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const insightsService = {
  /**
   * Get morning briefing
   */
  async getMorningBrief() {
    const response = await fitnessGeekService.get('/insights/morning-brief');
    return response.data;
  },

  /**
   * Get daily summary
   * @param {string} date - Optional date in YYYY-MM-DD format
   */
  async getDailySummary(date = null) {
    const params = date ? `?date=${date}` : '';
    const response = await fitnessGeekService.get(`/insights/daily-summary${params}`);
    return response.data;
  },

  /**
   * Get health correlations analysis
   */
  async getCorrelations() {
    const response = await fitnessGeekService.get('/insights/correlations');
    return response.data;
  },

  /**
   * Get coaching advice
   */
  async getCoaching() {
    const response = await fitnessGeekService.get('/insights/coaching');
    return response.data;
  },

  /**
   * Get AI-generated weekly nutrition report
   */
  async getWeeklyReport(options = {}) {
    const response = await fitnessGeekService.get(`/insights/weekly-report${buildQuery(options)}`);
    return response.data;
  },

  /**
   * Get AI-generated trend watch summary
   */
  async getTrendWatch(options = {}) {
    const response = await fitnessGeekService.get(`/insights/trend-watch${buildQuery(options)}`);
    return response.data;
  },

  /**
   * Chat with AI about health data
   * @param {string} message - User message
   * @param {Array} history - Conversation history
   */
  async chat(message, history = []) {
    const response = await fitnessGeekService.post('/insights/chat', {
      message,
      history
    });
    return response.data;
  },

  /**
   * Get raw context data (for debugging)
   * @param {number} days - Number of days to include
   */
  async getContext(days = 7) {
    const response = await fitnessGeekService.get(`/insights/context?days=${days}`);
    return response.data;
  }
};

export default insightsService;
