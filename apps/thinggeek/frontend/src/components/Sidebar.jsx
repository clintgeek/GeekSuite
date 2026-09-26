/**
 * ThingGeek sidebar — identity wrapper around the suite GeekSidebar.
 *
 *   Library · Needs attention (N)
 *   INVENTORY   Places · Types
 *   RECORDS     Insurance report · Trash
 *   Saved views (SavedViews, as `extras`: they need a ⋯ menu)
 *   footer: user · Settings · Sign out
 *
 * The shell owns the breakpoint: a permanent rail at md+, the drawer below.
 * The panel is the paper surface (a palette surface in both modes), so its
 * text stays on the text tokens — no always-dark chrome to own inks for.
 * axe cannot see sidebar rows (they come back "incomplete"), so the badge and
 * selected-row pairs are asserted in __tests__/utils/themeContrast.test.js.
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
import { useMutation, useQuery } from '@apollo/client';
import { GeekSidebar } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { DELETE_THING_FILTER } from '../graphql/mutations';
import { GET_THING_FACETS } from '../graphql/queries';
import { DISPLAY_FONT } from '../theme/theme';
import { useAttention, useThingProfile } from '../hooks/useThingMeta';
import { canonicalSearch, savedViewSearch } from '../utils/libraryFilter';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_NAME, NAV, activeNavId, isLibraryPath } from './navConfig';
import TagMark from './TagMark';

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <TagMark size={28} />
      <Typography
        component="span"
        noWrap
        sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'text.primary' }}
      >
        Thing<Box component="span" sx={{ color: 'primary.main' }}>Geek</Box>
      </Typography>
    </Box>
  );
}

/** The row styling, exported for the ratchet: what a selected row paints. */
export function sidebarItemSx(theme) {
  const accent = theme.palette.primary.main;
  return {
    mb: 0.25,
    color: 'text.secondary',
    '& .MuiListItemText-primary': { fontSize: '0.875rem', fontWeight: 500 },
    '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
    '&:hover': { bgcolor: alpha(accent, 0.08), color: 'text.primary' },
    '&.Mui-selected': {
      position: 'relative',
      bgcolor: alpha(accent, 0.12),
      color: 'text.primary',
      '& .MuiListItemIcon-root': { color: accent },
      '& .MuiListItemText-primary': { fontWeight: 700 },
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: 2,
        bgcolor: theme.palette.brass ?? accent,
      },
      '&:hover': { bgcolor: alpha(accent, 0.16) },
    },
  };
}

export const badgeProps = {
  sx: { color: 'text.secondary', backgroundColor: 'background.raised', fontVariantNumeric: 'tabular-nums' },
};

export default function Sidebar({ user, onSignOut }) {
  const theme = useTheme();
  const location = useLocation();
  const { profile } = useThingProfile();
  const { dueCount } = useAttention();
  const { data: facetData } = useQuery(GET_THING_FACETS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const total = facetData?.thingFacets?.total;
  const views = profile?.savedFilters ?? [];
  const here = isLibraryPath(location.pathname) ? canonicalSearch(location.search) : null;
  const activeView = here ? views.find((v) => canonicalSearch(savedViewSearch(v)) === here) : null;
  const [removeView] = useMutation(DELETE_THING_FILTER);
  const itemSx = sidebarItemSx(theme);

  const sections = [
    {
      items: [
        { id: NAV.library, label: 'Library', icon: <LibraryIcon />, badge: total, badgeProps, to: '/' },
        { id: NAV.attention, label: 'Needs attention', icon: <AttentionIcon />, badge: dueCount, badgeProps, to: '/attention' },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { id: NAV.places, label: 'Places', icon: <PlacesIcon />, to: '/places' },
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

  // A saved view that matches the URL exactly takes the highlight from Library.
  const activeId = activeView ? `view:${activeView.id}` : activeNavId(location.pathname);

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={sections}
      activeId={activeId}
      extras={
        views.length ? (
          <SavedViews
            views={views}
            activeId={activeView?.id ?? null}
            hrefFor={(view) => `/${savedViewSearch(view)}`}
            onDelete={(view) => removeView({ variables: { id: view.id } })}
            itemSx={itemSx}
          />
        ) : undefined
      }
      footer={{
        user: user ? { name: displayNameFrom(user), secondary: secondaryFrom(user), initials: initialsFrom(user) } : undefined,
        settings: { to: '/settings' },
        onSignOut,
      }}
      aria-label={`${APP_NAME} navigation`}
      sx={{ bgcolor: 'background.paper' }}
      itemSx={itemSx}
    />
  );
}
