/**
 * FlockGeek top bar — new on desktop as of the shell-grammar migration.
 *
 * Before this, FlockGeek had no desktop top bar at all, which is why the theme
 * toggle and app switcher were parked in the sidebar. They live here now, in
 * the suite's fixed right-cluster order (theme → switcher → account), and the
 * mobile hamburger comes from `GeekTopBar`'s default leading slot.
 */
import { alpha, useTheme } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { GeekTopBar } from "@geeksuite/ui";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";
import { displayNameFrom, initialsFrom, secondaryFrom } from "../utils/userDisplay";
import { pageTitle } from "./navConfig";

const TopBar = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      themeMode={mode}
      onThemeToggle={toggleColorMode}
      currentApp="flockgeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => navigate("/settings"),
              onSignOut: logout
            }
          : undefined
      }
      sx={{
        // Field Ledger identity: frosted parchment band, hairline rule, and a
        // serif page title at sidebar-brand size rather than the shared h3.
        bgcolor: alpha(theme.palette.background.paper, 0.92),
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: "none",
        color: "text.primary",
        '& [data-geek-topbar="title"]': {
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontWeight: 400,
          fontSize: "1.15rem",
          letterSpacing: 0.3
        }
      }}
    />
  );
};

export default TopBar;
