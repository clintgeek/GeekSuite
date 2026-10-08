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
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import MoreIcon from '@mui/icons-material/MoreHoriz';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { GeekSidebar, geekLayout, useGeekShell } from '@geeksuite/ui';
import TagContextMenu from './TagContextMenu';
import { gql, useQuery } from '@apollo/client';
import { graphiteTokens, tapTarget44 } from '../theme/tokens';
import { tagTree as buildTagTree, filterTagTree } from '@geeksuite/tags';
import { navSections, activeNavId } from './navConfig';

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

// ——— Section label ————————————————————————————————————————————————————
// h6 variant: sentence-case sans in secondary ink — a label, not a stamp.
function SectionLabel({ children, sx }) {
    return (
        <Typography
            variant="h6"
            sx={{
                color: 'text.secondary',
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
// it — @geeksuite/tags tagTree). Rows are 32px on desktop and 44px in the phone
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
    const g = graphiteTokens(theme);
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
                    // The tag being viewed: highlighter under ink.
                    bgcolor: isSelected ? g.hl : 'transparent',
                    '&:hover': { bgcolor: isSelected ? g.hl : alpha(g.ink, 0.05) },
                    '&:hover .tag-more-btn, &:focus-within .tag-more-btn': { opacity: 1 },
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
                            color: isSelected ? g.onHl : 'text.secondary',
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
                        color: isSelected ? g.onHl : 'text.secondary',
                        borderRadius: '4px',
                        '&:hover': { color: isSelected ? g.onHl : 'text.primary' },
                        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
                    }}
                >
                    <Box
                        component="span"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.8125rem',
                            fontWeight: isSelected ? 600 : 400,
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
                                color: isSelected ? g.onHl : 'text.secondary',
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
                        // A phone has no hover, so the menu — the only way to
                        // rename, move or delete a tag there — is always shown.
                        [theme.breakpoints.down('md')]: { ...tapTarget44, opacity: 1 },
                        '@media (hover: none)': { opacity: 1 },
                        color: isSelected ? g.onHl : 'text.secondary',
                        transition: 'opacity 100ms ease, color 100ms ease',
                        '&:hover': { color: isSelected ? g.onHl : 'text.primary', bgcolor: 'transparent' },
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

// ——— Brand: the wordmark with a pass of highlighter under "Note" ————————
// Passed as a node rather than the primitive's `{ monogram, name }` object
// so the highlighter stroke stays exact. `GeekSidebar` still gives it the
// standard 60px block, but a node brand has no built-in link/close
// behavior, so this owns its own `RouterLink` + mobile-drawer close.
function Brand() {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const { closeNav } = useGeekShell();

    return (
        <Box
            component={Link}
            to="/"
            onClick={closeNav}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                px: 2,
                height: geekLayout.topBarHeight,
                textDecoration: 'none',
                color: 'inherit',
            }}
        >
            <Box component="img" src="/icons/favicon.svg" alt="" aria-hidden sx={{ width: 22, height: 22, flexShrink: 0 }} />
            <Typography
                component="div"
                noWrap
                sx={{
                    fontWeight: 650,
                    fontSize: '1rem',
                    letterSpacing: '-0.01em',
                    userSelect: 'none',
                    lineHeight: 1,
                    color: 'text.primary',
                }}
            >
                <Box
                    component="span"
                    sx={theme.palette.mode === 'dark' ? {
                        // At night the swipe covers the whole word, with the
                        // dark ink the highlighter always carries.
                        bgcolor: g.hl,
                        color: g.onHl,
                        borderRadius: '2px',
                        px: '3px',
                        mr: '1px',
                    } : {
                        // By day, a highlighter swipe: the lower half of the word.
                        background: `linear-gradient(transparent 45%, ${g.hl} 45%, ${g.hl} 92%, transparent 92%)`,
                        px: '2px',
                        mx: '-2px',
                    }}
                >
                    Note
                </Box>
                Geek
            </Typography>
        </Box>
    );
}

/**
 * TagsPanel — the tag filter, "All notes" and the tag tree, with the one
 * context menu for every row. The desktop sidebar holds it (as `extras`);
 * on a phone the Notes page opens it in a sheet (there is no drawer).
 *
 * `onNavigate` runs after a row is followed (the sidebar closes its drawer,
 * the phone sheet closes itself).
 */
