import React, { lazy } from 'react';
import { Box } from '@mui/material';
import { Page, SuspenseSurface } from '../components/primitives';
import ContainerTabs, { useTabParam } from './containerTabs.jsx';

const MyMeals = lazy(() => import('./MyMeals.jsx'));
const MyFoods = lazy(() => import('./MyFoods.jsx'));

const TABS = [
  { key: 'meals', label: 'Meals', Inner: MyMeals },
  { key: 'foods', label: 'Foods', Inner: MyFoods },
];
const KEYS = TABS.map((t) => t.key);

export default function SavedFoods() {
  const [tab, setTab] = useTabParam(KEYS);
  const { Inner } = TABS.find((t) => t.key === tab);
  return (
    <Page>
      <ContainerTabs label="Saved foods sections" tabs={TABS} value={tab} onChange={setTab} />
      <Box role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <SuspenseSurface rows={5} height={360}>
          <Inner embedded />
        </SuspenseSurface>
      </Box>
    </Page>
  );
}
