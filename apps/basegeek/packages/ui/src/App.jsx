import { useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { ThemeProvider, useThemeMode } from '@geeksuite/user';
import { createBaseGeekTheme } from './theme';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import BaseGeekHome from './pages/BaseGeekHome';
import DataGeekPage from './pages/DataGeekPage';
import UserGeekPage from './pages/UserGeekPage';
import AIGeekPage from './pages/AIGeekPage';
import APIKeysPage from './pages/APIKeysPage';
import Settings from './pages/Settings';
import AccountPage from './pages/AccountPage';
import { AuthProvider, useBaseGeekAuth } from './components/AuthContext';
import PortalPage from './pages/PortalPage';

/**
 * RequireAdmin — the client half of the admin gate.
 *
 * DataGeek, UserGeek and AIGeek are admin-only on the server: their routes sit
 * behind `requireAdmin` (mongo/postgres/redis/influx, /api/users) or
 * `requireAdminUser` (the aiGeek config surfaces). Before this, a non-admin
 * could open all three and got a wall of GeekErrorStates for their trouble —
 * a 403 rendered as a bug report. Now they bounce to Home with a sentence
 * saying why.
 *
 * This is chrome, not security. The server is still the gate; a client that
 * claims `role: 'admin'` gets exactly the same 403 it always did. Which is
 * also why the redirect is silent about anything beyond the page's name.
 *
 * It lives inside `Layout` (as a route element, not a wrapper around it) for
 * one reason: `GeekToastProvider` is mounted by Layout, so this is the only
 * side of the boundary where `notify` reaches a real toast stack.
 */
function RequireAdmin({ label, children }) {
  const { isAdmin, loading } = useBaseGeekAuth();
  const { notify } = useToast();
  const announced = useRef(false);
  const denied = !loading && !isAdmin;

  useEffect(() => {
    if (!denied || announced.current) return;
    announced.current = true;
    notify(`${label} is admin-only`, { tone: 'warning' });
  }, [denied, label, notify]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (denied) return <Navigate to="/" replace />;

  return children;
}

// Reads the resolved mode from the suite-wide theme provider (shared
// `geek_theme` cookie + the user's stored preference) and rebuilds the MUI
// theme when it flips.
function AppContent() {
  const { theme: mode } = useThemeMode();
  const theme = useMemo(() => createBaseGeekTheme(mode), [mode]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public routes — no auth required */}
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<BaseGeekHome />} />
              <Route path="datageek" element={<RequireAdmin label="DataGeek"><DataGeekPage /></RequireAdmin>} />
              <Route path="usergeek" element={<RequireAdmin label="UserGeek"><UserGeekPage /></RequireAdmin>} />
              <Route path="aigeek" element={<RequireAdmin label="AIGeek"><AIGeekPage /></RequireAdmin>} />
              <Route path="api-keys" element={<APIKeysPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </MuiThemeProvider>
  );
}

function App() {
  // baseGeek is a dark-first control room: with no stored preference and no
  // cookie, it stays dark rather than following the OS.
  return (
    <ThemeProvider defaultPreference="dark">
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
