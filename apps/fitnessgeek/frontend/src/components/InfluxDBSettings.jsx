import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  AlertTitle,
  Stack,
  Divider,
  Button,
  CircularProgress,
  Chip,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Storage as StorageIcon,
  CloudSync as SyncIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon
} from '@mui/icons-material';

/**
 * InfluxDB Settings Component
 * Allows users to toggle between legacy Garmin API and InfluxDB data sources
 */
export default function InfluxDBSettings({ onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [settings, setSettings] = useState({
    influxEnabled: false,
    healthBaselines: {
      weeklyHRV: null,
      restingHR: null,
      lastUpdated: null
    }
  });
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Temporary state for baseline inputs
  const [hrvInput, setHrvInput] = useState('');
  const [hrInput, setHrInput] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings.healthBaselines.weeklyHRV) {
      setHrvInput(settings.healthBaselines.weeklyHRV.toString());
    }
    if (settings.healthBaselines.restingHR) {
      setHrInput(settings.healthBaselines.restingHR.toString());
    }
  }, [settings]);

  async function fetchSettings() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.get('/user/settings');
      const s = response?.data || response || {};
      setSettings({
        influxEnabled: s.influxEnabled || false,
        healthBaselines: s.healthBaselines || {
          weeklyHRV: null,
          restingHR: null,
          lastUpdated: null
        }
      });
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function testInfluxConnection() {
    setTestingConnection(true);
    setConnectionStatus(null);
    setError(null);

    try {
      const response = await apiService.get('/influx/status');
      setConnectionStatus({
        success: response.connected,
        database: response.database,
        measurements: response.measurementCount
      });
    } catch (err) {
      console.error('Error testing connection:', err);
      setConnectionStatus({
        success: false,
        error: err.response?.data?.error || 'Connection test failed'
      });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleToggleInflux(event) {
    const newValue = event.target.checked;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiService.patch('/user/settings', {
        influxEnabled: newValue
      });

      setSettings(prev => ({ ...prev, influxEnabled: newValue }));
      setSuccessMessage(
        newValue
          ? 'InfluxDB enabled! Your health data will now come from your personal InfluxDB instance.'
          : 'Switched back to legacy Garmin API.'
      );

      // Notify parent component of the change
      if (onSettingsChange) {
        onSettingsChange({ influxEnabled: newValue });
      }

      // Auto-test connection when enabling
      if (newValue) {
        setTimeout(() => testInfluxConnection(), 500);
      }
    } catch (err) {
      console.error('Error updating settings:', err);
      setError(err.response?.data?.error || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateBaselines() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const newBaselines = {
        weeklyHRV: hrvInput ? parseFloat(hrvInput) : null,
        restingHR: hrInput ? parseFloat(hrInput) : null,
        lastUpdated: new Date().toISOString()
      };

      await apiService.patch('/user/settings', {
        healthBaselines: newBaselines
      });

      setSettings(prev => ({ ...prev, healthBaselines: newBaselines }));
      setSuccessMessage('Health baselines updated successfully!');
    } catch (err) {
      console.error('Error updating baselines:', err);
      setError(err.response?.data?.error || 'Failed to update baselines');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack spacing={3}>
        {/* Header */}
        <Typography variant="h5">
          <StorageIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Data Source Settings
        </Typography>

        {/* Status Messages */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        )}

        {successMessage && (
          <Alert severity="success" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {/* Main Toggle Card */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">Enable InfluxDB Integration</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use your personal InfluxDB instance for health data instead of Garmin API
                  </Typography>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.influxEnabled}
                      onChange={handleToggleInflux}
                      disabled={saving}
                    />
                  }
                  label=""
                />
              </Stack>

              <Divider />

              <Alert severity="info" icon={<InfoIcon />}>
                <AlertTitle>About InfluxDB Mode</AlertTitle>
                When enabled, fitnessGeek will pull health metrics from your personal InfluxDB
                instance (populated by Garmin data sync). This provides:
                <ul style={{ marginTop: 8, marginBottom: 0 }}>
                  <li>More comprehensive intraday metrics (heart rate, stress, body battery)</li>
                  <li>Advanced sleep analysis with HRV, cardiovascular recovery, and respiratory metrics</li>
                  <li>AI-powered recovery coaching based on combined health data</li>
                  <li>Meal impact visualization showing physiological responses to food</li>
                </ul>
              </Alert>

              {settings.influxEnabled && (
                <Stack spacing={2}>
                  <Button
                    variant="outlined"
                    onClick={testInfluxConnection}
                    disabled={testingConnection}
                    startIcon={testingConnection ? <CircularProgress size={20} /> : <SyncIcon />}
                  >
                    Test Connection
                  </Button>

                  {connectionStatus && (
                    <Alert
                      severity={connectionStatus.success ? 'success' : 'error'}
                      icon={connectionStatus.success ? <CheckIcon /> : <WarningIcon />}
                    >
                      {connectionStatus.success ? (
                        <>
                          <AlertTitle>Connection Successful</AlertTitle>
                          Connected to database: <strong>{connectionStatus.database}</strong>
                          <br />
                          Found {connectionStatus.measurements} measurements
                        </>
                      ) : (
                        <>
                          <AlertTitle>Connection Failed</AlertTitle>
                          {connectionStatus.error}
                        </>
                      )}
                    </Alert>
                  )}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Health Baselines Card */}
        {settings.influxEnabled && (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6">Health Baselines</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Set your baseline metrics for more accurate recovery analysis
                  </Typography>
                </Box>

                <Alert severity="info" icon={<InfoIcon />}>
                  These values help the AI recovery coach provide more personalized recommendations.
                  Your typical HRV and resting HR serve as reference points for detecting recovery status.
                </Alert>

                <TextField
                  label="Weekly Average HRV"
                  value={hrvInput}
                  onChange={(e) => setHrvInput(e.target.value)}
                  type="number"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">ms</InputAdornment>
                  }}
                  helperText="Your typical HRV over a week (e.g., 60)"
                  fullWidth
                />

                <TextField
                  label="Resting Heart Rate"
                  value={hrInput}
                  onChange={(e) => setHrInput(e.target.value)}
                  type="number"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">bpm</InputAdornment>
                  }}
                  helperText="Your typical resting HR (e.g., 55)"
                  fullWidth
                />

                {settings.healthBaselines.lastUpdated && (
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {new Date(settings.healthBaselines.lastUpdated).toLocaleDateString()}
                  </Typography>
                )}

                <Button
                  variant="contained"
                  onClick={handleUpdateBaselines}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={20} /> : <CheckIcon />}
                >
                  Update Baselines
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Feature Availability */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Feature Availability
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Sleep Analysis"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'Available' : 'Requires InfluxDB'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Intraday Metrics"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'Available' : 'Requires InfluxDB'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="AI Recovery Coach"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'Available' : 'Requires InfluxDB'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Meal Impact Analysis"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'Available' : 'Requires InfluxDB'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Basic Health Tracking"
                  color="success"
                  size="small"
                  icon={<CheckIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  Always Available
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
