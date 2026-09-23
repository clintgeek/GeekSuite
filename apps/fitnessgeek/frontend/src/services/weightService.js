import { apiService } from './apiService';
import { localDateString, rollingMean, utcDateString } from '@geeksuite/utils';

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
   * Weight change over ~`periodDays`, smoothed (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §0).
   *
   * Computed client-side from weight logs — no dedicated stats endpoint exists.
   *
   * A scale reading swings 2–3 lb with water and food, so first-vs-last raw
   * readings (what this used to return) is mostly that noise: a salty dinner
   * the night before reads as a month's "gain". The change is instead the
   * 7-day trailing mean at the latest reading minus the 7-day trailing mean
   * at the last reading on or before `periodDays` earlier.
   *
   * When that comparison can't be made honestly, `totalChange` is null and
   * `reason` says why — never a raw-reading fallback:
   *   'no_data'           — no weigh-ins at all
   *   'insufficient_span' — history is shorter than `periodDays`;
   *                         `availableFrom` (YYYY-MM-DD) is when it won't be
   *   'no_baseline'       — history is long enough, but there is no reading
   *                         within a week before the baseline date, so the
   *                         only "then" would be a different period entirely
   *
   * Backward compatible: `totalChange`, `latestWeight`, `referenceWeight`
   * (now the baseline MEAN) and `periodDays` keep their names.
   */
  async getWeightStats({ periodDays = 30, windowDays = 7 } = {}) {
    const response = await apiService.get(BASE_URL);
    const logs = response?.data;
    const empty = {
      totalChange: null, latestWeight: null, referenceWeight: null, periodDays: null,
      method: 'rolling_mean', windowDays, reason: 'no_data', availableFrom: null,
      currentMean: null, referenceDate: null, latestDate: null,
    };
    if (!Array.isArray(logs) || logs.length === 0) {
      return { success: true, data: empty };
    }

    const points = logs
      .filter((l) => Number.isFinite(Number(l?.weight_value)) && l?.log_date)
      .map((l) => ({ date: l.log_date, value: Number(l.weight_value) }));
    const smoothed = rollingMean(points, { windowDays }); // oldest first, one per reading
    if (smoothed.length === 0) return { success: true, data: empty };

    const DAY_MS = 24 * 60 * 60 * 1000;
    const latest = smoothed[smoothed.length - 1];
    const first = smoothed[0];
    const base = {
      ...empty,
      reason: null,
      latestWeight: latest.value,
      currentMean: latest.mean,
      latestDate: utcDateString(latest.date),
    };

    const spanDays = Math.round((latest.date - first.date) / DAY_MS);
    if (spanDays < periodDays) {
      return {
        success: true,
        data: {
          ...base,
          reason: 'insufficient_span',
          availableFrom: utcDateString(new Date(first.date.getTime() + periodDays * DAY_MS)),
        },
      };
    }

    const target = latest.date.getTime() - periodDays * DAY_MS;
    const baseline = [...smoothed].reverse().find((p) => p.date.getTime() <= target);
    if (!baseline || target - baseline.date.getTime() >= windowDays * DAY_MS) {
      // No reading near the baseline date — typically a long gap in logging
      // (Chef: nothing between Dec 2025 and Sep 2026). The change becomes
      // honest `periodDays` after the current unbroken run began, where a run
      // ends at any gap longer than `windowDays`.
      let runStart = smoothed[smoothed.length - 1];
      for (let i = smoothed.length - 1; i > 0; i -= 1) {
        if (smoothed[i].date - smoothed[i - 1].date > windowDays * DAY_MS) break;
        runStart = smoothed[i - 1];
      }
      return {
        success: true,
        data: {
          ...base,
          reason: 'no_baseline',
          availableFrom: utcDateString(new Date(runStart.date.getTime() + periodDays * DAY_MS)),
        },
      };
    }

    return {
      success: true,
      data: {
        ...base,
        totalChange: Math.round((latest.mean - baseline.mean) * 10) / 10,
        referenceWeight: baseline.mean,
        referenceDate: utcDateString(baseline.date),
        periodDays,
      },
    };
  },

  /**
   * Add weight log with date formatting
   */
  async addWeightLog(weight, date = new Date(), notes = '') {
    let logDate;
    if (date instanceof Date) {
      logDate = localDateString(date);
    } else {
      logDate = date; // already a YYYY-MM-DD string
    }
    const weightData = {
      weight_value: parseFloat(weight),
      log_date: logDate,
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