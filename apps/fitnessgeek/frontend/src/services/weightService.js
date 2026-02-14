import { apiService } from './apiService';

const BASE_URL = '/weight';

export const weightService = {
  /**
   * Get all weight logs for the current user
   */
  async getWeightLogs(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const url = queryParams.toString() ? `${BASE_URL}?${queryParams}` : BASE_URL;
    const response = await apiService.get(url);
    return response;
  },

  /**
   * Get a single weight log by ID
   */
  async getWeightLog(id) {
    const response = await apiService.get(`${BASE_URL}/${id}`);
    return response;
  },

  /**
   * Create a new weight log
   */
  async createWeightLog(weightData) {
    const response = await apiService.post(BASE_URL, weightData);
    return response;
  },

  /**
   * Update an existing weight log
   */
  async updateWeightLog(id, weightData) {
    const response = await apiService.put(`${BASE_URL}/${id}`, weightData);
    return response;
  },

  /**
   * Delete a weight log
   */
  async deleteWeightLog(id) {
    const response = await apiService.delete(`${BASE_URL}/${id}`);
    return response;
  },

  /**
   * Get weight statistics for the current user
   */
  async getWeightStats(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const url = queryParams.toString() ? `${BASE_URL}/stats?${queryParams}` : `${BASE_URL}/stats`;
    const response = await apiService.get(url);
    return response;
  },

  /**
   * Add weight log with date formatting
   */
  async addWeightLog(weight, date = new Date(), notes = '') {
    const weightData = {
      weight_value: parseFloat(weight),
      log_date: date instanceof Date ? date.toISOString() : date,
      notes
    };

    return this.createWeightLog(weightData);
  },

  /**
   * Get current weight (most recent entry)
   */
  async getCurrentWeight() {
    const response = await this.getWeightLogs({ limit: 1 });
    if (response.success && response.data.length > 0) {
      return response.data[0].weight_value;
    }
    return null;
  },

  /**
   * Get weight trend data for charts
   */
  async getWeightTrend(startDate = null, endDate = null) {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await this.getWeightLogs(params);
    if (response.success) {
      return response.data.sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
    }
    return [];
  }
};