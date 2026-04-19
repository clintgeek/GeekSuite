import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    Alert,
    CircularProgress,
    Box,
    Divider,
    TextField,
    InputAdornment,
    useTheme,
    alpha,
} from '@mui/material';
import {
    Add as AddIcon,
    Search as SearchIcon,
    Logout as LogoutIcon,
    Clear as ClearIcon,
    LocalOffer as TagIcon,
    AutoStoriesOutlined as AllNotesIcon,
    HomeOutlined as HomeIcon,
    SettingsOutlined as SettingsIcon,
} from '@mui/icons-material';
import useTagStore from '../store/tagStore';
import useAuthStore from '../store/authStore';
import useNoteStore from '../store/noteStore';
import TagContextMenu from './TagContextMenu';
import { gql, useQuery } from '@apollo/client';

const GET_TAGS = gql`
  query GetNoteTags {
    noteTags
  }
`;

// Earthy, editorial tag accent colors — warm tones that feel at home
// against cream paper. Mapped deterministically from tag name hash.
const TAG_COLORS = [
    '#3D6B7A',  // muted teal   (matches noteTypes.markdown)
    '#5B7A4A',  // moss          (matches noteTypes.code)
    '#A8782F',  // ochre         (matches noteTypes.mindmap)
    '#8B2C2A',  // oxblood       (matches primary)
    '#6B5A3A',  // warm umber
    '#4A6B8A',  // slate blue
    '#7A5A3D',  // leather
    '#3A5C4A',  // dark sage
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
                color: 'text.disabled',
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

function Sidebar({ closeNavbar }) {
    const location = useLocation();
    const navigate = useNavigate();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const { clearTags } = useTagStore();
    const { logout } = useAuthStore();
    const { clearNotes } = useNoteStore();
    const [tagFilter, setTagFilter] = useState('');

    const { data, loading: tagsLoading, error } = useQuery(GET_TAGS, {
        fetchPolicy: 'cache-and-network',
    });
    const tags = data?.noteTags || [];
    const tagsError = error?.message;

    const handleLinkClick = () => {
        closeNavbar?.();
    };

    const handleLogout = () => {
        handleLinkClick();
        logout();
        clearNotes();
        clearTags();
        navigate('/login');
    };

    // Build hierarchical tag structure
    const buildTagHierarchy = (tagList) => {
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
    };

    // Recursive tag-tree renderer
    const RenderTagHierarchy = ({ hierarchy, level = 0 }) => {
        const [contextMenu, setContextMenu] = useState(null);
        const [selectedTag, setSelectedTag] = useState(null);

        const handleContextMenu = (event, tag) => {
            event.preventDefault();
            setContextMenu(event.currentTarget);
            setSelectedTag(tag);
        };

        const handleCloseContextMenu = () => {
            setContextMenu(null);
            setSelectedTag(null);
        };

        return (
            <>
                {Object.entries(hierarchy).map(([tag, data]) => {
                    const isSelected =
                        location.pathname === `/tags/${encodeURIComponent(data.path)}`;
                    const tagColor = getTagColor(data.path);

                    return (
                        <div key={data.path}>
                            <ListItemButton
                                component={Link}
                                to={`/tags/${encodeURIComponent(data.path)}`}
                                selected={isSelected}
                                onClick={handleLinkClick}
                                onContextMenu={(e) => handleContextMenu(e, data.path)}
                                sx={{
                                    // Level indent: each nesting level adds 12px
                                    pl: level * 1.5 + 2,
                                    pr: 1.25,
                                    py: 0.625,
                                    mx: 0.75,
                                    my: 0.125,
                                    borderRadius: '6px',
                                    transition: 'all 100ms ease',
                                    // Override MuiListItemButton selected state: use tag color
                                    // (rather than global oxblood) for the glow bg, but keep
                                    // the 2px left-border in tag color for visual anchoring.
                                    '&.Mui-selected': {
                                        backgroundColor: alpha(tagColor, 0.08),
                                        borderLeft: `2px solid ${tagColor}`,
                                        paddingLeft: `calc(${level * 1.5 + 2} * 8px - 2px)`,
                                        '&:hover': {
                                            backgroundColor: alpha(tagColor, 0.12),
                                        },
                                    },
                                    '&:hover': {
                                        backgroundColor: alpha(tagColor, 0.06),
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
                            </ListItemButton>
                            {Object.keys(data.children).length > 0 && (
                                <RenderTagHierarchy
                                    hierarchy={data.children}
                                    level={level + 1}
                                />
                            )}
                        </div>
                    );
                })}
                <TagContextMenu
                    anchorEl={contextMenu}
                    open={Boolean(contextMenu)}
                    onClose={handleCloseContextMenu}
                    tag={selectedTag}
                />
            </>
        );
    };

    const filteredTags = tags.filter((tag) =>
        tag.toLowerCase().includes(tagFilter.toLowerCase())
    );
    const tagHierarchy = buildTagHierarchy(tags);
    const filteredHierarchy = buildTagHierarchy(filteredTags);

    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                bgcolor: 'background.paper',
            }}
        >
            {/* ——— Primary actions ——————————————————————————————————— */}
            <List sx={{ pt: 1.25, pb: 0.5, px: 0.75 }}>
                {/* New Note — primary oxblood contained */}
                <ListItem disablePadding sx={{ mb: 0.25 }}>
                    <ListItemButton
                        onClick={() => {
                            handleLinkClick();
                            navigate('/notes/new');
                        }}
                        sx={{
                            borderRadius: '6px',
                            py: 0.625,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            transition: 'background 100ms ease',
                            '&:hover': { bgcolor: 'primary.dark' },
                            '&:focus-visible': {
                                outline: `2px solid ${theme.palette.primary.main}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <AddIcon sx={{ color: 'inherit', fontSize: 17 }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="New Note"
                            primaryTypographyProps={{
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                color: 'inherit',
                                letterSpacing: '0.01em',
                            }}
                        />
                    </ListItemButton>
                </ListItem>

                {/* Home */}
                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        to="/"
                        selected={location.pathname === '/'}
                        onClick={handleLinkClick}
                        sx={{
                            '&.Mui-selected .sidebar-icon': { color: 'primary.main' },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <HomeIcon
                                className="sidebar-icon"
                                sx={{
                                    fontSize: 17,
                                    color: location.pathname === '/' ? 'primary.main' : 'text.secondary',
                                    transition: 'color 100ms ease',
                                }}
                            />
                        </ListItemIcon>
                        <ListItemText
                            primary="Home"
                            primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: location.pathname === '/' ? 600 : 400,
                            }}
                        />
                    </ListItemButton>
                </ListItem>

                {/* Search */}
                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        to="/search"
                        selected={location.pathname === '/search'}
                        onClick={handleLinkClick}
                    >
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <SearchIcon
                                sx={{
                                    fontSize: 17,
                                    color: location.pathname === '/search' ? 'primary.main' : 'text.secondary',
                                    transition: 'color 100ms ease',
                                }}
                            />
                        </ListItemIcon>
                        <ListItemText
                            primary="Search"
                            primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: location.pathname === '/search' ? 600 : 400,
                            }}
                        />
                    </ListItemButton>
                </ListItem>
            </List>

            {/* Hairline rule between nav and collections */}
            <Divider />

            {/* ——— Collections / Tags ——————————————————————————————— */}
            <SectionLabel>Collections</SectionLabel>

            {/* Scrollable tag area */}
            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    // Leave room for the fixed bottom bar (~72px)
                    pb: '72px',
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
                                    boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
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
                        onClick={handleLinkClick}
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
                        <TagIcon sx={{ fontSize: 24, color: 'text.disabled', mb: 0.75 }} />
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 0.25 }}
                        >
                            No tags yet
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            Add tags to your notes to organize them here
                        </Typography>
                    </Box>
                )}
                {!tagsLoading && !tagsError && Object.keys(filteredHierarchy).length > 0 && (
                    <RenderTagHierarchy hierarchy={filteredHierarchy} />
                )}
                {!tagsLoading && !tagsError && tagFilter && Object.keys(filteredHierarchy).length === 0 && (
                    <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.disabled">
                            No tags match "{tagFilter}"
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* ——— Bottom bar: Settings + Sign out ——————————————————— */}
            <Box
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    bgcolor: 'background.paper',
                    borderTop: `1px solid ${theme.palette.divider}`,
                    zIndex: 1,
                }}
            >
                <List sx={{ py: 0.375, px: 0.75 }}>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={Link}
                            to="/settings"
                            selected={location.pathname === '/settings'}
                            onClick={handleLinkClick}
                        >
                            <ListItemIcon sx={{ minWidth: 26 }}>
                                <SettingsIcon
                                    sx={{
                                        fontSize: 15,
                                        color: location.pathname === '/settings'
                                            ? 'primary.main'
                                            : 'text.disabled',
                                    }}
                                />
                            </ListItemIcon>
                            <ListItemText
                                primary="Settings"
                                primaryTypographyProps={{
                                    fontSize: '0.75rem',
                                    fontWeight: location.pathname === '/settings' ? 600 : 400,
                                    color: location.pathname === '/settings'
                                        ? 'text.primary'
                                        : 'text.secondary',
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                        <ListItemButton
                            onClick={handleLogout}
                            aria-label="sign out"
                            sx={{
                                transition: 'all 100ms ease',
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.error.main, 0.04),
                                    '& .logout-icon': { color: 'error.main' },
                                    '& .logout-text': { color: 'error.main' },
                                },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 26 }}>
                                <LogoutIcon
                                    className="logout-icon"
                                    sx={{
                                        fontSize: 15,
                                        color: 'text.disabled',
                                        transition: 'color 100ms ease',
                                    }}
                                />
                            </ListItemIcon>
                            <ListItemText
                                primary="Sign out"
                                primaryTypographyProps={{
                                    className: 'logout-text',
                                    fontSize: '0.75rem',
                                    fontWeight: 400,
                                    color: 'text.secondary',
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>
        </Box>
    );
}

export default Sidebar;
