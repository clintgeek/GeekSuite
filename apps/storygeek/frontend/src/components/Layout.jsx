/**
 * StoryGeek layout — pure suite grammar.
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the always-temporary
 * Drawer this file used to render at every width — plus its `mobileOpen` state,
 * its hamburger and the `isMobile` query that was computed and never used — are
 * gone. The same 220px `Sidebar` panel serves desktop and mobile.
 *
 * `fill` (the play route) hands the page the frame instead of the document
 * flow. `GeekAppFrame`'s own `fill` prop (see its header, DOCS/THE_UI_UNIFICATION_PLAN.md
 * §3b) now owns that contract: it stops scrolling itself and flexes its
 * route-transition `motion.div` for us — no more reaching into the frame with
 * a `& > div` selector. `Container` still needs its own `fill` handling below:
 * it's the frame's child, and it stops scrolling and becomes a flex column so
 * a page can size itself with `flex: 1` rather than guessing at the chrome
 * with `calc(100vh - N)`.
 *
 * `GeekToastProvider` is mounted *inside* `GeekShell` and *outside*
 * `GeekAppFrame` (TODO_ORDER #15) — inside the shell so it can read
 * `useGeekShell()` for placement, outside the frame because the frame's
 * route-transition `motion.div` becomes a containing block for
 * `position: fixed` children, which would drag a toast along with the page
 * fade.
 */
import { Container } from '@mui/material';
import { GeekShell, GeekAppFrame, GeekToastProvider } from '@geeksuite/ui';
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
      <GeekToastProvider>
        <GeekAppFrame fill={fill}>
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
      </GeekToastProvider>
    </GeekShell>
  );
}

export default Layout;
