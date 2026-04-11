import axios from 'axios';

/**
 * Influx Service — direct REST client for the fitnessgeek backend's
 * InfluxDB-powered health endpoints.
 *
 * These routes live under /api/influx/* on the fitnessgeek backend and are
 * NOT part of the GraphQL schema, so they bypass the apiService proxy entirely.
 * Same pattern as foodService and userService.
 *
 * All methods return the raw response payload (what axios calls `response.data`)
 * so callers can read fields like `response.heartRate` directly, matching the
 * existing consumer expectations.
 */

const restApi = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
});

// Attach auth token from the same localStorage key Apollo uses
restApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('geek_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const unwrap = (response) => response?.data ?? response;

export const influxService = {
  /**
   * Check InfluxDB connection / service status.
   * @returns { connected, database, measurementCount, ... }
   */
  async getStatus() {
    return unwrap(await restApi.get('/influx/status'));
  },

  /**
   * Intraday metrics (heart rate, stress, body battery, respiration) for a date range.
   * Both params are YYYY-MM-DD strings. For a single day, pass the same date twice.
   */
  async getIntraday(startDate, endDate) {
    return unwrap(await restApi.get(`/influx/intraday/${startDate}/${endDate}`));
  },

  /**
   * Detailed sleep analysis for a single date (HRV, recovery, cardio metrics).
   */
  async getSleepAnalysis(date) {
    return unwrap(await restApi.get(`/influx/sleep-analysis/${date}`));
  },

  /**
   * AI-generated recovery recommendations for a single date.
   */
  async getRecoveryRecommendations(date) {
    return unwrap(await restApi.get(`/influx/recovery-recommendations/${date}`));
  },

  /**
   * Raw health context snapshot used to feed the AI analyzer.
   */
  async getRecoveryContext(date) {
    return unwrap(await restApi.get(`/influx/recovery-context/${date}`));
  },
};

export default influxService;
