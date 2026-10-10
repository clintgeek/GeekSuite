/**
 * The phone's tab bar: Latest · Sources. A newsprint strip under a hairline;
 * the current tab is set in bold with an ink rule over it, like a section
 * flag. N2 adds Briefing, Saved and More (Settings) — up to five tabs fit.
 * Rendered only below md, as GeekShell's `bottomNav`.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { NewspaperOutlined as LatestIcon, RssFeedOutlined as SourcesIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { geekLayout } from '@geeksuite/ui';
import { GOTHIC } from '../theme/theme';
import { tabFor } from './navConfig';

const TAB_BAR_HEIGHT = geekLayout?.bottomNavHeight ?? 56;

const TABS = [
  { id: 'latest', label: 'Latest', to: '/', icon: <LatestIcon aria-hidden="true" /> },
  { id: 'sources', label: 'Sources', to: '/sources', icon: <SourcesIcon aria-hidden="true" /> },
];

export default function BottomTabs() {
  const location = useLocation();
  const current = tabFor(location.pathname);
  return (
    <Box
      component="nav"
      aria-label="Tabs"
      data-testid="bottom-tabs"
      sx={{
        flexShrink: 0,
        display: 'flex',
        height: `${TAB_BAR_HEIGHT}px`,
        boxSizing: 'content-box',
        pb: 'env(safe-area-inset-bottom, 0px)',
        bgcolor: 'background.default',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      {TABS.map(({ id, label, to, icon }) => {
        const active = current === id;
        return (
          <ButtonBase
            key={id}
            component={RouterLink}
            to={to}
            data-tab={id}
            aria-current={active ? 'page' : undefined}
            sx={{
              flex: 1,
              minHeight: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              color: active ? 'text.primary' : 'text.secondary',
              boxShadow: (t) => (active ? `inset 0 3px 0 ${t.palette.text.primary}` : 'none'),
              '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: -4 },
              '& .MuiSvgIcon-root': { fontSize: 22 },
            }}
          >
            {icon}
            <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.75rem', lineHeight: 1.2, fontWeight: active ? 700 : 500, letterSpacing: '0.02em' }}>
              {label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
