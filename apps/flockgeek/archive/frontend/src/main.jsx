import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AgricultureIcon from "@mui/icons-material/Agriculture";
import PetsIcon from "@mui/icons-material/Pets";
import GroupIcon from "@mui/icons-material/Group";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import EggIcon from "@mui/icons-material/Egg";
import LogoutIcon from "@mui/icons-material/Logout";
import { ThemeProvider } from "@mui/material/styles";
import "@fontsource/roboto";
import theme from "./theme.js";
import BirdsPage from "./pages/BirdsPage.jsx";
import BirdDetailPage from "./pages/BirdDetailPage.jsx";
import GroupsPage from "./pages/GroupsPage.jsx";
import LocationsPage from "./pages/LocationsPage.jsx";
import HatchLogPage from "./pages/HatchLogPage.jsx";
import PairingsPage from "./pages/PairingsPage.jsx";
import NotificationsProvider from "./components/Notifications.jsx";
import Login from "./pages/Login.jsx";

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const value = location.pathname.startsWith("/groups")
    ? "groups"
    : location.pathname.startsWith("/locations")
      ? "locations"
      : location.pathname.startsWith("/hatch-log")
        ? "egg"
        : "birds";
  return (
    <Paper
      elevation={3}
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderRadius: 0 }}
    >
      <BottomNavigation
        showLabels
        value={value}
        onChange={(e, v) => {
          if (v === "birds") navigate("/birds");
          if (v === "groups") navigate("/groups");
          if (v === "locations") navigate("/locations");
          if (v === "egg") navigate("/hatch-log");
        }}
      >
        <BottomNavigationAction
          label="Birds"
          value="birds"
          icon={<PetsIcon />}
        />
        <BottomNavigationAction
          label="Groups"
          value="groups"
          icon={<GroupIcon />}
        />
        <BottomNavigationAction
          label="Locations"
          value="locations"
          icon={<LocationOnIcon />}
        />
        <BottomNavigationAction
          label="Hatch Log"
          value="egg"
          icon={<EggIcon />}
        />
      </BottomNavigation>
    </Paper>
  );
}

function Layout() {
  const [open, setOpen] = useState(false);

  // Redirect to login if no token
  const location = useLocation();
  if (!localStorage.getItem('geek_token') && location.pathname !== '/login') {
    window.location.replace('/login');
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="primary">
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setOpen(true)}
            aria-label="menu"
          >
            <MenuIcon />
          </IconButton>
          <Box
            sx={{ display: "flex", alignItems: "center", ml: 1, flexGrow: 1 }}
          >
            <AgricultureIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              FlockGeek
            </Typography>
            <Typography variant="h6" sx={{ ml: 1, fontWeight: 700 }}>
              &lt;/&gt;
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: { top: "60px", height: "calc(100% - 60px)", borderRadius: 0 },
        }}
      >
        <Box
          sx={{ width: 240 }}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <List>
            <ListItemButton component={NavLink} to="/birds">
              <ListItemText primary="Birds" />
            </ListItemButton>
            <ListItemButton component={NavLink} to="/groups">
              <ListItemText primary="Groups" />
            </ListItemButton>
            <ListItemButton component={NavLink} to="/locations">
              <ListItemText primary="Locations" />
            </ListItemButton>
            <ListItemButton component={NavLink} to="/pairings">
              <ListItemText primary="Pairings" />
            </ListItemButton>
            <ListItemButton component={NavLink} to="/hatch-log">
              <ListItemText primary="Hatch Log" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                localStorage.removeItem('geek_token');
                window.location.replace('/login');
              }}
              sx={{ mt: 2, borderTop: 1, borderColor: 'divider' }}
            >
              <LogoutIcon sx={{ mr: 2 }} />
              <ListItemText primary="Logout" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Container maxWidth="xl" sx={{ py: 4, pb: 10, px: { xs: 2, sm: 3 } }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<BirdsPage />} />
          <Route path="/birds" element={<BirdsPage />} />
          <Route path="/birds/:id" element={<BirdDetailPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/pairings" element={<PairingsPage />} />
          <Route path="/hatch-log" element={<HatchLogPage />} />
        </Routes>
      </Container>

      <BottomNav />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <NotificationsProvider>
      <Layout />
    </NotificationsProvider>
  </BrowserRouter>,
);
