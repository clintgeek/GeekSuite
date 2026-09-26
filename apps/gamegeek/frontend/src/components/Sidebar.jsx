/**
 * GameGeek sidebar — identity wrapper around the suite GeekSidebar.
 *
 * Shelves are the app's navigation, so they are `sections` rows with count
 * badges (links to `/?shelf=…`, which the library reads). Saved views follow
 * directly under them (SavedViews, as `extras`: they need a ⋯ menu the
 * section rows have no slot for). A view that matches the URL exactly takes
 * the highlight from the shelf row it might also match. The shell owns the
 * breakpoint: a permanent rail at md+, the drawer below it. The footer gives
 * the drawer its Settings and Sign out.
 */
import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import {
  BookmarkBorder as BacklogIcon,
  CheckCircleOutline as FinishedIcon,
  CollectionsBookmarkOutlined as CustomIcon,
  DoNotDisturbAltOutlined as AbandonedIcon,
  FavoriteBorder as WishlistIcon,
  HelpOutline as UnshelvedIcon,
  PauseCircleOutline as OnHoldIcon,
  PlayCircleOutline as PlayingIcon,
  SportsEsportsOutlined as AllIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { GeekSidebar } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { DELETE_GAME_FILTER } from '../graphql/mutations';
import { DISPLAY_FONT } from '../theme/theme';
import { shelfCount, useGameProfile } from '../hooks/useGameMeta';
import { canonicalSearch, savedViewSearch } from '../utils/libraryFilter';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_NAME, LIBRARY_NAV_ID, activeNavId, isLibraryPath, shelfNavId } from './navConfig';
import SavePointMark from './SavePointMark';

const SHELF_ICONS = {
  playing: <PlayingIcon />,
  backlog: <BacklogIcon />,
  finished: <FinishedIcon />,
  'on-hold': <OnHoldIcon />,
  abandoned: <AbandonedIcon />,
  wishlist: <WishlistIcon />,
  unshelved: <UnshelvedIcon />,
};

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <SavePointMark size={26} />
      <Typography
        component="span"
        noWrap
        sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'text.primary' }}
      >
        Game<Box component="span" sx={{ color: 'primary.main' }}>Geek</Box>
      </Typography>
    </Box>
  );
}

export default function Sidebar({ user, shelves, stats, onSignOut }) {
  const theme = useTheme();
  const location = useLocation();
  const { profile } = useGameProfile();
  const accent = theme.palette.primary.main;
  const views = profile?.savedFilters ?? [];
  const here = isLibraryPath(location.pathname) ? canonicalSearch(location.search) : null;
  const activeView = here ? views.find((v) => canonicalSearch(savedViewSearch(v)) === here) : null;
  const [removeView] = useMutation(DELETE_GAME_FILTER);

  const badgeProps = {
    sx: { color: 'text.secondary', backgroundColor: 'background.raised', fontVariantNumeric: 'tabular-nums' },
  };

  const shelfItems = shelves.map((shelf) => ({
    id: shelfNavId(shelf.id),
    label: shelf.label,
    icon: SHELF_ICONS[shelf.id] ?? <CustomIcon />,
    badge: shelfCount(stats, shelf.id),
    badgeProps,
    to: `/?shelf=${encodeURIComponent(shelf.id)}`,
  }));

  if ((stats?.unshelved ?? 0) > 0) {
    shelfItems.push({
      id: shelfNavId('unshelved'),
      label: 'Unshelved',
      icon: SHELF_ICONS.unshelved,
      badge: stats.unshelved,
      badgeProps,
      to: '/?shelf=unshelved',
    });
  }

  const itemSx = {
    mb: 0.25,
    color: 'text.secondary',
    '& .MuiListItemText-primary': { fontSize: '0.875rem', fontWeight: 500 },
    '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
    '&:hover': { bgcolor: alpha(accent, 0.08), color: 'text.primary' },
    '&.Mui-selected': {
      position: 'relative',
      bgcolor: alpha(accent, 0.12),
      color: 'text.primary',
      '& .MuiListItemIcon-root': { color: theme.palette.mode === 'dark' ? accent : theme.palette.primary.main },
      '& .MuiListItemText-primary': { fontWeight: 600 },
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: 2,
        bgcolor: theme.palette.phosphor?.main ?? accent,
      },
      '&:hover': { bgcolor: alpha(accent, 0.18) },
    },
  };

  const sections = [
    {
      items: [
        { id: LIBRARY_NAV_ID, label: 'All games', icon: <AllIcon />, badge: shelfCount(stats, 'all'), badgeProps, to: '/' },
      ],
    },
    { label: 'Shelves', items: shelfItems },
  ];

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={sections}
      activeId={activeView ? `view:${activeView.id}` : activeNavId(location.pathname, location.search)}
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
        user: user
          ? { name: displayNameFrom(user), secondary: secondaryFrom(user), initials: initialsFrom(user) }
          : undefined,
        settings: { to: '/settings' },
        onSignOut,
      }}
      aria-label={`${APP_NAME} navigation`}
      sx={{ bgcolor: 'background.paper' }}
      itemSx={itemSx}
    />
  );
}
