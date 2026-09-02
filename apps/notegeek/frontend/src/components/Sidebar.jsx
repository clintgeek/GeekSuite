import React, { useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    Alert,
    CircularProgress,
    Box,
    TextField,
    InputAdornment,
    IconButton,
    useTheme,
    alpha,
} from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TagIcon from '@mui/icons-material/LocalOffer';
import AllNotesIcon from '@mui/icons-material/AutoStoriesOutlined';
import MoreIcon from '@mui/icons-material/MoreHoriz';
import { GeekSidebar, geekLayout, useGeekShell } from '@geeksuite/ui';
import useTagStore from '../store/tagStore';
import useAuthStore from '../store/authStore';
import useNoteStore from '../store/noteStore';
import TagContextMenu from './TagContextMenu';
import { gql, useQuery } from '@apollo/client';
import { glow } from '../theme/tokens';
import { NEW_NOTE_ITEM, navSections, activeNavId } from './navConfig';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';

const GET_TAGS = gql`
  query GetNoteTags {
    noteTags
  }
`;

// Earthy, editorial tag accent colors — spread across the hue wheel so
// adjacent tags get visually distinct dots. Mapped deterministically from
// tag name hash. First four align with the noteTypes palette.
const TAG_COLORS = [
    '#2D6A9F',  // slate blue    (matches noteTypes.markdown)
    '#4A7A2E',  // forest green  (matches noteTypes.code)
    '#B8841F',  // warm amber    (matches noteTypes.mindmap)
    '#8B2C2A',  // oxblood       (matches primary/handwritten)
    '#6B5A3A',  // warm umber
    '#5C4A8A',  // muted indigo
    '#7A4A5C',  // plum
    '#3A6B7A',  // deep teal
];

function getTagColor(tagName) {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
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

// ——— Tag hierarchy builder (pure function, module-level) ———————————————
function buildTagHierarchy(tagList) {
    const hierarchy = {};
    tagList.forEach((tag) => {
        const parts = tag.split('/');
        let current = hierarchy;
        let currentPath = '';
        parts.forEach((part) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!current[part]) {
                current[part] = { path: currentPath, children: {} };
            }
            current = current[part].children;
        });
    });
    return hierarchy;
}

// ——— TagTreeRow: single tag node (module-level, no re-creation) —————————
function TagTreeRow({ tag, data, level, location, theme, onNavigate, onTagMenu }) {
    const isSelected = location.pathname === `/tags/${encodeURIComponent(data.path)}`;
    const tagColor = getTagColor(data.path);
    const hasChildren = Object.keys(data.children).length > 0;

    return (
        <div key={data.path}>
            <ListItemButton
                component={Link}
                to={`/tags/${encodeURIComponent(data.path)}`}
                selected={isSelected}
                onClick={onNavigate}
                onContextMenu={(e) => { e.preventDefault(); onTagMenu(e, data.path); }}
                sx={{
                    pl: level * 1.5 + 2,
                    pr: 0.5,
                    py: 0.625,
                    mx: 0.75,
                    my: 0.125,
                    borderRadius: '6px',
                    transition: 'all 100ms ease',
                    '&.Mui-selected': {
                        backgroundColor: alpha(tagColor, 0.08),
                        borderLeft: `2px solid ${tagColor}`,
                        paddingLeft: `calc(${level * 1.5 + 2} * 8px - 2px)`,
                        '&:hover': { backgroundColor: alpha(tagColor, 0.12) },
                    },
                    '&:hover': {
                        backgroundColor: alpha(tagColor, 0.06),
                        '& .tag-more-btn': { opacity: 1 },
                    },
                }}
            >
                {/* Tag color dot */}
                <Box
                    sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: tagColor,
                        mr: 1.25,
                        flexShrink: 0,
                        opacity: isSelected ? 1 : 0.55,
                        transition: 'opacity 100ms ease',
                    }}
                />
                <ListItemText
                    primary={tag}
                    primaryTypographyProps={{
                        fontFamily: theme.typography.fontFamilyMono,
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'text.primary' : 'text.secondary',
                        letterSpacing: '0.01em',
                    }}
                />
                {/* Discoverable "..." button — visible on hover or focus */}
                <IconButton
                    className="tag-more-btn"
                    size="small"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagMenu(e.currentTarget, data.path); }}
                    sx={{
                        opacity: 0,
                        p: 0.25,
                        color: 'text.disabled',
                        transition: 'opacity 100ms ease, color 100ms ease',
                        '&:hover': { color: 'text.secondary', bgcolor: 'transparent' },
                    }}
                    aria-label={`Tag options for ${data.path}`}
                >
                    <MoreIcon sx={{ fontSize: 14 }} />
                </IconButton>
            </ListItemButton>
            {hasChildren && (
                <TagTree
                    hierarchy={data.children}
                    level={level + 1}
                    location={location}
                    theme={theme}
                    onNavigate={onNavigate}
                    onTagMenu={onTagMenu}
                />
            )}
        </div>
    );
}

