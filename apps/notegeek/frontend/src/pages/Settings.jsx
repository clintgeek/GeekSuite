import React from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Slider,
    Switch,
    Button,
    useTheme,
    alpha,
} from '@mui/material';
import {
    Brightness4Outlined as ThemeIcon,
    Brightness7Outlined as LightIcon,
    SecurityOutlined as SecurityIcon,
    LogoutOutlined as LogoutIcon,
    InfoOutlined as InfoIcon,
    PersonOutlined as AccountIcon,
    TextFields as FontSizeIcon,
} from '@mui/icons-material';
import { useAppPreferences, useUser } from '@geeksuite/user';
import useAuthStore from '../store/authStore';
import { useThemeMode } from '../theme/ThemeModeProvider';

function SettingsSection({ title, children }) {
    return (
        <Box sx={{ mb: 3 }}>
            <Typography
                variant="overline"
                sx={{
                    display: 'block',
                    color: 'text.disabled',
                    mb: 1,
                    px: 0.5,
                }}
            >
                {title}
            </Typography>
            <Paper
                elevation={0}
                sx={{
                    borderRadius: 3,
                    overflow: 'hidden',
                }}
            >
                <List disablePadding>
                    {children}
                </List>
            </Paper>
        </Box>
    );
}

function SettingsRow({ icon, primary, secondary, action, onClick, divider = true }) {
    const theme = useTheme();

    return (
        <ListItem
            onClick={onClick}
            sx={{
                px: 2.5,
                py: 1.75,
                cursor: onClick ? 'pointer' : 'default',
                transition: 'background 150ms ease',
                borderBottom: divider ? `1px solid ${alpha(theme.palette.divider, 0.5)}` : 'none',
                '&:hover': onClick ? {
                    bgcolor: alpha(theme.palette.text.primary, 0.02),
                } : {},
                '&:last-child': { borderBottom: 'none' },
            }}
        >
            <ListItemIcon sx={{ minWidth: 40 }}>
                {icon}
            </ListItemIcon>
            <ListItemText
                primary={primary}
                secondary={secondary}
                primaryTypographyProps={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                }}
                secondaryTypographyProps={{
                    fontSize: '0.75rem',
                    mt: 0.25,
                }}
            />
            {action}
        </ListItem>
    );
}

function Settings() {
    const { logout, user } = useAuthStore();
    const { mode, toggleMode } = useThemeMode();
    const { reset } = useUser();
    const { preferences: appPrefs, updateAppPreferences } = useAppPreferences('notegeek');
    const editorFontSize = appPrefs?.editorFontSize ?? 14;
    const theme = useTheme();
    const isDark = mode === 'dark';

    const handleFontSizeChange = async (_event, newValue) => {
        await updateAppPreferences({ editorFontSize: newValue });
    };

    const handleLogout = async () => {
        reset();
        await logout();
    };

    return (
        <Box sx={{ maxWidth: 560, mx: 'auto', py: { xs: 2, sm: 3 }, px: { xs: 0.5, sm: 1 } }}>
            <Typography
                variant="h3"
                sx={{
                    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
                    fontWeight: 600,
                    fontSize: { xs: '1.5rem', sm: '1.75rem' },
                    color: 'text.primary',
                    mb: 3,
                }}
            >
                Settings
            </Typography>

            {/* Account */}
            {user && (
                <SettingsSection title="Account">
                    <SettingsRow
                        icon={<AccountIcon sx={{ fontSize: 20, color: 'primary.main' }} />}
                        primary={user.name || user.email}
                        secondary={user.email || 'GeekSuite account'}
                        divider={false}
                    />
                </SettingsSection>
            )}

            {/* Appearance */}
            <SettingsSection title="Appearance">
                <SettingsRow
                    icon={isDark
                        ? <LightIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        : <ThemeIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    }
                    primary="Dark mode"
                    secondary={isDark ? 'Currently using dark theme' : 'Currently using light theme'}
                    action={
                        <Switch
                            edge="end"
                            checked={isDark}
                            onChange={toggleMode}
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: 'primary.main',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: 'primary.main',
                                },
                            }}
                        />
                    }
                />
                <SettingsRow
                    icon={<FontSizeIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                    primary={`Editor font size: ${editorFontSize}px`}
                    secondary="Applies to all note editors"
                    action={
                        <Slider
                            value={editorFontSize}
                            onChange={handleFontSizeChange}
                            min={10}
                            max={24}
                            step={1}
                            valueLabelDisplay="auto"
                            sx={{ width: 120 }}
                        />
                    }
                    divider={false}
                />
            </SettingsSection>

            {/* Security */}
            <SettingsSection title="Security">
                <SettingsRow
                    icon={<SecurityIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                    primary="Security"
                    secondary="Managed by GeekSuite"
                    divider={false}
                />
            </SettingsSection>

            {/* About */}
            <SettingsSection title="About">
                <SettingsRow
                    icon={<InfoIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                    primary="NoteGeek v1.0"
                    secondary="Part of GeekSuite"
                    divider={false}
                />
            </SettingsSection>

            {/* Sign out */}
            <Button
                variant="outlined"
                color="error"
                startIcon={<LogoutIcon sx={{ fontSize: 18 }} />}
                onClick={handleLogout}
                fullWidth
                sx={{
                    py: 1.25,
                    borderRadius: 2.5,
                    fontSize: '0.875rem',
                    borderWidth: 1.5,
                    '&:hover': {
                        borderWidth: 1.5,
                        bgcolor: alpha(theme.palette.error.main, 0.04),
                    },
                }}
            >
                Sign out
            </Button>
        </Box>
    );
}

export default Settings;