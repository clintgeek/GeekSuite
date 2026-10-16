import { useCallback } from 'react';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { foodService } from '../services/foodService.js';
import logger from '../utils/logger.js';
import { forgetRecentLogs } from './useRecentLogs.js';
import { newIdempotencyKey } from '../components/FoodSearch/idempotency.js';

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
 * THE REFRESH COMES AFTER THE ANSWER. `onChanged` is a page reload — nine
 * calls on Home — and every write used to `await` it before returning, so a
 * tap sat silent for 1–3 s on a phone and a second tap logged it twice
 * (REVIEW_2026-10 B7). Writes now return as soon as the write itself is done;
 * the caller says so, and the reload runs behind it.
 *
 * @param {{date: string, onChanged?: () => Promise<void>|void}} options
 */
export const useFoodLogging = ({ date, onChanged }) => {
  // The Again chips and "Same as yesterday's" are cached for two minutes;
  // any write makes that cache wrong, so it goes with every one of them.
  const refreshLater = useCallback(() => {
    forgetRecentLogs();
    if (!onChanged) return;
    Promise.resolve()
      .then(() => onChanged())
      .catch((err) => logger.warn('Refresh after a food write failed:', err?.message));
  }, [onChanged]);

  /**
   * @param {object[]} items   foods carrying a `servings` count
   * @param {string} mealType
   * @returns {Promise<{ok, fail, logIds: string[], perItem: string[][]}>}
   *          `logIds` is every id written, flat, which is what undo needs.
   *          `perItem` is the same ids grouped by the item that produced them,
   *          because one saved meal expands into several logs and anything
   *          pairing items to ids by index would mis-attribute the rest.
   *          `errors` is each failed item's reason, for `errorMessage()`.
   */
  const logItems = useCallback(async (items, mealType = 'snack') => {
    if (!items?.length) return { ok: 0, fail: 0, logIds: [], perItem: [], errors: [] };

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
    const errors = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        ok += 1;
        perItem.push(result.value || []);
      } else {
        fail += 1;
        perItem.push([]);
        errors.push(result.reason);
        logger.error('Failed to log food:', result.reason?.message);
      }
    }

    // One refresh for the batch, not one per item — and not awaited.
    if (ok > 0) refreshLater();

    return { ok, fail, logIds: perItem.flat(), perItem, errors };
  }, [date, refreshLater]);

  /**
   * Delete exactly these logs. Says which went and which didn't: `allSettled`
   * used to swallow every rejection, so a failed undo looked like a working
   * one and the row was still there on the next refresh (B8).
   *
   * @returns {Promise<{deleted: string[], failed: string[]}>}
   */
  const undoLogs = useCallback(async (logIds) => {
    if (!logIds?.length) return { deleted: [], failed: [] };
    const settled = await Promise.allSettled(logIds.map((id) => fitnessGeekService.deleteFoodLog(id)));
    const deleted = [];
    const failed = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') deleted.push(logIds[i]);
      else {
        failed.push(logIds[i]);
        logger.error('Failed to undo a food log:', result.reason?.message);
      }
    });
    if (deleted.length > 0) refreshLater();
    return { deleted, failed };
  }, [refreshLater]);

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
   *
   * `idempotencyKey` is one per press of Log it (C2). A describe that times
   * out here can still finish on the server; sending the same key again on
   * the retry gets that first answer back instead of a second copy.
   */
  const describeMeal = useCallback(async (text, { mealType, idempotencyKey } = {}) => {
    const result = await foodService.describe(text, {
      date,
      // The server runs UTC and cannot guess which meal 8pm is.
      hour: new Date().getHours(),
      // …and when the person already picked the meal, it doesn't have to.
      mealType,
      idempotencyKey: idempotencyKey || newIdempotencyKey()
    });

    const logged = result?.logged || [];
    const skipped = result?.skipped || [];
    const logIds = result?.logIds || [];

    if (logged.length > 0) refreshLater();

    return {
      ok: logged.length,
      fail: skipped.length,
      logIds,
      logged,
      skipped,
      questions: result?.questions || [],
      totalCalories: result?.totalCalories ?? 0
    };
  }, [date, refreshLater]);

  /**
   * Re-scale one already-written log to a different calorie total.
   *
   * This is what answering the portion question does. The macros move with the
   * calories rather than staying put, because a bigger plate of the same dish
   * has proportionally more of everything — keeping 34g of fat while doubling
   * the calories would describe a food that does not exist, and the sanity
   * rails would be right to object to it.
   *
   * The log is patched, not rewritten: `FoodLogUpdateInput` is a partial, so
   * only `nutrition` moves and meal, date and servings stay as logged.
   */
  const adjustLogCalories = useCallback(async (logId, nutrition, servings, targetCalories) => {
    const per = Number(nutrition?.calories_per_serving) || 0;
    const count = Number(servings) || 1;
    const current = per * count;
    if (!logId || !Number.isFinite(targetCalories) || targetCalories <= 0 || current <= 0) return false;

    const factor = targetCalories / current;
    const scaled = Object.fromEntries(
      Object.entries(nutrition || {}).map(([key, value]) => [
        key,
        typeof value === 'number' && Number.isFinite(value)
          ? Math.round(value * factor * 10) / 10
          : value
      ])
    );

    await fitnessGeekService.updateFoodLog(logId, { nutrition: scaled });
    refreshLater();
    return true;
  }, [refreshLater]);

  /** The "Can't find it? Create …" escape hatch. */
  const createFood = useCallback(async (payload) => {
    const created = await foodService.create(payload);
    return created?.data || created;
  }, []);

  return { logItems, undoLogs, describeMeal, adjustLogCalories, createFood };
};

export default useFoodLogging;
