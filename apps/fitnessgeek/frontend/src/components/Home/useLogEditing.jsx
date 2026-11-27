import React, { useCallback, useState } from 'react';
import { useToast } from '@geeksuite/ui';
import { fitnessGeekService } from '../../services/fitnessGeekService.js';
import { UndoAction, UNDO_TOAST_MS, UNDONE_MESSAGE, UNDO_FAILED_MESSAGE } from '../FoodSearch/undoToast.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { friendlyDay } from '../../utils/plainWords.js';

/**
 * Changing what is already logged on Today: edit an entry, remove it (with
 * Undo), and save a meal's entries as a meal.
 *
 * REMOVE snapshots the row before it goes. Undo re-logs it through the same
 * `logItems` the add box uses, so it lands as a new entry (a delete can't
 * hand back the old id) that reads and totals the same; and it speaks the
 * add's own undo grammar (undoToast.jsx): ten seconds, then "Undone ✓", or
 * "Couldn’t undo — try again" with a retry.
 *
 * Every result is a toast near the thumb, never an alert at the foot of a
 * long page. A moved entry leaves the day on screen, so the toast says where
 * it went.
 *
 * @param {object} p
 * @param {object[]} p.logs       the day's raw entries
 * @param {string} p.day          the day on screen (YYYY-MM-DD)
 * @param {string} p.today
 * @param {Function} p.reloadFood re-reads the day's food
 * @param {Function} p.logItems   useFoodLogging's
 * @param {Function} [p.onRemoved] (logId) — e.g. take it off the "Just added" strip
 */
export function useLogEditing({ logs, day, today, reloadFood, logItems, onRemoved }) {
  const { notify, dismiss } = useToast();
  const [editingLog, setEditingLog] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [mealToSave, setMealToSave] = useState(null);
  const [savingMeal, setSavingMeal] = useState(false);

  const closeEdit = useCallback(() => setEditingLog(null), []);

  const saveEdit = async (logId, updateData) => {
    setUpdating(true);
    let ok = false;
    let failure = null;
    try {
      const response = await fitnessGeekService.updateFoodLog(logId, updateData);
      ok = Boolean(response && response.success);
    } catch (error) {
      console.error('Error updating food log:', error);
      failure = error;
    }
    if (ok) {
      setEditingLog(null);
      await reloadFood?.();
      if (updateData?.log_date && updateData.log_date !== day) {
        const where = friendlyDay(updateData.log_date, today);
        notify(`Moved to ${where === 'Today' || where === 'Yesterday' ? where.toLowerCase() : where}`, { tone: 'success' });
      } else {
        notify('Saved', { tone: 'success' });
      }
    } else {
      notify(errorMessage(failure, 'Couldn’t save that. Try again.'), { tone: 'error' });
    }
    setUpdating(false);
  };

  const removeLog = async (logId) => {
    if (!logId) return;
    const log = logs.find((l) => (l.id || l._id) === logId);
    const food = log?.food_item || log?.food_item_id;

    try {
      const response = await fitnessGeekService.deleteFoodLog(logId);
      if (response && response.success === false) throw new Error(response.message || 'Not removed');
    } catch (error) {
      console.error('Failed to remove food log:', error);
      notify(errorMessage(error, 'Couldn’t remove that. Try again.'), { tone: 'error' });
      return;
    }
    onRemoved?.(logId);
    await reloadFood?.();

    const canUndo = Boolean(log && food);
    const undoAndSay = async (toastId) => {
      const result = await Promise.resolve()
        .then(() => logItems([{ ...food, servings: log.servings, nutrition: log.nutrition }], log.meal_type))
        .catch(() => null);
      dismiss?.(toastId);
      if ((result?.ok ?? 0) > 0) {
        notify(UNDONE_MESSAGE, { tone: 'info' });
        return;
      }
      let retryId = null;
      retryId = notify(UNDO_FAILED_MESSAGE, {
        tone: 'error',
        duration: UNDO_TOAST_MS,
        action: <UndoAction label="Try again" onUndo={() => undoAndSay(retryId)} />,
      });
    };
    let toastId = null;
    toastId = notify(`Removed ${food?.name || 'that'}`, {
      tone: 'info',
      duration: canUndo ? UNDO_TOAST_MS : undefined,
      action: canUndo ? <UndoAction onUndo={() => undoAndSay(toastId)} /> : undefined,
    });
  };

  // "Remove" inside Edit: the rows have no trash icon. Same toast, same Undo.
  const removeFromEdit = (logId) => {
    setEditingLog(null);
    return removeLog(logId);
  };

  const confirmSaveMeal = async (mealData) => {
    setSavingMeal(true);
    try {
      const response = await fitnessGeekService.createMeal(mealData);
      if (response && response.success) {
        notify('Meal saved', { tone: 'success' });
        setMealToSave(null);
      } else {
        notify('Couldn’t save that meal. Try again.', { tone: 'error' });
      }
    } catch (error) {
      console.error('Error saving meal:', error);
      notify(errorMessage(error, 'Couldn’t save that meal. Try again.'), { tone: 'error' });
    } finally {
      setSavingMeal(false);
    }
  };

  return {
    editingLog,
    openEdit: setEditingLog,
    closeEdit,
    saveEdit,
    updating,
    removeLog,
    removeFromEdit,
    mealToSave,
    openSaveMeal: (mealType, mealLogs) => setMealToSave({ mealType, logs: mealLogs }),
    closeSaveMeal: () => setMealToSave(null),
    confirmSaveMeal,
    savingMeal,
  };
}

export default useLogEditing;
