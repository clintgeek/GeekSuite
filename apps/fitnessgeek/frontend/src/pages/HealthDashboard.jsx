import React, { lazy, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  Tab,
  Tabs,
  Alert,
  AlertTitle,
  CircularProgress,
  Button,
  IconButton,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useAuth } from '@geeksuite/auth';
import { localDateString } from '@geeksuite/utils';
import { apiService } from '../services/apiService';
import Shell from './embeddedShell.jsx';
import InfluxDBSettings from '../components/InfluxDBSettings';
import { DateField, SuspenseSurface, Page } from '../components/primitives';

// The four analytics panels are lazy. Two of them (Intraday, Meal Impact) pull
// the chart library, which used to sit in this route's chunk, so it was
// downloaded even by users who have never enabled the InfluxDB integration and
// only ever see the "integration required" screen above. InfluxDBSettings
// stays eager: it renders on that screen, and it costs nothing (no chart
// library). Q52a swapped chart.js for @nivo/line here — one library for the
// whole app — so these two panels now share the `nivo` + `d3` vendor chunks
// with /weight and /blood-pressure instead of pulling a third one of their own.
const IntradayDashboard = lazy(() => import('../components/IntradayDashboard'));
const SleepAnalysis = lazy(() => import('../components/SleepAnalysis'));
const MealImpactVisualization = lazy(() => import('../components/MealImpactVisualization'));
const RecoveryCoach = lazy(() => import('../components/RecoveryCoach'));

const TAB_TITLES = [
  'Overview',
  'Sleep analysis',
  'Meal impact',
  'Recovery coach',
  'Settings',
];

// Calendar-day arithmetic on YYYY-MM-DD strings, in local time (never UTC).
const parseDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftDay = (iso, by) => {
  const date = parseDay(iso);
  date.setDate(date.getDate() + by);
  return dayString(date);
};

/** The day, as a header on the grey ground: previous / next around a bold
 * "Today" (or the date in words) with the date as a small eyebrow, then
 * the Yesterday / Today shortcuts and the native picker for any other day. */
