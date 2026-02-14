import React from 'react';
import {
    Box,
    Drawer,
    useTheme,
    useMediaQuery,
    Container,
} from '@mui/material';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import Header from './Header';

const DRAWER_WIDTH = 220;

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
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header onMenuClick={handleDrawerToggle} />

            {/* Content Area - Below AppBar */}
            <Box
                sx={{
                    display: 'flex',
                    flexGrow: 1,
                    mt: { xs: '44px', sm: '48px' },
                    height: {
                        xs: 'calc(100vh - 44px - 60px - env(safe-area-inset-bottom))',
                        sm: 'calc(100vh - 48px - 60px - env(safe-area-inset-bottom))',
                        md: 'calc(100vh - 48px)',
                    },
                    overflow: 'hidden',
                }}
            >
                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{
                        keepMounted: false,
                    }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: DRAWER_WIDTH,
                            bgcolor: 'background.paper',
                            borderRight: '1px solid',
                            borderColor: 'divider',
                            mt: { xs: '44px', sm: '48px' },
                        },
                    }}
                >
                    <Sidebar closeNavbar={() => setMobileOpen(false)} />
                </Drawer>

                {/* Desktop Drawer */}
                <Drawer
                    variant="persistent"
                    open={desktopOpen}
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        width: DRAWER_WIDTH,
                        flexShrink: 0,
                        '& .MuiDrawer-paper': {
                            width: DRAWER_WIDTH,
                            boxSizing: 'border-box',
                            bgcolor: 'background.paper',
                            borderRight: '1px solid',
                            borderColor: 'divider',
                            boxShadow: 'none',
                            mt: { xs: '44px', sm: '48px' },
                        },
                    }}
                >
                    <Sidebar />
                </Drawer>

                {/* Main Content */}
                <Box
                    component="main"
                    sx={{
                        flexGrow: 1,
                        width: '100%',
                        minWidth: 0,
                        height: '100%',
                        bgcolor: 'background.default',
                        pt: 0,
                        pb: 0,
                        ml: { sm: desktopOpen ? 0 : `-${DRAWER_WIDTH}px` },
                        transition: theme.transitions.create('margin', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.leavingScreen,
                        }),
                        '&.mindmap-container': {
                            overflow: 'hidden',
                        },
                        display: 'flex',
                        justifyContent: 'center',
                        overflow: 'auto'
                    }}
                >
                    <Container
                        maxWidth={false}
                        sx={{
                            px: { xs: 1.5, sm: 2.5 },
                            width: '100%',
                            maxWidth: '100%'
                        }}
                    >
                        {children}
                    </Container>
                </Box>
            </Box>

            <MobileBottomNav />
        </Box>
    );
}

export default Layout;