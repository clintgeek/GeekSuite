/**
 * Harvest defaults — what the quick harvest sheet remembers so the common
 * morning is three taps: FAB → usual count → Log (UX review 2026-11-18,
 * FlockGeek 1).
 *
 * Two pieces:
 *
 *   - the last pen logged to, kept ON THIS DEVICE (localStorage). A keeper
 *     with three pens usually walks to the same one first; the phone in the
 *     coop is the one that should remember it. Storage can be missing or
 *     throw (private mode, blocked site data, the harness), so every read and
 *     write is guarded and a failure just means "no default".
 *   - the quick counts, built from the recent harvests at that pen instead of
 *     a fixed 1–6 and 12 that skipped the flock's real range (a flock laying
 *     8–11 a day had no one-tap count).
 */

export const LAST_PEN_KEY = 'flockgeek:lastHarvestLocation';

/** The pen the last harvest on this device was logged to, or `''`. */
export function readLastPen() {
  try {
    return window.localStorage.getItem(LAST_PEN_KEY) || '';
  } catch {
    return '';
  }
}

/** Remember (or, for "no specific location", forget) the pen just logged to. */
export function rememberPen(locationId) {
  try {
    if (locationId) window.localStorage.setItem(LAST_PEN_KEY, locationId);
    else window.localStorage.removeItem(LAST_PEN_KEY);
  } catch {
    // No storage: the next sheet simply opens without a default pen.
  }
}

/** Used when there is no recent history to build from. */
export const FALLBACK_COUNTS = [1, 2, 3, 4, 5, 6, 12];

/**
 * Five one-tap counts centred on the usual daily count at this pen.
 *
 * "Usual" is the median of the per-day counts of the last seven harvests at
 * the pen (a three-day harvest of 27 counts as 9), so one odd day does not
 * move the row. With no pen chosen every recent harvest counts. With no
 * history at all the fixed row comes back.
 *
 * @param {Array<{date: string, eggsCount: number, daysObserved?: number, locationId?: string}>} records
 * @param {string} [locationId]
 * @returns {{ counts: number[], usual: number|null }}
 */
export function usualCounts(records = [], locationId = '') {
  const atPen = records
    .filter((r) => r && Number.isFinite(r.eggsCount) && r.eggsCount > 0)
    .filter((r) => !locationId || r.locationId === locationId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 7)
    .map((r) => Math.round(r.eggsCount / Math.max(1, r.daysObserved || 1)))
    .filter((n) => n > 0);

  if (atPen.length === 0) return { counts: FALLBACK_COUNTS, usual: null };

  const sorted = [...atPen].sort((a, b) => a - b);
  const usual = sorted[Math.floor((sorted.length - 1) / 2)];
  const start = Math.max(1, usual - 2);
  const counts = Array.from({ length: 5 }, (_, i) => start + i);
  return { counts, usual };
}

/** Bottom padding a page owes the harvest FAB below `md`: 56 px FAB + 16 px
 * offset + 16 px of air, so the last row's ⋯ is reachable above it. */
export const HARVEST_FAB_CLEARANCE = { xs: '88px', md: 0 };
