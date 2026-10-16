import { useCallback } from 'react';
import { useToast } from '@geeksuite/ui';

/**
 * What the Fix sheet does, built from useFoodLogging's functions, so the
 * composer's result card and the "Just added" strip fix things the same way.
 *
 * `onChanged(item, replacement)` hears about every change: `replacement` is
 * the updated item, or `{ removed: true, added: [...] }` after a re-describe.
 */
export function useEntryFixes({ setLogCalories, describeMeal, undoLogs, onChanged }) {
  const { notify } = useToast();

  const setCalories = useCallback(async (item, target) => {
    const nutrition = await setLogCalories?.(item.logId, item.nutrition, item.servings, target);
    if (!nutrition) throw new Error('not updated');
    onChanged?.(item, { ...item, calories: Math.round(target), nutrition });
    notify(`Updated to ${Math.round(target)} cal`, { tone: 'success' });
  }, [setLogCalories, onChanged, notify]);

  const redescribe = useCallback(async (item, text, key) => {
    const result = await describeMeal?.(text, { mealType: item.mealType, date: item.date, idempotencyKey: key });
    const logged = result?.logged || [];
    if (logged.length === 0) {
      const err = new Error('nothing');
      err.response = { status: 422 };
      throw err;
    }
    // The old entry goes only now that the new one is in.
    const undone = await undoLogs?.([item.logId]);
    const stillThere = (undone?.failed || []).includes(item.logId);
    onChanged?.(item, {
      removed: !stillThere,
      added: logged.map((row) => ({ ...row, mealType: row.mealType || item.mealType, date: item.date })),
    });
    notify(stillThere ? `Added ${logged[0].name}. The old one is still there.` : `Changed to ${logged.map((r) => r.name).join(' and ')}`, {
      tone: stillThere ? 'warning' : 'success',
    });
  }, [describeMeal, undoLogs, onChanged, notify]);

  return { setCalories, redescribe };
}

