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
    Collapse,
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

// Color palette for tag indicators — earthy, muted
const TAG_COLORS = [
    '#5B50A8', // warm indigo
    '#7B5DAE', // dusty violet
    '#A85C73', // dusty rose
    '#3A7058', // forest
    '#3D8493', // muted teal
    '#96682A', // warm amber
    '#A33529', // brick
    '#4A6B8A', // slate blue
];

// Get consistent color for a tag based on its name
function getTagColor(tagName) {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function Sidebar({ closeNavbar }) {
    const location = useLocation();
    const navigate = useNavigate();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    // Still import clearTags for logout
    const { clearTags } = useTagStore();
    const { logout } = useAuthStore();
    const { clearNotes } = useNoteStore();
    const [tagFilter, setTagFilter] = useState('');

    const { data, loading: tagsLoading, error } = useQuery(GET_TAGS, {
        fetchPolicy: 'cache-and-network'
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

    // Function to build hierarchical tag structure
    const buildTagHierarchy = (tags) => {
        const hierarchy = {};
        tags.forEach(tag => {
            const parts = tag.split('/');
            let current = hierarchy;
            let currentPath = '';
            parts.forEach(part => {
                currentPath = currentPath ? `${ currentPath }/${ part }` : part;
                if (!current[part]) {
                    current[part] = {
                        path: currentPath,
                        children: {}
                    };
                }
                current = current[part].children;
            });
        });
        return hierarchy;
    };

    // Recursive component to render tag hierarchy
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
                    const isSelected = location.pathname === `/tags/${ encodeURIComponent(data.path) }`;
                    const tagColor = getTagColor(data.path);

                    return (
                        <div key={data.path}>
                            <ListItemButton
                                component={Link}
                                to={`/tags/${ encodeURIComponent(data.path) }`}
                                selected={isSelected}
                                onClick={handleLinkClick}
                                onContextMenu={(e) => handleContextMenu(e, data.path)}
                                sx={{
                                    pl: level * 2 + 2,
                                    py: 0.75,
                                    mx: 1,
                                    my: 0.25,
                                    borderRadius: 2,
                                    transition: 'all 150ms ease-out',
                                    '&:hover': {
                                        bgcolor: alpha(tagColor, 0.08),
                                    },
                                    '&.Mui-selected': {
                                        bgcolor: alpha(tagColor, 0.12),
                                        '&:hover': {
                                            bgcolor: alpha(tagColor, 0.16),
                                        },
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        bgcolor: tagColor,
                                        mr: 1.5,
                                        flexShrink: 0,
                                        opacity: isSelected ? 1 : 0.7,
                                        transition: 'opacity 150ms ease-out',
                                    }}
                                />
                                <ListItemText
                                    primary={tag}
                                    primaryTypographyProps={{
                                        fontSize: '0.875rem',
                                        fontWeight: isSelected ? 600 : 500,
                                        color: isSelected ? 'text.primary' : 'text.secondary',
                                    }}
                                />
                            </ListItemButton>
                            {Object.keys(data.children).length > 0 && (
                                <RenderTagHierarchy hierarchy={data.children} level={level + 1} />
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

    // Filter tags based on search input
    const filteredTags = tags.filter(tag =>
        tag.toLowerCase().includes(tagFilter.toLowerCase())
    );

    const tagHierarchy = buildTagHierarchy(tags);

    return (
        <Box sx={{
            height: '100vh',
            maxHeight: { xs: 'calc(100vh - 44px)', sm: 'calc(100vh - 48px)' },
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            bgcolor: 'background.paper',
        }}>
            {/* Main Navigation */}
            <List sx={{ pt: 1, pb: 0.5, px: 0.5 }}>
                {/* New Note */}
                <ListItem disablePadding>
                    <ListItemButton
                        onClick={() => {
                            handleLinkClick();
                            navigate('/notes/new');
                        }}
                        sx={{
                            borderRadius: 1.5,
                            py: 0.625,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            transition: 'background 100ms ease',
                            '&:hover': {
                                bgcolor: 'primary.dark',
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                            <AddIcon sx={{ color: 'inherit', fontSize: 18 }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="New Note"
                            primaryTypographyProps={{
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                color: 'inherit',
                            }}
                        />
                    </ListItemButton>
                </ListItem>

                {/* Home */}
                <ListItem disablePadding sx={{ mt: 0.5 }}>
                    <ListItemButton
                        component={Link}
                        to="/"
                        selected={location.pathname === '/'}
                        onClick={handleLinkClick}
                    >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                            <HomeIcon sx={{ fontSize: 17, color: location.pathname === '/' ? 'primary.main' : 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="Home"
                            primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: location.pathname === '/' ? 600 : 500,
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
                        <ListItemIcon sx={{ minWidth: 28 }}>
                            <SearchIcon sx={{ fontSize: 17, color: location.pathname === '/search' ? 'primary.main' : 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                            primary="Search"
                            primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: location.pathname === '/search' ? 600 : 500,
                            }}
                        />
                    </ListItemButton>
                </ListItem>
            </List>

            {/* Section label */}
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
                <Typography
                    variant="overline"
                    sx={{
                        color: 'text.disabled',
                    }}
                >
                    Collections
                </Typography>
            </Box>

            {/* Tags Section */}
            <List sx={{
                flex: 1,
                overflowY: 'auto',
                mb: '72px',
                pt: 0,
                scrollbarWidth: 'thin',
                scrollbarColor: isDark
                    ? 'rgba(148, 163, 184, 0.25) transparent'
                    : 'rgba(100, 116, 139, 0.25) transparent',
                '&::-webkit-scrollbar': {
                    width: 6,
                },
                '&::-webkit-scrollbar-track': {
                    backgroundColor: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: isDark
                        ? 'rgba(148, 163, 184, 0.25)'
                        : 'rgba(100, 116, 139, 0.25)',
                    borderRadius: 3,
                    '&:hover': {
                        backgroundColor: isDark
                            ? 'rgba(148, 163, 184, 0.4)'
                            : 'rgba(100, 116, 139, 0.4)',
                    },
                },
            }}>
                {/* Tag Filter Input */}
                <ListItem sx={{ pb: 1, px: 1.5 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Filter tags..."
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: 2,
                                fontSize: '0.8125rem',
                                bgcolor: alpha(theme.palette.text.primary, 0.03),
                                transition: 'all 150ms ease',
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.text.primary, 0.05),
                                },
                                '&.Mui-focused': {
                                    bgcolor: 'background.paper',
                                    boxShadow: `0 0 0 3px ${ theme.palette.glow.ring }`,
                                },
                            },
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                                </InputAdornment>
                            ),
                            endAdornment: tagFilter && (
                                <InputAdornment position="end">
                                    <ClearIcon
                                        sx={{
                                            fontSize: 16,
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
                </ListItem>

                {/* All Notes link */}
                <ListItemButton
                    component={Link}
                    to="/notes"
                    selected={location.pathname === '/notes'}
                    onClick={handleLinkClick}
                    sx={{
                        mx: 1,
                        my: 0.25,
                        py: 0.75,
                        borderRadius: 2,
                        transition: 'all 150ms ease-out',
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                        },
                        '&.Mui-selected': {
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                        },
                    }}
                >
                    <AllNotesIcon sx={{ fontSize: 18, mr: 1.5, color: 'text.secondary' }} />
                    <ListItemText
                        primary="All Notes"
                        primaryTypographyProps={{
                            fontSize: '0.875rem',
                            fontWeight: location.pathname === '/notes' ? 600 : 500,
                        }}
                    />
                </ListItemButton>

                {tagsLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress size={20} />
                    </Box>
                )}
                {tagsError && (
                    <Alert severity="error" sx={{ mx: 2, my: 1, borderRadius: 2 }}>
                        {tagsError}
                    </Alert>
                )}
                {!tagsLoading && !tagsError && Object.keys(tagHierarchy).length === 0 && (
                    <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                        <TagIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            No tags yet
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            Add tags to organize your notes
                        </Typography>
                    </Box>
                )}
                {!tagsLoading && !tagsError && (
                    <RenderTagHierarchy
                        hierarchy={buildTagHierarchy(filteredTags)}
                    />
                )}
            </List>

            {/* Bottom Actions */}
            <Box sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                bgcolor: 'background.paper',
                borderTop: `1px solid`,
                borderColor: 'divider',
                zIndex: 1,
            }}>
                <List sx={{ py: 0.25, px: 0.5 }}>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={Link}
                            to="/settings"
                            selected={location.pathname === '/settings'}
                            onClick={handleLinkClick}
                        >
                            <ListItemIcon sx={{ minWidth: 28 }}>
                                <SettingsIcon sx={{ fontSize: 16, color: location.pathname === '/settings' ? 'primary.main' : 'text.disabled' }} />
                            </ListItemIcon>
                            <ListItemText
                                primary="Settings"
                                primaryTypographyProps={{
                                    fontSize: '0.75rem',
                                    fontWeight: location.pathname === '/settings' ? 600 : 500,
                                    color: location.pathname === '/settings' ? 'text.primary' : 'text.secondary',
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                        <ListItemButton
                            onClick={handleLogout}
                            sx={{
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.error.main, 0.04),
                                    '& .MuiListItemIcon-root': { color: 'error.main' },
                                    '& .MuiListItemText-primary': { color: 'error.main' },
                                },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 28 }}>
                                <LogoutIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                            </ListItemIcon>
                            <ListItemText
                                primary="Sign out"
                                primaryTypographyProps={{
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
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