/**
 * The phone's one set of paths: Things · Where · Load · Attention · More.
 *
 *   - Load sits in the middle: a big moving-orange tile with black
 *     lettering, standing a little proud of the bar — the app's one primary
 *     action, in the thumb zone (it opens the add screen). No floating +.
 *   - Attention (the cab dashboard) carries the count of things overdue or
 *     due soon on an orange badge.
 *   - More opens a sheet with the rest (Types, Insurance report, Trash,
 *     Settings, saved views). No hamburger anywhere on the phone.
 *
 * Moving Day: the bar is the truck's black flank with the orange livery
 * stripe along its top edge, in both modes (it renders under the chrome
 * theme). Rendered only below md (App.jsx), as GeekShell's `bottomNav`, so
 * the shell reserves its 56px (plus the home-indicator inset).
 */
import React, { useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import {
  Inventory2Outlined as ThingsIcon,
  LocalShippingOutlined as LoadIcon,
  MoreHoriz as MoreIcon,
  SpeedOutlined as AttentionIcon,
  WarehouseOutlined as WhereIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { geekLayout } from '@geeksuite/ui';
import { useAttention } from '../hooks/useThingMeta';
import { CHROME, LIVERY, LIVERY_BAND_PX, STENCIL_FONT, liveryBand } from '../theme/theme';
import ChromeTheme from './Chrome';
import { tabFor } from './navConfig';
import NavMoreSheet from './NavMoreSheet';

export const TAB_BAR_HEIGHT = geekLayout?.bottomNavHeight ?? 56;

function TabGlyph({ active, children }) {
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
        height: 26,
        borderRadius: '3px',
        color: active ? LIVERY.orange : 'inherit',
        // The current tab: an orange rule under its glyph, like a lit gauge.
        boxShadow: active ? `inset 0 -3px 0 ${LIVERY.orange}` : 'none',
        '& .MuiSvgIcon-root': { fontSize: 23 },
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
        top: -6,
        right: -2,
        minWidth: 20,
        height: 20,
        px: '5px',
        borderRadius: '10px',
        bgcolor: LIVERY.orange,
        color: LIVERY.ink,
        border: '1.5px solid',
        borderColor: CHROME.bar,
        fontSize: '0.75rem',
        fontWeight: 800,
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
  // clear of the livery stripe along the top edge
  pt: '9px',
  color: 'text.secondary',
  textDecoration: 'none',
  '&:focus-visible': { outline: '2px solid', outlineColor: LIVERY.orange, outlineOffset: -4, borderRadius: '6px' },
};

function Label({ active, children }) {
  return (
    <Typography component="span" noWrap sx={{ fontSize: '0.75rem', lineHeight: 1.2, fontWeight: active ? 800 : 600, color: active ? 'text.primary' : 'text.secondary' }}>
      {children}
    </Typography>
  );
}

/** The middle tab: the Load button, standing proud of the bar. */
function LoadTab() {
  return (
    <ButtonBase
      component={RouterLink}
      to="/add"
      data-tab="add"
      aria-label="Load: add a thing"
      sx={{ ...itemSx, pt: 0, justifyContent: 'flex-start', '&:focus-visible': {} }}
    >
      <Box
        component="span"
        sx={{
          mt: '-14px',
          width: 64,
          height: 52,
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1px',
          bgcolor: LIVERY.orange,
          color: LIVERY.ink,
          border: `2px solid ${LIVERY.ink}`,
          boxShadow: `0 0 0 2px ${CHROME.bar}, 0 4px 0 ${LIVERY.burnt}`,
          '.Mui-focusVisible &': { outline: `3px solid ${CHROME.text}`, outlineOffset: 2 },
          '& .MuiSvgIcon-root': { fontSize: 24 },
        }}
      >
        <LoadIcon aria-hidden="true" />
        <Box component="span" sx={{ fontFamily: STENCIL_FONT, fontSize: '0.8125rem', lineHeight: 1, letterSpacing: '0.06em' }}>
          Load
        </Box>
      </Box>
    </ButtonBase>
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
    { id: 'add' },
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
      <ChromeTheme>
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
            bgcolor: CHROME.bar,
            color: CHROME.text,
            // The livery stripe along the top edge of the truck's flank.
            backgroundImage: liveryBand('top'),
            backgroundRepeat: 'no-repeat',
            backgroundSize: `100% ${LIVERY_BAND_PX}px`,
            backgroundPosition: 'left top',
          }}
        >
          {tabs.map((t) => {
            if (t.id === 'add') return <LoadTab key="add" />;
            const active = current === t.id;
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
                <TabGlyph active={active}>
                  {t.icon}
                  <CountBadge count={t.badge} />
                </TabGlyph>
                <Label active={active}>{t.label}</Label>
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
      </ChromeTheme>
      <NavMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
