/**
 * NewsGeek sidebar (md+): the suite GeekSidebar on newsprint.
 *
 *   Latest
 *   Desk   Sources
 *   footer: user · Sign out
 *
 * N2 adds Briefing above Latest and Saved/Settings; the groups are already
 * shaped for them. A selected row is the shaded band with an ink rule at its
 * left edge (measured in __tests__/theme/gazetteContrast.test.js).
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { NewspaperOutlined as LatestIcon, RssFeedOutlined as SourcesIcon } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { GeekSidebar } from '@geeksuite/ui';
import { GOTHIC, SERIF, SIDEBAR_SX } from '../theme/theme';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_NAME, NAV, activeNavId } from './navConfig';
import GazetteMark from './GazetteMark';

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <GazetteMark size={30} />
      <Typography component="span" noWrap sx={{ fontFamily: SERIF, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.015em', color: 'text.primary' }}>
        NewsGeek
      </Typography>
    </Box>
  );
}

const itemSx = {
  mb: 0.5,
  minHeight: 44,
  borderRadius: 0,
  color: 'text.secondary',
  '& .MuiListItemText-primary': { fontFamily: GOTHIC, fontSize: '0.9375rem', fontWeight: 600 },
  '& .MuiListItemIcon-root': { color: 'inherit' },
  '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
  '&:hover': { bgcolor: 'background.shade', color: 'text.primary' },
  '&.Mui-selected': {
    bgcolor: 'background.shade',
    color: 'text.primary',
    boxShadow: (t) => `inset 3px 0 0 ${t.palette.text.primary}`,
    '& .MuiListItemText-primary': { fontWeight: 700 },
    '&:hover': { bgcolor: 'background.shade' },
  },
};


export default function Sidebar({ user, onSignOut }) {
  const location = useLocation();
  const sections = [
    { items: [{ id: NAV.latest, label: 'Latest', icon: <LatestIcon />, to: '/' }] },
    { label: 'Desk', items: [{ id: NAV.sources, label: 'Sources', icon: <SourcesIcon />, to: '/sources' }] },
  ];
  return (
    <GeekSidebar
      brand={<Brand />}
      sections={sections}
      activeId={activeNavId(location.pathname)}
      footer={{
        user: user ? { name: displayNameFrom(user), secondary: secondaryFrom(user), initials: initialsFrom(user) } : undefined,
        onSignOut,
      }}
      aria-label={`${APP_NAME} navigation`}
      sx={SIDEBAR_SX}
      itemSx={itemSx}
    />
  );
}
