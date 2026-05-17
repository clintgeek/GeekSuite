import React from 'react';
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  alpha,
  useTheme
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import EggIcon from "@mui/icons-material/EggOutlined";
import PetsIcon from "@mui/icons-material/PetsOutlined";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";
import PlaceIcon from "@mui/icons-material/PlaceOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorderOutlined";
import HatchIcon from "@mui/icons-material/TrackChangesOutlined";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";
import { APP_NAME } from "../utils/constants";
import { geekLayout } from "@geeksuite/ui";

const navItems = [
  { label: "Home", to: "/", icon: <HomeIcon /> },
  { label: "Birds", to: "/birds", icon: <PetsIcon /> },
  { label: "Egg Log", to: "/egg-log", icon: <EggIcon /> },
  { label: "Groups", to: "/groups", icon: <GroupsIcon /> },
  { label: "Locations", to: "/locations", icon: <PlaceIcon /> },
  { label: "Pairings", to: "/pairings", icon: <FavoriteIcon /> },
  { label: "Hatch Log", to: "/hatch-log", icon: <HatchIcon /> }
];

const Sidebar = ({ isMobile = false, onClose }) => {
  const theme = useTheme();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();

  return (
    <Box
      sx={{
        width: isMobile ? 280 : geekLayout.sidebarWidth,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.sidebar",
        flexShrink: 0,
        borderRight: `1px solid ${theme.palette.divider}`
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
          <IconButton size="small" onClick={onClose} aria-label="close navigation">
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
                onClick={isMobile ? onClose : undefined}
                sx={{
                  mb: 0.25,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                  color: isActive ? "text.primary" : "text.secondary",
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.18) : "transparent",
                  boxShadow: isActive ? `inset 3px 0 0 ${theme.palette.primary.main}` : "none",
                  "&:hover": {
                    bgcolor: alpha(theme.palette.primary.main, 0.10),
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
};

export default Sidebar;
