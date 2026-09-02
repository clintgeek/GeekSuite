import React from 'react';
import { useTheme, useMediaQuery } from '@mui/material';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import useAuthStore from '../store/authStore';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import Header from './Header';

/**
 * Layout — pure suite grammar.
 *
 * `nav` / `topBar` hand the shell sidebar *content* and the top bar; it owns
 * the breakpoint, the permanent-column-vs-drawer choice and the mobile
 * hamburger. There is no local `isMobile`/`desktopOpen`/`mobileOpen` state
 * or hand-rolled `<Drawer>` here any more — the same `Sidebar` panel serves
 * desktop and mobile.
 *
 * The one media query that remains is for the bottom tab bar: NoteGeek is a
 * data-entry app that opts into `GeekBottomNav` (via `MobileBottomNav`), but
 * only on mobile — `GeekAppFrame`'s bottom inset is driven by whether
 * `bottomNav` is non-null, so passing it unconditionally would reserve 56px
 * of dead padding on desktop, where the bar never renders.
 */
function Layout({ children }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { isAuthenticated } = useAuthStore();
    const showNavigation = isAuthenticated;

    return (
        <GeekShell
            nav={showNavigation ? <Sidebar /> : undefined}
            topBar={<Header />}
            bottomNav={showNavigation && isMobile ? <MobileBottomNav /> : null}
        >
            {/* Main content with route transitions */}
            <GeekAppFrame
                sx={{
                    // NoteGeek specific: Mindmap editor wants overflow: hidden
                    '&.mindmap-container': {
                        overflow: 'hidden',
                    },
                }}
            >
                {children}
            </GeekAppFrame>
        </GeekShell>
    );
}

export default Layout;
