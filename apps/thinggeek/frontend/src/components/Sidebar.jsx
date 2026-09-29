/**
 * ThingGeek sidebar — identity wrapper around the suite GeekSidebar. Desktop
 * only (md+): the phone's paths are the tab bar and its More sheet.
 *
 *   Things · Needs attention (N)
 *   Inventory   Where · Types
 *   Records     Insurance report · Trash
 *   Saved views (SavedViews, as `extras`: they need a ⋯ menu)
 *   footer: user · Settings · Sign out
 *
 * The panel is kraft chrome; a selected row is a card-stock label with an
 * ink rule. Section captions are sentence case (only tape is uppercase).
 * The attention count is a safety-orange fill with dark ink — "needs
 * attention" is what orange means. axe cannot see sidebar rows (they come
 * back "incomplete"), so these pairs are asserted in
 * __tests__/theme/labelMakerContrast.test.js.
 */
import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import {
  CategoryOutlined as TypesIcon,
  DeleteOutline as TrashIcon,
  Inventory2Outlined as LibraryIcon,
  NotificationsActiveOutlined as AttentionIcon,
  PlaceOutlined as PlacesIcon,
  ReceiptLongOutlined as InsuranceIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GeekSidebar } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { GET_THING_FACETS } from '../graphql/queries';
import { DISPLAY_FONT } from '../theme/theme';
import { useAttention } from '../hooks/useThingMeta';
import { useSavedViews } from '../hooks/useSavedViews';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_NAME, NAV, activeNavId } from './navConfig';
import TagMark from './TagMark';

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <TagMark size={30} />
      <Typography
        component="span"
        noWrap
        sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.375rem', letterSpacing: '0.01em', color: 'text.primary' }}
      >
        ThingGeek
      </Typography>
    </Box>
  );
}

/** The row styling, exported for the ratchet: what a selected row paints. */
export function sidebarItemSx(theme) {
  const ink = theme.palette.text.primary;
  return {
    mb: 0.25,
    minHeight: 44,
    borderRadius: '6px',
    color: 'text.secondary',
    border: '1px solid transparent',
    '& .MuiListItemText-primary': { fontSize: '0.9375rem', fontWeight: 500 },
    '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
    '&:hover': { bgcolor: alpha(ink, 0.07), color: 'text.primary' },
    '&.Mui-selected': {
      position: 'relative',
      bgcolor: 'background.paper',
      borderColor: theme.palette.border,
      color: 'text.primary',
      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
      '& .MuiListItemIcon-root': { color: 'text.primary' },
      '& .MuiListItemText-primary': { fontWeight: 700 },
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 8,
        bottom: 8,
        width: 3,
        borderRadius: 2,
        bgcolor: ink,
      },
      '&:hover': { bgcolor: 'background.paper' },
    },
  };
}

export const badgeProps = {
  sx: { color: 'text.secondary', backgroundColor: 'background.raised', fontVariantNumeric: 'tabular-nums' },
};

/** "Needs attention" is what orange means: a fill, dark ink on it. */
export const attentionBadgeProps = {
  sx: { color: 'safety.contrastText', backgroundColor: 'safety.main', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
};

/** Sentence-case captions, on the kraft chrome. */
export const SIDEBAR_SX = {
  bgcolor: 'background.chrome',
  '& [data-geek-sidebar="section-label"]': { textTransform: 'none', letterSpacing: '0.01em', fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' },
};

export default function Sidebar({ user, onSignOut }) {
  const theme = useTheme();
  const location = useLocation();
  const { dueCount } = useAttention();
  const { data: facetData } = useQuery(GET_THING_FACETS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const total = facetData?.thingFacets?.total;
  const { views, activeView, hrefFor, remove } = useSavedViews();
  const itemSx = sidebarItemSx(theme);

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
