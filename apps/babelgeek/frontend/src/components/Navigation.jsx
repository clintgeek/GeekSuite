import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PersonIcon from "@mui/icons-material/Person";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";
import { APP_NAME, NAV_LINKS } from "../utils/constants";

const Navigation = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const { isAuthenticated, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const location = useLocation();
  const navigate = useNavigate();

  const primaryLinks = NAV_LINKS.filter(({ priority }) => priority !== "secondary");
  const secondaryLinks = NAV_LINKS.filter(({ priority }) => priority === "secondary");
  const hasSecondaryActive = secondaryLinks.some(({ external, to }) => !external && location.pathname === to);
  const highlightSecondary = hasSecondaryActive || menuAnchor !== null;

  const handleDrawerToggle = () => {
    setMobileOpen((prev) => !prev);
  };

  const handleMenuOpen = (event) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleGoToLogin = () => {
    navigate("/login");
  };

  const menuOpen = Boolean(menuAnchor);

  const renderDrawerList = (links, title) => (
    <List
      dense
      sx={{ px: 1 }}
      subheader={
        links.length > 0 ? (
          <ListSubheader disableSticky sx={{ px: 1, fontWeight: 600, textTransform: "uppercase", fontSize: 11, letterSpacing: 0.6 }}>
            {title}
          </ListSubheader>
        ) : null
      }
    >
      {links.map(({ to, label, external }) => (
        <ListItemButton
          key={label}
          component={external ? "a" : NavLink}
          to={external ? undefined : to}
          end={external ? undefined : to === "/"}
          href={external ? to : undefined}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener" : undefined}
          selected={!external && location.pathname === to}
          onClick={handleDrawerToggle}
          sx={{
            borderRadius: 2,
            mb: 0.5,
            "&.Mui-selected": {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              color: (theme) => theme.palette.primary.main,
              "&:hover": {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.2)
              }
            }
          }}
        >
          <ListItemText primary={label} />
        </ListItemButton>
      ))}
    </List>
  );

  const drawer = (
    <Box sx={{ width: 320, height: "100%", display: "flex", flexDirection: "column" }} role="presentation">
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, py: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {APP_NAME}
        </Typography>
        <IconButton aria-label="close navigation" onClick={handleDrawerToggle}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", py: 2 }}>
        {renderDrawerList(primaryLinks, "Primary")}
        {secondaryLinks.length > 0 && renderDrawerList(secondaryLinks, "More")}
      </Box>
      <Divider />
      <Box sx={{ display: "grid", gap: 1.5, p: 3 }}>
        <Button variant="outlined" onClick={toggleColorMode} startIcon={mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}>
          {mode === "light" ? "Dark mode" : "Light mode"}
        </Button>
        {isAuthenticated ? (
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              handleDrawerToggle();
              logout();
            }}
            startIcon={<LogoutIcon />}
          >
            Sign out
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              handleDrawerToggle();
              handleGoToLogin();
            }}
            startIcon={<PersonIcon />}
          >
            Sign in
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <AppBar
      position="fixed"
      color="transparent"
      elevation={0}
      enableColorOnDark
      sx={(theme) => ({
        backdropFilter: "saturate(180%) blur(18px)",
        backgroundColor: alpha(theme.palette.background.paper, 0.92),
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
        color: theme.palette.text.primary,
        transition: theme.transitions.create(["background-color", "border-color"], {
          duration: theme.transitions.duration.shorter
        })
      })}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 80 }, gap: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open navigation"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            component={NavLink}
            to="/"
            style={{ textDecoration: "none", color: "inherit" }}
            sx={{
              fontWeight: 700,
              letterSpacing: 0.5,
              flexGrow: { xs: 1, md: 0 }
            }}
          >
            {APP_NAME}
          </Typography>
          <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1 }}>
            {primaryLinks.map(({ to, label, external }) => (
              external ? (
                <Button
                  key={label}
                  color="inherit"
                  component="a"
                  href={to}
                  target="_blank"
                  rel="noopener"
                  sx={{
                    borderRadius: 999,
                    px: 2.5,
                    py: 1
                  }}
                >
                  {label}
                </Button>
              ) : (
                <NavLink key={label} to={to} end={to === "/"} style={{ textDecoration: "none" }}>
                  {({ isActive }) => (
                    <Button
                      color="inherit"
                      sx={{
                        borderRadius: 999,
                        px: 2.5,
                        py: 1,
                        transition: (theme) => theme.transitions.create(["background-color", "color"]),
                        backgroundColor: isActive
                          ? (theme) => alpha(theme.palette.primary.main, 0.12)
                          : "transparent",
                        color: isActive ? "primary.main" : "text.primary",
                        "&:hover": {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.18)
                        }
                      }}
                    >
                      {label}
                    </Button>
                  )}
                </NavLink>
              )
            ))}
            {secondaryLinks.length > 0 && (
              <Button
                color="inherit"
                endIcon={<MoreHorizIcon />}
                onClick={handleMenuOpen}
                aria-haspopup="true"
                aria-controls={menuOpen ? "secondary-nav-menu" : undefined}
                aria-expanded={menuOpen ? "true" : undefined}
                sx={{
                  borderRadius: 999,
                  px: 2.5,
                  py: 1,
                  textTransform: "none",
                  backgroundColor: highlightSecondary
                    ? (theme) => alpha(theme.palette.primary.main, 0.12)
                    : "transparent",
                  color: highlightSecondary ? "primary.main" : "text.primary",
                  "&:hover": {
                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.18)
                  }
                }}
              >
                More
              </Button>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { xs: 0, md: "auto" } }}>
            <Tooltip title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}>
              <IconButton color="inherit" onClick={toggleColorMode} aria-label="toggle color mode">
                {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>
            {isAuthenticated ? (
              <>
                <Tooltip title="Sign out">
                  <IconButton
                    color="inherit"
                    onClick={logout}
                    aria-label="sign out"
                    sx={{ display: { xs: "inline-flex", sm: "none" } }}
                  >
                    <LogoutIcon />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={logout}
                  startIcon={<LogoutIcon />}
                  size="small"
                  sx={{ display: { xs: "none", sm: "inline-flex" }, borderRadius: 999 }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Tooltip title="Sign in">
                  <IconButton
                    color="inherit"
                    onClick={handleGoToLogin}
                    aria-label="sign in"
                    sx={{ display: { xs: "inline-flex", sm: "none" } }}
                  >
                    <PersonIcon />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={handleGoToLogin}
                  startIcon={<PersonIcon />}
                  size="small"
                  sx={{ display: { xs: "none", sm: "inline-flex" }, borderRadius: 999 }}
                >
                  Sign in
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </Container>
      {secondaryLinks.length > 0 && (
        <Menu
          id="secondary-nav-menu"
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          MenuListProps={{ "aria-label": "secondary navigation" }}
        >
          {secondaryLinks.map(({ to, label, external }) => (
            <MenuItem
              key={label}
              component={external ? "a" : NavLink}
              to={external ? undefined : to}
              end={external ? undefined : to === "/"}
              href={external ? to : undefined}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener" : undefined}
              onClick={handleMenuClose}
              selected={!external && location.pathname === to}
              sx={{
                borderRadius: 2,
                "&.Mui-selected": {
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
                  color: (theme) => theme.palette.primary.main
                }
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: 320,
            backgroundImage: "none"
          }
        }}
      >
        {drawer}
      </Drawer>
    </AppBar>
  );
};

export default Navigation;
