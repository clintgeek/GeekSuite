/**
 * ThingGeek sidebar — identity wrapper around the suite GeekSidebar. Desktop
 * only (md+): the phone's paths are the tab bar and its More sheet.
 *
 *   Things · Needs attention (N)
 *   Inventory   Where · Types
 *   Records     Insurance report · The Attic (family documents, locked) · Trash
 *   Saved views (SavedViews, as `extras`: they need a ⋯ menu)
 *   footer: user · Settings · Sign out
 *
 * Storage Yard: the panel is a rental truck's black flank (it renders under the
 * chrome theme in both modes); a selected row is lit — a raised panel with an
 * orange rule. Section captions are sentence case (stencil is for yard
 * stencils only). The attention count is an orange fill with black ink.
 * axe cannot see sidebar rows (they come back "incomplete"), so these pairs
 * are asserted in __tests__/theme/storageYardContrast.test.js.
 */
import React from 'react';
import { Box, Typography, alpha } from '@mui/material';
import {
  CategoryOutlined as TypesIcon,
  DeleteOutline as TrashIcon,
  LockOutlined as AtticIcon,
  Inventory2Outlined as LibraryIcon,
  ReceiptLongOutlined as InsuranceIcon,
  SpeedOutlined as AttentionIcon,
  WarehouseOutlined as PlacesIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GeekSidebar } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { GET_THING_FACETS } from '../graphql/queries';
import { CHROME, DISPLAY_FONT, LIVERY } from '../theme/theme';
import ChromeTheme from './Chrome';
import { useAttention } from '../hooks/useThingMeta';
import { useSavedViews } from '../hooks/useSavedViews';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_NAME, NAV, activeNavId } from './navConfig';
import BoxMark from './BoxMark';

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <BoxMark size={32} />
      <Typography
        component="span"
        noWrap
        sx={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.005em', color: CHROME.text }}
      >
        ThingGeek
      </Typography>
    </Box>
  );
}

/** The row styling, exported for the ratchet: what a selected row paints. */
export function sidebarItemSx() {
  return {
    mb: 0.25,
    minHeight: 44,
    borderRadius: '3px',
    color: CHROME.secondary,
    border: '1px solid transparent',
    '& .MuiListItemText-primary': { fontSize: '0.9375rem', fontWeight: 600 },
    '& .MuiListItemIcon-root': { color: 'inherit' },
    '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
    '&:hover': { bgcolor: alpha(CHROME.text, 0.08), color: CHROME.text },
    '&.Mui-selected': {
      position: 'relative',
      bgcolor: CHROME.raised,
      borderColor: CHROME.border,
      color: CHROME.text,
      '& .MuiListItemIcon-root': { color: LIVERY.orange },
      '& .MuiListItemText-primary': { fontWeight: 800 },
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 6,
        bottom: 6,
        width: 4,
        bgcolor: LIVERY.orange,
      },
      '&:hover': { bgcolor: CHROME.raised },
    },
  };
}

export const badgeProps = {
  sx: { color: CHROME.secondary, backgroundColor: CHROME.raised, fontVariantNumeric: 'tabular-nums' },
};

/** The attention count: an orange fill, black ink on it. */
export const attentionBadgeProps = {
  sx: { color: LIVERY.ink, backgroundColor: LIVERY.orange, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
};

/** Sentence-case captions, on the black flank. */
export const SIDEBAR_SX = {
  bgcolor: CHROME.bar,
  color: CHROME.text,
  borderRight: `4px solid ${LIVERY.orange}`,
  '& [data-geek-sidebar="section-label"]': { textTransform: 'none', letterSpacing: '0.01em', fontSize: '0.8125rem', fontWeight: 700, color: CHROME.secondary },
};

export default function Sidebar(props) {
  return (
    <ChromeTheme>
      <SidebarInner {...props} />
    </ChromeTheme>
  );
}

function SidebarInner({ user, onSignOut }) {
  const location = useLocation();
  const { dueCount } = useAttention();
  const { data: facetData } = useQuery(GET_THING_FACETS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const total = facetData?.thingFacets?.total;
  const { views, activeView, hrefFor, remove } = useSavedViews();
  const itemSx = sidebarItemSx();

  const sections = [
    {
      items: [
        { id: NAV.library, label: 'Things', icon: <LibraryIcon />, badge: total, badgeProps, to: '/' },
        { id: NAV.attention, label: 'Needs attention', icon: <AttentionIcon />, badge: dueCount, badgeProps: attentionBadgeProps, to: '/attention' },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { id: NAV.where, label: 'Where', icon: <PlacesIcon />, to: '/where' },
        { id: NAV.types, label: 'Types', icon: <TypesIcon />, to: '/types' },
      ],
    },
    {
      label: 'Records',
      items: [
        { id: NAV.insurance, label: 'Insurance report', icon: <InsuranceIcon />, to: '/insurance' },
        { id: NAV.attic, label: 'The Attic', icon: <AtticIcon />, to: '/attic' },
        { id: NAV.trash, label: 'Trash', icon: <TrashIcon />, to: '/trash' },
      ],
    },
  ];

  // A saved view that matches the URL exactly takes the highlight from Things.
  const activeId = activeView ? `view:${activeView.id}` : activeNavId(location.pathname);

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={sections}
      activeId={activeId}
      extras={
        views.length ? (
          <SavedViews views={views} activeId={activeView?.id ?? null} hrefFor={hrefFor} onDelete={remove} itemSx={itemSx} />
        ) : undefined
      }
      footer={{
        user: user ? { name: displayNameFrom(user), secondary: secondaryFrom(user), initials: initialsFrom(user) } : undefined,
        settings: { to: '/settings' },
        onSignOut,
      }}
      aria-label={`${APP_NAME} navigation`}
      sx={SIDEBAR_SX}
      itemSx={itemSx}
    />
  );
}
