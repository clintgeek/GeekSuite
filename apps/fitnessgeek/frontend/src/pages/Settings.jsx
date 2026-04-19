import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slide,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Palette as ThemeIcon,
  Language as LanguageIcon,
  MonitorHeart as BPIcon,
  Save as SaveIcon,
  RestartAlt as DiscardIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { settingsService } from '../services/settingsService.js';
import logger from '../utils/logger.js';
import { useThemeMode as useAppTheme } from '@geeksuite/user';
import HouseholdSettings from '../components/Settings/HouseholdSettings';
import {
  Surface,
  DisplayHeading,
  SectionLabel,
} from '../components/primitives';

// ─── Dirty detection — compare a settings snapshot field-by-field ───
const isDirty = (current, baseline, passwordSet) => {
  if (!current || !baseline) return false;
  if (passwordSet) return true;
  // Compare the leaf values that the UI touches
  const keys = ['theme', 'notifications', 'units', 'garmin'];
  for (const k of keys) {
    if (JSON.stringify(current[k]) !== JSON.stringify(baseline[k])) return true;
  }
  return false;
};

const Settings = () => {
  const theme = useTheme();
  const { themePreference, setThemePreference } = useAppTheme();
  const [settings, setSettings] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [garminUsername, setGarminUsername] = useState('');
  const [garminUsernameBaseline, setGarminUsernameBaseline] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getSettings();
      const loaded = response.data;
      const g = loaded.garmin || settingsService.getDefaultGarminSettings();
      const normalizedGarmin = {
        enabled: !!g.enabled,
        username: g.username || '',
      };
      const normalized = {
        ...loaded,
        garmin: normalizedGarmin,
      };
      setGarminUsername(g.username || '');
      setGarminUsernameBaseline(g.username || '');
      setGarminPassword('');
      setSettings(normalized);
      setBaseline(JSON.parse(JSON.stringify(normalized)));
    } catch (err) {
      console.error('Error loading settings:', err);
      setError('Failed to load settings');
      const defaultSettings = {
        dashboard: settingsService.getDefaultDashboardSettings(),
        theme: 'light',
        notifications: { enabled: true, daily_reminder: true, goal_reminders: true },
        units: { weight: 'lbs', height: 'ft' },
        garmin: settingsService.getDefaultGarminSettings(),
      };
      logger.debug('Settings: using default settings');
      setSettings(defaultSettings);
      setBaseline(JSON.parse(JSON.stringify(defaultSettings)));
    } finally {
      setLoading(false);
    }
  };

  // Derived dirty state — also includes username change and password set
  const dirty = useMemo(() => {
    const usernameChanged = garminUsername !== garminUsernameBaseline;
    const passwordSet = !!garminPassword;
    return (
      isDirty(settings, baseline, passwordSet) ||
      usernameChanged
    );
  }, [settings, baseline, garminUsername, garminUsernameBaseline, garminPassword]);

  const handleNotificationSettingChange = (setting, value) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [setting]: value },
    }));
  };

  const handleUnitSettingChange = (type, value) => {
    setSettings((prev) => ({
      ...prev,
      units: { ...prev.units, [type]: value },
    }));
  };

  const handleThemeChange = (newTheme) => {
    setThemePreference(newTheme);
    setSettings((prev) => ({ ...prev, theme: newTheme }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        ...settings,
        garmin: {
          enabled: settings.garmin?.enabled || false,
          username: garminUsername || '',
          ...(garminPassword ? { password: garminPassword } : {}),
        },
      };
      await settingsService.updateSettings(payload);
      // Reset baseline to current
      setBaseline(JSON.parse(JSON.stringify(settings)));
      setGarminUsernameBaseline(garminUsername);
      setGarminPassword('');
      setSuccess('Settings saved');
      setTimeout(() => setSuccess(''), 2800);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    if (baseline) {
      setSettings(JSON.parse(JSON.stringify(baseline)));
      setGarminUsername(garminUsernameBaseline);
      setGarminPassword('');
      // Also revert the live theme preference to baseline
      if (baseline.theme) setThemePreference(baseline.theme);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!settings) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load settings</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        maxWidth: 820,
        mx: 'auto',
        // Leave room at the bottom for the sticky save bar
        pb: dirty ? { xs: 12, sm: 10 } : { xs: 2, sm: 3 },
      }}
    >
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Account · Preferences</SectionLabel>
        <DisplayHeading size="page">Settings</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Customize your FitnessGeek experience. Changes stay local until you save.
        </Typography>
      </Box>

      {/* Success/Error */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Household Sharing */}
      <Box sx={{ mb: 2 }}>
        <HouseholdSettings />
      </Box>

      {/* Appearance */}
      <Surface sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.25 }}>
          <ThemeIcon sx={{ color: 'primary.main' }} />
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.375rem',
              fontWeight: 400,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Appearance
          </Typography>
        </Box>

        <FormControl fullWidth>
          <InputLabel>Theme</InputLabel>
          <Select
            value={themePreference}
            onChange={(e) => handleThemeChange(e.target.value)}
            label="Theme"
          >
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
            <MenuItem value="auto">Auto (System)</MenuItem>
          </Select>
        </FormControl>
      </Surface>

      {/* Notifications */}
      <Surface sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.25 }}>
          <NotificationsIcon sx={{ color: 'primary.main' }} />
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.375rem',
              fontWeight: 400,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Notifications
          </Typography>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.enabled}
              onChange={(e) => handleNotificationSettingChange('enabled', e.target.checked)}
            />
          }
          label="Enable Notifications"
          sx={{ mb: 1, display: 'flex' }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.daily_reminder}
              onChange={(e) => handleNotificationSettingChange('daily_reminder', e.target.checked)}
              disabled={!settings.notifications.enabled}
            />
          }
          label="Daily Reminders"
          sx={{ mb: 1, display: 'flex' }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.goal_reminders}
              onChange={(e) => handleNotificationSettingChange('goal_reminders', e.target.checked)}
              disabled={!settings.notifications.enabled}
            />
          }
          label="Goal Reminders"
          sx={{ display: 'flex' }}
        />
      </Surface>

      {/* Units */}
      <Surface sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.25 }}>
          <LanguageIcon sx={{ color: 'primary.main' }} />
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.375rem',
              fontWeight: 400,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Units
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Weight Units</InputLabel>
            <Select
              value={settings.units.weight}
              onChange={(e) => handleUnitSettingChange('weight', e.target.value)}
              label="Weight Units"
            >
              <MenuItem value="lbs">Pounds (lbs)</MenuItem>
              <MenuItem value="kg">Kilograms (kg)</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Height Units</InputLabel>
            <Select
              value={settings.units.height}
              onChange={(e) => handleUnitSettingChange('height', e.target.value)}
              label="Height Units"
            >
              <MenuItem value="ft">Feet/Inches (ft)</MenuItem>
              <MenuItem value="cm">Centimeters (cm)</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Surface>

      {/* Garmin Integration */}
      <Surface sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.25 }}>
          <BPIcon sx={{ color: 'primary.main' }} />
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.375rem',
              fontWeight: 400,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Garmin Integration
          </Typography>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={!!settings.garmin?.enabled}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  garmin: { ...(prev.garmin || {}), enabled: e.target.checked },
                }))
              }
            />
          }
          label="Enable Garmin"
          sx={{ mb: 2, display: 'flex' }}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            fullWidth
            label="Garmin Email"
            type="email"
            autoComplete="username"
            value={garminUsername}
            onChange={(e) => setGarminUsername(e.target.value)}
            placeholder="your@email.com"
            disabled={!settings.garmin?.enabled}
            helperText="The email you use for Garmin Connect"
          />
          <TextField
            fullWidth
            label="Garmin Password"
            type="password"
            autoComplete="current-password"
            value={garminPassword}
            onChange={(e) => setGarminPassword(e.target.value)}
            placeholder={settings.garmin?.enabled ? 'Leave blank to keep current' : 'Enable Garmin to edit'}
            disabled={!settings.garmin?.enabled}
            helperText="Never stored in plain text"
          />
        </Box>
      </Surface>

      {/* ─── Sticky save bar — only when dirty ─── */}
      <Slide direction="up" in={dirty} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: 'fixed',
            left: { xs: 0, md: 280 }, // respect desktop sidebar offset
            right: 0,
            bottom: 0,
            zIndex: 30,
            px: { xs: 2, sm: 3 },
            py: { xs: 1.5, sm: 2 },
            pb: `calc(${theme.spacing(1.5)} + var(--safe-area-inset-bottom, 0px))`,
            backdropFilter: 'blur(12px)',
            backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.92 : 0.94),
            borderTop: `1px solid ${theme.palette.divider}`,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 -12px 32px rgba(0, 0, 0, 0.5)'
              : '0 -12px 32px rgba(28, 25, 23, 0.14)',
          }}
        >
          <Box
            sx={{
              maxWidth: 820,
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: theme.palette.warning.main,
                  boxShadow: `0 0 0 3px ${alpha(theme.palette.warning.main, 0.25)}`,
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'text.primary',
                }}
              >
                Unsaved changes
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                onClick={discardChanges}
                disabled={saving}
                startIcon={<DiscardIcon />}
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Discard
              </Button>
              <Button
                variant="contained"
                onClick={saveSettings}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                sx={{
                  borderRadius: 999,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  px: 2.5,
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Slide>
    </Box>
  );
};

export default Settings;
