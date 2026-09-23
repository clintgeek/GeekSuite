import { apiService } from './apiService';

/**
 * Body composition reads — DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §3.2.
 *
 * The summary is already smoothed server-side (14-day "current", 7-vs-7-day
 * change with a 14-day gap, lean-mass BMR). Callers display it; they do not
 * subtract two scans to make a change of their own — that is exactly the
 * noise the rule exists to keep off the screen.
 *
 * Uploads are a different path (`bodyCompUploadService.js`, multipart to the
 * Express backend); these are ordinary GraphQL reads through the shim.
 */
export const bodyCompService = {
  /** @returns {Promise<{success: boolean, data: Object}>} the BodyCompSummary */
  async getSummary() {
    return apiService.get('/body-comp/summary');
  },

  /**
   * Scans, oldest first. Both bounds are optional calendar days (YYYY-MM-DD).
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async getScans({ startDate, endDate } = {}) {
    const qp = new URLSearchParams();
    if (startDate) qp.append('startDate', startDate);
    if (endDate) qp.append('endDate', endDate);
    const q = qp.toString();
    return apiService.get(q ? `/body-comp/scans?${q}` : '/body-comp/scans');
  },
};

export default bodyCompService;
