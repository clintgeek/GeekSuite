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
 * `describeMeal` is the other way in, and the one Chef actually asked for: a
 * sentence goes to `POST /logs/describe` and comes back already written. It
 * returns the same `{ok, fail, logIds}` shape as `logItems` precisely so undo
 * and the session ribbon cannot develop two behaviours.
 *
 * @param {{date: string, onChanged?: () => Promise<void>|void}} options
 */
export const useFoodLogging = ({ date, onChanged }) => {
  /**
   * @param {object[]} items   foods carrying a `servings` count
   * @param {string} mealType
   * @returns {Promise<{ok, fail, logIds: string[], perItem: string[][]}>}
   *          `logIds` is every id written, flat, which is what undo needs.
   *          `perItem` is the same ids grouped by the item that produced them,
   *          because one saved meal expands into several logs and anything
   *          pairing items to ids by index would mis-attribute the rest.
   */
  const logItems = useCallback(async (items, mealType = 'snack') => {
    if (!items?.length) return { ok: 0, fail: 0, logIds: [] };

    const settled = await Promise.allSettled(
      items.map(async (item) => {
        // A saved meal expands into several logs. Those ids used to be
        // dropped on the floor — `addMealToLog` has always returned them — so
        // logging a meal produced nothing to undo and the toast quietly came
        // up without its button. Undo only means something if it covers
        // everything that was written.
        if (item?.type === 'meal' && (item._id || item.id)) {
          const response = await fitnessGeekService.addMealToLog(item._id || item.id, date, mealType);
          return (response?.data?.logs || [])
            .map((log) => log?.id || log?._id)
            .filter(Boolean)
            .map(String);
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
        const id = response.data?.id || response.data?._id || null;
        return id ? [String(id)] : [];
      })
    );

    let ok = 0;
    let fail = 0;
    const perItem = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        ok += 1;
        perItem.push(result.value || []);
      } else {
        fail += 1;
        perItem.push([]);
        logger.error('Failed to log food:', result.reason?.message);
      }
    }

    // One refresh for the batch, not one per item.
    if (ok > 0) await onChanged?.();

    return { ok, fail, logIds: perItem.flat(), perItem };
  }, [date, onChanged]);

  const undoLogs = useCallback(async (logIds) => {
    if (!logIds?.length) return;
    await Promise.allSettled(logIds.map((id) => fitnessGeekService.deleteFoodLog(id)));
    await onChanged?.();
  }, [onChanged]);

  /**
   * Describe a meal; the backend writes it.
   *
   * Returns the same `{ok, fail, logIds}` shape `logItems` does, so the box
   * can treat a described meal and a tapped row identically for undo and for
   * the session ribbon — plus `logged`/`skipped` for what to actually say.
   *
   * A described meal can partially succeed: the sanity rails reject an entry
   * whose numbers are nonsense while its neighbours on the same line write
   * fine. That is reported, not hidden, or the log quietly disagrees with what
   * he told it.
   */
  const describeMeal = useCallback(async (text) => {
    const result = await foodService.describe(text, {
      date,
      // The server runs UTC and cannot guess which meal 8pm is.
      hour: new Date().getHours()
    });

    const logged = result?.logged || [];
    const skipped = result?.skipped || [];
    const logIds = result?.logIds || [];

    if (logged.length > 0) await onChanged?.();

    return {
      ok: logged.length,
      fail: skipped.length,
      logIds,
      logged,
      skipped,
      questions: result?.questions || [],
      totalCalories: result?.totalCalories ?? 0
    };
  }, [date, onChanged]);

  /** The "Can't find it? Create …" escape hatch. */
  const createFood = useCallback(async (payload) => {
    const created = await foodService.create(payload);
    return created?.data || created;
  }, []);

  return { logItems, undoLogs, describeMeal, createFood };
};

export default useFoodLogging;
