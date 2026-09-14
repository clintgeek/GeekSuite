import { useCallback } from 'react';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { foodService } from '../services/foodService.js';
import logger from '../utils/logger.js';

/**
 * Logging a food, and taking it back.
 *
 * The search box logs on a tap rather than staging-then-committing, which only
 * works if undo is real — so every write returns the log ids it created and
 * `undoLogs` deletes exactly those. Both the Food Log page and the full-page
 * search mount the same box, so this lives here rather than being written
 * twice with two different notions of what "logged" means.
 *
 * @param {{date: string, onChanged?: () => Promise<void>|void}} options
 */
export const useFoodLogging = ({ date, onChanged }) => {
  /**
   * @param {object[]} items   foods carrying a `servings` count
   * @param {string} mealType
   * @returns {Promise<{ok: number, fail: number, logIds: string[]}>}
   */
  const logItems = useCallback(async (items, mealType = 'snack') => {
    if (!items?.length) return { ok: 0, fail: 0, logIds: [] };

    const settled = await Promise.allSettled(
      items.map(async (item) => {
        if (item?.type === 'meal' && (item._id || item.id)) {
          await fitnessGeekService.addMealToLog(item._id || item.id, date, mealType);
          return null;   // a meal expands into several logs; undo is per-meal, not per-row
        }

        const servings = Number(item.servings);
        const response = await fitnessGeekService.addFoodToLog({
          food_item: item,
          meal_type: mealType,
          servings: Number.isFinite(servings) && servings > 0 ? Math.max(0.1, servings) : 1,
          log_date: date,
          nutrition: item.nutrition
        });

        if (!response?.success) {
          throw new Error(response?.error?.message || 'Failed to log item');
        }
        return response.data?.id || response.data?._id || null;
      })
    );

    let ok = 0;
    let fail = 0;
    const logIds = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        ok += 1;
        if (result.value) logIds.push(result.value);
      } else {
        fail += 1;
        logger.error('Failed to log food:', result.reason?.message);
      }
    }

    // One refresh for the batch, not one per item.
    if (ok > 0) await onChanged?.();

    return { ok, fail, logIds };
  }, [date, onChanged]);

  const undoLogs = useCallback(async (logIds) => {
    if (!logIds?.length) return;
    await Promise.allSettled(logIds.map((id) => fitnessGeekService.deleteFoodLog(id)));
    await onChanged?.();
  }, [onChanged]);

  /** The "Can't find it? Create …" escape hatch. */
  const createFood = useCallback(async (payload) => {
    const created = await foodService.create(payload);
    return created?.data || created;
  }, []);

  return { logItems, undoLogs, createFood };
};

export default useFoodLogging;
