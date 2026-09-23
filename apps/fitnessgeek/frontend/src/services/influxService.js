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

import { restClient as restApi } from './restClient.js';

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
   * Daily Garmin trends — DOCS/FITNESSGEEK_TRENDS_PLAN.md §3. One point per
   * calendar day, oldest first, for the `days` ending at `end` (the caller's
   * local YYYY-MM-DD — the server never guesses "today"):
   *
   *   { available: boolean,
   *     days: [{ date, restingHR, overnightHRV, sleepScore, sleepHours, steps,
   *              moderateMin, vigorousMin, activeKcal, stressMean,
   *              bodyBatteryHigh, bodyBatteryLow, fitnessAge }],   // null = no reading
   *     fitnessAge: { current, chronological, achievable } | null,
   *     activeKcal30: { mean, days } | null }                      // for the wizard
   *
   * Raw daily values only; every average, change and sparkline is smoothed
   * client-side through @geeksuite/utils bodyComp.js (the smoothing rule).
   */
  async getTrends({ days = 90, end } = {}) {
    const qp = new URLSearchParams({ days: String(days) });
    if (end) qp.set('end', end);
    return unwrap(await restApi.get(`/influx/trends?${qp}`));
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
