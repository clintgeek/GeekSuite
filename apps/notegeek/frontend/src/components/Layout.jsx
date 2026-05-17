import React from 'react';
import { Drawer, useTheme, useMediaQuery } from '@mui/material';
import { GeekShell, GeekAppFrame, geekLayout } from '@geeksuite/ui';
import useAuthStore from '../store/authStore';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import Header from './Header';

// Use shared layout tokens for consistency
const DRAWER_WIDTH = geekLayout.sidebarWidth; // 220
const MOBILE_TAB_HEIGHT = 56;

/**
 * Layout — Standard GeekSuite Shell implementation for NoteGeek.
 * Composes GeekShell (engine) + GeekAppFrame (content/transitions).
 */
function Layout({ children }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { isAuthenticated } = useAuthStore();
    
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [desktopOpen, setDesktopOpen] = React.useState(true);

    const handleDrawerToggle = () => {
        if (!isMobile) {
            setDesktopOpen((prev) => !prev);
            return;
        }
        setMobileOpen((prev) => !prev);
    };

    const showNavigation = isAuthenticated;

    const sidebar = showNavigation && !isMobile && desktopOpen
        ? <Sidebar />
        : null;

    const topBar = <Header onMenuClick={handleDrawerToggle} />;

    return (
        <GeekShell sidebar={sidebar} topBar={topBar}>
            {/* Mobile Drawer */}
            {isMobile && showNavigation && (
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: false }}
                    PaperProps={{
                        sx: { 
                            width: DRAWER_WIDTH,
                            // Theme handles bg + border
                        }
                    }}
                >
                    <Sidebar closeNavbar={() => setMobileOpen(false)} />
                </Drawer>
            )}

            {/* Main content with route transitions */}
            <GeekAppFrame sx={{ 
                pb: isMobile && showNavigation ? `${MOBILE_TAB_HEIGHT}px` : 0,
                // NoteGeek specific: Mindmap editor wants overflow: hidden
                '&.mindmap-container': {
                    overflow: 'hidden',
                },
            }}>
                {children}
            </GeekAppFrame>

            {/* Mobile Bottom Navigation */}
            {isMobile && showNavigation && <MobileBottomNav />}
        </GeekShell>
    );
}

export default Layout;
