import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import AuthCallback from './pages/AuthCallback';
import BaseGeekHome from './pages/BaseGeekHome';
import DataGeekPage from './pages/DataGeekPage';
import UserGeekPage from './pages/UserGeekPage';
import AIGeekPage from './pages/AIGeekPage';
import APIKeysPage from './pages/APIKeysPage';
import Settings from './pages/Settings';
import AccountPage from './pages/AccountPage';
import SharedAuthProvider from './components/SharedAuthProvider';
import PortalPage from './pages/PortalPage';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SharedAuthProvider app="basegeek">
        <Router>
          <Routes>
            {/* Public routes — no auth required */}
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* Protected routes */}
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
      </SharedAuthProvider>
    </ThemeProvider>
  );
}

export default App;