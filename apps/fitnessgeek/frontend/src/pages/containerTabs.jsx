import React, { useCallback } from 'react';
import { Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';

// Same look as the Health dashboard's text tabs: hairline under the row,
// primary indicator, 44px+ rows.
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
    px: 3,
    '&.Mui-selected': { color: 'text.primary' },
  },
};

/**
 * The tab named by `?tab=`, falling back to the first key for a missing or
 * unknown value, and a setter that replaces (not pushes) the history entry
 * and leaves every other query parameter alone.
 */
export function useTabParam(keys) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = keys.includes(raw) ? raw : keys[0];
  const setTab = useCallback(
    (next) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('tab', next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [tab, setTab];
}

export default function ContainerTabs({ label, tabs, value, onChange }) {
  return (
    <Tabs
      value={value}
      onChange={(e, v) => onChange(v)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      aria-label={label}
      sx={tabsSx}
    >
      {tabs.map((t) => (
        <Tab key={t.key} value={t.key} label={t.label} id={`tab-${t.key}`} aria-controls={`tabpanel-${t.key}`} />
      ))}
    </Tabs>
  );
}
