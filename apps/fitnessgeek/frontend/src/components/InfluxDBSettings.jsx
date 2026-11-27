import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import { influxService } from '../services/influxService';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Stack,
  Button,
  CircularProgress,
  TextField,
  InputAdornment,
} from '@mui/material';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import { LabelPanel, Tag } from './primitives';
import { EXPLAIN } from './Reports/watchWords.js';
import { errorMessage } from '../utils/errorMessage.js';
import { shortDay } from '../utils/dates.js';

const UNREACHABLE = 'FitnessGeek couldn’t reach the home data server. Try again in a moment.';

const EMPTY_BASELINES = { weeklyHRV: null, restingHR: null, lastUpdated: null };

/** A typed number, or null for an empty or unreadable box. */
const numberOrNull = (text) => {
  const n = parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Watch settings: the advanced switch that reads detailed Garmin data from
 * the home data server, and the "usual numbers" recovery notes compare with.
 *
 * This is the ONE place the app says "InfluxDB", and it says it under an
 * "Advanced" tag: it is the name the person who runs the server will look
 * for, and nobody else needs to read it.
 *
 * `step` prefixes the panel title ("2. ") when this sits in the numbered
 * setup behind Health's "connect a watch" card.
 */
export default function InfluxDBSettings({ onSettingsChange, step = '' }) {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState(null);
  const [baselineError, setBaselineError] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [settings, setSettings] = useState({ influxEnabled: false, healthBaselines: EMPTY_BASELINES });
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [hrvInput, setHrvInput] = useState('');
  const [hrInput, setHrInput] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    fetchSettings();
    return () => { alive.current = false; };
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await apiService.get('/user/settings');
      if (!alive.current) return;
      const s = response?.data || response || {};
      const baselines = { ...EMPTY_BASELINES, ...(s.healthBaselines || {}) };
      setSettings({ influxEnabled: !!s.influxEnabled, healthBaselines: baselines });
      // The boxes are filled once, from what was loaded. They used to be
      // re-filled on every settings change, so flipping the switch wiped a
      // number that had been typed and not yet saved.
      setHrvInput(baselines.weeklyHRV ? String(baselines.weeklyHRV) : '');
      setHrInput(baselines.restingHR ? String(baselines.restingHR) : '');
    } catch (err) {
      if (!alive.current) return;
      console.error('Error fetching settings:', err);
      // A failed read is not "off": the switch is not drawn at all.
      setLoadError(errorMessage(err, 'Couldn’t load these settings. Try again.'));
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  async function testInfluxConnection() {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      // GET /api/influx/status answers { userEnabled, serverConnected, error }.
      // The route's `error` is the driver's own text ("connect ECONNREFUSED…");
      // it is not shown — a person gets one plain sentence instead.
      const response = await influxService.getStatus();
      if (alive.current) setConnectionStatus({ success: !!response?.serverConnected });
    } catch (err) {
      console.error('Error testing connection:', err);
      if (alive.current) setConnectionStatus({ success: false, error: errorMessage(err, UNREACHABLE) });
    } finally {
      if (alive.current) setTestingConnection(false);
    }
  }

  async function handleToggleInflux(event) {
    const newValue = event.target.checked;
    setSaving(true);
    setToggleError(null);

    try {
      await apiService.patch('/user/settings', { influxEnabled: newValue });
      if (!alive.current) return;

      setSettings((prev) => ({ ...prev, influxEnabled: newValue }));
      setConnectionStatus(null);
      notify(newValue ? 'Detailed watch data is on' : 'Detailed watch data is off', { tone: 'success' });
      if (onSettingsChange) onSettingsChange({ influxEnabled: newValue });
      // The parent may have swapped this view out; only check if still here.
      if (newValue && alive.current) testInfluxConnection();
    } catch (err) {
      console.error('Error updating settings:', err);
      if (!alive.current) return;
      const message = errorMessage(err, 'Couldn’t save that setting. Try again.');
      setToggleError(message);
      notify(message, { tone: 'error' });
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  async function handleUpdateBaselines() {
    if (saving) return;
    setSaving(true);
    setBaselineError(null);

    try {
      const newBaselines = {
        weeklyHRV: numberOrNull(hrvInput),
        restingHR: numberOrNull(hrInput),
        lastUpdated: new Date().toISOString(),
      };

      await apiService.patch('/user/settings', { healthBaselines: newBaselines });
      if (!alive.current) return;

      setSettings((prev) => ({ ...prev, healthBaselines: newBaselines }));
      notify('Your usual numbers are saved', { tone: 'success' });
    } catch (err) {
      console.error('Error updating baselines:', err);
      if (!alive.current) return;
      // Said under the boxes, which keep what was typed.
      const message = errorMessage(err, 'Couldn’t save your usual numbers. Try again.');
      setBaselineError(message);
      notify(message, { tone: 'error' });
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading watch settings" />
      </Box>
    );
  }

  if (loadError) {
    return <GeekErrorState compact title="Couldn’t load watch settings" error={loadError} onRetry={fetchSettings} />;
  }

  const quiet = { color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.5 };

  return (
    <Stack spacing={{ xs: 3, md: 4 }} data-testid="watch-settings-panels">
      <LabelPanel title={`${step}Detailed watch data`} action={<Tag>Advanced</Tag>}>
        <Typography sx={quiet}>
          Heart rate, stress and energy through the day, the closer look at your sleep and the recovery
          notes are read from a data server at home that your Garmin sync fills. Turn this on only if
          one has been set up for you.
        </Typography>

        <FormControlLabel
          labelPlacement="start"
          control={(
            <Switch
              checked={settings.influxEnabled}
              onChange={handleToggleInflux}
              disabled={saving}
            />
          )}
          label={<Box component="span" sx={{ fontWeight: 600 }}>Use the home data server (InfluxDB)</Box>}
          sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, ml: 0, mr: 0, mt: 3, minHeight: 44 }}
        />
        {toggleError && (
          <Typography role="alert" data-testid="toggle-error" sx={{ color: 'error.main', fontSize: '0.875rem', mt: 1 }}>
            {toggleError}
          </Typography>
        )}

        {settings.influxEnabled && (
          <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
            <Button
              variant="tonal"
              onClick={testInfluxConnection}
              disabled={testingConnection}
              startIcon={testingConnection ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ minHeight: 44 }}
            >
              Check the connection
            </Button>
            {connectionStatus && (
              <Box role="status" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, flex: '1 1 220px', minWidth: 0 }}>
                <Tag tone={connectionStatus.success ? 'success' : 'error'}>
                  {connectionStatus.success ? 'Connected' : 'Not connected'}
                </Tag>
                <Typography sx={{ ...quiet, fontSize: '0.875rem' }}>
                  {connectionStatus.success
                    ? 'FitnessGeek can reach the home data server.'
                    : (connectionStatus.error || UNREACHABLE)}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </LabelPanel>

      {settings.influxEnabled && (
        <LabelPanel title="Your usual numbers">
          <Typography sx={quiet}>
            What’s normal for you, so recovery notes can tell a good day from a tired one. Leave a box
            empty if you don’t know it yet.
          </Typography>
          {/* 16px between fields: the suite's spacing unit is 4px. */}
          <Stack spacing={4} sx={{ mt: 4 }}>
            <TextField
              label="Usual heart-rate variability (HRV)"
              value={hrvInput}
              onChange={(e) => setHrvInput(e.target.value)}
              type="number"
              inputProps={{ inputMode: 'decimal', min: 0 }}
              InputProps={{ endAdornment: <InputAdornment position="end">ms</InputAdornment> }}
              helperText={`Your average over a week, such as 60. ${EXPLAIN.hrv}`}
              fullWidth
            />
            <TextField
              label="Usual resting heart rate"
              value={hrInput}
              onChange={(e) => setHrInput(e.target.value)}
              type="number"
              inputProps={{ inputMode: 'decimal', min: 0 }}
              InputProps={{ endAdornment: <InputAdornment position="end">bpm</InputAdornment> }}
              helperText="Such as 55"
              fullWidth
            />
          </Stack>

          {baselineError && (
            <Typography role="alert" data-testid="baseline-error" sx={{ color: 'error.main', fontSize: '0.875rem', mt: 3 }}>
              {baselineError}
            </Typography>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, mt: 4 }}>
            <Button variant="contained" onClick={handleUpdateBaselines} disabled={saving} sx={{ minHeight: 44 }}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {settings.healthBaselines.lastUpdated && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                {`Last saved ${shortDay(settings.healthBaselines.lastUpdated)}`}
              </Typography>
            )}
          </Box>
        </LabelPanel>
      )}
    </Stack>
  );
}
