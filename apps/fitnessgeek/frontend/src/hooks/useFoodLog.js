import { useState, useEffect } from 'react';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
// Legacy goals removed
import { settingsService } from '../services/settingsService.js';
import { goalsService } from '../services/goalsService.js';
import { foodService } from '../services/foodService.js';
import logger from '../utils/logger.js';

export const useFoodLog = (selectedDate) => {
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  // Real favourite state for the log view. This used to not exist at all:
  // FoodLogItem defaulted `isFavorite` to false and nothing here fed it real
  // data, so every star rendered unfavourited regardless of truth, and
  // tapping it always called addFavorite, never removeFavorite. Favourites
  // are food-catalog metadata, not per-log-entry, so they're loaded once
  // (not per selectedDate) and shared by id across every meal section —
  // the same food logged at breakfast and dinner shows the same star.
  const [favoriteFoodIds, setFavoriteFoodIds] = useState(() => new Set());

  // Load goals (prefer settings-based nutrition_goal; fallback to legacy /goals)
  const loadGoals = async () => {
    try {
      // Try settings first
      const settingsResp = await settingsService.getSettings();
      const settingsData = settingsResp?.data || settingsResp?.data?.data || settingsResp; // support different shapes
      // Debug: log nutrition goal path
      try {
        logger.debug('[useFoodLog] settings keys:', Object.keys(settingsData || {}));
      } catch (e) {}
      const ng = settingsData?.nutrition_goal;

      if (ng && ng.enabled) {
        // Derive macros via backend rules to keep parity across UI
        try {
          const derived = await goalsService.getDerivedMacros();
          const payload = derived?.data || derived?.data?.data || derived;
          const today = payload?.today;
          setGoals({
            nutrition: {
              trackMacros: true,
              goals: today ? {
                calories: Math.round((today.target_calories ?? today.calories) || 0),
                protein: Math.round(today.protein_g || 0),
                fat: Math.round(today.fat_g || 0),
                carbs: Math.round(today.carbs_g || 0)
              } : { calories: Math.round(ng.daily_calorie_target || 0) }
            },
            weight: ng.start_weight && ng.target_weight ? {
              startWeight: ng.start_weight,
              targetWeight: ng.target_weight,
              startDate: ng.start_date,
              goalDate: ng.estimated_end_date,
              is_active: true
            } : null
          });
          return;
        } catch (e) {
          logger.warn('[useFoodLog] Derived macros endpoint failed, falling back to schedule');
          // Fallback to schedule
          const [y, m, d] = String(selectedDate || '').split('-').map(Number);
          const dateObj = new Date(y || 0, (m || 1) - 1, d || 1);
          const dayIndex = (dateObj.getDay() + 6) % 7;
          const dayTarget = Array.isArray(ng.weekly_schedule) && ng.weekly_schedule.length === 7
            ? ng.weekly_schedule[dayIndex]
            : ng.daily_calorie_target;
          setGoals({
            nutrition: { trackMacros: true, goals: { calories: Math.round(dayTarget || 0) } },
            weight: null
          });
          return;
        }
      }

      // Legacy goals removed; no fallback
    } catch (error) {
      logger.error('Error loading goals:', error);
    }
  };

  // Load food logs
  const loadFoodLogs = async () => {
    setLoading(true);
    try {
      logger.debug('Loading logs for date:', selectedDate);
      const response = await fitnessGeekService.getLogsForDate(selectedDate);
      logger.debug('Logs response received');

      // The backend returns { success: true, data: logs }
      if (response && response.success) {
        setLogs(response.data || []);
      } else if (Array.isArray(response)) {
        // Fallback for direct array response
        setLogs(response);
      } else if (response && response.data) {
        // Fallback for other response formats
        setLogs(response.data);
      } else {
        setLogs([]);
      }

      logger.debug('Logs state updated');
    } catch (error) {
      logger.error('Error loading food logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // NOTE: this hook used to also export its own `addFoodToLog`, a second "add
  // a food to the log" implementation that disagreed with the one actually in
  // use (useFoodLogging.js's `logItems`, which every real caller — the search
  // box, the FAB dialog, the describe path — goes through). Nothing ever
  // destructured it off this hook's return value, so it was dead: reachable
  // by nothing, and a landmine for whoever next needed "add a food" and found
  // two candidates. Confirmed dead by a repo-wide grep for `useFoodLog(` and
  // its destructuring before removal; deleted rather than fixed.

  // Update food log
  // NOTE on feedback: update/delete used to route their success/error text
  // through `setAutoCloseMessage` into `successMessage`/`errorMessage`, which
  // FoodLog.jsx rendered as an Alert *below* the header, date nav, quick
  // actions, search box and all four meal sections — likely off-screen on a
  // phone, and gone in 3 seconds regardless. Deleting near the top of a long
  // day's log read as a silent failure. Adding a food, by contrast, gets a
  // floating toast near the thumb (useFoodLogging.js). These two now leave
  // that decision to the caller, which shows the same toast add already
  // does — see FoodLog.jsx's handleUpdateLog/handleDeleteLog. `saveMeal`
  // below is unchanged and still uses this Alert; it wasn't part of this bug.
  const updateFoodLog = async (logId, updateData) => {
    try {
      const response = await fitnessGeekService.updateFoodLog(logId, updateData);
      logger.debug('Update log response received');

      // The backend returns { success: true, data: log, message: '...' }
      if (response && response.success) {
        await loadFoodLogs();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error updating food log:', error);
      return false;
    }
  };

  // Delete food log
  const deleteFoodLog = async (logId) => {
    try {
      const response = await fitnessGeekService.deleteFoodLog(logId);
      logger.debug('Delete log response received');

      // The backend returns { success: true, data: log, message: '...' }
      if (response && response.success) {
        await loadFoodLogs();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error deleting food log:', error);
      return false;
    }
  };

  // Save meal
  const saveMeal = async (mealData) => {
    try {
      const response = await fitnessGeekService.createMeal(mealData);
      logger.debug('Save meal response received');

      // The backend returns { success: true, data: meal, message: '...' }
      if (response && response.success) {
        setAutoCloseMessage('Meal saved successfully!', setSuccessMessage);
        await loadFoodLogs();
        return true;
      } else {
        setAutoCloseMessage('Failed to save meal. Please try again.', setErrorMessage);
        return false;
      }
    } catch (error) {
      logger.error('Error saving meal:', error);
      setAutoCloseMessage('Error saving meal. Please try again.', setErrorMessage);
      return false;
    }
  };

  // Calculate nutrition summary
  const calculateNutritionSummary = () => {
    const totals = logs.reduce((acc, log) => {
      // Handle both food_item and food_item_id structures
      const food_item = log.food_item || log.food_item_id;
      const { servings } = log;

      // Safety check for food_item
      if (!food_item) {
        logger.warn('Food item or nutrition data missing');
        return acc;
      }

      // Prefer the log's stored snapshot when present
      const nutrition = (log.nutrition && Object.keys(log.nutrition || {}).length > 0)
        ? log.nutrition
        : food_item.nutrition;

      if (!nutrition) {
        return acc;
      }
      const servingsCount = typeof servings === 'string' ? parseFloat(servings) || 1 : (servings || 1);

      return {
        calories: acc.calories + ((nutrition.calories_per_serving || 0) * servingsCount),
        protein: acc.protein + ((nutrition.protein_grams || 0) * servingsCount),
        carbs: acc.carbs + ((nutrition.carbs_grams || 0) * servingsCount),
        fat: acc.fat + ((nutrition.fat_grams || 0) * servingsCount)
      };
    }, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    });

    // Add goals from user settings
    const nutritionGoals = goals?.nutrition?.goals || {};
    const trackMacros = goals?.nutrition?.trackMacros || false;

    return {
      ...totals,
      calorieGoal: trackMacros ? (nutritionGoals.calories || 0) : 0,
      proteinGoal: trackMacros ? (nutritionGoals.protein || 0) : 0,
      carbsGoal: trackMacros ? (nutritionGoals.carbs || 0) : 0,
      fatGoal: trackMacros ? (nutritionGoals.fat || 0) : 0
    };
  };

  // Get logs by meal type
  const getLogsByMealType = (mealType) => {
    return logs.filter(log => log.meal_type === mealType);
  };

  // Load the user's favourite foods once and reduce to a Set of ids, which
  // is all FoodLogItem needs to answer "is this one starred".
  const loadFavorites = async () => {
    try {
      const favorites = await foodService.getFavorites();
      const list = Array.isArray(favorites) ? favorites : (favorites?.data || []);
      const ids = list.map((food) => String(food?._id || food?.id)).filter(Boolean);
      setFavoriteFoodIds(new Set(ids));
    } catch (error) {
      logger.error('Error loading favorites:', error);
    }
  };

  // FoodLogItem calls this after it successfully adds/removes a favourite,
  // so every meal section showing the same food agrees immediately rather
  // than waiting on the next full favorites reload.
  const toggleFavoriteId = (foodId, isFavorite) => {
    const id = String(foodId);
    setFavoriteFoodIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Clear messages
  const clearSuccessMessage = () => setSuccessMessage(null);
  const clearErrorMessage = () => setErrorMessage(null);

  // Auto-close messages after 3 seconds
  const setAutoCloseMessage = (message, setMessage) => {
    setMessage(message);
    setTimeout(() => {
      setMessage(null);
    }, 3000);
  };

  // Load data on mount and when date changes
  useEffect(() => {
    loadFoodLogs();
    loadGoals();
  }, [selectedDate]);

  // Favourites aren't date-scoped — load them once, not on every day change.
  useEffect(() => {
    loadFavorites();
  }, []);

  const showError = (msg) => setAutoCloseMessage(msg, setErrorMessage);
  const showSuccess = (msg) => setAutoCloseMessage(msg, setSuccessMessage);

  return {
    logs,
    goals,
    loading,
    successMessage,
    errorMessage,
    nutritionSummary: calculateNutritionSummary(),
    getLogsByMealType,
    updateFoodLog,
    deleteFoodLog,
    saveMeal,
    showError,
    showSuccess,
    clearSuccessMessage,
    clearErrorMessage,
    refreshGoals: loadGoals,
    refreshLogs: loadFoodLogs,
    favoriteFoodIds,
    toggleFavoriteId
  };
};