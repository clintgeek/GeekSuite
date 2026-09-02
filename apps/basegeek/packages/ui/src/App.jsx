import { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
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
import { AuthProvider } from './components/AuthContext';
import PortalPage from './pages/PortalPage';

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
              <Route path="datageek" element={<DataGeekPage />} />
              <Route path="usergeek" element={<UserGeekPage />} />
              <Route path="aigeek" element={<AIGeekPage />} />
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
