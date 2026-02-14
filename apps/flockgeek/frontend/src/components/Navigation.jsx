import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import EggIcon from "@mui/icons-material/EggOutlined";
import PetsIcon from "@mui/icons-material/PetsOutlined";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";
import PlaceIcon from "@mui/icons-material/PlaceOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorderOutlined";
import HatchIcon from "@mui/icons-material/TrackChangesOutlined";
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";
import { APP_NAME } from "../utils/constants";

const SIDEBAR_WIDTH = 240;

const navItems = [
  { label: "Home", to: "/", icon: <HomeIcon /> },
  { label: "Birds", to: "/birds", icon: <PetsIcon /> },
  { label: "Egg Log", to: "/egg-log", icon: <EggIcon /> },
  { label: "Groups", to: "/groups", icon: <GroupsIcon /> },
  { label: "Locations", to: "/locations", icon: <PlaceIcon /> },
  { label: "Pairings", to: "/pairings", icon: <FavoriteIcon /> },
  { label: "Hatch Log", to: "/hatch-log", icon: <HatchIcon /> }
];

const Navigation = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const location = useLocation();

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev);

  const sidebarContent = (isMobile = false) => (
    <Box
      sx={{
        width: isMobile ? 280 : SIDEBAR_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.sidebar",
        borderRight: (theme) => isMobile ? "none" : `1px solid ${theme.palette.divider}`
      }}
      role="navigation"
    >
      {/* Brand */}
      <Box sx={{ px: 2.5, pt: 3, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <NavLink to="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 10 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#1a1a18",
              fontWeight: 800,
              fontSize: "0.875rem",
              fontFamily: '"DM Serif Display", serif'
            }}
          >
            F
          </Box>
          <Typography
            variant="h6"
            sx={{
              fontFamily: '"DM Serif Display", Georgia, serif',
              fontWeight: 400,
              fontSize: "1.15rem",
              letterSpacing: 0.3
            }}
          >
            {APP_NAME}
          </Typography>
        </NavLink>
        {isMobile && (
          <IconButton size="small" onClick={handleDrawerToggle} aria-label="close navigation">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Nav links */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 2 }}>
        <Typography
          variant="overline"
          sx={{ px: 1.5, mb: 1, display: "block", color: "text.disabled", fontSize: "0.625rem" }}
        >
          Navigation
        </Typography>
        <List dense disablePadding>
          {navItems.map(({ to, label, icon }) => {
            const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <ListItemButton
                key={label}
                component={NavLink}
                to={to}
                end={to === "/"}
                onClick={isMobile ? handleDrawerToggle : undefined}
                sx={{
                  mb: 0.25,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                  color: isActive ? "text.primary" : "text.secondary",
                  bgcolor: isActive ? (theme) => alpha(theme.palette.primary.main, 0.18) : "transparent",
                  boxShadow: isActive ? (theme) => `inset 3px 0 0 ${theme.palette.primary.main}` : "none",
                  "&:hover": {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.10),
                    color: "text.primary"
                  },
                  transition: "all 0.15s ease"
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
                  {icon}
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{
                    fontSize: "0.8125rem",
                    fontWeight: isActive ? 600 : 500
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* Bottom controls */}
      <Divider />
      <Box sx={{ p: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tooltip title={mode === "light" ? "Dark mode" : "Light mode"} placement="top">
          <IconButton size="small" onClick={toggleColorMode} aria-label="toggle color mode" sx={{ color: "text.secondary" }}>
            {mode === "light" ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {isAuthenticated && (
          <Tooltip title="Sign out" placement="top">
            <IconButton size="small" onClick={logout} aria-label="sign out" sx={{ color: "text.secondary" }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile top bar */}
      <Box
        component="header"
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          height: 56,
          px: 2,
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.92),
          backdropFilter: "blur(12px)",
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`
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

      {/* Desktop sidebar — persistent */}
      <Box
        component="nav"
        sx={{
          display: { xs: "none", md: "block" },
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          zIndex: (theme) => theme.zIndex.drawer
        }}
      >
        {sidebarContent(false)}
      </Box>

      {/* Mobile drawer */}
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
        {sidebarContent(true)}
      </Drawer>
    </>
  );
};

export const SIDEBAR_WIDTH_EXPORT = SIDEBAR_WIDTH;
export default Navigation;
