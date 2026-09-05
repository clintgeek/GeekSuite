/**
 * StoryGeek layout — pure suite grammar.
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the always-temporary
 * Drawer this file used to render at every width — plus its `mobileOpen` state,
 * its hamburger and the `isMobile` query that was computed and never used — are
 * gone. The same 220px `Sidebar` panel serves desktop and mobile.
 *
 * `fill` (the play route) hands the page the frame instead of the document
 * flow: `main` and the container stop scrolling and become a flex column, so a
 * page can size itself with `flex: 1` rather than guessing at the chrome with
 * `calc(100vh - N)`. `GeekAppFrame`'s route-transition `motion.div` sits
 * between the two, hence the `& > div` rule — it has no `sx` of its own to
 * take a flex value.
 */
import { Container } from '@mui/material';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const fillColumn = { display: 'flex', flexDirection: 'column', minHeight: 0 };

function Layout({ children, fill = false }) {
  return (
    <GeekShell
      nav={<Sidebar />}
      navSx={{ bgcolor: 'background.paper' }}
      topBar={<TopBar />}
    >
      <GeekAppFrame
        sx={fill ? { overflowY: 'hidden', ...fillColumn, '& > div': { flex: 1, ...fillColumn } } : undefined}
      >
        <Container
          maxWidth="xl"
          sx={{
            py: { xs: 2, md: 3 },
            ...(fill ? { py: { xs: 1.5, md: 2 }, flex: 1, ...fillColumn } : null),
          }}
        >
          {children}
        </Container>
      </GeekAppFrame>
    </GeekShell>
  );
}

export default Layout;
