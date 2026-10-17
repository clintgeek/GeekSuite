import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { influxService } from '../services/influxService';
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
import { useToast } from '@geeksuite/ui';
import { errorMessage } from '../utils/errorMessage.js';
import { shortDay } from '../utils/dates.js';

const UNREACHABLE = 'FitnessGeek couldn’t reach the home data server. Try again in a moment.';

/**
 * InfluxDB Settings Component
 * Allows users to toggle between legacy Garmin API and InfluxDB data sources
 */
export default function InfluxDBSettings({ onSettingsChange }) {
  const { notify } = useToast();
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

  // Temporary state for baseline inputs
  const [hrvInput, setHrvInput] = useState('');
  const [hrInput, setHrInput] = useState('');

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; fetchSettings now closes over `notify` from useToast(), which the linter can't prove is stable.
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
      notify(errorMessage(err, 'Couldn’t load these settings. Try again.'), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function testInfluxConnection() {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      // GET /api/influx/status answers { userEnabled, serverConnected, error }.
      // This used to read `response.connected`, which the route has never sent,
      // so a working InfluxDB still reported "Connection Failed".
      const response = await influxService.getStatus();
      // The route's `error` is the driver's own text ("connect ECONNREFUSED…");
      // it is not shown — a person gets one plain sentence instead.
      setConnectionStatus({ success: !!response?.serverConnected });
    } catch (err) {
      console.error('Error testing connection:', err);
      setConnectionStatus({
        success: false,
        error: errorMessage(err, UNREACHABLE)
      });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleToggleInflux(event) {
    const newValue = event.target.checked;
    setSaving(true);

    try {
      await apiService.patch('/user/settings', {
        influxEnabled: newValue
      });

      setSettings(prev => ({ ...prev, influxEnabled: newValue }));
      notify(
        newValue
          ? 'Home data server on. Your Garmin data now comes from it'
          : 'Home data server off. Your Garmin data comes straight from Garmin again',
        { tone: 'success' }
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
      notify(errorMessage(err, 'Couldn’t save that setting. Try again.'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateBaselines() {
    setSaving(true);

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
      notify('Your usual numbers are saved', { tone: 'success' });
    } catch (err) {
      console.error('Error updating baselines:', err);
      notify(errorMessage(err, 'Couldn’t save your usual numbers. Try again.'), { tone: 'error' });
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
          Where your Garmin data comes from
        </Typography>

        {/* Main Toggle Card */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">Use the home data server (InfluxDB)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Read your Garmin data from the home data server instead of straight from Garmin.
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
                <AlertTitle>What the home data server adds</AlertTitle>
                When it’s on, FitnessGeek reads your Garmin data from the home data server,
                which your Garmin sync fills. That adds:
                <ul style={{ marginTop: 8, marginBottom: 0 }}>
                  <li>Heart rate, stress and Body Battery through the day</li>
                  <li>A closer look at your sleep: heart-rate variability (HRV), recovery and breathing</li>
                  <li>Recovery notes written by AI from all of it</li>
                  <li>How your heart rate answered each meal</li>
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
                    Check the connection
                  </Button>

                  {connectionStatus && (
                    <Alert
                      severity={connectionStatus.success ? 'success' : 'error'}
                      icon={connectionStatus.success ? <CheckIcon /> : <WarningIcon />}
                    >
                      {connectionStatus.success ? (
                        <>
                          <AlertTitle>Connected</AlertTitle>
                          FitnessGeek can reach the home data server.
                        </>
                      ) : (
                        <>
                          <AlertTitle>Not connected</AlertTitle>
                          {connectionStatus.error || UNREACHABLE}
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
                  <Typography variant="h6">Your usual numbers</Typography>
                  <Typography variant="body2" color="text.secondary">
                    What’s normal for you, so recovery notes can tell a good day from a tired one.
                  </Typography>
                </Box>

                <Alert severity="info" icon={<InfoIcon />}>
                  The AI compares each day with these. Leave a box empty if you don’t know it yet.
                </Alert>

                <TextField
                  label="Usual heart-rate variability (HRV)"
                  value={hrvInput}
                  onChange={(e) => setHrvInput(e.target.value)}
                  type="number"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">ms</InputAdornment>
                  }}
                  helperText="Your average over a week, such as 60"
                  fullWidth
                />

                <TextField
                  label="Usual resting heart rate"
                  value={hrInput}
                  onChange={(e) => setHrInput(e.target.value)}
                  type="number"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">bpm</InputAdornment>
                  }}
                  helperText="Such as 55"
                  fullWidth
                />

                {settings.healthBaselines.lastUpdated && (
                  <Typography variant="caption" color="text.secondary">
                    {`Last saved ${shortDay(settings.healthBaselines.lastUpdated)}`}
                  </Typography>
                )}

                <Button
                  variant="contained"
                  onClick={handleUpdateBaselines}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={20} /> : <CheckIcon />}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Feature Availability */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              What’s on
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Sleep analysis"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'On' : 'Needs the home data server'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Through the day"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'On' : 'Needs the home data server'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Recovery coach"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'On' : 'Needs the home data server'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Meal impact"
                  color={settings.influxEnabled ? 'success' : 'default'}
                  size="small"
                  icon={settings.influxEnabled ? <CheckIcon /> : <InfoIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.influxEnabled ? 'On' : 'Needs the home data server'}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="Steps, sleep and heart rate"
                  color="success"
                  size="small"
                  icon={<CheckIcon />}
                />
                <Typography variant="body2" color="text.secondary">
                  Always on
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