function DayHeader({ selectedDate, onChange }) {
  const today = localDateString();
  const yesterday = shiftDay(today, -1);
  const date = parseDay(selectedDate);
  const title = selectedDate === today
    ? 'Today'
    : selectedDate === yesterday
      ? 'Yesterday'
      : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const eyebrow = selectedDate === today || selectedDate === yesterday
    ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', alignItems: 'center' }}>
        <IconButton
          onClick={() => onChange(shiftDay(selectedDate, -1))}
          aria-label="Previous day"
          sx={{ width: 48, height: 48, color: 'text.primary' }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
          <Typography component="h2" sx={{ m: 0, fontWeight: 700, lineHeight: 1.1, fontSize: { xs: '1.5rem', sm: '1.75rem' }, textAlign: 'center' }}>
            {title}
          </Typography>
          {eyebrow && (
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
              {eyebrow}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={() => onChange(shiftDay(selectedDate, 1))}
          disabled={selectedDate >= today}
          aria-label="Next day"
          sx={{ width: 48, height: 48, color: 'text.primary' }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="text" size="small" onClick={() => onChange(yesterday)}>
          Yesterday
        </Button>
        <Button variant="text" size="small" onClick={() => onChange(today)}>
          Today
        </Button>
        <DateField
          label={false}
          inputProps={{ 'aria-label': 'Date' }}
          size="small"
          value={selectedDate}
          onChange={onChange}
          max={today}
          sx={{ minWidth: 150 }}
        />
      </Stack>
    </Box>
  );
}

// Text tabs: a hairline under the row, a blue indicator on the selected one.
const tabsSx = {
  borderBottom: (t) => `1px solid ${t.palette.divider}`,
  minHeight: 48,
  '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0', bgcolor: 'primary.main' },
  '& .MuiTab-root': {
    minHeight: 48,
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '1rem',
    color: 'text.secondary',
    px: 2,
    '&.Mui-selected': { color: 'text.primary' },
  },
};

// Under Trends the outer tabs are the primary control, so these sections read
// as a lighter row of small pills. Each tab keeps a 44px hit area; the pill is
// drawn smaller inside it.
const pillTabsSx = {
  minHeight: 44,
  '& .MuiTabs-indicator': { display: 'none' },
  '& .MuiTabs-flexContainer': { gap: 1 },
  '& .MuiTab-root': {
    position: 'relative',
    minHeight: 44,
    minWidth: 0,
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.875rem',
    color: 'text.secondary',
    px: 3,
    zIndex: 0,
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: '6px 0',
      borderRadius: 999,
      border: (t) => `1px solid ${t.palette.divider}`,
      zIndex: -1,
    },
    '&.Mui-selected': { color: 'primary.contrastText' },
    '&.Mui-selected::before': { bgcolor: 'primary.main', borderColor: 'primary.main' },
  },
};

/**
 * Comprehensive Health Dashboard
 * Displays InfluxDB-powered health analytics
 */
export default function HealthDashboard({ embedded = false }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  // Five tabs don't fit a phone's width: "Settings" was cut off the end. On a
  // phone they scroll sideways (with arrows); from md up they share the row.
  const theme = useTheme();
  const tabsFit = useMediaQuery(theme.breakpoints.up('md'));

  // Reflect the current tab in document.title so browser history is readable
  useEffect(() => {
    const tabName = TAB_TITLES[activeTab] || 'Health dashboard';
    const previousTitle = document.title;
    document.title = `${tabName} · Health dashboard · FitnessGeek`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeTab]);
  // Local calendar day (YYYY-MM-DD), not UTC.
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [influxEnabled, setInfluxEnabled] = useState(false);
  const [checkingInflux, setCheckingInflux] = useState(true);

  useEffect(() => {
    checkInfluxStatus();
  }, []);

  async function checkInfluxStatus() {
    setCheckingInflux(true);
    try {
      const response = await apiService.get('/user/settings');
      const settings = response?.data || response || {};
      setInfluxEnabled(settings.influxEnabled || false);
    } catch (err) {
      console.warn('Could not load InfluxDB settings:', err.message);
    } finally {
      setCheckingInflux(false);
    }
  }

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
  };

  if (checkingInflux) {
    return (
      <Shell embedded={embedded}>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Shell>
    );
  }

  if (!influxEnabled) {
    return (
      <Shell embedded={embedded}>
        <Alert severity="info">
          <AlertTitle>Turn on the home data server first</AlertTitle>
          This page reads your Garmin data from the home data server (InfluxDB).
          Turn it on below to see:
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li>Heart rate, stress and Body Battery through the day</li>
            <li>How you slept, with heart-rate variability (HRV) and recovery</li>
            <li>How your heart rate answered each meal</li>
            <li>Recovery notes written by AI</li>
          </ul>
        </Alert>

        <InfluxDBSettings onSettingsChange={(newSettings) => {
          if (newSettings.influxEnabled) {
            setInfluxEnabled(true);
          }
        }} />
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      {/* Editorial header */}
      <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
        Your Garmin data through the day, from the home data server.
      </Typography>

      <DayHeader selectedDate={selectedDate} onChange={handleDateChange} />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant={tabsFit && !embedded ? 'fullWidth' : 'scrollable'}
        // The pills swipe sideways; a cut-off pill at the edge says there are more.
        scrollButtons={embedded || tabsFit ? false : 'auto'}
        allowScrollButtonsMobile
        data-testid="health-tabs"
        aria-label={embedded ? 'Health sections' : undefined}
        sx={embedded ? pillTabsSx : tabsSx}
      >
        <Tab label="Overview" />
        <Tab label="Sleep analysis" />
        <Tab label="Meal impact" />
        <Tab label="Recovery coach" />
        <Tab label="Settings" />
      </Tabs>

      {/* Tab Panels — no redundant heading, tab label already names the section */}
      <Box>
        <SuspenseSurface rows={5} height={360}>
          {activeTab === 0 && <IntradayDashboard date={selectedDate} />}
          {activeTab === 1 && <SleepAnalysis date={selectedDate} />}
          {activeTab === 2 && <MealImpactVisualization date={selectedDate} />}
          {activeTab === 3 && (
            <RecoveryCoach date={selectedDate} />
          )}
        </SuspenseSurface>

        {activeTab === 4 && (
          <InfluxDBSettings onSettingsChange={(newSettings) => {
            setInfluxEnabled(newSettings.influxEnabled);
          }} />
        )}
      </Box>
    </Shell>
  );
}