// ——— TagTree: recursive renderer (module-level) ———————————————————————
function TagTree({ hierarchy, level = 0, location, theme, onNavigate, onTagMenu }) {
    return (
        <>
            {Object.entries(hierarchy).map(([tag, data]) => (
                <TagTreeRow
                    key={data.path}
                    tag={tag}
                    data={data}
                    level={level}
                    location={location}
                    theme={theme}
                    onNavigate={onNavigate}
                    onTagMenu={onTagMenu}
                />
            ))}
        </>
    );
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
    const navigate = useNavigate();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const { closeNav } = useGeekShell();
    const { clearTags } = useTagStore();
    const { user, logout } = useAuthStore();
    const { clearNotes } = useNoteStore();
    const [tagFilter, setTagFilter] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedTag, setSelectedTag] = useState(null);

    const { data, loading: tagsLoading, error } = useQuery(GET_TAGS, {
        fetchPolicy: 'cache-and-network',
    });
    const tags = data?.noteTags || [];
    const tagsError = error?.message;

    const handleLogout = () => {
        logout();
        clearNotes();
        clearTags();
        navigate('/login?signedOut=1');
    };

    // Single context menu handler for all tag rows
    const handleTagMenu = useCallback((anchorEl, tagPath) => {
        setContextMenu(anchorEl);
        setSelectedTag(tagPath);
    }, []);

    const handleCloseTagMenu = useCallback(() => {
        setContextMenu(null);
        setSelectedTag(null);
    }, []);

    const filteredTags = tags.filter((tag) =>
        tag.toLowerCase().includes(tagFilter.toLowerCase())
    );
    const tagHierarchy = buildTagHierarchy(tags);
    const filteredHierarchy = buildTagHierarchy(filteredTags);

    // "/tags/…" rows manage their own `selected` state directly off
    // `location` (see TagTreeRow) since they live outside the primitive's
    // `sections`/`activeId` matching — only the primary row uses it.
    const activeId = activeNavId(location.pathname);

    /**
     * The Collections tag tree as `extras` — see the file header note in the
     * migration report: `GeekSidebar`'s `sections` box is the only slot with
     * `flex: 1` / its own scroll region, while `extras` sizes to its content
     * and does not compete for space. For NoteGeek the tag tree (not the
     * three-item primary row) is the thing that can grow arbitrarily large,
     * so left unbounded it would push the footer (Settings / Sign out)
     * outside the panel's `overflow: hidden` bounds. Bounding it here with
     * its own `maxHeight` + `overflowY: auto` keeps the footer on screen at
     * the cost of a variable gap between Search and "Collections" on tall
     * viewports with few tags — a primitive gap, not an app choice.
     */
    const collectionsExtras = (
        <Box sx={{ borderTop: `1px solid ${theme.palette.divider}` }}>
            <SectionLabel>Collections</SectionLabel>

            <Box
                sx={{
                    maxHeight: 'clamp(160px, 40vh, 420px)',
                    overflowY: 'auto',
                    pb: 1.5,
                    scrollbarWidth: 'thin',
                    scrollbarColor: isDark
                        ? 'rgba(237, 230, 214, 0.15) transparent'
                        : 'rgba(31, 28, 22, 0.15) transparent',
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: isDark
                            ? 'rgba(237, 230, 214, 0.15)'
                            : 'rgba(31, 28, 22, 0.15)',
                        borderRadius: 2,
                        '&:hover': {
                            backgroundColor: isDark
                                ? 'rgba(237, 230, 214, 0.25)'
                                : 'rgba(31, 28, 22, 0.25)',
                        },
                    },
                }}
            >
                {/* Tag filter input */}
                <Box sx={{ px: 1.25, pt: 0.25, pb: 0.75 }}>
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
                <List sx={{ pt: 0, px: 0.75 }}>
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
                    </ListItemButton>
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
                    <Alert severity="error" sx={{ mx: 1.5, my: 1, borderRadius: '6px' }}>
                        {tagsError}
                    </Alert>
                )}
                {!tagsLoading && !tagsError && Object.keys(tagHierarchy).length === 0 && (
                    <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                        <TagIcon sx={{ fontSize: 24, color: 'text.muted', mb: 0.75 }} />
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 0.25 }}
                        >
                            No tags yet
                        </Typography>
                        <Typography variant="caption" color="text.muted">
                            Add tags to your notes to organize them here
                        </Typography>
                    </Box>
                )}
                {!tagsLoading && !tagsError && Object.keys(filteredHierarchy).length > 0 && (
                    <TagTree
                        hierarchy={filteredHierarchy}
                        location={location}
                        theme={theme}
                        onNavigate={closeNav}
                        onTagMenu={handleTagMenu}
                    />
                )}
                {!tagsLoading && !tagsError && tagFilter && Object.keys(filteredHierarchy).length === 0 && (
                    <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.muted">
                            No tags match "{tagFilter}"
                        </Typography>
                    </Box>
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
                footer={{
                    user: {
                        name: displayNameFrom(user),
                        secondary: secondaryFrom(user),
                        initials: initialsFrom(user),
                    },
                    settings: { to: '/settings' },
                    onSignOut: handleLogout,
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
