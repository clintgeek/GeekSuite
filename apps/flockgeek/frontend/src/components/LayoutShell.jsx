import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Navigation, { SIDEBAR_WIDTH_EXPORT } from "./Navigation";

const LayoutShell = () => (
  <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default" }}>
    <Navigation />
    <Box
      component="main"
      sx={{
        flex: 1,
        ml: { xs: 0, md: `${SIDEBAR_WIDTH_EXPORT}px` },
        mt: { xs: "56px", md: 0 },
        minHeight: { xs: "calc(100vh - 56px)", md: "100vh" },
        px: { xs: 2, sm: 3, md: 5 },
        py: { xs: 3, md: 4 },
        maxWidth: { md: `calc(100vw - ${SIDEBAR_WIDTH_EXPORT}px)` }
      }}
    >
      <Outlet />
    </Box>
  </Box>
);

export default LayoutShell;
