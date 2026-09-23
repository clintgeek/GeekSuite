import { useState, useEffect } from 'react';
import { rollingMean, utcDateString } from '@geeksuite/utils';
import { weightService } from '../services/weightService';
// Legacy goals removed
import { settingsService } from '../services/settingsService.js';
import logger from '../utils/logger.js';

export const useWeight = () => {
  const [weightLogs, setWeightLogs] = useState([]);
  const [weightGoal, setWeightGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load weight data. `silent` refreshes in place: a reload after a save must
  // not flip `loading`, or the page swaps to its spinner, unmounts the open
  // dialog and scrolls the user back to the top for a one-row change.
  const loadWeightData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      // Load weight logs from database
      const response = await weightService.getWeightLogs();
      if (response.success) {
        setWeightLogs(response.data);
      } else {
        setAutoCloseMessage('Failed to load weight logs', setError);
      }

      // Load goals from settings wizard (legacy removed)
      try {
        const settingsResp = await settingsService.getSettings();
        const settingsData = settingsResp?.data || settingsResp?.data?.data || settingsResp;
        // Debug: log settings payload
        try {
          // Avoid logging huge trees – keep concise in dev
          logger.debug('[useWeight] settings keys:', Object.keys(settingsData || {}));
        } catch (e) {
          logger.warn('[useWeight] Failed to log settings');
        }
        // Support multiple possible nesting/keys for weight_goal
        const wgRaw = settingsData?.weight_goal
          || settingsData?.goals?.weight_goal
          || settingsData?.wizard?.weight_goal
          || settingsData?.fitness?.weight_goal;

        // `ratePerWeek` was never mapped, so WeightProgress read `undefined`:
        // "Goal: 0.0 lbs/week", and a NaN days-ahead that made every goal
        // "On track" while tinting the projection card as off track. Stored
        // rates are magnitudes (a loss plan saves `1`), so the sign comes
        // from the direction of the goal.
        const signedRate = (rate, start, target) => {
          const r = Number(rate);
          if (!Number.isFinite(r) || r === 0) return null;
          const dir = Math.sign((Number(target) || 0) - (Number(start) || 0)) || 1;
          return dir * Math.abs(r);
        };

        const mapWeightGoal = (wgCandidate) => {
          if (!wgCandidate) return null;
          const enabled = (wgCandidate.enabled ?? wgCandidate.is_active ?? true) === true;
          const startWeight = wgCandidate.start_weight ?? wgCandidate.startWeight ?? null;
          const targetWeight = wgCandidate.target_weight ?? wgCandidate.targetWeight ?? null;
          const startDate = wgCandidate.start_date ?? wgCandidate.startDate ?? null;
          const goalDate = wgCandidate.estimated_end_date ?? wgCandidate.goal_date ?? wgCandidate.goalDate ?? null;
          return { enabled, startWeight, targetWeight, startDate, goalDate, ratePerWeek: signedRate(wgCandidate.ratePerWeek, startWeight, targetWeight) };
        };

        // Map both weight_goal and nutrition_goal, prefer the one with usable data
        const wgMapped = mapWeightGoal(wgRaw);
        const ng = settingsData?.nutrition_goal;
        const ngMapped = ng ? {
          enabled: Boolean(ng.enabled),
          startWeight: ng.start_weight ?? null,
          targetWeight: ng.target_weight ?? null,
          startDate: ng.start_date ?? null,
          goalDate: ng.estimated_end_date ?? null,
          ratePerWeek: signedRate(ng.weight_change_rate, ng.start_weight, ng.target_weight),
        } : null;

        logger.debug('[useWeight] mapped goal candidates');

        // Choose goal source. Two stores can each hold a goal: `weight_goal`
        // (the Weight page's goal wizard) and `nutrition_goal` (the Calorie
        // Wizard, which also sets a start and target weight). When both are
        // usable, the one STARTED MOST RECENTLY wins — it is the goal the
        // user set last. This used to prefer weight_goal unconditionally, so
        // on 2026-09-23 a goal from April (start 307.5, the last weigh-in
        // before a nine-month gap) outranked the plan Chef had just made
        // (start 318.6), and the tracker measured him from a stale number.
        const usable = (g) => g && (g.enabled || (g.startWeight != null && g.targetWeight != null));
        const startMs = (g) => {
          const t = g?.startDate ? new Date(g.startDate).getTime() : NaN;
          return Number.isFinite(t) ? t : -Infinity;
        };
        let mapped = null;
        const wgUsable = usable(wgMapped);
        const ngUsable = usable(ngMapped);
        if (wgUsable && ngUsable) mapped = startMs(ngMapped) > startMs(wgMapped) ? ngMapped : wgMapped;
        else if (wgUsable) mapped = wgMapped;
        else if (ngUsable) mapped = ngMapped;

        if (mapped && mapped.enabled) {
          setWeightGoal(mapped);
        } else {
          setWeightGoal(null);
        }
      } catch (goalsError) {
        logger.error('Error loading weight goals:', goalsError);
        setWeightGoal(null);
      }
    } catch (error) {
      setAutoCloseMessage('Failed to load weight data', setError);
      logger.error('Error loading weight data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Add weight log
  const addWeightLog = async (weightData) => {
    try {
      const response = await weightService.createWeightLog({
        weight_value: weightData.value,
        log_date: weightData.date
      });

      if (response.success) {
        // Reload weight data to get the updated list
        await loadWeightData({ silent: true });
        setAutoCloseMessage('Weight logged successfully!', setSuccess);
        return true;
      } else {
        setAutoCloseMessage(response.message || 'Failed to add weight log', setError);
        return false;
      }
    } catch (error) {
      setAutoCloseMessage('Failed to add weight log', setError);
      logger.error('Error adding weight log:', error);
      return false;
    }
  };

  // Edit a past weight (value and note; the day is the row and stays put).
  //
  // Resolves true only when the server hands back the row it saved.
  // `apiService.put` answers `{ success: true, data: null }` when a mutation
  // resolves to null, so `success` alone would call a save that wrote nothing
  // a success — the failure-that-looks-like-success this app keeps finding.
  // A rejection propagates so the dialog can show the server's reason.
  const updateWeightLog = async (logId, data) => {
    const response = await weightService.updateWeightLog(logId, {
      weight_value: data.weight_value,
      notes: data.notes ?? '',
    });
    if (!response?.success || !response?.data?.id) {
      logger.error('Weight update returned no row:', response);
      return false;
    }
    // Show the saved row at once, then refresh behind it.
    setWeightLogs((prev) => prev.map((l) => (l.id === logId ? { ...l, ...response.data } : l)));
    await loadWeightData({ silent: true });
    setAutoCloseMessage('Weight updated', setSuccess);
    return true;
  };

  // Delete weight log
  const deleteWeightLog = async (logId) => {
    try {
      const response = await weightService.deleteWeightLog(logId);

      if (response.success) {
        // Reload weight data to get the updated list
        await loadWeightData({ silent: true });
        setAutoCloseMessage('Weight log deleted successfully!', setSuccess);
        return true;
      } else {
        setAutoCloseMessage(response.message || 'Failed to delete weight log', setError);
        return false;
      }
    } catch (error) {
      setAutoCloseMessage('Failed to delete weight log', setError);
      logger.error('Error deleting weight log:', error);
      return false;
    }
  };

  // Current weight = the 7-day trailing mean at the latest log, not the
  // latest raw reading (BODY_DATA_PLAN §0). WeightProgress's "% complete" and
  // "to go" are measured from it, and the chart's line ends on the same
  // number — so one water day no longer moves the progress bar by 2 lb.
  const getCurrentWeight = () => {
    if (weightLogs.length === 0) {
      // If no logs exist, use start weight from goals
      return weightGoal && weightGoal.enabled ? weightGoal.startWeight : null;
    }
    const smoothed = rollingMean(
      weightLogs.map((l) => ({ date: utcDateString(l.log_date), value: Number(l.weight_value) })),
      { windowDays: 7 }
    );
    return smoothed.length ? smoothed[smoothed.length - 1].mean : null;
  };

  // Clear messages
  const clearSuccessMessage = () => setSuccess('');
  const clearErrorMessage = () => setError('');

  // Auto-close messages after 3 seconds
  const setAutoCloseMessage = (message, setMessage) => {
    setMessage(message);
    setTimeout(() => {
      setMessage('');
    }, 3000);
  };

  // Load data on mount
  useEffect(() => {
    loadWeightData();
  }, []);

  return {
    // State
    weightLogs,
    weightGoal,
    loading,
    error,
    success,
    currentWeight: getCurrentWeight(),

    // Actions
    addWeightLog,
    updateWeightLog,
    deleteWeightLog,
    loadWeightData,
    clearSuccessMessage,
    clearErrorMessage,
    setAutoCloseMessage
  };
};