import React, { useState, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    CircularProgress,
    Box,
    TextField,
    InputAdornment,
    IconButton,
    useTheme,
    alpha,
} from '@mui/material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TagIcon from '@mui/icons-material/LocalOffer';
import AllNotesIcon from '@mui/icons-material/AutoStoriesOutlined';
import MoreIcon from '@mui/icons-material/MoreHoriz';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { GeekSidebar, geekLayout, useGeekShell } from '@geeksuite/ui';
import useTagStore from '../store/tagStore';
import useNoteStore from '../store/noteStore';
import TagContextMenu from './TagContextMenu';
import { gql, useQuery } from '@apollo/client';
import { toneForMode } from '@geeksuite/ui';
import { glow, noteTypeColor, tapTarget44 } from '../theme/tokens';
import { buildTagTree, filterTagTree } from '../utils/tagTree';
import { NEW_NOTE_ITEM, navSections, activeNavId } from './navConfig';

const GET_TAGS = gql`
  query GetNoteTags {
    noteTags
  }
`;

// Note counts per tag. `noteTags` is a bare string list, so the counts come
// from the notes themselves — ids and tags only, nothing heavy. It is a
// `notes` root field, so every note write evicts it with the tag index
// (graphql/cacheUpdates.js) and the counts stay honest.
const GET_TAG_COUNTS = gql`
  query GetNoteTagCounts {
    notes {
      id
      tags
    }
  }
`;

// Earthy, editorial tag accent colors — spread across the hue wheel so
// adjacent tags get visually distinct dots. Mapped deterministically from
// tag name hash. First four are the real per-mode noteTypes palette values
// (not a copy — dark mode used to reuse the light-mode hex here, which
// skipped the dark lift `noteTypes` applies everywhere else, DOCS/SUITE_TODO.md
// "notegeek mind-map off-palette colors"). The remaining four have no
// noteTypes equivalent, so they're light-authored hues run through
// `toneForMode` (packages/ui/src/color.js) for the same dark lift.
const EXTRA_TAG_HUES = [
    '#6B5A3A',  // warm umber
    '#5C4A8A',  // muted indigo
    '#7A4A5C',  // plum
    '#3A6B7A',  // deep teal
];

function getTagColors(theme) {
    return [
        noteTypeColor(theme, 'markdown'),
        noteTypeColor(theme, 'code'),
        noteTypeColor(theme, 'mindmap'),
        noteTypeColor(theme, 'handwritten'),
        ...EXTRA_TAG_HUES.map((hue) => toneForMode(hue, theme)),
    ];
}

function getTagColor(tagName, theme) {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = getTagColors(theme);
    return colors[Math.abs(hash) % colors.length];
}

// ——— Section label ————————————————————————————————————————————————————
// h6 variant: mono caps, letterspaced — the "Ink Studio" panel header.
function SectionLabel({ children, sx }) {
    return (
        <Typography
            variant="h6"
            sx={{
                color: 'text.muted',
                px: 1.5,
                pt: 1.5,
                pb: 0.5,
                ...sx,
            }}
        >
            {children}
        </Typography>
    );
}

// ——— Tag tree ——————————————————————————————————————————————————————————
//
// A real tree: expand/collapse chevrons, a guide line down each open branch,
// and a note count on every row (a parent counts the distinct notes under
// it — utils/tagTree.js). Rows are 32px on desktop and 44px in the phone
// drawer (MOBILE_UI_PLAN §2). Each row is a <li> holding three siblings —
// chevron button, the tag link, the "…" button — rather than buttons nested
// inside the link.

const COLLAPSED_KEY = 'notegeek.tagTree.collapsed';

function readCollapsed() {
    try {
        const raw = window.localStorage.getItem(COLLAPSED_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(list) ? list : []);
    } catch {
        return new Set();
    }
}

function writeCollapsed(set) {
    try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
    } catch {
        // Private mode / blocked storage: collapse still works for the session.
    }
}

