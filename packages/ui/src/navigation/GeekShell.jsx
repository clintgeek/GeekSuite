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
 *   Both branches wrap `nav` in a `component="nav"` landmark (`aria-label`
 *   `"Primary"`), so the landmark exists below `md` too.
 *
 * `nav` and `sidebar` can coexist during a migration; `nav` is rendered after
 * `sidebar`, so pass one or the other in practice.
 *
 * The shell also owns the page's one thumb-zone action: a page calls
 * `useGeekPrimaryAction({ label, icon, onClick })` and the shell renders the
 * `GeekFab` here, as a *sibling* of the content column — `GeekAppFrame`'s route
 * transition is a motion element and would capture a fixed child. No page
 * registered → no FAB, and apps that mount their own `GeekFab` are unaffected.
 */
import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { geekLayout } from '../designTokens.js';
import { useFocusMode } from '../focus/index.js';
import { GeekFab } from '../surfaces/GeekFab.jsx';
import { GeekPrimaryActionContext, useGeekPrimaryActionState } from './primaryActionContext.js';
import { GeekShellContext } from './shellContext.js';

/**
 * The shell's own FAB slot. `action` is the committed registration (client);
 * `ssrRef` is the render-phase slot the page writes under SSR, read here
 * rather than in `GeekShell` so the read happens after the page renders.
 */
function ShellPrimaryFab({ action, ssrRef }) {
  const resolved = action ?? ssrRef.current;
  if (!resolved) return null;
  return (
    <GeekFab
      label={resolved.label}
      icon={resolved.icon}
      showOn={resolved.showOn}
      onClick={resolved.onClick}
    />
  );
}

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

  const {
    action: primaryAction,
    ssrRef: primaryActionSsrRef,
    value: primaryActionValue,
  } = useGeekPrimaryActionState();
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
  //
  // Heights are in `dvh` where the browser supports it (mobile grammar,
  // DOCS/MOBILE_UI_PLAN.md §2): `100vh` on iOS Safari is the *largest* viewport,
  // so with the URL bar showing the bottom of a `100vh` shell — the tab bar,
  // the last row, a pinned composer — sits below the visible screen. `dvh`
  // tracks the visible viewport. The `vh` value stays as the fallback for
  // engines without `dvh`, via `@supports`.
  const reservedHeight =
    (topBar ? geekLayout.topBarHeight : 0) + (showBottomNav ? geekLayout.bottomNavHeight : 0);
  const contentHeightFor = (unit) =>
    focusMode ? `100${unit}` : reservedHeight ? `calc(100${unit} - ${reservedHeight}px)` : '100%';
  const contentHeight = contentHeightFor('vh');
  const contentHeightDvh = contentHeightFor('dvh');

  return (
    <GeekPrimaryActionContext.Provider value={primaryActionValue}>
      <GeekShellContext.Provider value={shellValue}>
        <Box
          data-geek-shell
          data-focus-mode={focusMode ? 'true' : 'false'}
          sx={{
            display: 'flex',
            height: '100vh',
            maxHeight: '100vh',
            '@supports (height: 100dvh)': { height: '100dvh', maxHeight: '100dvh' },
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
              aria-label="Primary"
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
              sx={{
                '& .MuiDrawer-paper': {
                  width: navWidth,
                  boxSizing: 'border-box',
                  backgroundImage: 'none',
                  ...navSx,
                },
              }}
            >
              <Box
                component="nav"
                aria-label="Primary"
                data-geek-nav="temporary"
                sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}
              >
                {nav}
              </Box>
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
                '@supports (height: 100dvh)': { height: contentHeightDvh },
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

          {/* A component, and rendered after the content column, on purpose:
              under SSR the page registers during its own render, so the FAB
              has to be walked last to see it. */}
          <ShellPrimaryFab action={primaryAction} ssrRef={primaryActionSsrRef} />
        </Box>
      </GeekShellContext.Provider>
    </GeekPrimaryActionContext.Provider>
  );
}
