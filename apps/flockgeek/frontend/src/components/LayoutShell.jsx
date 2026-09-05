/**
 * FlockGeek layout — pure suite grammar, plus the mobile grammar's thumb-zone
 * chrome (MOBILE_UI_PLAN.md §2, §4).
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the bespoke 60px
 * mobile header and the 280px mobile Drawer that used to live here are gone,
 * along with the `isMobile` / `mobileOpen` state that drove them. The same
 * 220px `Sidebar` panel serves desktop and mobile.
 *
 * FlockGeek is a data-entry app — birds, eggs, hatches, every day — and was
 * the one such app in the suite with no bottom tab bar. It has one now:
 * `GeekBottomNav` below `md` with five rows drawn from the sidebar's nav.
 * `GeekShell bottomNav` reserves the space and `GeekAppFrame` insets the
 * content, so no page needs a manual `pb`.
 *
 * The thumb-zone FAB is the shell's job too: a page calls the suite's
 * `useGeekPrimaryAction({ label, icon, onClick })` — Home and the Egg log both
 * register "Log eggs" — and `GeekShell` mounts the `GeekFab` as a sibling of
 * `GeekAppFrame`, whose route transition would otherwise capture a fixed
 * child. No page registered → no FAB.
 */
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { Outlet, useLocation } from "react-router-dom";
import { GeekShell, GeekAppFrame, GeekBottomNav, geekLayout } from "@geeksuite/ui";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { activeNavId, bottomNavItems } from "./navConfig";

const LayoutShell = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const location = useLocation();

  return (
    <GeekShell
      nav={<Sidebar />}
      navSx={{ bgcolor: "background.sidebar" }}
      topBar={<TopBar />}
      bottomNav={
        isMobile ? (
          <GeekBottomNav
            items={bottomNavItems}
            activeId={activeNavId(location.pathname)}
            sx={{ bgcolor: "background.sidebar" }}
            labelSx={{ fontSize: "0.75rem", letterSpacing: 0.2 }}
          />
        ) : null
      }
    >
      <GeekAppFrame>
        <Box
          sx={{
            px: { xs: 2, sm: 3, md: 5 },
            py: { xs: 3, md: 4 }
          }}
        >
          <Outlet />
        </Box>
      </GeekAppFrame>
    </GeekShell>
  );
};

export default LayoutShell;
