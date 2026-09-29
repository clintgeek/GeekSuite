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
 * Phone (Label Maker): no hamburger — the tab bar is the navigation. A
 * sub-page (a thing, the add screen) gets a back arrow instead. "Add a
 * thing" is a desktop action here, a safety-orange fill; the phone's Add is
 * the middle tab. Settings lives in the sidebar (desktop) or More (phone),
 * so the avatar menu keeps only the account: theme and sign out.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Box, Button, IconButton, InputAdornment, Paper, Popper, alpha, useMediaQuery, useTheme } from '@mui/material';
import { Add as AddIcon, ArrowBack as ArrowBackIcon, Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeMode } from '@geeksuite/user';
import { GeekSearchField, GeekTopBar } from '@geeksuite/ui';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { DISPLAY_FONT, MONO_FONT } from '../theme/theme';
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
      {SEARCH_EXAMPLE.map((t) => (
        <Box component="span" key={t} sx={{ ...tokenSx, mr: 0.5 }}>
          {t}
        </Box>
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
    <>
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
            : titleFor(location.pathname)
        }
        search={!isMobile && onLibrary ? field : undefined}
        themeMode={mode}
        onThemeToggle={toggleTheme}
        currentApp={APP_ID}
        actions={
          onLibrary ? (
            <Button
              variant="contained"
              color="safety"
              disableElevation
              startIcon={<AddIcon />}
              onClick={() => navigate(`/add${location.search}`)}
              sx={{ fontWeight: 700, px: 2, whiteSpace: 'nowrap', border: 1.5, borderStyle: 'solid', borderColor: 'safety.contrastText' }}
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
          backgroundColor: theme.palette.background.chrome,
          borderBottom: `1px solid ${theme.palette.border}`,
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.12)',
          color: 'text.primary',
          '& [data-geek-topbar="title"]': { fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', letterSpacing: '0.01em', lineHeight: 1.1 },
          '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"], & [data-geek-topbar="back"]': {
            color: 'text.primary',
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
          },
          // The avatar: an ink disc with card-stock initials (never orange).
          '& [data-geek-topbar="account"] .MuiAvatar-root': { bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 },
          // The search field is card stock on the kraft bar.
          '& .MuiInputBase-root': { bgcolor: 'background.paper' },
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
    </>
  );
}
