import React from 'react';
import { useTheme, useMediaQuery } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { GeekShell, GeekAppFrame, GeekToastProvider } from '@geeksuite/ui';
import useAuthStore from '../store/authStore';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import Header from './Header';
import useEditorChrome from '../store/editorChromeStore';
import NoteImporter from './new/NoteImporter';

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
 *
 * `GeekToastProvider` is mounted *inside* `GeekShell` and *outside*
 * `GeekAppFrame` (TODO_ORDER #15 fan-out), same placement as bujogeek and
 * flockgeek: inside the shell so it can read `useGeekShell()` and clear the
 * sidebar/tab bar; outside the frame because the frame's route transition is
 * a framer-motion element and would drag a `position: fixed` toast along
 * with the page fade.
 */
function Layout({ children }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { isAuthenticated } = useAuthStore();
    const showNavigation = isAuthenticated;
    const { pathname } = useLocation();
    // A single note (/notes/new, /notes/:id, /notes/:id/edit) is a page that
    // owns its own scroller: the editor's sheet must be exactly as tall as
    // the viewport so it reaches the bottom and its toolbar can stick, and
    // the canvas editors need a real height to fill. `fill` makes the frame
    // a non-scrolling flex column and hands that height down; lists and
    // home keep the frame's own scroll.
    const fillFrame = /^\/notes\/[^/]+/.test(pathname);
    // Writing on a phone: the suite top bar tucks away while the caret is in
    // the note (NoteShell reports it), so the page has the room. The note's
    // own head — Back, the ⋯ menu — is still at the top of the sheet.
    const writing = useEditorChrome((s) => s.writing);
    const tuckTopBar = isMobile && fillFrame && writing;

    return (
        <GeekShell
            // Desktop only: a phone has no drawer (Header.jsx); its tag tree
            // opens from the Notes page instead.
            nav={showNavigation && !isMobile ? <Sidebar /> : undefined}
            topBar={tuckTopBar ? null : <Header />}
            // Not on a single note: MobileBottomNav hides itself there
            // (`shouldHide`), but passing it anyway still made the frame
            // reserve its 56px inset — a strip of empty desk under the
            // editor on every phone.
            bottomNav={showNavigation && isMobile && !fillFrame ? <MobileBottomNav /> : null}
        >
            <GeekToastProvider>
                {/* Markdown import: the drop zone and the file picker the New
                    surfaces open (DOCS/CONTEXT.md §9). Inside the toast
                    provider, which Header and the tab bar are not. */}
                {showNavigation ? <NoteImporter /> : null}
                {/* Main content with route transitions */}
                <GeekAppFrame
                    fill={fillFrame}
                    sx={{
                        // NoteGeek specific: Mindmap editor wants overflow: hidden
                        '&.mindmap-container': {
                            overflow: 'hidden',
                        },
                    }}
                >
                    {children}
                </GeekAppFrame>
            </GeekToastProvider>
        </GeekShell>
    );
}

export default Layout;
