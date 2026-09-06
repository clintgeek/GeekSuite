/**
 * quickAddService — natural-language quick-add (AI_IDEAS.md idea #2, R115).
 *
 * One read: `parseFoodEntry`, which answers a *proposal* — a search query per
 * thing the person said they ate. It writes nothing. The rows the user ticks
 * are logged by `fitnessGeekService.addFoodToLog`, the same call a hand-picked
 * food goes through, so nothing here bypasses the gateway's validation,
 * `findOrCreate` dedupe or nutrition math.
 *
 * The `date` it sends is the caller's **local wall clock**
 * (`YYYY-MM-DDTHH:mm`), not a calendar date and not an instant. The gateway
 * runs in UTC (no image installs tzdata — BURN_REVIEW #13), so it cannot know
 * what hour it is where the user is, and the hour is what picks a meal type.
 * Same rule as every other per-day read in this app: the browser owns the
 * local clock.
 */

import { apiService } from './apiService.js';
import { localDateString } from '@geeksuite/utils';
import logger from '../utils/logger.js';

const pad = (n) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` in the browser's own timezone. */
export function localWallClock(now = new Date()) {
  const day = localDateString(now);
  if (!day) return '';
  return `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export const quickAddService = {
  /**
   * @param {string} text one "what I ate" sentence (the gateway caps it at 500)
   * @param {object} [options]
   * @param {Date} [options.now] injectable clock, for tests
   * @returns {Promise<{fragments: Array, provenance: object|null}>}
   */
  parse: async (text, { now = new Date() } = {}) => {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { fragments: [], provenance: null };

    const params = new URLSearchParams({ text: trimmed, date: localWallClock(now) });
    const response = await apiService.get(`/quick-add/parse?${params.toString()}`);
    const data = response?.data || {};
    logger.debug('quickAddService: parsed', data?.fragments?.length ?? 0, 'fragment(s)');
    return {
      fragments: Array.isArray(data.fragments) ? data.fragments : [],
      provenance: data.provenance || null,
    };
  },
};

export default quickAddService;
