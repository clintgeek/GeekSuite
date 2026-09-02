/**
 * GeekShell — the suite layout engine.
 *
 * Two modes, and the old one is untouched:
 *
 *   Legacy (`sidebar`): the app hands over already-responsive elements and owns
 *   its own drawer state and breakpoint. Every app shipped today does this.
 *
 *   Grammar (`nav`): the app hands over sidebar *content* (normally
 *   `<GeekSidebar />`) and the shell owns the breakpoint and the drawer — a
 *   permanent 220px column at `md`+ and a temporary 220px drawer below it. The
 *   state is published through `useGeekShell()`, so `GeekTopBar`'s hamburger
 *   and `GeekSidebar`'s close-on-navigate work with no wiring in the app.
 *
 * `nav` and `sidebar` can coexist during a migration; `nav` is rendered after
 * `sidebar`, so pass one or the other in practice.
 */
import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { geekLayout } from '../designTokens.js';
import { useFocusMode } from '../focus/index.js';
import { GeekShellContext } from './shellContext.js';

export function GeekShell({
  // Legacy: fully-formed, app-managed chrome.
  sidebar,
  // Grammar: sidebar *content*; the shell decides permanent vs. drawer.
  nav,
  navWidth = geekLayout.sidebarWidth,
  navSx,
  topBar,
  // Optional mobile tab bar (data-entry apps only). Pass it conditionally —
  // its presence is what sets `bottomInset` for GeekAppFrame.
  bottomNav,
  children,
  focusMode: focusModeOverride,
  sx,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const [mobileOpen, setMobileOpen] = useState(false);

  const openNav = useCallback(() => setMobileOpen(true), []);
  const closeNav = useCallback(() => setMobileOpen(false), []);
  const toggleNav = useCallback(() => setMobileOpen((open) => !open), []);

  const { focusMode: contextFocusMode } = useFocusMode();
  const focusMode = focusModeOverride ?? contextFocusMode;

  const hasNav = Boolean(nav);
  const showNav = hasNav && !focusMode;
  const showBottomNav = Boolean(bottomNav) && !focusMode;

  const shellValue = useMemo(
    () => ({
      isMobile,
      mobileOpen: showNav && isMobile && mobileOpen,
      hasNav,
      bottomInset: showBottomNav ? geekLayout.bottomNavHeight : 0,
      openNav,
      closeNav,
      toggleNav,
    }),
    [isMobile, mobileOpen, hasNav, showNav, showBottomNav, openNav, closeNav, toggleNav]
  );

  // The content box used to hardcode `calc(100vh - 60px)` unconditionally, which
  // over-reserved 60px for shells that render no top bar (bookgeek). Reserve
  // only what is actually on screen; `100%` when that is nothing, so a nested
  // shell inherits its container instead of assuming the viewport.
  const reservedHeight =
    (topBar ? geekLayout.topBarHeight : 0) + (showBottomNav ? geekLayout.bottomNavHeight : 0);
  const contentHeight = focusMode
    ? '100vh'
    : reservedHeight
      ? `calc(100vh - ${reservedHeight}px)`
      : '100%';

  return (
    <GeekShellContext.Provider value={shellValue}>
      <Box
        data-geek-shell
        data-focus-mode={focusMode ? 'true' : 'false'}
        sx={{
          display: 'flex',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          bgcolor: 'background.default',
          color: 'text.primary',
          ...sx,
        }}
      >
        {focusMode ? null : sidebar}

        {showNav && !isMobile ? (
          <Box
            component="nav"
            data-geek-nav="permanent"
            sx={{
              width: navWidth,
              flexShrink: 0,
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              borderRight: (t) => `1px solid ${t.palette.divider}`,
              ...navSx,
            }}
          >
            {nav}
          </Box>
        ) : null}

        {showNav && isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={closeNav}
            ModalProps={{ keepMounted: true }}
            data-geek-nav="temporary"
            sx={{
              '& .MuiDrawer-paper': {
                width: navWidth,
                boxSizing: 'border-box',
                backgroundImage: 'none',
                ...navSx,
              },
            }}
          >
            {nav}
          </Drawer>
        ) : null}

        <Box
          sx={{
            minWidth: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            bgcolor: 'background.default',
          }}
        >
          {focusMode ? null : topBar}
          <Box
            sx={{
              height: contentHeight,
              minHeight: 0,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              bgcolor: 'background.default',
            }}
          >
            {children}
          </Box>
          {showBottomNav ? bottomNav : null}
        </Box>
      </Box>
    </GeekShellContext.Provider>
  );
}
