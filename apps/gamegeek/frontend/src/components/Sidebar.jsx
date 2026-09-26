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
import { DISPLAY_FONT, DISPLAY_WEIGHT, hardShadow } from '../theme/theme';
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

/**
 * The wordmark as an arcade marquee: an ink sign with a magenta frame and a
 * hard cyan shadow, the same in both modes (a marquee is lit, not themed).
 * GAME in cream, GEEK in lime — both clear 15:1 on the ink.
 */
export function Brand({ size = 'md' }) {
  const theme = useTheme();
  const a = theme.palette.arcade;
  const big = size === 'lg';
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.875,
        minWidth: 0,
        px: 1,
        py: 0.5,
        bgcolor: a.ink,
        border: `2px solid ${a.magenta}`,
        borderRadius: '6px',
        boxShadow: hardShadow(3, a.cyan),
        transform: 'rotate(-1.5deg)',
      }}
    >
      <SavePointMark size={big ? 30 : 22} />
      <Typography
        component="span"
        noWrap
        sx={{ fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, fontSize: big ? '1.5rem' : '1.0625rem', lineHeight: 1.1, letterSpacing: '0.02em', color: a.paperInk }}
      >
        Game<Box component="span" sx={{ color: a.lime }}>Geek</Box>
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

  // The selected row is a lime sticker: ink outline, ink label, hard shadow.
  // The fill is opaque, so the label's contrast is ink on lime (17:1) in
  // either mode, never an accent on a tint.
  const a = theme.palette.arcade;
  const itemSx = {
    mb: 0.25,
    color: 'text.secondary',
    border: '2px solid transparent',
    '& .MuiListItemText-primary': { fontSize: '0.875rem', fontWeight: 500 },
    '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 20 },
    '&:hover': { bgcolor: alpha(accent, 0.1), color: 'text.primary' },
    '&.Mui-selected': {
      bgcolor: a.lime,
      color: a.ink,
      borderColor: a.ink,
      boxShadow: hardShadow(3, theme.palette.mode === 'dark' ? a.magenta : a.ink),
      '& .MuiListItemIcon-root': { color: a.ink },
      '& .MuiListItemText-primary': { fontWeight: 800 },
      '& [data-geek-sidebar="badge"]': { color: a.ink, bgcolor: 'transparent', boxShadow: `inset 0 0 0 1.5px ${a.ink}`, fontWeight: 800 },
      '&:hover': { bgcolor: a.lime },
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
