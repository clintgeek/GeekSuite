import { apiService } from './apiService.js';

/**
 * Simple and Full: the person's saved choices, and the history the default
 * is decided from (utils/experience.js). Writes are partial — only the keys
 * just touched go out, and the gateway turns them into dot paths
 * (CONTEXT.md, "Settings writes are PARTIAL").
 */
const rows = (response) => {
  const data = response?.data ?? response;
  return Array.isArray(data) ? data : [];
};

export const experienceService = {
  /** The saved `experience` sub-document, or null when there is none yet. */
  async get() {
    const response = await apiService.get('/settings/experience');
    const settings = response?.data ?? response;
    return settings?.experience ?? null;
  },

  /** @param {{mode?, larger_text?, first_run_done?, preferred_name?, goal?}} patch */
  async update(patch) {
    return apiService.put('/settings/experience', patch);
  },

  /**
   * What the default-mode rule needs to know, fetched only as far as it has
   * to be: the newest food logs first, and weights and blood pressure only
   * if those say nothing. Chef answers on the first call; Heather, with no
   * logs of any kind, costs three small ones.
   */
  async activity(isRecent) {
    const foodLogs = rows(await apiService.get('/logs/activity').catch(() => null));
    if (isRecent({ foodLogs })) return { foodLogs };
    const [weights, bloodPressures] = await Promise.all([
      apiService.get('/weight').then(rows).catch(() => []),
      apiService.get('/blood-pressure').then(rows).catch(() => []),
    ]);
    return { foodLogs, weights, bloodPressures };
  },
};

export default experienceService;
