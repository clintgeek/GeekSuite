import { useState, useEffect } from 'react';
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

  // Load weight data
  const loadWeightData = async () => {
    setLoading(true);
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

        const mapWeightGoal = (wgCandidate) => {
          if (!wgCandidate) return null;
          const enabled = (wgCandidate.enabled ?? wgCandidate.is_active ?? true) === true;
          const startWeight = wgCandidate.start_weight ?? wgCandidate.startWeight ?? null;
          const targetWeight = wgCandidate.target_weight ?? wgCandidate.targetWeight ?? null;
          const startDate = wgCandidate.start_date ?? wgCandidate.startDate ?? null;
          const goalDate = wgCandidate.estimated_end_date ?? wgCandidate.goal_date ?? wgCandidate.goalDate ?? null;
          return { enabled, startWeight, targetWeight, startDate, goalDate };
        };

        // Map both weight_goal and nutrition_goal, prefer the one with usable data
        const wgMapped = mapWeightGoal(wgRaw);
        const ng = settingsData?.nutrition_goal;
        const ngMapped = ng ? {
          enabled: Boolean(ng.enabled),
          startWeight: ng.start_weight ?? null,
          targetWeight: ng.target_weight ?? null,
          startDate: ng.start_date ?? null,
          goalDate: ng.estimated_end_date ?? null
        } : null;

        logger.debug('[useWeight] mapped goal candidates');

        // Choose goal source:
        // - If weight_goal has both start/target OR explicitly enabled, use it
        // - Otherwise if nutrition_goal is enabled (and has targets), use it
        // - Else, no goal
        let mapped = null;
        const wgUsable = wgMapped && (wgMapped.enabled || (wgMapped.startWeight != null && wgMapped.targetWeight != null));
        const ngUsable = ngMapped && (ngMapped.enabled || (ngMapped.startWeight != null && ngMapped.targetWeight != null));
        if (wgUsable) mapped = wgMapped; else if (ngUsable) mapped = ngMapped;

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
      setLoading(false);
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
        await loadWeightData();
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

  // Delete weight log
  const deleteWeightLog = async (logId) => {
    try {
      const response = await weightService.deleteWeightLog(logId);

      if (response.success) {
        // Reload weight data to get the updated list
        await loadWeightData();
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

  // Get current weight
  const getCurrentWeight = () => {
    if (weightLogs.length === 0) {
      // If no logs exist, use start weight from goals
      return weightGoal && weightGoal.enabled ? weightGoal.startWeight : null;
    }
    const sortedLogs = [...weightLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    return sortedLogs[0].weight_value;
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
    deleteWeightLog,
    loadWeightData,
    clearSuccessMessage,
    clearErrorMessage,
    setAutoCloseMessage
  };
};