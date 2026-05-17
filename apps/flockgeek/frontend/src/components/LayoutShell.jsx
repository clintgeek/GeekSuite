import React, { useState } from 'react';
import { Box, Drawer, IconButton, Typography, useTheme, useMediaQuery, alpha } from "@mui/material";
import { Outlet } from "react-router-dom";
import MenuIcon from "@mui/icons-material/Menu";
import { GeekShell, GeekAppFrame, geekLayout } from "@geeksuite/ui";
import Sidebar from "./Sidebar";
import { APP_NAME } from "../utils/constants";

const LayoutShell = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev);

  const topBar = isMobile ? (
    <Box
      component="header"
      sx={{
        display: "flex",
        height: geekLayout.topBarHeight,
        px: 2,
        alignItems: "center",
        justifyContent: "space-between",
        bgcolor: alpha(theme.palette.background.paper, 0.92),
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${theme.palette.divider}`,
        width: '100%'
      }}
    >
      <IconButton onClick={handleDrawerToggle} aria-label="open navigation" sx={{ color: "text.primary" }}>
        <MenuIcon />
      </IconButton>
      <Typography
        variant="h6"
        sx={{
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontWeight: 400,
          fontSize: "1.05rem"
        }}
      >
        {APP_NAME}
      </Typography>
      <Box sx={{ width: 40 }} />
    </Box>
  ) : null;

  return (
    <GeekShell 
      sidebar={!isMobile ? <Sidebar /> : null} 
      topBar={topBar}
    >
      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: 280,
            backgroundImage: "none",
            bgcolor: "background.sidebar"
          }
        }}
      >
        <Sidebar isMobile onClose={handleDrawerToggle} />
      </Drawer>

      <GeekAppFrame>
        <Box
          sx={{
            px: { xs: 2, sm: 3, md: 5 },
            py: { xs: 3, md: 4 },
          }}
        >
          <Outlet />
        </Box>
      </GeekAppFrame>
    </GeekShell>
  );
};

export default LayoutShell;
