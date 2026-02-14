import React, { createContext, useState, useEffect, useContext } from 'react';
import { settingsService } from '../services/settingsService.js';
import { AuthContext } from './AuthContextDef.jsx';
import logger from '../utils/logger.js';

const SettingsContext = createContext();

export { SettingsContext };

export const SettingsProvider = ({ children }) => {
  const { user, loading: authLoading, isAuthenticated } = useContext(AuthContext);
  const [dashboardSettings, setDashboardSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  logger.debug('SettingsProvider: mount/recreate');

  // Load settings when authentication is ready
  useEffect(() => {
    logger.debug('SettingsContext: auth state changed');

    // Only load settings if authentication is ready and user is authenticated
    if (!authLoading && isAuthenticated) {
      logger.debug('SettingsContext: Auth ready, loading settings...');
      loadSettings();
    } else if (!authLoading && !isAuthenticated) {
      logger.debug('SettingsContext: Not authenticated, clearing settings');
      setDashboardSettings(null);
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      logger.debug('SettingsContext: Loading settings...');

      // Avoid logging tokens or payloads to keep console clean and secure

      const response = await settingsService.getSettings();
      logger.debug('SettingsContext: settings loaded');
      if (response.data && response.data.dashboard) {
        logger.debug('SettingsContext: dashboard settings set');
        setDashboardSettings(response.data.dashboard);
        logger.debug('SettingsContext: settings set from backend');
      } else {
        logger.debug('SettingsContext: no dashboard settings found, using defaults');
        setDashboardSettings(settingsService.getDefaultDashboardSettings());
        logger.debug('SettingsContext: settings set from defaults (no backend data)');
      }
    } catch (error) {
      logger.error('Error loading settings:', error);
      // Use default settings if loading fails
      logger.debug('SettingsContext: using default settings due to error');
      setDashboardSettings(settingsService.getDefaultDashboardSettings());
      logger.debug('SettingsContext: settings set from defaults (error)');
    } finally {
      setLoading(false);
    }
  };

  const updateDashboardSettings = async (newSettings) => {
    try {
      setLoading(true);
      await settingsService.updateDashboardSettings(newSettings);
      setDashboardSettings(newSettings);
      return { success: true };
    } catch (error) {
      console.error('Error updating dashboard settings:', error);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const updateDashboardSetting = async (setting, value) => {
    const updatedSettings = {
      ...dashboardSettings,
      [setting]: value
    };
    logger.debug('SettingsContext: updating dashboard setting', setting, value);
    const result = await updateDashboardSettings(updatedSettings);
    logger.debug('SettingsContext: update result', result);
    return result;
  };

  const refreshSettings = () => {
    loadSettings();
  };

  const value = {
    dashboardSettings,
    loading,
    updateDashboardSettings,
    updateDashboardSetting,
    refreshSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};