/**
 * StoryGeek layout — pure suite grammar.
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the always-temporary
 * Drawer this file used to render at every width — plus its `mobileOpen` state,
 * its hamburger and the `isMobile` query that was computed and never used — are
 * gone. The same 220px `Sidebar` panel serves desktop and mobile.
 */
import { Container } from '@mui/material';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

function Layout({ children }) {
  return (
    <GeekShell
      nav={<Sidebar />}
      navSx={{ bgcolor: 'background.paper' }}
      topBar={<TopBar />}
    >
      <GeekAppFrame>
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
          {children}
        </Container>
      </GeekAppFrame>
    </GeekShell>
  );
}

export default Layout;
