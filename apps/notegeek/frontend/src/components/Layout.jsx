import React, { useRef } from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { GeekShell, GeekAppFrame, GeekToastProvider, GeekTwoPane, GeekEmptyState } from '@geeksuite/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import useAuthStore from '../store/authStore';
import Header from './Header';
import NoteList from './NoteList';
import TagNotesList from './TagNotesList';
import useEditorChrome from '../store/editorChromeStore';
import useNavStore from '../store/navStore';
import NoteImporter from './new/NoteImporter';
import { useNotePrimaryNav } from './PrimaryNav';
import { CurrentNoteContext, useNoteFormFactor } from '../hooks/useNoteFormFactor';
import OneOnOnePicker from './oneOnOne/OneOnOnePicker';

/**
 * The paths that are one note: `/notes/new`, `/notes/:id`, `/notes/:id/edit`
 * (not `/notes/photo`, a capture workflow of its own).
 */
const NOTE_DETAIL = /^\/notes\/(?!photo(?:\/|$))([^/]+)(?:\/edit)?\/?$/;
const TAG_LIST = /^\/tags\/([^/]+)\/?$/;

/**
 * Which list sits in the list pane in two-pane: the last list the writer
 * looked at — all notes, or one tag's notes — so opening a note from a tag
 * keeps that tag's list (its scroll and filters) beside it.
 *
 * `beside` says whether that list is ON SCREEN to open a note beside: true
 * from a list page and on through the notes opened from it, false once the
 * writer goes anywhere else (Home, Search, a reload straight onto a note).
 * A note opened from there is a whole page, as it was — the list does not
 * pop in on the left and push the page over (Chef, 2026-11-16: "a bit
 * jarring when it moves things around"; TodoGeek's Today never does).
 */
function useListContext(pathname) {
    const last = useRef({ kind: 'notes', key: 'notes' });
    const beside = useRef(false);
    let next = null;
    if (pathname === '/notes' || pathname === '/notes/') next = { kind: 'notes', key: 'notes' };
    const tag = TAG_LIST.exec(pathname);
    if (tag) next = { kind: 'tag', tag: tag[1], key: `tag:${tag[1]}` };
    if (next && next.key !== last.current.key) last.current = next;
    if (next) beside.current = true;
    else if (!NOTE_DETAIL.test(pathname)) beside.current = false;
    return { ...last.current, beside: beside.current };
}

/**
 * Layout — pure suite grammar.
 *
 * Navigation is `useNotePrimaryNav` (PrimaryNav.jsx): one items array, and
 * the device picks the surface — bottom bar on a phone, rail on a tablet
 * (portrait 800 and touch landscape 1280 alike), sidebar on a desktop. While
 * the rail shows GeekShell draws no drawer, hamburger or bottom bar.
 *
 * Two panes (tablet wave, plan P2a/P2b): from 1024 px (`twoPane`) the notes
 * list and the note sit side by side on `/notes`, `/tags/:tag` and a note
 * opened FROM one of those (see useListContext: a note opened from Home or
 * Search stays a whole page). The list element stays at the same place in the tree
 * while the note changes, so it keeps its scroll, type filter and sort.
 * Below 1024 nothing changes: one pane, the existing routes.
 *
 * `GeekToastProvider` is mounted *inside* `GeekShell` and *outside*
 * `GeekAppFrame` (TODO_ORDER #15 fan-out), same placement as todogeek and
 * flockgeek: inside the shell so it can read `useGeekShell()` and clear the
 * sidebar/tab bar; outside the frame because the frame's route transition is
 * a framer-motion element and would drag a `position: fixed` toast along
 * with the page fade.
 */
function Layout({ children }) {
    const { phone, twoPane } = useNoteFormFactor();
    const { isAuthenticated } = useAuthStore();
    const showNavigation = isAuthenticated;
    const { pathname } = useLocation();
    // A single note (/notes/new, /notes/:id, /notes/:id/edit) is a page that
    // owns its own scroller: the editor's sheet must be exactly as tall as
    // the viewport so it reaches the bottom and its toolbar can stick, and
    // the canvas editors need a real height to fill. `fill` makes the frame
    // a non-scrolling flex column and hands that height down; lists and
    // home keep the frame's own scroll.
    const singleNote = /^\/notes\/[^/]+/.test(pathname);
    const detailMatch = NOTE_DETAIL.exec(pathname);
    const listContext = useListContext(pathname);
    const split =
        showNavigation &&
        twoPane &&
        (pathname === '/notes' || pathname === '/notes/' || TAG_LIST.test(pathname) ||
            (Boolean(detailMatch) && listContext.beside));
    const fillFrame = singleNote;
    // Writing on a phone: the suite top bar tucks away while the caret is in
    // the note (NoteShell reports it), so the page has the room. The note's
    // own head — Back, the ⋯ menu — is still at the top of the sheet.
    const writing = useEditorChrome((s) => s.writing);
    const tuckTopBar = phone && singleNote && writing;
    // Desktop can fold the sidebar away; the toggle lives in the top bar's
    // leading slot (Header.jsx), so it is reachable either way.
    const navCollapsed = useNavStore((s) => s.navCollapsed);
    const { slots, sheets } = useNotePrimaryNav({ hidden: !showNavigation, sidebarCollapsed: navCollapsed });

    const currentNoteId = split && detailMatch && detailMatch[1] !== 'new' ? decodeURIComponent(detailMatch[1]) : null;

    const page = split ? (
        <GeekTwoPane
            twoPane
            sx={{ flex: 1 }}
            data-note-two-pane=""
            listLabel="Notes"
            detailLabel="Note"
            list={
                listContext.kind === 'tag'
                    ? <TagNotesList tag={listContext.tag} />
                    : <NoteList />
            }
            detail={detailMatch ? children : null}
            placeholder={
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3 }}>
                    <GeekEmptyState
                        icon={<AutoStoriesOutlinedIcon sx={{ fontSize: 28 }} />}
                        title="Pick a note"
                        description="It opens here, beside the list."
                    />
                </Box>
            }
            listSx={{ bgcolor: 'background.default', px: '8px' }}
            // The note owns its scroller (NoteShell) and the canvases need a
            // non-scrolling box with real bounds (tldraw), as on a full page.
            detailSx={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}
        />
    ) : null;

    return (
        <GeekShell
            nav={slots.nav}
            rail={slots.rail}
            topBar={tuckTopBar ? null : <Header />}
            bottomNav={slots.bottomNav}
        >
            <GeekToastProvider>
                {/* Markdown import: the drop zone and the file picker the New
                    surfaces open (DOCS/CONTEXT.md §9). Inside the toast
                    provider, which Header and the tab bar are not. */}
                {showNavigation ? <NoteImporter /> : null}
                {split ? (
                    // Two panes get their own <main>, not GeekAppFrame: the
                    // frame keys its fade on the first path segment, so going
                    // from /tags/x to /notes/:id would remount the list pane
                    // and lose its scroll — the thing two panes are for.
                    <Box
                        component="main"
                        data-geek-frame="fill"
                        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}
                    >
                        <CurrentNoteContext.Provider value={currentNoteId}>
                            {page}
                        </CurrentNoteContext.Provider>
                    </Box>
                ) : (
                    /* Main content with route transitions */
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
                )}
                {sheets}
                {isAuthenticated ? <OneOnOnePicker /> : null}
            </GeekToastProvider>
        </GeekShell>
    );
}

export default Layout;
