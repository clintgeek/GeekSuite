import React from 'react';
import {
    Box,
    Drawer,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import Header from './Header';

// Design spec: sidebar 240px, header 48px (xs: 44px), bottom nav 56px
const DRAWER_WIDTH = 240;

function Layout({ children }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [desktopOpen, setDesktopOpen] = React.useState(true);

    const handleDrawerToggle = () => {
        if (isDesktop) {
            setDesktopOpen((prev) => !prev);
            setMobileOpen(false);
            return;
        }
        setMobileOpen((prev) => !prev);
    };

    React.useEffect(() => {
        if (isDesktop && mobileOpen) {
            setMobileOpen(false);
        }
    }, [isDesktop, mobileOpen]);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
                bgcolor: 'background.default',
            }}
        >
            <Header onMenuClick={handleDrawerToggle} />

            {/* Content area — below the fixed AppBar */}
            <Box
                sx={{
                    display: 'flex',
                    flexGrow: 1,
                    // xs/sm: clear the 44/48px header + leave room for 56px bottom nav
                    mt: { xs: '44px', sm: '48px' },
                    height: {
                        xs: 'calc(100vh - 44px - 56px - env(safe-area-inset-bottom))',
                        sm: 'calc(100vh - 48px - 56px - env(safe-area-inset-bottom))',
                        md: 'calc(100vh - 48px)',
                    },
                    overflow: 'hidden',
                }}
            >
                {/* Mobile Drawer — temporary overlay */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: false }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: DRAWER_WIDTH,
                            // Aligns drawer paper below the fixed header
                            mt: { xs: '44px', sm: '48px' },
                            height: {
                                xs: 'calc(100% - 44px)',
                                sm: 'calc(100% - 48px)',
                            },
                            // Theme override in createAppTheme handles bg + borderRight;
                            // nothing to override here — keeps it clean.
                        },
                    }}
                >
                    <Sidebar closeNavbar={() => setMobileOpen(false)} />
                </Drawer>

                {/* Desktop Drawer — persistent push */}
                <Drawer
                    variant="persistent"
                    open={desktopOpen}
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        width: desktopOpen ? DRAWER_WIDTH : 0,
                        flexShrink: 0,
                        transition: theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.leavingScreen,
                        }),
                        '& .MuiDrawer-paper': {
                            width: DRAWER_WIDTH,
                            boxSizing: 'border-box',
                            boxShadow: 'none',
                            mt: '48px',
                            height: 'calc(100% - 48px)',
                            // bg + hairline right border come from MuiDrawer override in theme
                        },
                    }}
                >
                    <Sidebar />
                </Drawer>

                {/* Main content surface */}
                <Box
                    component="main"
                    sx={{
                        flexGrow: 1,
                        width: '100%',
                        minWidth: 0,
                        height: '100%',
                        bgcolor: 'background.default',
                        overflow: 'auto',
                        // Smooth push when desktop drawer opens/closes
                        ml: {
                            md: desktopOpen ? 0 : `-${DRAWER_WIDTH}px`,
                        },
                        transition: theme.transitions.create('margin', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.leavingScreen,
                        }),
                        // Mindmap editor wants overflow: hidden — applied by NoteShell
                        // via className; preserve the hook here.
                        '&.mindmap-container': {
                            overflow: 'hidden',
                        },
                    }}
                >
                    {children}
                </Box>
            </Box>

            <MobileBottomNav />
        </Box>
    );
}

export default Layout;
