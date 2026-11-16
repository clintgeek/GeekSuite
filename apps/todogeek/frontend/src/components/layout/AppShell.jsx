/**
 * AppShell — TodoGeek's layout shell, suite grammar (`GeekShell`: sidebar /
 * drawer, top bar, the phone's tab bar, the tablet's rail).
 *
 * Navigation comes from ONE items array (`navConfig.jsx`) through
 * `useGeekNavSlots` (tablet wave 3, 2026-11-16): the device picks the surface —
 * phone: the tab bar plus the hamburger drawer (as before); tablet (600–1199
 * px, or any touch tablet, portrait 800 and landscape 1280): the rail, with
 * no hamburger and no tab bar; desktop: the Red Pen sidebar. Reminders, the
 * one thing the sidebar had that the rail does not, are in the account menu
 * on every device (TopBar).
 *
 * The content frame is TodoGeek's own rather than `GeekAppFrame`: the frame
 * fades every route in, and Red Pen allows exactly one animation, the strike
 * (DOCS/SIMPLE_PLAN.md § Identity item 3). The frame is otherwise the same —
 * the scrolling <main>, the page ground, room for the tab bar.
 *
 * `GeekToastProvider` stays inside `GeekShell` (so it reads the shell's
 * insets and clears the sidebar and tab bar).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekToastProvider, useGeekNavSlots, useGeekShell } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';
import Sidebar, { PenMark } from './Sidebar';
import { chromeFor } from '../../theme/chrome';
import { penOf, PEN_FONT } from '../../theme/pen';
import TopBar from './TopBar';
import { navItems, activeNavId } from './navConfig';
import { scrollMainToTop } from './scrollTop';

export function PenFrame({ children, navMode }) {
  const { bottomInset } = useGeekShell();
  const { pathname } = useLocation();
  const first = useRef(true);
  // Each tab opens at its top: the scroll position used to carry from one
  // view to the next (3.20). Tapping the ACTIVE tab does it too (MobileTabBar).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    scrollMainToTop();
  }, [pathname]);
  return (
    <Box
      component="main"
      data-pen-frame
      data-nav-mode={navMode}
      sx={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor: 'background.default',
        ...(bottomInset ? { pb: `${bottomInset}px` } : null),
      }}
    >
      {children}
    </Box>
  );
}

/**
 * From 600 px wide MUI's Snackbar pins itself 24px from the bottom in its own
 * media query, which overrides GeekToastProvider's footer clearance. Re-apply
 * the docked add box's clearance (TodayPage's `--pen-dock-clear`) there, so a
 * toast rises above the box on a tablet as it does on a phone. With no dock
 * the variable is unset and this is MUI's own 24px.
 */
export const TOAST_SX = {
  '@media (min-width: 600px)': { bottom: 'max(24px, var(--pen-dock-clear, 0px))' },
};

/** The rail in Red Pen: paper, a hairline, ink labels; the current item gets the pen's red mark under its icon. */
export function railPropsFor(theme) {
  const chrome = chromeFor(theme.palette.mode);
  const p = penOf(theme);
  return {
    header: <Box data-rail-mark sx={{ pt: 2, pb: 3 }}><PenMark size={28} chrome={chrome} /></Box>,
    sx: { bgcolor: chrome.bg, borderRight: `1px solid ${chrome.border}` },
    itemSx: {
      color: chrome.textMuted,
      '&[aria-current="page"]': { color: chrome.text },
      '&[aria-current="page"] [data-geek-nav-rail="indicator"]': {
        bgcolor: chrome.active,
        boxShadow: `inset 0 -3px 0 ${chrome.accent}`,
      },
      '@media (any-hover: hover)': {
        '&:hover [data-geek-nav-rail="indicator"]': { bgcolor: chrome.bgHover },
      },
      '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -2 },
    },
    indicatorSx: { borderRadius: '4px' },
    labelSx: { fontFamily: PEN_FONT, fontSize: '0.75rem' },
  };
}

const AppShell = ({ children }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const showNavigation = Boolean(user);
  const p = penOf(theme);
  const currentId = activeNavId(pathname);

  const items = navItems.map(({ Icon, id, label, to }) => ({
    id,
    label,
    to,
    icon: <Icon size={22} strokeWidth={id === currentId ? 2.25 : 1.75} />,
  }));

  const { navMode, ...slots } = useGeekNavSlots({
    items,
    activeId: currentId,
    // Tapping the view you are on goes to its top (3.20), on the bar and the rail alike.
    onNavigate: (item) => { if (item.id === currentId) scrollMainToTop(); },
    sidebar: <Sidebar />,
    phoneDrawer: true,
    hidden: !showNavigation,
    railProps: railPropsFor(theme),
    bottomNavProps: { sx: { backgroundColor: p.paper, borderTop: `1px solid ${p.rule}` } },
  });

  return (
    <GeekShell
      {...slots}
      navSx={{ bgcolor: chromeFor(theme.palette.mode).bg }}
      topBar={<TopBar />}
    >
      <GeekToastProvider sx={TOAST_SX}>
        <PenFrame navMode={navMode}>{children}</PenFrame>
      </GeekToastProvider>
    </GeekShell>
  );
};

export default AppShell;
