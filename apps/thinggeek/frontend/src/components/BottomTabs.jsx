/**
 * The phone's one set of paths: Things · Where · Add · Attention · More.
 *
 *   - Add sits in the middle on a safety-orange fill (dark ink on it): the
 *     app's one primary action, in the thumb zone. There is no floating +.
 *   - Attention carries the count of things overdue or due soon, as an
 *     orange badge — orange means "needs attention" and nothing else.
 *   - More opens a sheet with the rest (Types, Insurance report, Trash,
 *     Saved views, Settings). No hamburger anywhere on the phone.
 *
 * The current tab's glyph sits on a small card-stock label on the kraft bar.
 * Rendered only below md (App.jsx), as GeekShell's `bottomNav`, so the shell
 * reserves its 56px (plus the home-indicator inset).
 */
import React, { useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import {
  Add as AddIcon,
  Inventory2Outlined as ThingsIcon,
  MoreHoriz as MoreIcon,
  NotificationsActiveOutlined as AttentionIcon,
  PlaceOutlined as WhereIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { geekLayout } from '@geeksuite/ui';
import { useAttention } from '../hooks/useThingMeta';
import { tabFor } from './navConfig';
import NavMoreSheet from './NavMoreSheet';

export const TAB_BAR_HEIGHT = geekLayout?.bottomNavHeight ?? 56;

function TabGlyph({ active, action, children }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 28,
        borderRadius: '6px',
        border: '1.5px solid',
        borderColor: action ? 'safety.contrastText' : active ? 'border' : 'transparent',
        bgcolor: action ? 'safety.main' : active ? 'background.paper' : 'transparent',
        color: action ? 'safety.contrastText' : active ? 'text.primary' : 'inherit',
        boxShadow: action || active ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
        '& .MuiSvgIcon-root': { fontSize: 22 },
      }}
    >
      {children}
    </Box>
  );
}

function CountBadge({ count }) {
  if (!count) return null;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid="attention-badge"
      sx={{
        position: 'absolute',
        top: -7,
        right: -4,
        minWidth: 20,
        height: 20,
        px: '5px',
        borderRadius: '10px',
        bgcolor: 'safety.main',
        color: 'safety.contrastText',
        border: '1.5px solid',
        borderColor: 'background.chrome',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: '17px',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        boxSizing: 'border-box',
      }}
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
}

const itemSx = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  px: 0.5,
  color: 'text.secondary',
  textDecoration: 'none',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: -4, borderRadius: '8px' },
};

function Label({ active, action, children }) {
  return (
    <Typography component="span" noWrap sx={{ fontSize: '0.75rem', lineHeight: 1.2, fontWeight: active || action ? 700 : 500, color: active || action ? 'text.primary' : 'text.secondary' }}>
      {children}
    </Typography>
  );
}

export default function BottomTabs() {
  const location = useLocation();
  const { dueCount } = useAttention();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = moreOpen ? 'more' : tabFor(location.pathname);

  const tabs = [
    { id: 'things', label: 'Things', to: '/', icon: <ThingsIcon /> },
    { id: 'where', label: 'Where', to: '/where', icon: <WhereIcon /> },
    { id: 'add', label: 'Add', to: '/add', icon: <AddIcon />, action: true, aria: 'Add a thing' },
    {
      id: 'attention',
      label: 'Attention',
      to: '/attention',
      icon: <AttentionIcon />,
      badge: dueCount,
      aria: dueCount ? `Needs attention, ${dueCount} due` : 'Needs attention',
    },
  ];

  return (
    <>
      <Box
        component="nav"
        aria-label="Tabs"
        data-testid="bottom-tabs"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          height: `${TAB_BAR_HEIGHT}px`,
          boxSizing: 'content-box',
          pb: 'env(safe-area-inset-bottom, 0px)',
          bgcolor: 'background.chrome',
          borderTop: 1,
          borderColor: 'border',
          boxShadow: '0 -1px 0 rgba(255,255,255,0.18) inset',
        }}
      >
        {tabs.map((t) => {
          const active = current === t.id && !t.action;
          return (
            <ButtonBase
              key={t.id}
              component={RouterLink}
              to={t.to}
              data-tab={t.id}
              aria-label={t.aria ?? t.label}
              aria-current={active ? 'page' : undefined}
              sx={itemSx}
            >
              <TabGlyph active={active} action={t.action}>
                {t.icon}
                <CountBadge count={t.badge} />
              </TabGlyph>
              <Label active={active} action={t.action}>
                {t.label}
              </Label>
            </ButtonBase>
          );
        })}
        <ButtonBase
          data-tab="more"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen ? 'true' : 'false'}
          aria-current={current === 'more' && !moreOpen ? 'page' : undefined}
          aria-label="More"
          sx={itemSx}
        >
          <TabGlyph active={current === 'more'}>
            <MoreIcon />
          </TabGlyph>
          <Label active={current === 'more'}>More</Label>
        </ButtonBase>
      </Box>
      <NavMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
