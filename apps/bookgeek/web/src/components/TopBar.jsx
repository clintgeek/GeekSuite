/**
 * BookGeek top bar — the old `Header.jsx`, moved inside the shell.
 *
 * `Header` was an `AppBar` rendered as a *sibling above* `GeekShell`, which is
 * why the sidebar started 60px down the page and why BookGeek had no mobile
 * hamburger to give one. This renders as `GeekShell topBar` instead, so the
 * sidebar column runs full height and `GeekTopBar` supplies the mobile
 * hamburger from the shell context.
 *
 * The brand moved to the sidebar's brand block; the left slot now carries the
 * page title. "Add book" is an app action, so it sits in `actions`, left of
 * the fixed suite cluster (theme → switcher → account) — on a phone it is the
 * `GeekFab` instead, so `mobileActions` gives that slot to search.
 *
 * Search (MOBILE_UI_PLAN.md §3.1) lives here at every size, not in the content
 * toolbar: the `search` slot on desktop, and a search icon on mobile that
 * swaps the title for a full-width field. Explicitly:
 *   - the mobile icon toggles the field open/closed; closing it (icon or Esc)
 *     keeps whatever was typed — the query stays live and shows as a chip
 *     under the toolbar;
 *   - the ✕ *inside* the field clears the query and keeps the field open.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, IconButton, InputAdornment, alpha, useMediaQuery, useTheme } from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useThemeMode } from '@geeksuite/user';
import { GeekSearchField, GeekTopBar } from '@geeksuite/ui';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { viewTitle } from './navConfig';
import { SERIF_FONT, SIGN_YELLOW } from '../theme/theme';

const TopBar = ({
  user,
  activeView,
  setActiveView,
  setAddBookOpen,
  onSignOut,
  searchQuery = '',
  setSearchQuery,
}) => {
  const theme = useTheme();
  const { theme: mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileFieldRef = useRef(null);

  // Leaving mobile with the field open would strand it in the desktop layout.
  useEffect(() => {
    if (!isMobile && searchOpen) setSearchOpen(false);
  }, [isMobile, searchOpen]);

  const searchField = (
    <GeekSearchField
      fullWidth
      placeholder="Search title / author / tag"
      // `/` (suite slash focus) lands here: the library is the app.
      slashFocus={20}
      value={searchQuery}
      onChange={(e) => setSearchQuery?.(e.target.value)}
      // `type="search"` brings WebKit's own clear glyph; ours is the one with
      // a 44px target and a label, so hide the native one.
      sx={{
        '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
        '& input[type="search"]::-webkit-search-decoration': { WebkitAppearance: 'none' }
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 18, color: 'text.muted' }} />
          </InputAdornment>
        ),
        endAdornment: searchQuery ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery?.('');
                mobileFieldRef.current?.focus();
              }}
              sx={{ minWidth: 32, minHeight: 32, p: 0.5 }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ) : null
      }}
    />
  );

  const mobileSearchOpen = isMobile && searchOpen;

  return (
    <GeekTopBar
      elevation={0}
      // Mobile, search open: the field takes the title slot and the hamburger
      // stands down so the field has room (the ✕ is the way back).
      leading={mobileSearchOpen ? null : undefined}
      title={
        mobileSearchOpen
          ? React.cloneElement(searchField, {
              autoFocus: true,
              inputRef: mobileFieldRef,
              onKeyDown: (e) => {
                // Esc closes; it does not clear. The ✕ clears.
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSearchOpen(false);
                }
              }
            })
          : viewTitle(activeView)
      }
      search={isMobile ? undefined : searchField}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp="bookgeek"
      actions={
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddBookOpen(true)}
          sx={{
            borderRadius: '6px',
            textTransform: 'none',
            fontWeight: 700,
            px: 2,
            // On the green board the action is sticker yellow with dark ink.
            bgcolor: SIGN_YELLOW.ground,
            color: SIGN_YELLOW.ink,
            boxShadow: `inset 0 -2px 0 ${SIGN_YELLOW.rim}`,
            '&:hover': { bgcolor: '#E9B82F', boxShadow: `inset 0 -2px 0 ${SIGN_YELLOW.rim}` }
          }}
        >
          Add book
        </Button>
      }
      mobileActions={
        <IconButton
          data-geek-topbar="search"
          onClick={() => setSearchOpen((prev) => !prev)}
          aria-label={mobileSearchOpen ? 'Close search' : 'Search books'}
          aria-expanded={mobileSearchOpen ? 'true' : undefined}
          sx={{ color: 'inherit' }}
        >
          {mobileSearchOpen ? <ArrowBackIcon /> : <SearchIcon />}
        </IconButton>
      }
      account={
        user
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => setActiveView("profile"),
              onSignOut
            }
          : undefined
      }
      sx={{
        // Used Bookstore: the top bar is the shop's painted signboard — green
        // board, cream serif lettering, a darker bottom edge (theme SIGN).
        backgroundColor: theme.palette.sign.board,
        backgroundImage: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.06)}, transparent 45%)`,
        borderBottom: `3px solid ${theme.palette.sign.edge}`,
        boxShadow: '0 2px 6px rgba(20, 12, 4, 0.18)',
        color: theme.palette.sign.ink,
        '& [data-geek-topbar="title"]': {
          fontFamily: SERIF_FONT,
          fontWeight: 400,
          fontSize: '1.375rem',
          letterSpacing: '0.005em',
          color: theme.palette.sign.ink,
        },
        '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"], & [data-geek-topbar="menu"], & [data-geek-topbar="search"]': {
          color: theme.palette.sign.ink,
          '&:hover': { bgcolor: alpha(theme.palette.sign.ink, 0.12) }
        },
        // The avatar: a sticker-yellow disc with dark initials, not green on green.
        '& [data-geek-topbar="account"] .MuiAvatar-root': { bgcolor: SIGN_YELLOW.ground, color: SIGN_YELLOW.ink, fontWeight: 700 },
        // The search field is a card of paper on the board.
        '& .MuiInputBase-root': { bgcolor: 'background.paper', color: 'text.primary' },
      }}
    />
  );
};

export default TopBar;
