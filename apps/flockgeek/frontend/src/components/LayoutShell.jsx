/**
 * FlockGeek layout — pure suite grammar.
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the bespoke 60px
 * mobile header and the 280px mobile Drawer that used to live here are gone,
 * along with the `isMobile` / `mobileOpen` state that drove them. The same
 * 220px `Sidebar` panel serves desktop and mobile.
 */
import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import { GeekShell, GeekAppFrame } from "@geeksuite/ui";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

const LayoutShell = () => (
  <GeekShell
    nav={<Sidebar />}
    navSx={{ bgcolor: "background.sidebar" }}
    topBar={<TopBar />}
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

export default LayoutShell;