const ROW_SX = (theme) => ({
    minHeight: 32,
    [theme.breakpoints.down('md')]: { minHeight: 44 },
});

function TagTreeRow({ node, level, activePath, isOpen, onToggle, theme, onNavigate, onTagMenu, renderChildren }) {
    const href = `/tags/${encodeURIComponent(node.path)}`;
    const isSelected = activePath === node.path;
    const tagColor = getTagColor(node.path, theme);
    const hasChildren = node.children.length > 0;

    return (
        <Box component="li" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mx: '6px',
                    borderRadius: '4px',
                    position: 'relative',
                    ...ROW_SX(theme),
                    bgcolor: isSelected ? alpha(tagColor, 0.1) : 'transparent',
                    '&:hover': { bgcolor: alpha(tagColor, isSelected ? 0.14 : 0.06) },
                    '&:hover .tag-more-btn, &:focus-within .tag-more-btn': { opacity: 1 },
                    '&::before': isSelected ? {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: 6,
                        bottom: 6,
                        width: 2,
                        borderRadius: 1,
                        bgcolor: tagColor,
                    } : undefined,
                }}
            >
                {/* Indent + chevron (or a spacer the same width) */}
                <Box sx={{ width: level * 14, flexShrink: 0 }} />
                {hasChildren ? (
                    <IconButton
                        size="small"
                        onClick={() => onToggle(node.path)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.path}`}
                        sx={{
                            width: 24,
                            height: 24,
                            minWidth: 24,
                            minHeight: 24,
                            p: 0,
                            flexShrink: 0,
                            color: 'text.secondary',
                            borderRadius: '4px',
                            [theme.breakpoints.down('md')]: { ...tapTarget44, width: 44, height: 44 },
                            '&:hover': { color: 'text.primary', bgcolor: 'transparent' },
                        }}
                    >
                        <ChevronRightIcon
                            sx={{
                                fontSize: 16,
                                transform: isOpen ? 'rotate(90deg)' : 'none',
                                transition: 'transform 120ms ease',
                                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                            }}
                        />
                    </IconButton>
                ) : (
                    <Box sx={{ width: 24, flexShrink: 0, [theme.breakpoints.down('md')]: { width: 44 } }} />
                )}

                <Box
                    component={Link}
                    to={href}
                    onClick={onNavigate}
                    aria-current={isSelected ? 'page' : undefined}
                    onContextMenu={(e) => { e.preventDefault(); onTagMenu(e.currentTarget, node.path); }}
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        alignSelf: 'stretch',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        pl: '2px',
                        pr: '4px',
                        textDecoration: 'none',
                        color: isSelected ? 'text.primary' : 'text.secondary',
                        borderRadius: '4px',
                        '&:hover': { color: 'text.primary' },
                        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
                    }}
                >
                    <Box
                        aria-hidden
                        sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: tagColor,
                            flexShrink: 0,
                            opacity: isSelected ? 1 : 0.7,
                        }}
                    />
                    <Box
                        component="span"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: theme.typography.fontFamilyMono,
                            fontSize: '0.75rem',
                            fontWeight: isSelected ? 600 : 400,
                            letterSpacing: '0.01em',
                        }}
                    >
                        {node.name}
                    </Box>
                    {node.count !== null && (
                        <Box
                            component="span"
                            sx={{
                                flexShrink: 0,
                                fontFamily: theme.typography.fontFamilyMono,
                                fontSize: '0.75rem',
                                color: 'text.secondary',
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {node.count}
                        </Box>
                    )}
                </Box>

                {/* Discoverable "..." button — visible on hover or focus */}
                <IconButton
                    className="tag-more-btn"
                    size="small"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagMenu(e.currentTarget, node.path); }}
                    sx={{
                        opacity: 0,
                        p: 0.25,
                        mr: '2px',
                        minWidth: 24,
                        minHeight: 24,
                        [theme.breakpoints.down('md')]: { ...tapTarget44 },
                        color: 'text.secondary',
                        transition: 'opacity 100ms ease, color 100ms ease',
                        '&:hover': { color: 'text.primary', bgcolor: 'transparent' },
                        '&:focus-visible': { opacity: 1 },
                    }}
                    aria-label={`Tag options for ${node.path}`}
                >
                    <MoreIcon sx={{ fontSize: 14 }} />
                </IconButton>
            </Box>

            {hasChildren && isOpen && renderChildren(node.children, level + 1, node.path)}
        </Box>
    );
}

function TagTree({ nodes, activePath, collapsed, forceOpen, onToggle, theme, onNavigate, onTagMenu }) {
    const render = (list, level, parentPath) => (
        <Box
            component="ul"
            aria-label={parentPath ? `Tags under ${parentPath}` : 'Tags'}
            sx={{
                m: 0,
                p: 0,
                position: 'relative',
                // The guide line down an open branch, under the parent's chevron.
                ...(level > 0 ? {
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        bottom: 6,
                        left: `${6 + (level - 1) * 14 + 12}px`,
                        width: '1px',
                        bgcolor: theme.palette.divider,
                        [theme.breakpoints.down('md')]: { left: `${6 + (level - 1) * 14 + 22}px` },
                    },
                } : null),
            }}
        >
            {list.map((node) => (
                <TagTreeRow
                    key={node.path}
                    node={node}
                    level={level}
                    activePath={activePath}
                    isOpen={forceOpen || !collapsed.has(node.path)}
                    onToggle={onToggle}
                    theme={theme}
                    onNavigate={onNavigate}
                    onTagMenu={onTagMenu}
                    renderChildren={render}
                />
            ))}
        </Box>
    );
    return render(nodes, 0, null);
}

// ——— Brand: two-tone mono wordmark ——————————————————————————————————————
// Passed as a node rather than the primitive's `{ monogram, name }` object
// so the "Note" / "Geek" color split stays exact. `GeekSidebar` still gives
// it the standard 60px block, but a node brand has no built-in link/close
// behavior, so this owns its own `RouterLink` + mobile-drawer close.
function Brand() {
    const theme = useTheme();
    const { closeNav } = useGeekShell();

    return (
        <Box
            component={Link}
            to="/"
            onClick={closeNav}
            sx={{
                display: 'flex',
                alignItems: 'center',
                px: 2,
                height: geekLayout.topBarHeight,
                textDecoration: 'none',
                color: 'inherit',
            }}
        >
            <Typography
                component="div"
                noWrap
                sx={{
                    fontFamily: theme.typography.fontFamilyMono,
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    userSelect: 'none',
                    display: 'flex',
                    lineHeight: 1,
                }}
            >
                <Box component="span" sx={{ color: 'text.primary' }}>
                    Note
                </Box>
                <Box component="span" sx={{ color: 'primary.main' }}>
                    Geek
                </Box>
            </Typography>
        </Box>
    );
}

function Sidebar() {
    const location = useLocation();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const { closeNav } = useGeekShell();
    const [tagFilter, setTagFilter] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedTag, setSelectedTag] = useState(null);

    const { data, loading: tagsLoading, error: tagsError, refetch: refetchTags } = useQuery(GET_TAGS, {
        fetchPolicy: 'cache-and-network',
    });
    const tags = useMemo(() => data?.noteTags || [], [data]);
    const { data: countData } = useQuery(GET_TAG_COUNTS, { fetchPolicy: 'cache-and-network' });
    const countNotes = countData?.notes || null;

    const [collapsed, setCollapsed] = useState(readCollapsed);
    const toggleTag = useCallback((path) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            writeCollapsed(next);
            return next;
        });
    }, []);

    // Single context menu handler for all tag rows
    const handleTagMenu = useCallback((anchorEl, tagPath) => {
        setContextMenu(anchorEl);
        setSelectedTag(tagPath);
    }, []);

    const handleCloseTagMenu = useCallback(() => {
        setContextMenu(null);
        setSelectedTag(null);
    }, []);

    const tagTree = useMemo(() => buildTagTree(tags, countNotes), [tags, countNotes]);
    const filteredTree = useMemo(() => filterTagTree(tagTree, tagFilter), [tagTree, tagFilter]);

    // The tag this route is showing, and every ancestor of it open, so a deep
    // link never lands on a collapsed branch.
    const activePath = location.pathname.startsWith('/tags/')
        ? decodeURIComponent(location.pathname.slice('/tags/'.length))
        : null;
    const effectiveCollapsed = useMemo(() => {
        if (!activePath) return collapsed;
        const next = new Set(collapsed);
        const parts = activePath.split('/');
        for (let i = 1; i < parts.length; i += 1) next.delete(parts.slice(0, i).join('/'));
        return next;
    }, [collapsed, activePath]);

    // "/tags/…" rows manage their own `selected` state directly off
    // `location` (see TagTreeRow) since they live outside the primitive's
    // `sections`/`activeId` matching — only the primary row uses it.
    const activeId = activeNavId(location.pathname);

    /**
     * The Tags tree as `extras` — see the file header note in the
     * migration report: `GeekSidebar`'s `sections` box is the only slot with
     * `flex: 1` / its own scroll region, while `extras` sizes to its content
     * and does not compete for space. For NoteGeek the tag tree (not the
     * three-item primary row) is the thing that can grow arbitrarily large,
     * so left unbounded it would push the footer (Settings / Sign out)
     * outside the panel's `overflow: hidden` bounds. Bounding it here with
     * its own `maxHeight` + `overflowY: auto` keeps the footer on screen at
     * the cost of a variable gap between Search and "Tags" on tall
     * viewports with few tags — a primitive gap, not an app choice.
     */
    const collectionsExtras = (
        <Box sx={{ borderTop: `1px solid ${theme.palette.divider}` }}>
            <SectionLabel>Tags</SectionLabel>

            {/* The tag tree takes the rest of the sidebar's height (extrasGrow
                below) and scrolls in GeekSidebar's extras body. It used to be
                capped at 40vh with a 4px, 15%-opacity scrollbar, so the last
                tags sat below the fold of a box that looked finished — Chef,
                2026-09-24: "new tags like xformative" weren't showing. */}
            <Box sx={{ pb: 1.5 }}>
                {/* Tag filter input — stays put while the tree scrolls under it. */}
                <Box sx={{ px: 1.25, pt: 0.25, pb: 0.75, position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'background.paper' }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Filter tags…"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        inputProps={{ 'aria-label': 'filter tags' }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontFamily: theme.typography.fontFamilyMono,
                                bgcolor: alpha(theme.palette.text.primary, 0.025),
                                transition: 'all 120ms ease',
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.text.primary, 0.04),
                                },
                                '&.Mui-focused': {
                                    bgcolor: 'background.paper',
                                    boxShadow: `0 0 0 3px ${glow(theme).ring}`,
                                },
                            },
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                </InputAdornment>
                            ),
                            endAdornment: tagFilter && (
                                <InputAdornment position="end">
                                    <ClearIcon
                                        sx={{
                                            fontSize: 14,
                                            cursor: 'pointer',
                                            color: 'text.disabled',
                                            '&:hover': { color: 'text.secondary' },
                                        }}
                                        onClick={() => setTagFilter('')}
                                    />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>

                {/* All Notes */}
                {/* The row is an <li> that CONTAINS the link — a bare
                    ListItemButton put an <a> straight into the <ul> (axe
                    `list`), unseen until a scene first opened the drawer. */}
                <List sx={{ pt: 0, px: 0.75 }}>
                    <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        to="/notes"
                        selected={location.pathname === '/notes'}
                        onClick={closeNav}
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <AllNotesIcon
                                sx={{
                                    fontSize: 17,
                                    color: location.pathname === '/notes' ? 'primary.main' : 'text.secondary',
                                    transition: 'color 100ms ease',
                                }}
                            />
                        </ListItemIcon>
                        <ListItemText
                            primary="All Notes"
                            primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: location.pathname === '/notes' ? 600 : 400,
                            }}
                        />
                        {countNotes && (
                            <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                            >
                                {countNotes.length}
                            </Typography>
                        )}
                    </ListItemButton>
                    </ListItem>
                </List>

                {/* Tag tree */}
                {tagsLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress
                            size={16}
                            sx={{ color: 'text.disabled' }}
                        />
                    </Box>
                )}
                {tagsError && (
                    <GeekErrorState
                        compact
                        sx={{ mx: 1.5, my: 1 }}
                        error={tagsError}
                        onRetry={() => refetchTags()}
                    />
                )}
                {!tagsLoading && !tagsError && tagTree.length === 0 && (
                    <GeekEmptyState
                        compact
                        icon={<TagIcon sx={{ fontSize: 24 }} />}
                        title="No tags yet"
                        titleSx={{ typography: 'body2', color: 'text.secondary', mb: 0.25 }}
                        description="Add tags to your notes to organize them here"
                        descriptionSx={{ typography: 'caption' }}
                    />
                )}
                {!tagsLoading && !tagsError && filteredTree.length > 0 && (
                    <TagTree
                        nodes={filteredTree}
                        activePath={activePath}
                        collapsed={effectiveCollapsed}
                        // While filtering, show every match in place.
                        forceOpen={Boolean(tagFilter.trim())}
                        onToggle={toggleTag}
                        theme={theme}
                        onNavigate={closeNav}
                        onTagMenu={handleTagMenu}
                    />
                )}
                {!tagsLoading && !tagsError && tagFilter && filteredTree.length === 0 && (
                    <GeekEmptyState
                        compact
                        description={`No tags match "${tagFilter}"`}
                        descriptionSx={{ typography: 'caption' }}
                    />
                )}
            </Box>
        </Box>
    );

    return (
        <>
            <GeekSidebar
                brand={<Brand />}
                chromeSx={{ flexShrink: 0 }}
                sections={[{ items: [NEW_NOTE_ITEM, ...navSections[0].items] }]}
                activeId={activeId}
                extras={collectionsExtras}
                extrasGrow
                extrasSx={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: isDark
                        ? 'rgba(237, 230, 214, 0.35) transparent'
                        : 'rgba(31, 28, 22, 0.3) transparent',
                    '&::-webkit-scrollbar': { width: 6 },
                    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: isDark ? 'rgba(237, 230, 214, 0.35)' : 'rgba(31, 28, 22, 0.3)',
                        borderRadius: 3,
                    },
                }}
                itemSx={{
                    color: 'text.secondary',
                    '& .MuiListItemText-primary': { fontSize: '0.8125rem' },
                    '&.Mui-selected .MuiListItemText-primary': { fontWeight: 600, color: 'text.primary' },
                    '&.Mui-selected .MuiListItemIcon-root': { color: 'primary.main' },
                    // New Note — the one row styled as a filled primary
                    // button rather than a plain nav row (see NEW_NOTE_ITEM).
                    '&[data-geek-nav-item="new-note"]': {
                        mb: 0.25,
                        borderRadius: '6px',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        transition: 'background 100ms ease',
                        '& .MuiListItemText-primary': { fontWeight: 600 },
                        '&:hover': { bgcolor: 'primary.dark' },
                        '&:focus-visible': {
                            outline: `2px solid ${theme.palette.primary.main}`,
                            outlineOffset: 2,
                        },
                    },
                }}
            />

            {/* Single context menu for all tag rows */}
            <TagContextMenu
                anchorEl={contextMenu}
                open={Boolean(contextMenu)}
                onClose={handleCloseTagMenu}
                tag={selectedTag}
            />
        </>
    );
}

export default Sidebar;
