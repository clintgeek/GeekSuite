/**
 * ThingGeek top bar, rendered as GeekShell's `topBar`.
 *
 * Search lives here on the library at every size (the desktop `search` slot;
 * a toggle on a phone that swaps the title for a full-width field). Typing
 * is debounced into the URL's `q`, and the SERVER parses q's tokens
 * (`type:boat in:garage missing:receipt`), so the box teaches the grammar: on
 * focus a small helper under the field shows a worked example.
 *
 * `/` (suite slash focus) lands in the library search — priority 20.
 *
 * Phone: no hamburger — the tab bar is the navigation. A sub-page (a
 * thing, the add screen) gets a back arrow instead. "Add a thing" is a
 * desktop action here, a yard-orange fill with black lettering; the
 * phone's Add is the middle tab. Settings lives in the sidebar (desktop) or
 * More (phone), so the avatar menu keeps only the account: theme and sign out.
 *
 * Storage Yard: the bar is a rental truck's black flank in both modes (it
 * renders under the chrome theme), the page title in leaning slab lettering,
 * and the orange livery stripe along its bottom edge.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Box, Button, IconButton, InputAdornment, Paper, Popper, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Close as CloseIcon, Add as AddIcon, Search as SearchIcon } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeMode } from '@geeksuite/user';
import { GeekSearchField, GeekTopBar } from '@geeksuite/ui';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { CHROME, DISPLAY_FONT, LIVERY, LIVERY_BAND_PX, MONO_FONT, liveryBand } from '../theme/theme';
import ChromeTheme from './Chrome';
import { goBack } from '../utils/goBack';
import { writeLibraryState } from '../utils/libraryFilter';
import { visuallyHidden } from '../utils/a11y';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_ID, isBackPath, isLibraryPath, titleFor } from './navConfig';

export const SEARCH_EXAMPLE = ['type:boat', 'tag:fishing', 'in:garage', 'missing:receipt'];
export const SEARCH_MORE = ['before:2020', 'due:30d', 'has:document'];

const tokenSx = {
  fontFamily: MONO_FONT,
  fontSize: '0.75rem',
  color: 'text.primary',
  bgcolor: 'background.raised',
  border: 1,
  borderColor: 'divider',
  borderRadius: '4px',
  px: 0.5,
  py: '1px',
  whiteSpace: 'nowrap',
};

/** The grammar helper: visual only (the same words are the field's description). */
export function SearchHint({ sx }) {
  return (
    <Box aria-hidden="true" data-testid="search-hint" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.9, ...sx }}>
      <Box component="span" sx={{ mr: 0.75, fontWeight: 600, color: 'text.primary' }}>
        Try
      </Box>
      {/* A space after each token: a line-break opportunity, so a 320px phone wraps them. */}
      {SEARCH_EXAMPLE.map((t) => (
        <React.Fragment key={t}>
          <Box component="span" sx={tokenSx}>
            {t}
          </Box>{' '}
        </React.Fragment>
      ))}
      <Box component="span" sx={{ display: 'block' }}>
        Also {SEARCH_MORE.map((t, i) => (
          <React.Fragment key={t}>
            {i ? ' · ' : ''}
            <Box component="span" sx={tokenSx}>
              {t}
            </Box>
          </React.Fragment>
        ))}
        , or just type a name.
      </Box>
    </Box>
  );
}

