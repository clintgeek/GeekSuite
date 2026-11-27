import React, { lazy, useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Tab,
  Tabs,
  CircularProgress,
  Button,
  IconButton,
  Collapse,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { GeekErrorState } from '@geeksuite/ui';
import { localDateString } from '@geeksuite/utils';
import { apiService } from '../services/apiService';
import Shell from './embeddedShell.jsx';
import InfluxDBSettings from '../components/InfluxDBSettings';
import ConnectWatchCard from '../components/Reports/ConnectWatchCard.jsx';
import { DisplayHeading, LabelPanel, SuspenseSurface } from '../components/primitives';
import { tonalColors } from '../theme/theme.jsx';
import { errorMessage } from '../utils/errorMessage.js';

// The four panels are lazy. Two of them (Overview, Meals) pull the chart
// library, which a person who has never connected a watch should not download
// just to see the "connect a watch" card. InfluxDBSettings stays eager: it is
// the setup behind that card, and it costs nothing (no chart library).
const IntradayDashboard = lazy(() => import('../components/IntradayDashboard'));
const SleepAnalysis = lazy(() => import('../components/SleepAnalysis'));
const MealImpactVisualization = lazy(() => import('../components/MealImpactVisualization'));
const RecoveryCoach = lazy(() => import('../components/RecoveryCoach'));

// Short names, so all four fit a phone's width with nothing cut off and
// nothing to swipe.
const SECTIONS = ['Overview', 'Sleep', 'Meals', 'Recovery'];

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

/** "Today" / "Yesterday" / "Wed, Nov 25", and the date beside the first two. */
const dayWords = (selectedDate, today = localDateString()) => {
  const date = parseDay(selectedDate);
  const short = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (selectedDate === today) return { title: 'Today', detail: short };
  if (selectedDate === shiftDay(today, -1)) return { title: 'Yesterday', detail: short };
  return { title: short, detail: null };
};

/**
 * The day, as ONE compact control: previous, the day itself, next.
 *
 * It replaced a tall header (a big "Today", an eyebrow date, Yesterday and
 * Today buttons and a date field) that put a third layer of navigation
 * between the tabs and the data on a phone. Everything it did is still here:
 * the arrows step a day, the day itself opens the phone's own date picker for
 * any other day, and "Today" comes back when you have wandered off.
 */
function DayStepper({ selectedDate, onChange }) {
  const today = localDateString();
  const { title, detail } = dayWords(selectedDate, today);
  const pickerRef = useRef(null);
  const openPicker = () => {
    // The transparent date input lies over the label, so a tap lands on it
    // and phones open their picker by themselves. Desktop browsers only open
    // one from the calendar glyph, hence showPicker() where it exists.
    try {
      pickerRef.current?.showPicker?.();
    } catch {
      /* not allowed here (an iframe, an old browser): the input still takes typing */
    }
  };
  const arrowSx = { width: 44, height: 44, color: 'text.primary' };
  return (
    <Box data-testid="day-stepper" sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          borderRadius: 999,
          bgcolor: 'background.paper',
          border: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <IconButton onClick={() => onChange(shiftDay(selectedDate, -1))} aria-label="Previous day" sx={arrowSx}>
          <ChevronLeftIcon />
        </IconButton>
        <Box
          sx={{
            position: 'relative',
            minWidth: 0,
            minHeight: 44,
            px: 1,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 2,
            '&:focus-within': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: -2 },
          }}
        >
          <Typography
            data-testid="day-label"
            aria-hidden
            sx={{ fontSize: '0.9375rem', lineHeight: 1.2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
          >
            <Box component="span" sx={{ fontWeight: 700 }}>{title}</Box>
            {detail && <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${detail}`}</Box>}
          </Typography>
          <Box
            component="input"
            ref={pickerRef}
            type="date"
            aria-label={`Day shown: ${title}${detail ? `, ${detail}` : ''}. Choose another day`}
            value={selectedDate}
            max={today}
            onClick={openPicker}
            onChange={(e) => {
              const next = e.target.value;
              // Clearing the field (the picker's own "clear") is not a day.
              if (/^\d{4}-\d{2}-\d{2}$/.test(next) && next <= today) onChange(next);
            }}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              border: 0,
              p: 0,
              m: 0,
              // The whole field is the tap target on WebKit, not only the glyph.
              '&::-webkit-calendar-picker-indicator': { position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' },
            }}
          />
        </Box>
        <IconButton
          onClick={() => onChange(shiftDay(selectedDate, 1))}
          disabled={selectedDate >= today}
          aria-label="Next day"
          sx={arrowSx}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>
      {selectedDate !== today && (
        <Button variant="text" onClick={() => onChange(today)} sx={{ minHeight: 44, minWidth: 0, px: 2, fontWeight: 700 }}>
          Today
        </Button>
      )}
    </Box>
  );
}

// The sections, as a row of small pills under the Trends tabs. Each tab keeps
// a 44px hit area; the pill is drawn smaller inside it. The selected pill is
// the tonal wash, not the filled blue: the page's one filled blue is not
// spent on saying where you are.
const pillTabsSx = (theme) => {
  const tonal = tonalColors(theme);
  return {
    minHeight: 44,
    minWidth: 0,
    '& .MuiTabs-indicator': { display: 'none' },
    '& .MuiTabs-flexContainer': { gap: 1.5 },
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
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        zIndex: -1,
      },
      '&.Mui-selected': { color: tonal.ink, fontWeight: 700 },
      '&.Mui-selected::before': { backgroundColor: tonal.bg, borderColor: tonal.bg },
    },
  };
};

/**
 * Trends › Health: what the watch recorded through one day.
 *
 * Three states before any data, each its own screen:
 *   checking   a spinner
 *   failed     the settings read failed; said so, with a retry. It is NOT
 *              shown as "no watch", which would tell a connected person to
 *              set up something they already have.
 *   no watch   one friendly card; the setup sits behind its button.
 */
export default function HealthDashboard({ embedded = false }) {
  const [activeTab, setActiveTab] = useState(0);
  // Local calendar day (YYYY-MM-DD), not UTC.
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [influxEnabled, setInfluxEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const alive = useRef(true);

  // Reflect the current section in document.title so browser history is readable
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${SECTIONS[activeTab] || 'Health'} · Health · FitnessGeek`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeTab]);

  useEffect(() => {
    alive.current = true;
    checkStatus();
    return () => { alive.current = false; };
  }, []);

  async function checkStatus() {
    setChecking(true);
    setCheckError(null);
    try {
      const response = await apiService.get('/user/settings');
      if (!alive.current) return;
      const settings = response?.data || response || {};
      setInfluxEnabled(!!settings.influxEnabled);
    } catch (err) {
      if (!alive.current) return;
      console.warn('Could not load the watch-data setting:', err?.message);
      setCheckError(errorMessage(err, 'Couldn’t check your watch connection. Try again.'));
    } finally {
      if (alive.current) setChecking(false);
    }
  }

  const header = !embedded && <DisplayHeading size="page">Health</DisplayHeading>;

  if (checking) {
    return (
      <Shell embedded={embedded}>
        {header}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <CircularProgress aria-label="Loading your health data" />
        </Box>
      </Shell>
    );
  }

  if (checkError) {
    return (
      <Shell embedded={embedded}>
        {header}
        <GeekErrorState title="Couldn’t load your health data" error={checkError} onRetry={checkStatus} />
      </Shell>
    );
  }

  if (!influxEnabled) {
    return (
      <Shell embedded={embedded}>
        {header}
        <ConnectWatchCard
          action={setupOpen ? undefined : (
            <Button variant="contained" onClick={() => setSetupOpen(true)} aria-expanded={false}>
              Set it up
            </Button>
          )}
        />
        {setupOpen && (
          <Box data-testid="watch-setup" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } }}>
            <LabelPanel title="1. Connect your Garmin account">
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: 3 }}>
                Sign in to Garmin in Settings. Steps, sleep and workouts then show under Activity.
              </Typography>
              <Button component={RouterLink} to="/settings#garmin" variant="tonal" sx={{ minHeight: 44 }}>
                Open Settings
              </Button>
            </LabelPanel>
            <InfluxDBSettings
              step="2. "
              onSettingsChange={(next) => {
                if (next.influxEnabled) setInfluxEnabled(true);
              }}
            />
          </Box>
        )}
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      {header}

      {/* One band of controls: which part of the day's data, and which day.
          Side by side from sm up; on a phone the day sits under the pills. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 4, rowGap: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(event, next) => setActiveTab(next)}
          variant="scrollable"
          scrollButtons={false}
          data-testid="health-tabs"
          aria-label="Health sections"
          sx={pillTabsSx}
        >
          {SECTIONS.map((name) => <Tab key={name} label={name} />)}
        </Tabs>
        <DayStepper selectedDate={selectedDate} onChange={setSelectedDate} />
      </Box>

      <Box>
        <SuspenseSurface rows={5} height={360}>
          {activeTab === 0 && <IntradayDashboard date={selectedDate} />}
          {activeTab === 1 && <SleepAnalysis date={selectedDate} />}
          {activeTab === 2 && <MealImpactVisualization date={selectedDate} />}
          {activeTab === 3 && <RecoveryCoach date={selectedDate} />}
        </SuspenseSurface>
      </Box>

      {/* Setup is not a section of your health: it sits at the foot, closed. */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="text"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-controls="watch-settings"
            data-testid="watch-settings-toggle"
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            {settingsOpen ? 'Hide watch settings' : 'Watch settings'}
          </Button>
        </Box>
        <Collapse in={settingsOpen} unmountOnExit>
          <Box id="watch-settings" sx={{ pt: 3 }}>
            <InfluxDBSettings onSettingsChange={(next) => setInfluxEnabled(!!next.influxEnabled)} />
          </Box>
        </Collapse>
      </Box>
    </Shell>
  );
}
