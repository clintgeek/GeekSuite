import React, { lazy } from 'react';
import { Box } from '@mui/material';
import { Page, SuspenseSurface } from '../components/primitives';
import ContainerTabs, { useTabParam } from './containerTabs.jsx';

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

export default function Trends() {
  const [tab, setTab] = useTabParam(KEYS);
  const { Inner } = TABS.find((t) => t.key === tab);
  return (
    <Page>
      <ContainerTabs label="Trends sections" tabs={TABS} value={tab} onChange={setTab} />
      <Box role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <SuspenseSurface rows={5} height={360}>
          <Inner embedded />
        </SuspenseSurface>
      </Box>
    </Page>
  );
}