export default function TopBar({ user, onSignOut }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { theme: mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const onLibrary = isLibraryPath(location.pathname);
  const onSubPage = isBackPath(location.pathname);
  const hintId = useId();

  const urlQ = params.get('q') || '';
  const [text, setText] = useState(urlQ);
  const [searchOpen, setSearchOpen] = useState(Boolean(urlQ));
  const [focused, setFocused] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const fieldRef = useRef(null);
  const lastWritten = useRef(urlQ);

  // The URL can change under us (a chip cleared, a sidebar link): follow it.
  useEffect(() => {
    if (urlQ !== lastWritten.current) {
      lastWritten.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    if (!isMobile && searchOpen && !text) setSearchOpen(false);
  }, [isMobile, searchOpen, text]);

  const pushQuery = useDebouncedCallback((value) => {
    lastWritten.current = value.trim() ? value : '';
    setParams((prev) => writeLibraryState(prev, { q: value }), { replace: true });
  }, 300);

  const onChange = (value) => {
    setText(value);
    pushQuery(value);
  };

  const clear = () => {
    setText('');
    pushQuery('');
    pushQuery.flush();
    fieldRef.current?.focus();
  };

  const field = (
    <GeekSearchField
      fullWidth
      placeholder="Search your things"
      slashFocus={20}
      value={text}
      inputRef={fieldRef}
      ref={setAnchor}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      inputProps={{ 'aria-label': 'Search your things', 'aria-describedby': hintId }}
      sx={{ '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </InputAdornment>
        ),
        endAdornment: text ? (
          <InputAdornment position="end">
            <IconButton aria-label="Clear search" onClick={clear} sx={{ minWidth: 44, minHeight: 44, mr: -1 }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );

  const mobileSearch = isMobile && onLibrary && searchOpen;
  const hintOpen = onLibrary && focused && Boolean(anchor) && (!isMobile || mobileSearch);

  return (
    <ChromeTheme>
      <GeekTopBar
        elevation={0}
        leading={
          !isMobile ? undefined : onSubPage && !mobileSearch ? (
            <IconButton data-geek-topbar="back" aria-label="Back" edge="start" onClick={() => goBack(navigate, location)} sx={{ color: 'inherit' }}>
              <ArrowBackIcon />
            </IconButton>
          ) : null
        }
        title={
          mobileSearch
            ? React.cloneElement(field, {
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setSearchOpen(false);
                  }
                },
              })
            : (
                // The page's name in fleet lettering: heavy slab, leaning.
                <Typography variant="h3" noWrap data-geek-topbar="title" sx={{ minWidth: 0 }}>
                  {titleFor(location.pathname)}
                </Typography>
              )
        }
        search={!isMobile && onLibrary ? field : undefined}
        themeMode={mode}
        onThemeToggle={toggleTheme}
        currentApp={APP_ID}
        actions={
          onLibrary ? (
            <Button
              variant="contained"
              color="hero"
              disableElevation
              startIcon={<AddIcon />}
              onClick={() => navigate(`/add${location.search}`)}
              sx={{ fontWeight: 800, px: 2, whiteSpace: 'nowrap', border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText', boxShadow: `0 0 0 2px ${LIVERY.orange}` }}
            >
              Add a thing
            </Button>
          ) : null
        }
        mobileActions={
          onLibrary ? (
            <IconButton
              data-geek-topbar="search"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={mobileSearch ? 'Close search' : 'Search things'}
              aria-expanded={mobileSearch ? 'true' : 'false'}
              sx={{ color: 'inherit' }}
            >
              {mobileSearch ? <ArrowBackIcon /> : <SearchIcon />}
            </IconButton>
          ) : null
        }
        account={
          user
            ? {
                name: displayNameFrom(user),
                secondary: secondaryFrom(user),
                initials: initialsFrom(user),
                onSignOut,
              }
            : undefined
        }
        sx={{
          backgroundColor: CHROME.bar,
          borderBottom: 0,
          // The livery stripe along the bottom edge of the truck's flank.
          backgroundImage: liveryBand('bottom'),
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'left bottom',
          backgroundSize: `100% ${LIVERY_BAND_PX}px`,
          pb: `${LIVERY_BAND_PX - 4}px`,
          color: CHROME.text,
          '& [data-geek-topbar="title"]': { fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 700, fontSize: '1.625rem', letterSpacing: '-0.005em', lineHeight: 1.15, color: CHROME.text },
          '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"], & [data-geek-topbar="back"], & [data-geek-topbar="search"]': {
            color: CHROME.text,
            '&:hover': { bgcolor: alpha(CHROME.text, 0.1) },
          },
          // The avatar: an orange disc with black initials — the livery.
          '& [data-geek-topbar="account"] .MuiAvatar-root': { bgcolor: LIVERY.orange, color: LIVERY.ink, fontWeight: 800 },
          '& .MuiInputBase-root': { bgcolor: CHROME.raised },
        }}
      />
      {onLibrary ? (
        <Box component="span" id={hintId} sx={visuallyHidden}>
          Search names, notes, tags and details. You can narrow with words like {SEARCH_EXAMPLE.join(' ')}, {SEARCH_MORE.join(' ')}.
        </Box>
      ) : null}
      <Popper
        open={hintOpen}
        aria-label="Search tips"
        anchorEl={anchor}
        placement="bottom-start"
        style={{ zIndex: theme.zIndex.appBar + 1, width: anchor?.offsetWidth }}
        modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
      >
        <Paper sx={{ px: 1.5, py: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}>
          <SearchHint />
        </Paper>
      </Popper>
    </ChromeTheme>
  );
}
