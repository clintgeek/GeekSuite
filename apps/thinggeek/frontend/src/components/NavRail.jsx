/**
 * The tablet's paths: the suite rail (`GeekNavRail`) in Storage Yard livery.
 *
 *   Add (the orange tile, at the top — the app's one primary action)
 *   Things · Where · Attention (N) · More
 *
 * The same five as the phone's tab bar (BottomTabs.jsx), stood on end: a
 * touch tablet, in either grip, gets this instead of the tab bar or the
 * 220px sidebar (hooks/useThingNav.js). A mouse never sees it. More opens the same
 * sheet as the phone (Types, Insurance report, the Attic, Trash, saved views,
 * Settings). The rail stays on the add screen and Walk: it is beside the
 * page, not under the thumb, so their own Save/Done bars have the foot.
 *
 * Storage Yard: the truck's black flank with the orange stripe down its
 * inside edge, as the sidebar; the current item is lit — light lettering and
 * an orange rule under its glyph, as the tab bar. Rendered under the chrome
 * theme in both modes. The pairs are measured in storageYardContrast.test.js.
 */
import React, { useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import {
  Inventory2Outlined as ThingsIcon,
  Add as AddIcon,
  MoreHoriz as MoreIcon,
  SpeedOutlined as AttentionIcon,
  WarehouseOutlined as WhereIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekNavRail } from '@geeksuite/ui';
import { useAttention } from '../hooks/useThingMeta';
import { CHROME, DISPLAY_FONT, LIVERY } from '../theme/theme';
import ChromeTheme from './Chrome';
import { tabFor } from './navConfig';
import NavMoreSheet from './NavMoreSheet';

/** What the rail paints, exported for the contrast ratchet. */
export const RAIL_SX = {
  bgcolor: CHROME.bar,
  color: CHROME.text,
  borderRight: `4px solid ${LIVERY.orange}`,
};

export const railItemSx = {
  color: CHROME.secondary,
  '& .MuiSvgIcon-root': { fontSize: 23 },
  '&[aria-current="page"]': { color: CHROME.text },
  '&[aria-current="page"] [data-geek-nav-rail="indicator"]': {
    bgcolor: CHROME.raised,
    color: LIVERY.orange,
    boxShadow: `inset 0 -3px 0 ${LIVERY.orange}`,
  },
  '&[aria-current="page"] [data-geek-nav-rail="label"]': { fontWeight: 800 },
  '@media (any-hover: hover)': {
    '&:hover': { color: CHROME.text },
    '&:hover [data-geek-nav-rail="indicator"]': { bgcolor: CHROME.raised },
  },
  '&.Mui-focusVisible': { outline: `2px solid ${LIVERY.orange}`, outlineOffset: -2 },
  // The attention count: an orange fill, black ink on it.
  '& [data-geek-nav-rail="badge"]': {
    bgcolor: LIVERY.orange,
    color: LIVERY.ink,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
  },
};

function AddTile() {
  return (
    <ButtonBase
      component={RouterLink}
      to="/add"
      data-rail="add"
      aria-label="Add a thing"
      sx={{
        mt: 1,
        mb: 1.5,
        width: 56,
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
        boxShadow: `0 0 0 2px ${CHROME.bar}, 0 3px 0 ${LIVERY.burnt}`,
        textDecoration: 'none',
        '&.Mui-focusVisible': { outline: `3px solid ${CHROME.text}`, outlineOffset: 2 },
        '& .MuiSvgIcon-root': { fontSize: 24 },
      }}
    >
      <AddIcon aria-hidden="true" />
      <Box component="span" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1 }}>
        Add
      </Box>
    </ButtonBase>
  );
}

export default function NavRail() {
  const location = useLocation();
  const { dueCount } = useAttention();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = moreOpen ? 'more' : tabFor(location.pathname);

  const items = [
    { id: 'things', label: 'Things', to: '/', icon: <ThingsIcon /> },
    { id: 'where', label: 'Where', to: '/where', icon: <WhereIcon /> },
    {
      id: 'attention',
      label: 'Attention',
      to: '/attention',
      icon: <AttentionIcon />,
      badge: dueCount > 99 ? '99+' : dueCount,
      'aria-label': dueCount ? `Needs attention, ${dueCount} due` : 'Needs attention',
    },
    {
      id: 'more',
      label: 'More',
      icon: <MoreIcon />,
      onClick: () => setMoreOpen(true),
      'aria-haspopup': 'dialog',
    },
  ];

  return (
    <>
      <ChromeTheme>
        <GeekNavRail
          items={items}
          activeId={current}
          aria-label="ThingGeek navigation"
          data-testid="nav-rail"
          header={<AddTile />}
          sx={RAIL_SX}
          itemSx={railItemSx}
          indicatorSx={{ borderRadius: '3px' }}
        />
      </ChromeTheme>
      <NavMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
