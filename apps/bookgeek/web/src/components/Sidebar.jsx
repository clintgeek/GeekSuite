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
 * `closeNav` after every item's `onClick`). A shelf row puts the list on that
 * shelf and keeps the other filters (hooks/useLibraryParams `showShelf`).
 *
 * Saved views follow directly under the shelves (`@geeksuite/collection`
 * SavedViews, as `extras`: they need a ⋯ menu the section rows have no slot
 * for). A view that matches the URL exactly takes the highlight from the
 * shelf row it might also match. Clearing filters lives with the filters
 * now (the panel's and the chips' "Clear all"), not here.
 *
 * `GeekShell nav={…}` owns the breakpoint, the drawer and the column width,
 * so there is no width, height, border or `isMobile` plumbing here.
 */
import React from 'react';
import {
  ButtonBase,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  LibraryBooks as LibraryIcon,
  MenuBook as ReadingIcon,
  TabletMacOutlined as OnReaderIcon,
  BookmarkBorder as UnreadIcon,
  CheckCircleOutline as ReadIcon,
  FavoriteBorder as WantIcon,
  DoNotDisturbAltOutlined as AbandonedIcon,
  TravelExploreOutlined as NeedToFindIcon,
  BookOutlined as ShelfIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { GeekSidebar, readableAcross, useGeekShell } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { useSavedViews } from '../hooks/useSavedViews';
import { canonicalSearch, savedViewSearch } from '../utils/libraryFilter';
import {
  LIBRARY_NAV_ID,
  activeNavId,
  shelfCount,
  shelfNavId
} from './navConfig';

/** One glyph per built-in shelf in hooks/useProfile.js's `BUILT_IN_SHELVES`; custom shelves fall back to `ShelfIcon`. */
const SHELF_ICONS = {
  reading: <ReadingIcon />,
  'on-reader': <OnReaderIcon />,
  unread: <UnreadIcon />,
  read: <ReadIcon />,
  'want-to-read': <WantIcon />,
  abandoned: <AbandonedIcon />,
  'need-to-find': <NeedToFindIcon />,
};

/**
 * Brand block — BookGeek's identity, so it is passed as a node rather than the
 * primitive's `{ monogram, name }` object: the DM Serif Display wordmark with
 * no monogram chip is the app's mark. "Home" is a `setActiveView` click (the
 * URL-backed `showShelf` from hooks/useLibraryParams), and the caller closes the mobile drawer by hand (the
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
  showShelf,
  shelfSummary,
  activeView,
}) => {
  const theme = useTheme();
  const location = useLocation();
  const { closeNav } = useGeekShell();
  const { views, error: viewsError, remove } = useSavedViews();
  const accent = theme.palette.primary.main;
  // The selected row's label is the accent on an accent tint over the panel's
  // paper, at rest (12%) and hovered (18%). sky-600 read 3.52:1 there in light
  // mode (2026-09-25; axe files sidebar rows as "incomplete", so no gate saw
  // it). Walk the ink until it clears both tints.
  const paper = [theme.palette.background.paper];
  const selectedInk = readableAcross(
    readableAcross(accent, paper, { tint: alpha(accent, 0.12) }),
    paper,
    { tint: alpha(accent, 0.18) }
  );

  // The library (or a sheet over it) showing exactly a saved view lights it.
  const here = activeView === "library" ? canonicalSearch(location.search) : null;
  const activeSavedView = here != null ? views.find((v) => canonicalSearch(savedViewSearch(v)) === here) : null;

  const showLibraryAndClose = (shelfId) => {
    showShelf(shelfId);
    closeNav();
  };

  // "All books" is not repeated as a shelf row: the Library row *is* the
  // unfiltered library, so picking it clears the shelf filter.
  const shelfItems = shelves
    .filter((shelf) => shelf.id !== "all")
    .map((shelf) => ({
      id: shelfNavId(shelf.id),
      label: shelf.label,
      icon: SHELF_ICONS[shelf.id] ?? <ShelfIcon />,
      badge: shelfCount(shelfSummary, shelf.id),
      onClick: () => showShelf(shelf.id)
    }));

  const sections = [
    {
      items: [
        {
          id: LIBRARY_NAV_ID,
          label: "Library",
          icon: <LibraryIcon />,
          badge: shelfCount(shelfSummary, "all"),
          onClick: () => showShelf("all")
        }
      ]
    },
    { label: "Shelves", items: shelfItems }
  ];

  const itemSx = {
    mb: 0.25,
    color: 'text.secondary',
    '& .MuiListItemText-primary': { fontSize: '0.8125rem', fontWeight: 400 },
    '&:hover': {
      bgcolor: alpha(accent, 0.08),
      color: 'text.primary'
    },
    '&.Mui-selected': {
      bgcolor: alpha(accent, 0.12),
      color: selectedInk,
      '& .MuiListItemText-primary': { fontWeight: 600 },
      '&:hover': { bgcolor: alpha(accent, 0.18) }
    }
  };

  const extras = views.length || viewsError ? (
    <>
      <SavedViews
        views={views}
        activeId={activeSavedView?.id ?? null}
        hrefFor={(view) => `/${ savedViewSearch(view) }`}
        onDelete={remove}
        itemSx={itemSx}
      />
      {viewsError ? (
        <Typography role="status" sx={{ px: 1.5, pt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
          Saved views did not load.
        </Typography>
      ) : null}
    </>
  ) : null;

  return (
    <GeekSidebar
      brand={<Brand onHome={() => showLibraryAndClose("all")} />}
      sections={sections}
      activeId={activeSavedView ? `view:${ activeSavedView.id }` : activeNavId({ activeView, shelfFilter })}
      // Filters sit directly under the shelf list (extras grows, sections don't),
      // and there is no sidebar footer: the header avatar menu is the single
      // account entry in BookGeek, so a footer chip would duplicate it.
      extras={extras}
      extrasGrow
      sx={{ bgcolor: 'background.paper' }}
      itemSx={itemSx}
    />
  );
};

export default Sidebar;
