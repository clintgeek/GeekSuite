/**
 * FlockGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs to
 * the primitive; this file only supplies FlockGeek's Field Ledger identity:
 * the `background.sidebar` band, the amber inset active bar and dense labels.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `onClose`
 * plumbing here any more.
 */
import { Box, Typography, alpha, useTheme } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { GeekSidebar, geekLayout } from "@geeksuite/ui";
import { useAuth } from "../contexts/AuthContext";
import { APP_NAME } from "../utils/constants";
import { displayNameFrom, initialsFrom, secondaryFrom } from "../utils/userDisplay";
import { activeNavId, navSections } from "./navConfig";

/**
 * Brand block. Passed as a node rather than the primitive's
 * `{ monogram, name }` object so the monogram keeps its solid-amber ledger
 * stamp instead of the shared translucent chip.
 */
const Brand = () => (
  <Box
    component={RouterLink}
    to="/"
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.25,
      px: 2.5,
      height: geekLayout.topBarHeight,
      textDecoration: "none",
      color: "inherit"
    }}
  >
    <Box
      aria-hidden="true"
      sx={{
        width: 32,
        height: 32,
        flexShrink: 0,
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
      noWrap
      sx={{
        fontFamily: '"DM Serif Display", Georgia, serif',
        fontWeight: 400,
        fontSize: "1.15rem",
        letterSpacing: 0.3
      }}
    >
      {APP_NAME}
    </Typography>
  </Box>
);

const Sidebar = () => {
  const theme = useTheme();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const accent = theme.palette.primary.main;

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={navSections}
      activeId={activeNavId(location.pathname)}
      footer={{
        user: isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user)
            }
          : undefined,
        settings: { to: "/settings" },
        onSignOut: isAuthenticated ? logout : undefined
      }}
      sx={{ bgcolor: "background.sidebar" }}
      itemSx={{
        mb: 0.25,
        color: "text.secondary",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "& .MuiListItemText-primary": { fontSize: "0.8125rem", fontWeight: 500 },
        "&:hover": {
          bgcolor: alpha(accent, 0.1),
          color: "text.primary"
        },
        "&.Mui-selected": {
          bgcolor: alpha(accent, 0.18),
          color: "text.primary",
          boxShadow: `inset 3px 0 0 ${accent}`,
          "& .MuiListItemText-primary": { fontWeight: 600 },
          "&:hover": { bgcolor: alpha(accent, 0.22) }
        }
      }}
    />
  );
};

export default Sidebar;
