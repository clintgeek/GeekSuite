/**
 * BookGeek sidebar — identity wrapper around the suite `GeekSidebar`.
 *
 * Before the shell-grammar migration this file was a bare filter panel: no
 * brand, no nav, no footer, a hardcoded 220px width and `height: 100vh` that
 * overflowed its 60px-offset container. Structure (brand → nav → extras →
 * user chip → Settings → Sign out) now belongs to the primitive; this file
 * supplies BookGeek's identity and its two domain lists.
 *
 * Shelves are the app's real navigation, so they are `sections` rows with
 * count badges rather than an `extras` widget — they get the scrollable body
 * and, on mobile, the drawer closes when one is picked (the primitive calls
 * `closeNav` after every item's `onClick`). Saved filters and "clear filters"
 * are controls, not destinations, so they stay in `extras`.
 *
 * `GeekShell nav={…}` owns the breakpoint, the drawer and the column width,
 * so there is no width, height, border or `isMobile` plumbing here.
 */
import React from 'react';
import {
  Box,
  Button,
  ButtonBase,
  IconButton,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  LibraryBooks as LibraryIcon,
  MenuBook as ReadingIcon,
  BookmarkBorder as UnreadIcon,
  CheckCircleOutline as ReadIcon,
  FavoriteBorder as WantIcon,
  DoNotDisturbAltOutlined as AbandonedIcon,
  TravelExploreOutlined as NeedToFindIcon,
  BookOutlined as ShelfIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { GeekSidebar, useGeekShell } from '@geeksuite/ui';
import {
  LIBRARY_NAV_ID,
  activeNavId,
  shelfCount,
  shelfNavId
} from './navConfig';

/** One glyph per shelf in `App.jsx`'s `shelves`, so rows align with the footer. */
const SHELF_ICONS = {
  reading: <ReadingIcon />,
  unread: <UnreadIcon />,
  read: <ReadIcon />,
  'want-to-read': <WantIcon />,
  abandoned: <AbandonedIcon />,
  'need-to-find': <NeedToFindIcon />,
};

/**
 * Brand block — BookGeek's identity, so it is passed as a node rather than the
 * primitive's `{ monogram, name }` object: the DM Serif Display wordmark with
 * no monogram chip is the app's mark. There is no router, so "home" is a
 * `setActiveView` click, and the caller closes the mobile drawer by hand (the
 * primitive only auto-closes for `to`/`href` brands and for `onClick` rows).
 */
const Brand = ({ onHome }) => {
  return (
    <ButtonBase
      onClick={onHome}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.5,
        width: '100%',
        height: '100%',
        color: 'inherit',
        textAlign: 'left'
      }}
    >
      <Typography
        variant="h6"
        noWrap
        sx={{
          fontWeight: 400,
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: '1.25rem',
          letterSpacing: '-0.02em'
        }}
      >
        BookGeek
      </Typography>
    </ButtonBase>
  );
};

