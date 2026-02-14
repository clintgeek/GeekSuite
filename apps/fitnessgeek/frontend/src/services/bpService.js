import { apiService } from './apiService.js';

const BASE_URL = '/blood-pressure';

export const bpService = {
  /**
   * Get all blood pressure logs for the current user
   */
  async getBPLogs(params = {}) {
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
   * Get a single blood pressure log by ID
   */
  async getBPLog(id) {
    const response = await apiService.get(`${BASE_URL}/${id}`);
    return response;
  },

  /**
   * Create a new blood pressure log
   */
  async createBPLog(bpData) {
    const response = await apiService.post(BASE_URL, {
      systolic: bpData.systolic,
      diastolic: bpData.diastolic,
      pulse: bpData.pulse,
      log_date: bpData.date
    });
    return response;
  },

  /**
   * Update an existing blood pressure log
   */
  async updateBPLog(id, bpData) {
    const response = await apiService.put(`${BASE_URL}/${id}`, {
      systolic: bpData.systolic,
      diastolic: bpData.diastolic,
      pulse: bpData.pulse,
      log_date: bpData.date
    });
    return response;
  },

  /**
   * Delete a blood pressure log
   */
  async deleteBPLog(id) {
    const response = await apiService.delete(`${BASE_URL}/${id}`);
    return response;
  },

  /**
   * Get blood pressure statistics for the current user
   */
  async getBPStats(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const url = queryParams.toString() ? `${BASE_URL}/stats?${queryParams}` : `${BASE_URL}/stats`;
    const response = await apiService.get(url);
    return response;
  },

  /**
   * Add blood pressure log with date formatting
   */
  async addBPLog(systolic, diastolic, pulse, date = new Date(), notes = '') {
    const bpData = {
      systolic: parseInt(systolic),
      diastolic: parseInt(diastolic),
      pulse: pulse ? parseInt(pulse) : null,
      log_date: date instanceof Date ? date.toISOString() : date,
      notes
    };

    return this.createBPLog(bpData);
  },

  /**
   * Get current blood pressure (most recent entry)
   */
  async getCurrentBP() {
    const response = await this.getBPLogs({ limit: 1 });
    if (response.success && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  },

  /**
   * Get blood pressure trend data for charts
   */
  async getBPTrend(startDate = null, endDate = null) {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await this.getBPLogs(params);
    return response;
  }
};