export function TagsPanel({ onNavigate, stickyBg = 'background.paper' }) {
    const location = useLocation();
    const theme = useTheme();
    const g = graphiteTokens(theme);
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

    const onAllNotes = location.pathname === '/notes';
    const onArchived = location.pathname === '/archived';

    return (
        <>
            <Box sx={{ pb: 1.5 }}>
                {/* Tag filter input — stays put while the tree scrolls under it. */}
                <Box sx={{ px: 1.25, pt: 0.25, pb: 0.75, position: 'sticky', top: 0, zIndex: 1, backgroundColor: stickyBg }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Filter tags…"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        inputProps={{ 'aria-label': 'filter tags' }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                fontSize: '0.8125rem',
                                bgcolor: alpha(g.ink, 0.03),
                                transition: 'all 120ms ease',
                                '&:hover': { bgcolor: alpha(g.ink, 0.05) },
                                '&.Mui-focused': { bgcolor: g.sheet },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: g.ink, borderWidth: 1 },
                            },
                            '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 1 },
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                                </InputAdornment>
                            ),
                            endAdornment: tagFilter && (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        aria-label="Clear tag filter"
                                        onClick={() => setTagFilter('')}
                                        sx={{ color: 'text.secondary', minWidth: 32, minHeight: 32, [theme.breakpoints.down('md')]: { ...tapTarget44 } }}
                                    >
                                        <ClearIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>

                {/* All notes. The row is an <li> that CONTAINS the link — a
                    bare ListItemButton put an <a> straight into the <ul> (axe
                    `list`), unseen until a scene first opened the drawer. */}
                <List sx={{ pt: 0, px: 0.75 }}>
                    <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        to="/notes"
                        selected={onAllNotes}
                        aria-current={onAllNotes ? 'page' : undefined}
                        onClick={onNavigate}
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <AllNotesIcon sx={{ fontSize: 17, color: onAllNotes ? g.onHl : 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="All notes"
                            primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: onAllNotes ? 600 : 400 }}
                        />
                        {countNotes && (
                            <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: onAllNotes ? g.onHl : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                            >
                                {countNotes.length}
                            </Typography>
                        )}
                    </ListItemButton>
                    </ListItem>
                    {/* Archived (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U7): a
                        secondary place, beside All notes rather than a tab. */}
                    <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        to="/archived"
                        selected={onArchived}
                        aria-current={onArchived ? 'page' : undefined}
                        onClick={onNavigate}
                        data-nav-archived=""
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <ArchiveOutlined sx={{ fontSize: 17, color: onArchived ? g.onHl : 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="Archived"
                            primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: onArchived ? 600 : 400 }}
                        />
                    </ListItemButton>
                    </ListItem>
                </List>

                {/* Tag tree */}
                {tagsLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
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
                        onNavigate={onNavigate}
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

/**
 * Sidebar — desktop's permanent column: the brand, Home, then the Tags
 * panel. New lives in the top bar (NewNoteMenu) and search in the top bar's
 * box, so neither is repeated here.
 */
function Sidebar() {
    const location = useLocation();
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const { closeNav } = useGeekShell();
    const activeId = activeNavId(location.pathname);

    /**
     * The Tags panel as `extras` — `GeekSidebar`'s `sections` box is the only
     * slot with its own scroll region by default; `extrasGrow` gives the tag
     * tree (the thing that can grow arbitrarily large) the rest of the height
     * and its own scroll, so the footer stays on screen. It used to be capped
     * at 40vh with a faint scrollbar, so the last tags sat below the fold of a
     * box that looked finished (Chef, 2026-09-24).
     */
    const collectionsExtras = (
        <Box sx={{ borderTop: `1px solid ${theme.palette.divider}` }}>
            <SectionLabel>Tags</SectionLabel>
            <TagsPanel onNavigate={closeNav} />
        </Box>
    );

    const thumb = alpha(g.ink, 0.3);

    return (
        <GeekSidebar
            brand={<Brand />}
            chromeSx={{ flexShrink: 0 }}
            sections={navSections}
            activeId={activeId}
            extras={collectionsExtras}
            extrasGrow
            extrasSx={{
                scrollbarWidth: 'thin',
                scrollbarColor: `${thumb} transparent`,
                '&::-webkit-scrollbar': { width: 6 },
                '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
                '&::-webkit-scrollbar-thumb': { backgroundColor: thumb, borderRadius: 3 },
            }}
            itemSx={{
                color: 'text.secondary',
                '& .MuiListItemText-primary': { fontSize: '0.8125rem' },
                '&.Mui-selected .MuiListItemText-primary': { fontWeight: 600, color: g.onHl },
                '&.Mui-selected .MuiListItemIcon-root': { color: g.onHl },
            }}
        />
    );
}

export default Sidebar;