const Sidebar = ({
  shelves,
  shelfFilter,
  setShelfFilter,
  shelfSummary,
  activeView,
  setActiveView,
  searchQuery,
  setSearchQuery,
  authorFilter,
  setAuthorFilter,
  tagFilter,
  setTagFilter,
  savedFilters,
  savedFiltersError,
  applySavedFilter,
  handleDeleteSavedFilter,
  deleteFilterLoadingId
}) => {
  const theme = useTheme();
  const { closeNav } = useGeekShell();
  const accent = theme.palette.primary.main;

  const showLibrary = (shelfId) => {
    setShelfFilter(shelfId);
    setActiveView("library");
  };

  // The primitive closes the mobile drawer after every `sections` / footer
  // click, but `extras` and the brand node are ours, so they close it here.
  const showLibraryAndClose = (shelfId) => {
    showLibrary(shelfId);
    closeNav();
  };

  const hasAnyFilter = Boolean(
    searchQuery.trim() ||
    authorFilter.trim() ||
    tagFilter.trim() ||
    shelfFilter !== "all"
  );

  // "All books" is not repeated as a shelf row: the Library row *is* the
  // unfiltered library, so picking it clears the shelf filter.
  const shelfItems = shelves
    .filter((shelf) => shelf.id !== "all")
    .map((shelf) => ({
      id: shelfNavId(shelf.id),
      label: shelf.label,
      icon: SHELF_ICONS[shelf.id] ?? <ShelfIcon />,
      badge: shelfCount(shelfSummary, shelf.id),
      onClick: () => showLibrary(shelf.id)
    }));

  const sections = [
    {
      items: [
        {
          id: LIBRARY_NAV_ID,
          label: "Library",
          icon: <LibraryIcon />,
          badge: shelfCount(shelfSummary, "all"),
          onClick: () => showLibrary("all")
        }
      ]
    },
    { label: "Shelves", items: shelfItems }
  ];

  const extras = (hasAnyFilter || savedFilters.length > 0 || savedFiltersError) ? (
    <Box sx={{ maxHeight: 220, overflowY: 'auto' }}>
      {hasAnyFilter && (
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          size="small"
          onClick={() => {
            setSearchQuery("");
            setAuthorFilter("");
            setTagFilter("");
            setShelfFilter("all");
            closeNav();
          }}
          sx={{ mb: savedFilters.length > 0 ? 2 : 0, fontSize: '0.6875rem', py: 0.5 }}
        >
          Clear all filters
        </Button>
      )}

      {savedFilters.length > 0 && (
        <>
          <Typography
            variant="overline"
            sx={{ mb: 1, color: 'text.secondary', fontWeight: 700, display: 'block' }}
          >
            Saved Filters
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {savedFilters.map((preset) => (
              <Box key={preset.id} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Button
                  fullWidth
                  variant="contained"
                  sx={{
                    justifyContent: 'flex-start',
                    fontSize: '0.6875rem',
                    bgcolor: alpha(theme.palette.divider, 0.05),
                    color: 'text.primary',
                    border: `1px solid ${theme.palette.divider}`,
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.divider, 0.1),
                      boxShadow: 'none'
                    }
                  }}
                  size="small"
                  onClick={() => {
                    applySavedFilter(preset);
                    closeNav();
                  }}
                >
                  <Box
                    component="span"
                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {preset.name || "(unnamed)"}
                  </Box>
                </Button>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteSavedFilter(preset.id)}
                  disabled={deleteFilterLoadingId === preset.id}
                  aria-label={`Delete saved filter ${ preset.name || "(unnamed)" }`}
                  sx={{ p: 0.5, '&:hover': { color: 'error.main' } }}
                >
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </>
      )}

      {savedFiltersError && (
        <Typography variant="caption" color="error" sx={{ mt: 1, fontSize: '0.625rem' }}>
          {savedFiltersError}
        </Typography>
      )}
    </Box>
  ) : null;

  return (
    <GeekSidebar
      brand={<Brand onHome={() => showLibraryAndClose("all")} />}
      sections={sections}
      activeId={activeNavId({ activeView, shelfFilter })}
      // Filters sit directly under the shelf list (extras grows, sections don't),
      // and there is no sidebar footer: the header avatar menu is the single
      // account entry in BookGeek, so a footer chip would duplicate it.
      extras={extras}
      extrasGrow
      sx={{ bgcolor: 'background.paper' }}
      itemSx={{
        mb: 0.25,
        color: 'text.secondary',
        '& .MuiListItemText-primary': { fontSize: '0.8125rem', fontWeight: 400 },
        '&:hover': {
          bgcolor: alpha(accent, 0.08),
          color: 'text.primary'
        },
        '&.Mui-selected': {
          bgcolor: alpha(accent, 0.12),
          color: 'primary.main',
          '& .MuiListItemText-primary': { fontWeight: 600 },
          '&:hover': { bgcolor: alpha(accent, 0.18) }
        }
      }}
    />
  );
};

export default Sidebar;
