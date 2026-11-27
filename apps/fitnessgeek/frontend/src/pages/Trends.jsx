import React, { lazy } from 'react';
import { Box, Button, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Page, SuspenseSurface, SurfaceSkeleton } from '../components/primitives';
import ContainerTabs, { useTabParam } from './containerTabs.jsx';
import ConnectWatchCard from '../components/Reports/ConnectWatchCard.jsx';
import { useWatchConnection, CONNECT_WATCH_HREF } from '../components/Reports/useWatchConnection.js';

// Lazy, and only the selected tab is mounted: opening Trends does not fetch
// Garmin data for the Health tab.
const Reports = lazy(() => import('./Reports.jsx'));
const Activity = lazy(() => import('./Activity.jsx'));
const HealthDashboard = lazy(() => import('./HealthDashboard.jsx'));

const TABS = [
  { key: 'food', label: 'Food', Inner: Reports },
  { key: 'activity', label: 'Activity', Inner: Activity },
  { key: 'health', label: 'Health', Inner: HealthDashboard },
];
const KEYS = TABS.map((t) => t.key);

// What a person with no watch reads when a link brings them to a watch tab.
const NO_WATCH_COPY = {
  activity: 'Connect a Garmin watch to see steps, sleep, heart rate and workouts here.',
  health: 'Connect a Garmin watch to see heart rate, sleep and recovery here.',
};

/** The one quiet line at the foot of Trends for a person with no watch. The
 * whole line is the link, so it is a full-width, 44px target. */
const WatchLine = () => (
  <Link
    component={RouterLink}
    to={CONNECT_WATCH_HREF}
    data-testid="trends-watch-line"
    underline="none"
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      textAlign: 'center',
      color: 'text.secondary',
      fontSize: '0.875rem',
      lineHeight: 1.5,
    }}
  >
    <span>
      Have a Garmin watch?{' '}
      <Box component="span" sx={{ textDecoration: 'underline' }}>Connect it in Settings</Box>
      {' '}to see activity, sleep and heart rate here.
    </span>
  </Link>
);

/**
 * Trends: how your eating went and, for a person with a watch, what the watch
 * recorded.
 *
 * Without a watch, two of the three tabs were only "Connect a Garmin watch".
 * So the tabs exist only for someone who has one: everyone else gets the Food
 * view with no tab bar, and one quiet line at the foot saying a watch can be
 * connected. Until the answer is known the page is Food without tabs (tabs
 * are added, never flashed in and taken away); if the answer cannot be read,
 * the tabs show, so a watch owner is never locked out by a failed request.
 */
export default function Trends() {
  const [tab, setTab] = useTabParam(KEYS);
  const { status, showWatch } = useWatchConnection();
  const { Inner } = TABS.find((t) => t.key === tab);

  // One tree shape for every case (tab bar, panel, foot line), so the Food
  // view is not thrown away and fetched again when the tabs arrive.
  let panel;
  if (showWatch) {
    // A watch owner (or an answer we could not read): whichever tab is chosen.
    panel = <Inner embedded />;
  } else if (tab === 'food') {
    // Food alone. `watch` is false only when the answer (or this device's
    // memory of it) says there is no watch.
    panel = <Reports embedded watch={status === 'none' ? false : undefined} />;
  } else if (status === 'checking') {
    // A link to Activity or Health, answer not known yet: hold the space
    // rather than show Food and swap it out.
    panel = <SurfaceSkeleton rows={5} />;
  } else {
    // A link to Activity or Health and no watch: one friendly card saying
    // what would be here and how to get it.
    panel = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <ConnectWatchCard
          copy={NO_WATCH_COPY[tab]}
          action={(
            <Button component={RouterLink} to={CONNECT_WATCH_HREF} variant="contained">
              Connect in Settings
            </Button>
          )}
        />
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button component={RouterLink} to="/trends" variant="text" sx={{ minHeight: 44, fontWeight: 700 }}>
            See your food trends
          </Button>
        </Box>
      </Box>
    );
  }

  const tabPanelProps = showWatch
    ? { role: 'tabpanel', id: `tabpanel-${tab}`, 'aria-labelledby': `tab-${tab}` }
    : {};

  return (
    <Page>
      {showWatch && <ContainerTabs label="Trends sections" tabs={TABS} value={tab} onChange={setTab} />}
      <Box {...tabPanelProps}>
        <SuspenseSurface rows={5} height={360}>
          {panel}
        </SuspenseSurface>
      </Box>
      {status === 'none' && tab === 'food' && <WatchLine />}
    </Page>
  );
}
